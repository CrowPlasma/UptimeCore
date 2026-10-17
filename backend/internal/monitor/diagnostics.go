package monitor

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// DiagnosticRequest represents a single live diagnostic probe request.
type DiagnosticRequest struct {
	Mode      string `json:"mode"`       // PAPING, PING, TRACEROUTE_HOP, HTTP, DNS
	Target    string `json:"target"`     // IP, hostname, or URL
	Port      int    `json:"port"`       // TCP port for PAPING / HTTP / SSL
	Hop       int    `json:"hop"`        // TTL / Hop number (1..30) for TRACEROUTE_HOP
	Seq       int    `json:"seq"`        // Sequence number (1, 2, 3...) for live console output
	TimeoutMs int    `json:"timeout_ms"` // Timeout in milliseconds (default 2500)
}

// DiagnosticResponse is returned to the live diagnostic terminal modal.
type DiagnosticResponse struct {
	Ok          bool              `json:"ok"`
	Mode        string            `json:"mode"`
	Host        string            `json:"host"`
	ResolvedIP  string            `json:"resolved_ip,omitempty"`
	Port        int               `json:"port,omitempty"`
	Seq         int               `json:"seq,omitempty"`
	LatencyMs   float64           `json:"latency_ms"`
	TTL         int               `json:"ttl,omitempty"`
	Hop         int               `json:"hop,omitempty"`
	HopIP       string            `json:"hop_ip,omitempty"`
	Reached     bool              `json:"reached,omitempty"`
	Timeout     bool              `json:"timeout,omitempty"`
	StatusCode  int               `json:"status_code,omitempty"`
	RawLine     string            `json:"raw_line"`
	RawLines    []string          `json:"raw_lines,omitempty"`
	Details     map[string]string `json:"details,omitempty"`
	ErrorMsg    string            `json:"error_msg,omitempty"`
	CheckedAt   string            `json:"checked_at"`
}

// cleanHost extracts the clean hostname or IP from a target that might contain http(s)://, paths, or :port.
func cleanHost(raw string) (string, int) {
	s := strings.TrimSpace(raw)
	detectedPort := 0
	if strings.HasPrefix(strings.ToLower(s), "http://") || strings.HasPrefix(strings.ToLower(s), "https://") {
		if u, err := url.Parse(s); err == nil && u.Host != "" {
			if strings.EqualFold(u.Scheme, "https") {
				detectedPort = 443
			} else {
				detectedPort = 80
			}
			s = u.Host
		}
	}
	if idx := strings.Index(s, "/"); idx != -1 {
		s = s[:idx]
	}
	if h, pStr, err := net.SplitHostPort(s); err == nil {
		if p, err2 := strconv.Atoi(pStr); err2 == nil {
			detectedPort = p
		}
		return h, detectedPort
	}
	return s, detectedPort
}

// resolveIPv4 resolves a hostname to its primary IPv4 (or IP) string.
func resolveIPv4(host string) string {
	if ip := net.ParseIP(host); ip != nil {
		return ip.String()
	}
	addrs, err := net.LookupIP(host)
	if err != nil || len(addrs) == 0 {
		return host
	}
	for _, a := range addrs {
		if v4 := a.To4(); v4 != nil {
			return v4.String()
		}
	}
	return addrs[0].String()
}

// RunDiagnosticProbe executes a live diagnostic probe according to req.Mode.
func RunDiagnosticProbe(ctx context.Context, req DiagnosticRequest) DiagnosticResponse {
	mode := strings.ToUpper(strings.TrimSpace(req.Mode))
	host, detectedPort := cleanHost(req.Target)
	port := req.Port
	if port <= 0 {
		if detectedPort > 0 {
			port = detectedPort
		} else {
			port = 80
		}
	}
	timeoutMs := req.TimeoutMs
	if timeoutMs < 300 || timeoutMs > 10000 {
		timeoutMs = 2500
	}
	seq := req.Seq
	if seq <= 0 {
		seq = 1
	}

	switch mode {
	case "PAPING", "TCP":
		return runPapingProbe(ctx, host, port, seq, timeoutMs)
	case "PING", "ICMP":
		return runPingProbe(ctx, host, seq, timeoutMs)
	case "TRACEROUTE_HOP", "TRACEROUTE":
		hop := req.Hop
		if hop <= 0 {
			hop = 1
		}
		return runTracerouteHopProbe(ctx, host, hop, timeoutMs)
	case "HTTP", "HTTPS", "SSL":
		return runHTTPDiagnostic(ctx, req.Target, host, port, timeoutMs)
	case "DNS":
		return runDNSDiagnostic(ctx, host)
	default:
		return runPapingProbe(ctx, host, port, seq, timeoutMs)
	}
}

