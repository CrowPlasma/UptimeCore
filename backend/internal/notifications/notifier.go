package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"context"
	"crypto/tls"
	"mime"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"sync"
	"time"

	"ping-eye/internal/config"
	"ping-eye/internal/models"
)

// Dispatcher maneja el envío de alertas a múltiples canales.
type Dispatcher struct {
	cfg      config.Config
	settings map[string]string
	mu       sync.RWMutex
}

func NewDispatcher(cfg config.Config) *Dispatcher {
	return &Dispatcher{cfg: cfg, settings: make(map[string]string)}
}

// UpdateSettings refreshes the dispatcher's live configuration.
func (d *Dispatcher) UpdateSettings(s map[string]string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.settings = s
}

// GetSetting returns a value from DB settings, falling back to OS env vars.
func (d *Dispatcher) GetSetting(key string, envKey string) string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if val, ok := d.settings[key]; ok && val != "" {
		return val
	}
	return os.Getenv(envKey)
}

// Send dispara la alerta a todos los canales configurados en paralelo.
func (d *Dispatcher) Send(m models.Monitor, groupName string, status string, errMsg string) {
	title := fmt.Sprintf("[%s] Monitor %s: %s", status, m.Name, status)
	msg := fmt.Sprintf("El endpoint \"%s\" del grupo \"%s\" (%s) cambió a estado %s.", m.Name, groupName, m.Target, status)
	if errMsg != "" {
		msg += fmt.Sprintf("\nDetalle: %s", errMsg)
	}

	color := "FF0000" // Red for DOWN
	if status == "UP" {
		color = "00FF00" // Green for UP/RECOVERED
	} else if status == "DEGRADED" {
		color = "FFA500" // Orange for DEGRADED
	}

	go d.sendTeams(title, msg, color)
	go d.sendGChat(title, msg)
	go d.sendEmail(m, groupName, status, errMsg, title, msg)
	go d.sendTelegram(status, m.Name, groupName, m.Target, errMsg)
}

func (d *Dispatcher) sendTelegram(status, name, groupName, target, errMsg string) {
	token := d.GetSetting("telegram_bot_token", "TELEGRAM_BOT_TOKEN")
	chatIDsStr := d.GetSetting("telegram_chat_id", "TELEGRAM_CHAT_ID")
	if token == "" || chatIDsStr == "" {
		return
	}

	emoji := "🚨"
	if status == "UP" {
		emoji = "✅"
	} else if status == "DEGRADED" {
		emoji = "⚠️"
	} else if status == "MAINTENANCE" {
		emoji = "🔧"
	}

	text := fmt.Sprintf("%s <b>%s</b> del grupo <b>%s</b> (%s) está <b>%s</b>", emoji, name, groupName, target, status)
	if errMsg != "" {
		text += fmt.Sprintf("\n\n<i>Detalle:</i> %s", errMsg)
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	
	chatIDs := strings.Split(chatIDsStr, ",")
	for _, cid := range chatIDs {
		cid = strings.TrimSpace(cid)
		if cid == "" { continue }
		payload := map[string]interface{}{
			"chat_id":    cid,
			"text":       text,
			"parse_mode": "HTML",
		}
		d.postJSON(url, payload, "Telegram")
	}
}


func (d *Dispatcher) sendTeams(title, text, color string) {
	if d.cfg.TeamsWebhook == "" {
		return
	}
	payload := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "http://schema.org/extensions",
		"themeColor": color,
		"summary":    title,
		"sections": []map[string]interface{}{
			{
				"activityTitle":    title,
				"activitySubtitle": time.Now().Format(time.RFC1123),
				"text":             text,
			},
		},
	}
	d.postJSON(d.cfg.TeamsWebhook, payload, "Teams")
}

func (d *Dispatcher) sendGChat(title, text string) {
	if d.cfg.GChatWebhook == "" {
		return
	}
	payload := map[string]interface{}{
		"text": fmt.Sprintf("*%s*\n%s", title, text),
	}
	d.postJSON(d.cfg.GChatWebhook, payload, "Google Chat")
}

func (d *Dispatcher) formatSubject(template string, m models.Monitor, groupName, status string) string {
	res := template
	portStr := ""
	if m.Port != nil && *m.Port > 0 {
		portStr = fmt.Sprintf(":%d", *m.Port)
	}

	replacements := map[string]string{
		"{group}":      groupName,
		"{{group}}":    groupName,
		"{monitor}":    m.Name,
		"{{monitor}}":  m.Name,
		"{endpoint}":   m.Name,
		"{{endpoint}}": m.Name,
		"{status}":     status,
		"{{status}}":   status,
		"{target}":     m.Target,
		"{{target}}":   m.Target,
		"{ip}":         m.Target,
		"{{ip}}":       m.Target,
		"{port}":       portStr,
		"{{port}}":     portStr,
		"{type}":       m.Type,
		"{{type}}":     m.Type,
	}

	for k, v := range replacements {
		res = strings.ReplaceAll(res, k, v)
	}
	return strings.TrimSpace(res)
}

