// Package monitor contains the polling engine and protocol checkers.
package monitor

import (
	"context"
	"database/sql"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/gosnmp/gosnmp"
	"ping-eye/internal/models"
)

// CheckHTTP performs an HTTP or HTTPS availability check.
func CheckHTTP(target string, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()

	client := &http.Client{
		Timeout: time.Duration(timeoutSec) * time.Second,
		Transport: &http.Transport{
			TLSHandshakeTimeout: time.Duration(timeoutSec) * time.Second,
			DisableKeepAlives:   true,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	// Try HEAD first, fall back to GET if server doesn't support HEAD
	resp, err := client.Head(target)
	if err != nil {
		resp, err = client.Get(target)
	}
	r.LatencyMs = int(time.Since(start).Milliseconds())

	if err != nil {
		r.ErrorMsg = err.Error()
		return r
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		r.Status = models.StatusUP
	} else {
		r.ErrorMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return r
}

// CheckTCP checks if a TCP port is open on a host.
func CheckTCP(host string, port int, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()

	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), time.Duration(timeoutSec)*time.Second)
	r.LatencyMs = int(time.Since(start).Milliseconds())

	if err != nil {
		r.ErrorMsg = err.Error()
		return r
	}
	conn.Close()
	r.Status = models.StatusUP
	return r
}

// CheckPing performs an ICMP ping using the system ping binary.
// Requires NET_RAW capability in Docker (set via docker-compose cap_add).
func CheckPing(host string, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec+3)*time.Second)
	defer cancel()

	// Alpine/Linux ping: -c 1 packet, -W wait in seconds
	cmd := exec.CommandContext(ctx, "ping", "-c", "1", "-W", strconv.Itoa(timeoutSec), host)
	out, err := cmd.CombinedOutput()
	if err != nil {
		r.ErrorMsg = fmt.Sprintf("ping: %v", err)
		return r
	}

	// Parse "time=14.5 ms" or "time<1 ms" from output
	re := regexp.MustCompile(`time[=<](\d+\.?\d*)`)
	matches := re.FindStringSubmatch(string(out))
	if len(matches) < 2 {
		r.ErrorMsg = "could not parse ping output"
		return r
	}
	latF, _ := strconv.ParseFloat(matches[1], 64)
	r.LatencyMs = int(latF)
	r.Status = models.StatusUP
	return r
}


// CheckSNMP performs an SNMP Get request for a specific OID.
func CheckSNMP(target string, port int, community, oid string, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()


	params := &gosnmp.GoSNMP{
		Target:    target,
		Port:      uint16(port),
		Community: community,
		Version:   gosnmp.Version2c,
		Timeout:   time.Duration(timeoutSec) * time.Second,
		Retries:   1,
	}

	err := params.Connect()
	if err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = fmt.Sprintf("snmp connect: %v", err)
		return r
	}
	defer params.Conn.Close()

	oids := []string{oid}
	result, err := params.Get(oids)
	r.LatencyMs = int(time.Since(start).Milliseconds())

	if err != nil {
		r.ErrorMsg = fmt.Sprintf("snmp get: %v", err)
		return r
	}

	if len(result.Variables) == 0 || result.Variables[0].Type == gosnmp.NoSuchObject || result.Variables[0].Type == gosnmp.NoSuchInstance {
		r.ErrorMsg = "no such OID"
		return r
	}

	v := result.Variables[0].Value
	if v != nil {
		strVal := fmt.Sprintf("%v", v)
		if fVal, err := strconv.ParseFloat(strVal, 64); err == nil {
			r.MetricValue = &fVal
		} else {
			// If it's a byte slice (like an OctetString containing a number)
			if b, ok := v.([]byte); ok {
				if fVal, err := strconv.ParseFloat(string(b), 64); err == nil {
					r.MetricValue = &fVal
				}
			}
		}
	}

	r.Status = models.StatusUP
	return r
}


