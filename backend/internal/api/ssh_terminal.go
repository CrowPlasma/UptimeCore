package api

// ssh_terminal.go
// Terminal web SSH (puente WebSocket <-> SSH) para la Consola de Diagnóstico.
//
// Flujo:
//   1. El navegador abre ws://<host>/api/ssh/ws
//   2. Envía {"type":"connect","host","port","user","password","cols","rows"}
//   3. El backend abre la sesión SSH (password / keyboard-interactive). Si no se envió
//      contraseña, la solicita al navegador mediante {"type":"prompt"} para que el
//      usuario la escriba DENTRO de la terminal (igual que PuTTY / MobaXterm).
//   4. Salida de la shell -> mensajes binarios. Entrada del usuario -> {"type":"data"}.
//
// 100% local: no usa servicios externos. Solo conecta del contenedor backend hacia el host destino.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/ssh"
)

type sshClientMsg struct {
	Type     string   `json:"type"`
	Host     string   `json:"host,omitempty"`
	Port     int      `json:"port,omitempty"`
	User     string   `json:"user,omitempty"`
	Password string   `json:"password,omitempty"`
	Cols     int      `json:"cols,omitempty"`
	Rows     int      `json:"rows,omitempty"`
	Data     string   `json:"data,omitempty"`
	Answers  []string `json:"answers,omitempty"`
}

type sshServerMsg struct {
	Type    string   `json:"type"`
	Message string   `json:"message,omitempty"`
	Prompts []string `json:"prompts,omitempty"`
	Echo    []bool   `json:"echo,omitempty"`
	Name    string   `json:"name,omitempty"`
	Fingerprint string `json:"fingerprint,omitempty"`
}

// wsWriter serializa todas las escrituras al WebSocket (gorilla/fasthttp websocket no es thread-safe para escribir).
type wsWriter struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (w *wsWriter) json(v sshServerMsg) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	_ = w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return w.conn.WriteJSON(v)
}

func (w *wsWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	_ = w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := w.conn.WriteMessage(websocket.BinaryMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

// webSSHEnabled permite deshabilitar la terminal con WEB_SSH_ENABLED=false
func webSSHEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("WEB_SSH_ENABLED")))
	return v != "false" && v != "0" && v != "no"
}