func (d *Dispatcher) getEmailSubject(m models.Monitor, groupName, status, defaultTitle string) string {
	if status == "UP" {
		tmplUp := d.GetSetting("smtp_subject_up", "")
		if tmplUp != "" {
			return d.formatSubject(tmplUp, m, groupName, status)
		}
		downTmpl := d.GetSetting("smtp_subject_down", "")
		if downTmpl == "" {
			downTmpl = d.GetSetting("smtp_subject_template", "")
		}
		if downTmpl != "" {
			if strings.Contains(strings.ToLower(downTmpl), "status") {
				return d.formatSubject(downTmpl, m, groupName, status)
			}
			return fmt.Sprintf("[RECUPERADO] %s", d.formatSubject(downTmpl, m, groupName, status))
		}
		return fmt.Sprintf("[RECUPERADO] %s - %s", groupName, m.Name)
	}

	tmplDown := d.GetSetting("smtp_subject_down", "")
	if tmplDown == "" {
		tmplDown = d.GetSetting("smtp_subject_template", "")
	}
	if tmplDown != "" {
		return d.formatSubject(tmplDown, m, groupName, status)
	}

	if groupName != "" && groupName != "Sin Grupo" {
		return fmt.Sprintf("[%s] %s - %s", status, groupName, m.Name)
	}
	return defaultTitle
}

func (d *Dispatcher) getEmailBody(m models.Monitor, groupName string, status string, errMsg string, defaultBody string) string {
	stateLabel := "CAÍDA / NO DISPONIBLE"
	emoji := "🚨"
	if status == "UP" {
		stateLabel = "OPERATIVO / RECUPERADO"
		emoji = "✅"
	} else if status == "DEGRADED" {
		stateLabel = "RENDIMIENTO DEGRADADO"
		emoji = "⚠️"
	} else if status == "MAINTENANCE" {
		stateLabel = "EN MANTENIMIENTO"
		emoji = "🔧"
	}

	portStr := ""
	if m.Port != nil && *m.Port > 0 {
		portStr = fmt.Sprintf(":%d", *m.Port)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s NOTIFICACIÓN DE TELEMETRÍA - UPTIMECORE\n", emoji))
	sb.WriteString(strings.Repeat("=", 48) + "\n\n")
	sb.WriteString(fmt.Sprintf("• Grupo:    %s\n", groupName))
	sb.WriteString(fmt.Sprintf("• Endpoint: %s\n", m.Name))
	sb.WriteString(fmt.Sprintf("• Destino:  %s%s (%s)\n", m.Target, portStr, m.Type))
	sb.WriteString(fmt.Sprintf("• Estado:   %s (%s)\n", status, stateLabel))
	sb.WriteString(fmt.Sprintf("• Fecha:    %s\n", time.Now().Format("2006-01-02 15:04:05 MST")))

	if errMsg != "" {
		sb.WriteString(fmt.Sprintf("\nDetalle técnico:\n%s\n", errMsg))
	}
	sb.WriteString("\n" + strings.Repeat("-", 48) + "\n")
	sb.WriteString("Mensaje generado automáticamente por UptimeCore.")

	return sb.String()
}

func (d *Dispatcher) sendEmail(m models.Monitor, groupName string, status string, errMsg string, defaultTitle string, defaultBody string) {
	smtpTo := d.GetSetting("smtp_to", "SMTP_TO")
	if smtpTo == "" {
		smtpTo = d.cfg.SmtpTo
	}
	if smtpTo == "" {
		return
	}

	subject := d.getEmailSubject(m, groupName, status, defaultTitle)
	body := d.getEmailBody(m, groupName, status, errMsg, defaultBody)

	emails := strings.Split(smtpTo, ",")
	for _, email := range emails {
		email = strings.TrimSpace(email)
		if email == "" { continue }
		go d.sendEmailTo(subject, body, email)
	}
}

var ipv4Client = &http.Client{
	Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext(ctx, "tcp4", addr)
		},
	},
	Timeout: 15 * time.Second,
}

func (d *Dispatcher) postJSON(url string, payload interface{}, service string) {
	body, _ := json.Marshal(payload)
	resp, err := ipv4Client.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("⚠️  Error sending %s webhook: %v", service, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("⚠️  %s webhook returned status: %d", service, resp.StatusCode)
	}
}