// runPapingProbe connects via TCP to host:port and measures exact handshake RTT in milliseconds (with 2 decimal places).
func runPapingProbe(ctx context.Context, host string, port int, seq int, timeoutMs int) DiagnosticResponse {
	res := DiagnosticResponse{
		Mode:      "PAPING",
		Host:      host,
		Port:      port,
		Seq:       seq,
		CheckedAt: time.Now().Format("15:04:05"),
	}

	resolvedIP := resolveIPv4(host)
	res.ResolvedIP = resolvedIP

	start := time.Now()
	dialer := net.Dialer{Timeout: time.Duration(timeoutMs) * time.Millisecond}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0
	if elapsedMs <= 0 {
		elapsedMs = 0.05
	}

	if err != nil {
		res.Ok = false
		res.Timeout = true
		res.LatencyMs = 0
		res.ErrorMsg = err.Error()
		errFriendly := "Tiempo de espera agotado (Puerto filtrado / Host inalcanzable)"
		errLower := strings.ToLower(err.Error())
		if strings.Contains(errLower, "refused") {
			errFriendly = "Conexión rechazada (Host activo, pero puerto TCP cerrado)"
		} else if strings.Contains(errLower, "no such host") {
			errFriendly = "No se pudo resolver el nombre DNS del host"
		} else if strings.Contains(errLower, "network is unreachable") || strings.Contains(errLower, "no route to host") {
			errFriendly = "Sin ruta hacia el host (Inalcanzable en red)"
		}
		res.RawLine = fmt.Sprintf("[#%02d] Conectando a %s (%s) en TCP %d: FALLÓ — %s", seq, host, resolvedIP, port, errFriendly)
		return res
	}
	_ = conn.Close()

	res.Ok = true
	res.LatencyMs = float64(int(elapsedMs*100+0.5)) / 100.0
	res.RawLine = fmt.Sprintf("[#%02d] Conectando a %s (%s) en TCP %d: ¡Conectado! tiempo=%.2fms protocolo=TCP puerto=%d", seq, host, resolvedIP, port, res.LatencyMs, port)
	return res
}

// runPingProbe sends a single ICMP Echo Request and parses RTT and TTL.
func runPingProbe(parentCtx context.Context, host string, seq int, timeoutMs int) DiagnosticResponse {
	res := DiagnosticResponse{
		Mode:      "PING",
		Host:      host,
		Seq:       seq,
		CheckedAt: time.Now().Format("15:04:05"),
	}

	resolvedIP := resolveIPv4(host)
	res.ResolvedIP = resolvedIP

	timeoutSec := timeoutMs / 1000
	if timeoutSec < 1 {
		timeoutSec = 1
	}
	if timeoutSec > 5 {
		timeoutSec = 5
	}

	ctx, cancel := context.WithTimeout(parentCtx, time.Duration(timeoutSec+2)*time.Second)
	defer cancel()

	start := time.Now()
	cmd := exec.CommandContext(ctx, "ping", "-c", "1", "-W", strconv.Itoa(timeoutSec), host)
	outBytes, err := cmd.CombinedOutput()
	out := string(outBytes)
	elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0

	if err != nil {
		res.Ok = false
		res.Timeout = true
		res.ErrorMsg = err.Error()
		res.RawLine = fmt.Sprintf("[#%02d] Respuesta desde %s (%s): Tiempo de espera agotado para ICMP (Paquete perdido)", seq, host, resolvedIP)
		return res
	}

	reTime := regexp.MustCompile(`time[=<](\d+\.?\d*)`)
	reTTL := regexp.MustCompile(`(?i)ttl=(\d+)`)

	latF := elapsedMs
	if m := reTime.FindStringSubmatch(out); len(m) >= 2 {
		if parsed, err2 := strconv.ParseFloat(m[1], 64); err2 == nil {
			latF = parsed
		}
	}
	ttl := 64
	if m := reTTL.FindStringSubmatch(out); len(m) >= 2 {
		if parsed, err2 := strconv.Atoi(m[1]); err2 == nil {
			ttl = parsed
		}
	}

	res.Ok = true
	res.TTL = ttl
	res.LatencyMs = float64(int(latF*100+0.5)) / 100.0
	if res.LatencyMs <= 0 {
		res.LatencyMs = 0.1
	}
	res.RawLine = fmt.Sprintf("[#%02d] 64 bytes desde %s (%s): icmp_seq=%d ttl=%d tiempo=%.2f ms", seq, host, resolvedIP, seq, ttl, res.LatencyMs)
	return res
}