// SSHUpgradeGuard valida que la petición sea un upgrade WebSocket legítimo.
func SSHUpgradeGuard(c *fiber.Ctx) error {
	if !webSSHEnabled() {
		return c.Status(403).JSON(fiber.Map{"error": "La terminal SSH está deshabilitada (WEB_SSH_ENABLED=false)"})
	}
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("remote_ip", c.IP())
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// sshAlgorithms amplía la compatibilidad con equipos de red (Palo Alto PAN-OS, Cisco, Fortinet,
// MikroTik antiguos) que todavía negocian algoritmos heredados. Los no soportados se ignoran.
func sshAlgorithms(cfg *ssh.ClientConfig) {
	cfg.KeyExchanges = []string{
		"curve25519-sha256", "curve25519-sha256@libssh.org",
		"ecdh-sha2-nistp256", "ecdh-sha2-nistp384", "ecdh-sha2-nistp521",
		"diffie-hellman-group-exchange-sha256",
		"diffie-hellman-group14-sha256", "diffie-hellman-group16-sha512",
		"diffie-hellman-group14-sha1", "diffie-hellman-group-exchange-sha1",
		"diffie-hellman-group1-sha1",
	}
	cfg.Ciphers = []string{
		"chacha20-poly1305@openssh.com",
		"aes128-gcm@openssh.com", "aes256-gcm@openssh.com",
		"aes128-ctr", "aes192-ctr", "aes256-ctr",
		"aes128-cbc", "3des-cbc",
	}
	cfg.MACs = []string{
		"hmac-sha2-256-etm@openssh.com", "hmac-sha2-512-etm@openssh.com",
		"hmac-sha2-256", "hmac-sha2-512", "hmac-sha1", "hmac-sha1-96",
	}
	cfg.HostKeyAlgorithms = []string{
		ssh.KeyAlgoED25519,
		ssh.KeyAlgoECDSA256, ssh.KeyAlgoECDSA384, ssh.KeyAlgoECDSA521,
		ssh.KeyAlgoRSASHA512, ssh.KeyAlgoRSASHA256, ssh.KeyAlgoRSA,
		ssh.KeyAlgoDSA, //nolint:staticcheck // equipos legacy
	}
}

// SSHTerminalHandler es el handler WebSocket de la terminal.
func SSHTerminalHandler() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		remoteIP, _ := conn.Locals("remote_ip").(string)
		out := &wsWriter{conn: conn}
		defer conn.Close()

		// Canales alimentados por el lector del WebSocket
		connectCh := make(chan sshClientMsg, 1)
		dataCh := make(chan []byte, 256)
		resizeCh := make(chan [2]int, 8)
		promptCh := make(chan []string, 1)
		done := make(chan struct{})
		var closeOnce sync.Once
		closeDone := func() { closeOnce.Do(func() { close(done) }) }

		// Lector único del WebSocket
		go func() {
			defer closeDone()
			conn.SetReadLimit(1 << 20)
			for {
				_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second)) // el cliente envía ping cada 25s
				_, raw, err := conn.ReadMessage()
				if err != nil {
					return
				}
				var m sshClientMsg
				if err := json.Unmarshal(raw, &m); err != nil {
					continue
				}
				switch m.Type {
				case "connect":
					select {
					case connectCh <- m:
					default:
					}
				case "data":
					select {
					case dataCh <- []byte(m.Data):
					case <-done:
						return
					}
				case "resize":
					if m.Cols > 0 && m.Rows > 0 {
						select {
						case resizeCh <- [2]int{m.Cols, m.Rows}:
						default:
						}
					}
				case "prompt_response":
					select {
					case promptCh <- m.Answers:
					default:
					}
				case "ping":
					// keep-alive del navegador / proxy
				}
			}
		}()

		// 1) Esperar los parámetros de conexión
		var req sshClientMsg
		select {
		case req = <-connectCh:
		case <-done:
			return
		case <-time.After(2 * time.Minute):
			_ = out.json(sshServerMsg{Type: "error", Message: "Tiempo de espera agotado sin parámetros de conexión"})
			return
		}

		host := strings.TrimSpace(req.Host)
		user := strings.TrimSpace(req.User)
		if host == "" || user == "" {
			_ = out.json(sshServerMsg{Type: "error", Message: "Host y usuario son obligatorios"})
			return
		}
		port := req.Port
		if port <= 0 || port > 65535 {
			port = 22
		}
		cols, rows := req.Cols, req.Rows
		if cols <= 0 {
			cols = 120
		}
		if rows <= 0 {
			rows = 32
		}
		addr := net.JoinHostPort(host, strconv.Itoa(port))

		log.Printf("🔐 [WebSSH] %s abre sesión SSH -> %s@%s", remoteIP, user, addr)

		// Pide datos al usuario dentro de la terminal (contraseña / OTP / preguntas keyboard-interactive)
		askClient := func(name, instruction string, prompts []string, echos []bool) ([]string, error) {
			msg := name
			if instruction != "" {
				if msg != "" {
					msg += "\n"
				}
				msg += instruction
			}
			if err := out.json(sshServerMsg{Type: "prompt", Name: msg, Prompts: prompts, Echo: echos}); err != nil {
				return nil, err
			}
			select {
			case ans := <-promptCh:
				if len(ans) != len(prompts) {
					return nil, errors.New("respuesta de autenticación inválida")
				}
				return ans, nil
			case <-done:
				return nil, errors.New("conexión cerrada por el navegador")
			case <-time.After(3 * time.Minute):
				return nil, errors.New("tiempo de espera agotado para la autenticación")
			}
		}

		var authMethods []ssh.AuthMethod
		if req.Password != "" {
			pw := req.Password
			authMethods = append(authMethods,
				ssh.Password(pw),
				ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
					answers := make([]string, len(questions))
					allSecret := true
					for i := range questions {
						if echos[i] {
							allSecret = false
						}
						answers[i] = pw
					}
					if allSecret || len(questions) == 0 {
						return answers, nil
					}
					// Preguntas que requieren texto visible (p.ej. token / MFA): se delegan al usuario
					return askClient(name, instruction, questions, echos)
				}),
			)
		} else {
			// Contraseña tecleada dentro de la terminal, con 3 intentos como OpenSSH
			authMethods = append(authMethods,
				ssh.RetryableAuthMethod(ssh.PasswordCallback(func() (string, error) {
					ans, err := askClient("", "", []string{fmt.Sprintf("%s@%s's password: ", user, host)}, []bool{false})
					if err != nil {
						return "", err
					}
					return ans[0], nil
				}), 3),
				ssh.RetryableAuthMethod(ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
					if len(questions) == 0 {
						return []string{}, nil
					}
					return askClient(name, instruction, questions, echos)
				}), 3),
			)
		}

		var fingerprint string
		cfg := &ssh.ClientConfig{
			User: user,
			Auth: authMethods,
			HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
				// Se acepta la llave del host (equipos internos/administrados) y se muestra su huella al usuario.
				fingerprint = ssh.FingerprintSHA256(key)
				return nil
			},
			Timeout:       45 * time.Second,
			ClientVersion: "SSH-2.0-OpenSSH_8.9p1",
		}
		sshAlgorithms(cfg)

		_ = out.json(sshServerMsg{Type: "status", Message: fmt.Sprintf("Conectando a %s ...", addr)})

		tcpConn, err := net.DialTimeout("tcp", addr, 15*time.Second)
		if err != nil {
			_ = out.json(sshServerMsg{Type: "error", Message: "No se pudo abrir la conexión TCP: " + err.Error()})
			return
		}
		cc, chans, reqs, err := ssh.NewClientConn(tcpConn, addr, cfg)
		if err != nil {
			tcpConn.Close()
			msg := err.Error()
			if strings.Contains(msg, "unable to authenticate") {
				msg = "Autenticación fallida: usuario o contraseña incorrectos"
			} else if strings.Contains(msg, "EOF") {
				msg = "El equipo remoto cerró la conexión (EOF). Verifica que el puerto sea el de SSH (habitualmente 22) y que el usuario/contraseña sean correctos."
			}
			log.Printf("⚠️  [WebSSH] %s -> %s@%s: %v", remoteIP, user, addr, err)
			_ = out.json(sshServerMsg{Type: "error", Message: msg})
			return
		}
		client := ssh.NewClient(cc, chans, reqs)
		defer client.Close()

		session, err := client.NewSession()
		if err != nil {
			errMsg := err.Error()
			if strings.Contains(errMsg, "unexpected packet in response to channel open") || strings.Contains(errMsg, "<nil>") {
				errMsg = "El servidor aceptó la autenticación pero rechazó abrir el canal interactivo (canal SSH cerrado por el host remoto). Causas comunes: el usuario no tiene shell asignado (ej. /sbin/nologin), la cuenta requiere cambio de clave, o la respuesta al banner de seguridad requiere un formato específico (ej. YES en mayúsculas)."
			}
			log.Printf("⚠️  [WebSSH] %s -> %s@%s: error creando sesión: %v", remoteIP, user, addr, err)
			_ = out.json(sshServerMsg{Type: "error", Message: "No se pudo crear la sesión: " + errMsg})
			return
		}
		defer session.Close()

		modes := ssh.TerminalModes{
			ssh.ECHO:          1,
			ssh.TTY_OP_ISPEED: 38400,
			ssh.TTY_OP_OSPEED: 38400,
		}
		if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
			_ = out.json(sshServerMsg{Type: "error", Message: "El equipo rechazó la terminal (PTY): " + err.Error()})
			return
		}

		stdin, err := session.StdinPipe()
		if err != nil {
			_ = out.json(sshServerMsg{Type: "error", Message: err.Error()})
			return
		}
		session.Stdout = out
		session.Stderr = out

		if err := session.Shell(); err != nil {
			_ = out.json(sshServerMsg{Type: "error", Message: "No se pudo iniciar la shell: " + err.Error()})
			return
		}

		_ = out.json(sshServerMsg{Type: "connected", Message: fmt.Sprintf("%s@%s", user, addr), Fingerprint: fingerprint})
		log.Printf("✅ [WebSSH] Sesión establecida %s@%s (%s)", user, addr, fingerprint)

		sessionEnded := make(chan error, 1)
		go func() { sessionEnded <- session.Wait() }()

		// Keep-alive SSH para que firewalls intermedios no cierren sesiones inactivas
		keepAlive := time.NewTicker(30 * time.Second)
		defer keepAlive.Stop()

		for {
			select {
			case b := <-dataCh:
				if _, err := stdin.Write(b); err != nil && !errors.Is(err, io.EOF) {
					_ = out.json(sshServerMsg{Type: "closed", Message: "Sesión finalizada"})
					return
				}
			case sz := <-resizeCh:
				_ = session.WindowChange(sz[1], sz[0])
			case <-keepAlive.C:
				_, _, _ = client.SendRequest("keepalive@openssh.com", true, nil)
			case err := <-sessionEnded:
				reason := "Sesión finalizada por el equipo remoto"
				if err != nil {
					var exitErr *ssh.ExitError
					if errors.As(err, &exitErr) {
						reason = fmt.Sprintf("Sesión finalizada (código %d)", exitErr.ExitStatus())
					}
				}
				log.Printf("🔒 [WebSSH] Sesión cerrada %s@%s", user, addr)
				_ = out.json(sshServerMsg{Type: "closed", Message: reason})
				return
			case <-done:
				log.Printf("🔒 [WebSSH] Navegador cerró la sesión %s@%s", user, addr)
				return
			}
		}
	}, websocket.Config{
		HandshakeTimeout: 15 * time.Second,
		ReadBufferSize:   8192,
		WriteBufferSize:  32768,
	})
}