// SendEscalation envía alertas secundarias tras alcanzar el timeout de escalación.
func (d *Dispatcher) SendEscalation(m models.Monitor, groupName string, status string, errMsg string) {
	title := fmt.Sprintf("ESCALATION: [%s] %s", status, m.Name)
	msg := fmt.Sprintf("URGENTE: El endpoint \"%s\" del grupo \"%s\" (%s) lleva caído demasiado tiempo (estado %s).", m.Name, groupName, m.Target, status)
	if status == "UP" {
		title = fmt.Sprintf("ESCALATION RECOVERED: %s", m.Name)
		msg = fmt.Sprintf("El endpoint \"%s\" del grupo \"%s\" ha sido recuperado tras haber estado escalado.", m.Name, groupName)
	} else if errMsg != "" {
		msg += fmt.Sprintf("\nDetalle: %s", errMsg)
	}
	
	// Telegram Secundario (Múltiples separados por coma)
	token := d.GetSetting("escalation_telegram_bot_token", "")
	if token == "" {
		token = d.GetSetting("telegram_bot_token", "TELEGRAM_BOT_TOKEN")
	}
	chatIDsStr := d.GetSetting("escalation_telegram_chat_id", "")
	if token != "" && chatIDsStr != "" {
		chatIDs := strings.Split(chatIDsStr, ",")
		for _, cid := range chatIDs {
			cid = strings.TrimSpace(cid)
			if cid == "" { continue }
			url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
			emoji := "🚨"
			if status == "UP" {
				emoji = "✅"
			}
			text := fmt.Sprintf("%s <b>ESCALACIÓN</b> %s\n<b>%s</b> del grupo <b>%s</b>.\n<i>%s</i>", emoji, emoji, m.Name, groupName, errMsg)
			if status == "UP" {
				text = fmt.Sprintf("✅ <b>ESCALACIÓN RECUPERADA</b> ✅\n<b>%s</b> del grupo <b>%s</b> volvió a la normalidad.", m.Name, groupName)
			}
			d.postJSON(url, map[string]interface{}{"chat_id": cid, "text": text, "parse_mode": "HTML"}, "Telegram Escalation")
		}
	}

	// Email Secundario (Múltiples separados por coma)
	escalationEmailsStr := d.GetSetting("escalation_smtp_to", "")
	if escalationEmailsStr != "" {
		emails := strings.Split(escalationEmailsStr, ",")
		subject := d.getEmailSubject(m, groupName, status, title)
		if !strings.HasPrefix(subject, "[ESCALACIÓN]") && !strings.HasPrefix(subject, "ESCALATION") {
			subject = "[ESCALACIÓN] " + subject
		}
		body := d.getEmailBody(m, groupName, status, errMsg, msg)
		for _, email := range emails {
			email = strings.TrimSpace(email)
			if email == "" { continue }
			go d.sendEmailTo(subject, body, email)
		}
	}
}

func (d *Dispatcher) sendEmailTo(subject, body, customTo string) {
	smtpUser := d.GetSetting("smtp_user", "SMTP_USER")
	smtpPass := d.GetSetting("smtp_pass", "SMTP_PASS")
	if smtpUser == "" {
		smtpUser = d.cfg.SmtpUser
		smtpPass = d.cfg.SmtpPass
	}
	if smtpUser == "" || customTo == "" || smtpPass == "" {
		return
	}
	smtpHost := d.GetSetting("smtp_host", "SMTP_HOST")
	if smtpHost == "" {
		smtpHost = d.cfg.SmtpHost
	}
	if smtpHost == "" {
		smtpHost = "smtp.gmail.com"
	}
	smtpPort := d.GetSetting("smtp_port", "SMTP_PORT")
	if smtpPort == "" {
		smtpPort = d.cfg.SmtpPort
	}
	if smtpPort == "" {
		smtpPort = "587"
	}

	fromName := d.GetSetting("smtp_from_name", "SMTP_FROM_NAME")
	if fromName == "" {
		fromName = "UptimeCore Alertas"
	}

	encodedSubject := mime.QEncoding.Encode("utf-8", subject)
	encodedFromName := mime.QEncoding.Encode("utf-8", fromName)

	var msgBuffer bytes.Buffer
	msgBuffer.WriteString(fmt.Sprintf("From: %s <%s>\r\n", encodedFromName, smtpUser))
	msgBuffer.WriteString(fmt.Sprintf("To: %s\r\n", customTo))
	msgBuffer.WriteString(fmt.Sprintf("Subject: %s\r\n", encodedSubject))
	msgBuffer.WriteString("MIME-Version: 1.0\r\n")
	msgBuffer.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	msgBuffer.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	msgBuffer.WriteString("\r\n")
	msgBuffer.WriteString(body)
	msgBuffer.WriteString("\r\n")

	msg := msgBuffer.Bytes()
	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)

	conn, err := net.Dial("tcp4", addr)
	if err != nil {
		log.Printf("⚠️  Error dialing SMTP over tcp4: %v", err)
		return
	}
	defer conn.Close()
	client, err := smtp.NewClient(conn, smtpHost)
	if err != nil {
		return
	}
	if err = client.Hello("uptimecore"); err != nil {
		return
	}
	if err = client.StartTLS(&tls.Config{ServerName: smtpHost}); err == nil {
		if err = client.Auth(auth); err != nil {
			return
		}
	}
	if err = client.Mail(smtpUser); err != nil {
		return
	}
	if err = client.Rcpt(customTo); err != nil {
		return
	}
	w, err := client.Data()
	if err != nil {
		return
	}
	_, err = w.Write(msg)
	if err != nil {
		return
	}
	err = w.Close()
	if err != nil {
		log.Printf("⚠️  Error sending SMTP email: %v", err)
	}
	client.Quit()
}