// runTracerouteHopProbe probes a single TTL hop (1..30) using traceroute -f <hop> -m <hop> (with ping -t <hop> fallback).
func runTracerouteHopProbe(parentCtx context.Context, host string, hop int, timeoutMs int) DiagnosticResponse {
	if hop < 1 {
		hop = 1
	}
	if hop > 30 {
		hop = 30
	}

	resolvedIP := resolveIPv4(host)
	res := DiagnosticResponse{
		Mode:       "TRACEROUTE_HOP",
		Host:       host,
		ResolvedIP: resolvedIP,
		Hop:        hop,
		CheckedAt:  time.Now().Format("15:04:05"),
	}

	ctx, cancel := context.WithTimeout(parentCtx, 3500*time.Millisecond)
	defer cancel()

	// Try BusyBox/Linux traceroute for this exact hop: -n (no DNS lag), -w 1 (1s wait), -q 2 (2 probes), -f hop, -m hop
	start := time.Now()
	cmd := exec.CommandContext(ctx, "traceroute", "-n", "-w", "1", "-q", "2", "-f", strconv.Itoa(hop), "-m", strconv.Itoa(hop), host)
	outBytes, _ := cmd.CombinedOutput()
	out := string(outBytes)

	reIP := regexp.MustCompile(`(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})`)
	reTime := regexp.MustCompile(`(\d+\.?\d*)\s*ms`)

	lines := strings.Split(out, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(strings.ToLower(trimmed), "traceroute to") {
			continue
		}
		ips := reIP.FindAllString(trimmed, -1)
		if len(ips) > 0 {
			hopIP := ips[0]
			var latF float64
			if tm := reTime.FindStringSubmatch(trimmed); len(tm) >= 2 {
				latF, _ = strconv.ParseFloat(tm[1], 64)
			} else {
				latF = float64(time.Since(start).Microseconds()) / 1000.0
			}
			res.Ok = true
			res.HopIP = hopIP
			res.LatencyMs = float64(int(latF*100+0.5)) / 100.0
			res.Reached = (hopIP == resolvedIP)
			tag := ""
			if res.Reached {
				tag = "  ✅ [DESTINO ALCANZADO]"
			}
			res.RawLine = fmt.Sprintf("Salto %02d   %-18s   %7.2f ms%s", hop, hopIP, res.LatencyMs, tag)
			return res
		}
	}

	// Fallback: try ping -c 1 -W 1 -t <hop> <host> in case UDP traceroute is filtered by firewall
	ctxPing, cancelPing := context.WithTimeout(parentCtx, 2000*time.Millisecond)
	defer cancelPing()
	startPing := time.Now()
	pingCmd := exec.CommandContext(ctxPing, "ping", "-c", "1", "-W", "1", "-t", strconv.Itoa(hop), host)
	pingBytes, _ := pingCmd.CombinedOutput()
	pingOut := string(pingBytes)
	elapsedPing := float64(time.Since(startPing).Microseconds()) / 1000.0

	for _, line := range strings.Split(pingOut, "\n") {
		trimmed := strings.TrimSpace(line)
		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "ping ") || trimmed == "" {
			continue
		}
		if strings.Contains(lower, "time to live exceeded") || strings.Contains(lower, "ttl exceeded") || strings.Contains(lower, "bytes from") {
			ips := reIP.FindAllString(trimmed, -1)
			if len(ips) > 0 {
				hopIP := ips[0]
				latF := elapsedPing
				if tm := reTime.FindStringSubmatch(trimmed); len(tm) >= 2 {
					if parsed, err2 := strconv.ParseFloat(tm[1], 64); err2 == nil {
						latF = parsed
					}
				}
				res.Ok = true
				res.HopIP = hopIP
				res.LatencyMs = float64(int(latF*100+0.5)) / 100.0
				res.Reached = (hopIP == resolvedIP) || strings.Contains(lower, "bytes from")
				tag := ""
				if res.Reached {
					tag = "  ✅ [DESTINO ALCANZADO]"
				}
				res.RawLine = fmt.Sprintf("Salto %02d   %-18s   %7.2f ms%s", hop, hopIP, res.LatencyMs, tag)
				return res
			}
		}
	}

	// Hop timed out (* * *)
	res.Ok = false
	res.Timeout = true
	res.HopIP = "*"
	res.LatencyMs = 0
	res.RawLine = fmt.Sprintf("Salto %02d   * * *                Sin respuesta ICMP/UDP (Salto oculto o firewall)", hop)
	return res
}

