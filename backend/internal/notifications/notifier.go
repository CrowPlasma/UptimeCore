package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"context"
	"crypto/tls"
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
	go d.sendEmail(title, msg)
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

func (d *Dispatcher) sendEmail(subject, body string) {
	smtpTo := d.GetSetting("smtp_to", "SMTP_TO")
	if smtpTo == "" {
		smtpTo = d.cfg.SmtpTo
	}
	if smtpTo == "" {
		return
	}

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
		for _, email := range emails {
			email = strings.TrimSpace(email)
			if email == "" { continue }
			go d.sendEmailTo(title, msg, email)
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

	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\n\r\n%s\r\n", customTo, subject, body))
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