// CheckSSL reads the TLS certificate of a host and verifies expiration.
func CheckSSL(host string, port int, days int, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()

	// Strip https:// or http:// if user included it
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	// Strip trailing paths
	if idx := strings.Index(host, "/"); idx != -1 {
		host = host[:idx]
	}

	dialer := &net.Dialer{Timeout: time.Duration(timeoutSec) * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", fmt.Sprintf("%s:%d", host, port), &tls.Config{
		InsecureSkipVerify: true, // We still want to parse it even if root is untrusted, to check expiry
	})
	
	r.LatencyMs = int(time.Since(start).Milliseconds())

	if err != nil {
		r.ErrorMsg = fmt.Sprintf("tls connect: %v", err)
		return r
	}
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		r.ErrorMsg = "no certificates found"
		return r
	}

	cert := certs[0]
	daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)

	if daysLeft < 0 {
		r.ErrorMsg = fmt.Sprintf("certificate EXPIRED %d days ago", -daysLeft)
		return r
	}
	if daysLeft <= days {
		r.ErrorMsg = fmt.Sprintf("Vence en %d días (Umbral: %d)", daysLeft, days)
		return r
	}

	r.Status = models.StatusUP
	r.ErrorMsg = fmt.Sprintf("Válido por %d días", daysLeft)
	return r
}

// RunCheck dispatches to the correct checker based on monitor type.
func RunCheck(m models.Monitor) models.CheckResult {
	var r models.CheckResult

	switch m.Type {
	case "HTTP", "HTTPS":
		r = CheckHTTP(m.Target, m.TimeoutSeconds)
	case "TCP", "TCP_PING":
		port := 80
		if m.Port != nil {
			port = *m.Port
		}
		r = CheckTCP(m.Target, port, m.TimeoutSeconds)
	case "PING", "ICMP":
		r = CheckPing(m.Target, m.TimeoutSeconds)
	case "POSTGRESQL":
		r = CheckPostgres(m.Target, m.TimeoutSeconds)
	case "MYSQL", "MARIADB":
		r = CheckMySQL(m.Target, m.TimeoutSeconds)
	case "REDIS":
		r = CheckRedis(m.Target, m.TimeoutSeconds)
	case "SNMP":
		port := 161
		if m.Port != nil {
			port = *m.Port
		}
		comm := "public"
		if m.SnmpCommunity != nil && *m.SnmpCommunity != "" {
			comm = *m.SnmpCommunity
		}
		oid := ".1.3.6.1.2.1.1.3.0"
		if m.SnmpOID != nil && *m.SnmpOID != "" {
			oid = *m.SnmpOID
		}
		r = CheckSNMP(m.Target, port, comm, oid, m.TimeoutSeconds)
	case "SSL":
		port := 443
		if m.Port != nil {
			port = *m.Port
		}
		days := 7
		if m.SslExpirationDays != nil {
			days = *m.SslExpirationDays
		}
		r = CheckSSL(m.Target, port, days, m.TimeoutSeconds)
	default:
		r.Status = models.StatusUNKNOWN
		r.CheckedAt = time.Now()
		r.ErrorMsg = fmt.Sprintf("unknown type: %s", m.Type)
	}

	if r.Status == models.StatusUP {
		// Define degraded threshold: Half of the timeout, minimum 1500ms
		threshold := (m.TimeoutSeconds * 1000) / 2
		if threshold < 1500 {
			threshold = 1500
		}
		if r.LatencyMs > threshold {
			r.Status = models.StatusDEGRADED
			r.ErrorMsg = fmt.Sprintf("High latency (%d ms)", r.LatencyMs)
		}
	}

	r.MonitorID = m.ID
	return r
}

func CheckPostgres(uri string, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()
	
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, uri)
	if err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = err.Error()
		return r
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = err.Error()
		return r
	}

	r.LatencyMs = int(time.Since(start).Milliseconds())
	r.Status = models.StatusUP
	return r
}

func CheckMySQL(uri string, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()

	db, err := sql.Open("mysql", uri)
	if err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = err.Error()
		return r
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = err.Error()
		return r
	}

	r.LatencyMs = int(time.Since(start).Milliseconds())
	r.Status = models.StatusUP
	return r
}

func CheckRedis(uri string, timeoutSec int) models.CheckResult {
	r := models.CheckResult{Status: models.StatusDOWN, CheckedAt: time.Now()}
	start := time.Now()

	opts, err := redis.ParseURL(uri)
	if err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = err.Error()
		return r
	}

	client := redis.NewClient(opts)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		r.LatencyMs = int(time.Since(start).Milliseconds())
		r.ErrorMsg = err.Error()
		return r
	}

	r.LatencyMs = int(time.Since(start).Milliseconds())
	r.Status = models.StatusUP
	return r
}