// runHTTPDiagnostic inspects HTTP/HTTPS status, headers, response latency, and TLS certificate metadata.
func runHTTPDiagnostic(ctx context.Context, rawTarget string, host string, port int, timeoutMs int) DiagnosticResponse {
	res := DiagnosticResponse{
		Mode:      "HTTP",
		Host:      host,
		Port:      port,
		Details:   make(map[string]string),
		RawLines:  []string{},
		CheckedAt: time.Now().Format("15:04:05"),
	}

	resolvedIP := resolveIPv4(host)
	res.ResolvedIP = resolvedIP

	targetURL := strings.TrimSpace(rawTarget)
	if !strings.HasPrefix(strings.ToLower(targetURL), "http://") && !strings.HasPrefix(strings.ToLower(targetURL), "https://") {
		scheme := "http"
		if port == 443 || port == 8443 {
			scheme = "https"
		}
		if (scheme == "http" && port == 80) || (scheme == "https" && port == 443) {
			targetURL = fmt.Sprintf("%s://%s", scheme, host)
		} else {
			targetURL = fmt.Sprintf("%s://%s:%d", scheme, host, port)
		}
	}

	reqCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	start := time.Now()
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			TLSHandshakeTimeout: time.Duration(timeoutMs) * time.Millisecond,
			DisableKeepAlives:   true,
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		},
	}

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL, nil)
	if err != nil {
		res.Ok = false
		res.ErrorMsg = err.Error()
		res.RawLine = fmt.Sprintf("❌ URL inválida (%s): %v", targetURL, err)
		return res
	}
	req.Header.Set("User-Agent", "UptimeCore-Diagnostic/2.0")

	resp, err := client.Do(req)
	elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0
	res.LatencyMs = float64(int(elapsedMs*100+0.5)) / 100.0

	if err != nil {
		res.Ok = false
		res.ErrorMsg = err.Error()
		res.RawLine = fmt.Sprintf("❌ Error conectando a %s (%s): %v", targetURL, resolvedIP, err)
		res.RawLines = []string{res.RawLine}
		return res
	}
	defer resp.Body.Close()

	res.Ok = resp.StatusCode >= 200 && resp.StatusCode < 404
	res.StatusCode = resp.StatusCode
	res.Details["url"] = targetURL
	res.Details["status"] = fmt.Sprintf("%d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	res.Details["protocol"] = resp.Proto
	if srv := resp.Header.Get("Server"); srv != "" {
		res.Details["server"] = srv
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		res.Details["content_type"] = ct
	}

	res.RawLines = append(res.RawLines,
		fmt.Sprintf("🌐 URL Probada      : %s (IP: %s)", targetURL, resolvedIP),
		fmt.Sprintf("⚡ Estado HTTP      : %d %s (%s) en %.2f ms", resp.StatusCode, http.StatusText(resp.StatusCode), resp.Proto, res.LatencyMs),
	)
	if srv := resp.Header.Get("Server"); srv != "" {
		res.RawLines = append(res.RawLines, fmt.Sprintf("🖥️ Servidor Web     : %s", srv))
	}

	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
		res.Details["ssl_subject"] = cert.Subject.CommonName
		if len(cert.Issuer.Organization) > 0 {
			res.Details["ssl_issuer"] = strings.Join(cert.Issuer.Organization, ", ")
		} else {
			res.Details["ssl_issuer"] = cert.Issuer.CommonName
		}
		res.Details["ssl_expires"] = cert.NotAfter.Format("2006-01-02 15:04 MST")
		res.Details["ssl_days_left"] = strconv.Itoa(daysLeft)
		res.RawLines = append(res.RawLines,
			fmt.Sprintf("🔒 Certificado SSL  : %s (Emisor: %s)", cert.Subject.CommonName, res.Details["ssl_issuer"]),
			fmt.Sprintf("📅 Vigencia SSL     : Vence el %s (%d días restantes)", cert.NotAfter.Format("2006-01-02"), daysLeft),
		)
	}

	res.RawLine = strings.Join(res.RawLines, "\n")
	return res
}

// runDNSDiagnostic resolves A, AAAA, CNAME, and reverse PTR records for a host or IP.
func runDNSDiagnostic(ctx context.Context, host string) DiagnosticResponse {
	res := DiagnosticResponse{
		Mode:      "DNS",
		Host:      host,
		Details:   make(map[string]string),
		RawLines:  []string{},
		CheckedAt: time.Now().Format("15:04:05"),
	}

	start := time.Now()
	resolver := net.Resolver{}

	if ip := net.ParseIP(host); ip != nil {
		// Reverse DNS (PTR) + confirm IP
		res.ResolvedIP = ip.String()
		names, err := resolver.LookupAddr(ctx, host)
		elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0
		res.LatencyMs = float64(int(elapsedMs*100+0.5)) / 100.0
		res.Ok = true
		res.RawLines = append(res.RawLines, fmt.Sprintf("🔎 Consulta DNS Inversa (PTR) para IP: %s (%.2f ms)", host, res.LatencyMs))
		if err == nil && len(names) > 0 {
			res.Details["ptr"] = strings.Join(names, ", ")
			for _, n := range names {
				res.RawLines = append(res.RawLines, fmt.Sprintf("   PTR  →  %s", n))
			}
		} else {
			res.RawLines = append(res.RawLines, "   ℹ️ Sin registro PTR inverso público configurado para esta IP.")
		}
		res.RawLine = strings.Join(res.RawLines, "\n")
		return res
	}

	addrs, err := resolver.LookupIPAddr(ctx, host)
	elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0
	res.LatencyMs = float64(int(elapsedMs*100+0.5)) / 100.0

	if err != nil || len(addrs) == 0 {
		res.Ok = false
		res.ErrorMsg = fmt.Sprintf("%v", err)
		res.RawLine = fmt.Sprintf("❌ Falló la resolución DNS para '%s' (%.2f ms): %v", host, res.LatencyMs, err)
		res.RawLines = []string{res.RawLine}
		return res
	}

	res.Ok = true
	res.ResolvedIP = addrs[0].IP.String()
	res.RawLines = append(res.RawLines, fmt.Sprintf("✅ Resolución DNS exitosa para '%s' en %.2f ms:", host, res.LatencyMs))

	if cname, errC := resolver.LookupCNAME(ctx, host); errC == nil && cname != "" && strings.TrimSuffix(cname, ".") != host {
		res.Details["cname"] = cname
		res.RawLines = append(res.RawLines, fmt.Sprintf("   CNAME  →  %s", cname))
	}

	var ipStrings []string
	for _, a := range addrs {
		recType := "A"
		if a.IP.To4() == nil {
			recType = "AAAA"
		}
		ipStrings = append(ipStrings, a.IP.String())
		res.RawLines = append(res.RawLines, fmt.Sprintf("   %-5s  →  %s", recType, a.IP.String()))
	}
	res.Details["ips"] = strings.Join(ipStrings, ", ")
	res.RawLine = strings.Join(res.RawLines, "\n")
	return res
}
