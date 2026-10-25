// Package api contains the HTTP handlers and route definitions for UptimeCore.
package api

import (
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
	"ping-eye/internal/database"
	"ping-eye/internal/models"
	"ping-eye/internal/monitor"
)

// Handlers bundles all HTTP handler dependencies.
type Handlers struct {
	db     *database.DB
	cache  *database.Cache
	engine *monitor.Engine
}

// NewHandlers constructs a new Handlers instance.
func NewHandlers(db *database.DB, cache *database.Cache, engine *monitor.Engine) *Handlers {
	return &Handlers{db: db, cache: cache, engine: engine}
}

// computeGroupStatus derives the overall status from its monitors.
func computeGroupStatus(monitors []models.Monitor) models.MonitorStatus {
	if len(monitors) == 0 {
		return models.StatusUNKNOWN
	}
	hasUp, hasDeg, hasDown, hasMaint := false, false, false, false
	activeCount := 0

	for _, m := range monitors {
		if !m.IsActive || m.CurrentStatus == models.StatusPAUSED {
			continue
		}
		activeCount++
		switch m.CurrentStatus {
		case models.StatusUP:
			hasUp = true
		case models.StatusDEGRADED:
			hasDeg = true
		case models.StatusDOWN:
			hasDown = true
		case models.StatusMAINTENANCE:
			hasMaint = true
		}
	}

	if activeCount == 0 {
		return models.StatusPAUSED
	}
	if hasUp {
		if hasDeg || hasDown {
			return models.StatusDEGRADED
		}
		return models.StatusUP
	}
	if hasDeg {
		return models.StatusDEGRADED
	}
	if hasDown {
		return models.StatusDOWN
	}
	if hasMaint {
		return models.StatusMAINTENANCE
	}
	return models.StatusUNKNOWN
}


// --- Tags ---

func (h *Handlers) ListTags(c *fiber.Ctx) error {
	tags, err := h.db.ListTags(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tags == nil {
		tags = []models.Tag{}
	}
	return c.JSON(tags)
}

func (h *Handlers) CreateTag(c *fiber.Ctx) error {
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}
	if body.Color == "" {
		body.Color = "#6366f1"
	}
	t, err := h.db.CreateTag(c.Context(), body.Name, body.Color)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(t)
}

func (h *Handlers) UpdateTag(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	c.BodyParser(&body)
	if err := h.db.UpdateTag(c.Context(), id, body.Name, body.Color); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handlers) DeleteTag(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	if err := h.db.DeleteTag(c.Context(), id); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ListGroups handles GET /api/groups
func (h *Handlers) ListGroups(c *fiber.Ctx) error {
	groups, err := h.db.ListGroups(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	isGlobalMaint := h.engine.IsGlobalMaintenance()
	// Enrich each monitor with live status from Redis cache.
	for i := range groups {
		for j := range groups[i].Monitors {
			m := &groups[i].Monitors[j]
			statusStr, latency, msg, mVal := h.cache.GetStatus(c.Context(), m.ID)
			if !m.IsActive {
				m.CurrentStatus = models.StatusPAUSED
				m.CurrentLatency = 0
				m.CurrentMsg = ""
			} else if m.IsMaintenance || isGlobalMaint {
				m.IsMaintenance = true
				m.CurrentStatus = models.StatusMAINTENANCE
				m.CurrentLatency = 0
				if isGlobalMaint {
					m.CurrentMsg = "Mantenimiento Global"
				} else {
					m.CurrentMsg = "En Mantenimiento"
				}
			} else if statusStr == "UP" || statusStr == "DOWN" || statusStr == "DEGRADED" {
				m.CurrentStatus = models.MonitorStatus(statusStr)
				m.CurrentLatency = latency
				m.CurrentMsg = msg
				m.CurrentValue = mVal
			} else if statusStr == "CHECKING" {
				m.CurrentStatus = models.StatusUNKNOWN
				m.CurrentLatency = 0
				m.CurrentMsg = ""
			} else if n := len(m.RecentHistory); n > 0 {
				// Redis has no state (restart / eviction): fall back to the last persisted operational check
				// (skipping MAINTENANCE and PAUSED so an active monitor never shows MAINTENANCE/PAUSED).
				found := false
				for k := n - 1; k >= 0; k-- {
					last := m.RecentHistory[k]
					if last.Status == models.StatusUP || last.Status == models.StatusDOWN || last.Status == models.StatusDEGRADED {
						m.CurrentStatus = last.Status
						m.CurrentLatency = last.LatencyMs
						found = true
						break
					}
				}
				if !found {
					m.CurrentStatus = models.StatusUNKNOWN
					m.CurrentLatency = 0
				}
			} else {
				m.CurrentStatus = models.StatusUNKNOWN
				m.CurrentLatency = 0
			}
		}
		groups[i].OverallStatus = computeGroupStatus(groups[i].Monitors)
	}
	return c.JSON(groups)
}

// CreateGroup handles POST /api/groups
func (h *Handlers) CreateGroup(c *fiber.Ctx) error {
	var body struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}
	g, err := h.db.CreateGroup(c.Context(), body.Name, body.Description, body.Tags)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(g)
}

// UpdateGroup handles PUT /api/groups/:id
func (h *Handlers) UpdateGroup(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	var body struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	c.BodyParser(&body)
	if err := h.db.UpdateGroup(c.Context(), id, body.Name, body.Description, body.Tags); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DeleteGroup handles DELETE /api/groups/:id
func (h *Handlers) DeleteGroup(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	
	// Primero detenemos los hilos de los monitores que pertenecen a este grupo
	groups, _ := h.db.ListGroups(c.Context())
	for _, g := range groups {
		if g.ID == id {
			for _, m := range g.Monitors {
				h.engine.StopMonitor(m.ID)
			}
			break
		}
	}

	if err := h.db.DeleteGroup(c.Context(), id); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// CreateMonitor handles POST /api/monitors
func (h *Handlers) CreateMonitor(c *fiber.Ctx) error {
	var body struct {
		GroupID         *int   `json:"group_id"`
		Name            string `json:"name"`
		Type            string `json:"type"`
		Target          string `json:"target"`
		Port            *int   `json:"port"`
		IntervalSeconds int    `json:"interval_seconds"`
		Retries         int    `json:"retries"`
		SnmpCommunity   *string `json:"snmp_community"`
		SnmpOID         *string `json:"snmp_oid"`
		SslExpirationDays *int `json:"ssl_expiration_days"`
		ValueThreshold *int `json:"value_threshold"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	body.Target = strings.TrimSpace(body.Target)
	if body.Name == "" || body.Target == "" || body.Type == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name, type and target are required"})
	}
	if body.IntervalSeconds < 10 {
		body.IntervalSeconds = 60
	}
	if body.Retries == 0 {
		body.Retries = 3
	}

	m := models.Monitor{
		GroupID:         body.GroupID,
		Name:            body.Name,
		Type:            strings.ToUpper(body.Type),
		Target:          body.Target,
		Port:            body.Port,
		IntervalSeconds: body.IntervalSeconds,
		TimeoutSeconds:  10,
		Retries:         body.Retries,
		SnmpCommunity:   body.SnmpCommunity,
		SnmpOID:         body.SnmpOID,
		SslExpirationDays: body.SslExpirationDays,
		ValueThreshold: body.ValueThreshold,
	}

	created, err := h.db.CreateMonitor(c.Context(), m)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Register immediately in the polling engine.
	h.engine.ScheduleMonitor(created)

	return c.Status(201).JSON(created)
}

// UpdateMonitor handles PUT /api/monitors/:id
func (h *Handlers) UpdateMonitor(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	var body struct {
		Name            string `json:"name"`
		Type            string `json:"type"`
		Target          string `json:"target"`
		Port            *int   `json:"port"`
		IntervalSeconds int    `json:"interval_seconds"`
		Retries         int    `json:"retries"`
		SnmpCommunity   *string `json:"snmp_community"`
		SnmpOID         *string `json:"snmp_oid"`
		SslExpirationDays *int `json:"ssl_expiration_days"`
		ValueThreshold *int `json:"value_threshold"`
	}
	c.BodyParser(&body)
	body.Target = strings.TrimSpace(body.Target)

	if err := h.db.UpdateMonitor(c.Context(), id, models.Monitor{
		Name: body.Name, Type: strings.ToUpper(body.Type),
		Target: body.Target, Port: body.Port,
		IntervalSeconds: body.IntervalSeconds, Retries: body.Retries,
		SnmpCommunity: body.SnmpCommunity, SnmpOID: body.SnmpOID, SslExpirationDays: body.SslExpirationDays,
		ValueThreshold: body.ValueThreshold,
	}); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Restart the polling goroutine with updated config.
	if updated, err := h.db.GetMonitor(c.Context(), id); err == nil {
		h.engine.StopMonitor(id)
		
		// Reset alert state when edited so it can trigger new notifications
		h.cache.ResetFails(c.Context(), id)
		h.cache.SetAlerted(c.Context(), id, false)
		
		if updated.IsActive {
			if updated.IsMaintenance {
				h.engine.BroadcastStatus(c.Context(), id, models.StatusMAINTENANCE, 0, "En Mantenimiento", true, true)
				intervalSec := updated.IntervalSeconds
				if intervalSec <= 0 {
					intervalSec = 60
				}
				h.engine.ScheduleMonitorAfter(updated, time.Duration(intervalSec)*time.Second)
			} else {
				h.engine.ScheduleMonitor(updated)
			}
		} else {
			h.engine.BroadcastStatus(c.Context(), id, models.StatusPAUSED, 0, "", false, false)
		}
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DeleteMonitor handles DELETE /api/monitors/:id
func (h *Handlers) DeleteMonitor(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	h.engine.StopMonitor(id)
	if err := h.db.DeleteMonitor(c.Context(), id); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ToggleMonitor handles PUT /api/monitors/:id/toggle
func (h *Handlers) ToggleMonitor(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	// Cancel any in-flight check BEFORE changing state so it cannot overwrite Redis/SSE
	h.engine.StopMonitor(id)

	isActive, err := h.db.ToggleMonitorActive(c.Context(), id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if isActive {
		h.engine.BroadcastStatus(c.Context(), id, models.StatusUNKNOWN, 0, "", true, false)
		h.cache.SetStatus(c.Context(), id, "CHECKING", 0, "", nil)
		if updated, err := h.db.GetMonitor(c.Context(), id); err == nil {
			h.engine.ScheduleMonitor(updated)
		}
		return c.JSON(fiber.Map{
			"ok":             true,
			"is_active":      true,
			"is_maintenance": false,
			"current_status": models.StatusUNKNOWN,
		})
	}

	h.engine.BroadcastStatus(c.Context(), id, models.StatusPAUSED, 0, "En Pausa", false, false)
	return c.JSON(fiber.Map{
		"ok":             true,
		"is_active":      false,
		"is_maintenance": false,
		"current_status": models.StatusPAUSED,
	})
}

// ToggleMaintenance handles PUT /api/monitors/:id/maintenance
func (h *Handlers) ToggleMaintenance(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	// Cancel any in-flight check BEFORE changing state so it cannot overwrite Redis/SSE
	h.engine.StopMonitor(id)

	isMaint, err := h.db.ToggleMonitorMaintenance(c.Context(), id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if updated, err := h.db.GetMonitor(c.Context(), id); err == nil {
		if isMaint {
			h.engine.BroadcastStatus(c.Context(), id, models.StatusMAINTENANCE, 0, "En Mantenimiento", true, true)
			intervalSec := updated.IntervalSeconds
			if intervalSec <= 0 {
				intervalSec = 60
			}
			h.engine.ScheduleMonitorAfter(updated, time.Duration(intervalSec)*time.Second)
			return c.JSON(fiber.Map{
				"ok":             true,
				"is_active":      true,
				"is_maintenance": true,
				"current_status": models.StatusMAINTENANCE,
			})
		}

		h.engine.BroadcastStatus(c.Context(), id, models.StatusUNKNOWN, 0, "", true, false)
		h.cache.SetStatus(c.Context(), id, "CHECKING", 0, "", nil)
		h.engine.ScheduleMonitor(updated)
	}

	return c.JSON(fiber.Map{
		"ok":             true,
		"is_active":      true,
		"is_maintenance": false,
		"current_status": models.StatusUNKNOWN,
	})
}

// ToggleGroup handles PUT /api/groups/:id/toggle (pause or resume all monitors in a group)
func (h *Handlers) ToggleGroup(c *fiber.Ctx) error {
	groupID, _ := strconv.Atoi(c.Params("id"))
	existing, err := h.db.GetMonitorsByGroup(c.Context(), groupID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// If any monitor in the group is active, pause the whole group; otherwise resume all.
	anyActive := false
	for _, m := range existing {
		h.engine.StopMonitor(m.ID)
		if m.IsActive {
			anyActive = true
		}
	}
	targetActive := !anyActive

	updatedList, err := h.db.SetGroupMonitorsActive(c.Context(), groupID, targetActive)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	for _, m := range updatedList {
		if targetActive {
			h.engine.BroadcastStatus(c.Context(), m.ID, models.StatusUNKNOWN, 0, "", true, false)
			h.cache.SetStatus(c.Context(), m.ID, "CHECKING", 0, "", nil)
			h.engine.ScheduleMonitor(m)
		} else {
			h.engine.BroadcastStatus(c.Context(), m.ID, models.StatusPAUSED, 0, "En Pausa", false, false)
		}
	}

	return c.JSON(fiber.Map{
		"ok":             true,
		"is_active":      targetActive,
		"is_maintenance": false,
	})
}

// ToggleGroupMaintenance handles PUT /api/groups/:id/maintenance (toggle maintenance for all monitors in a group)
func (h *Handlers) ToggleGroupMaintenance(c *fiber.Ctx) error {
	groupID, _ := strconv.Atoi(c.Params("id"))
	existing, err := h.db.GetMonitorsByGroup(c.Context(), groupID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	allMaint := len(existing) > 0
	for _, m := range existing {
		h.engine.StopMonitor(m.ID)
		if !m.IsActive || !m.IsMaintenance {
			allMaint = false
		}
	}
	targetMaint := !allMaint

	updatedList, err := h.db.SetGroupMonitorsMaintenance(c.Context(), groupID, targetMaint)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	for _, m := range updatedList {
		if targetMaint {
			h.engine.BroadcastStatus(c.Context(), m.ID, models.StatusMAINTENANCE, 0, "En Mantenimiento", true, true)
			intervalSec := m.IntervalSeconds
			if intervalSec <= 0 {
				intervalSec = 60
			}
			h.engine.ScheduleMonitorAfter(m, time.Duration(intervalSec)*time.Second)
		} else {
			h.engine.BroadcastStatus(c.Context(), m.ID, models.StatusUNKNOWN, 0, "", true, false)
			h.cache.SetStatus(c.Context(), m.ID, "CHECKING", 0, "", nil)
			h.engine.ScheduleMonitor(m)
		}
	}

	return c.JSON(fiber.Map{
		"ok":             true,
		"is_active":      true,
		"is_maintenance": targetMaint,
	})
}

// TestMonitor handles POST /api/monitors/test (runs an on-demand connectivity check without persisting)
func (h *Handlers) TestMonitor(c *fiber.Ctx) error {
	var body struct {
		Type              string  `json:"type"`
		Target            string  `json:"target"`
		Port              *int    `json:"port"`
		SnmpCommunity     *string `json:"snmp_community"`
		SnmpOID           *string `json:"snmp_oid"`
		SslExpirationDays *int    `json:"ssl_expiration_days"`
		ValueThreshold    *int    `json:"value_threshold"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	target := strings.TrimSpace(body.Target)
	mType := strings.ToUpper(strings.TrimSpace(body.Type))
	if target == "" || mType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "type and target are required"})
	}

	temp := models.Monitor{
		Type:              mType,
		Target:            target,
		Port:              body.Port,
		TimeoutSeconds:    5,
		SnmpCommunity:     body.SnmpCommunity,
		SnmpOID:           body.SnmpOID,
		SslExpirationDays: body.SslExpirationDays,
		ValueThreshold:    body.ValueThreshold,
	}

	res := monitor.RunCheck(c.Context(), temp)
	if temp.ValueThreshold != nil && *temp.ValueThreshold > 0 && res.MetricValue != nil {
		if *res.MetricValue >= float64(*temp.ValueThreshold) {
			res.Status = models.StatusDEGRADED
			res.ErrorMsg = fmt.Sprintf("Valor %.2f > Límite %d", *res.MetricValue, *temp.ValueThreshold)
		}
	}

	return c.JSON(fiber.Map{
		"status":       res.Status,
		"latency_ms":   res.LatencyMs,
		"error_msg":    res.ErrorMsg,
		"metric_value": res.MetricValue,
	})
}

// RunDiagnostic handles POST /api/diagnostics/run (live PAPING, PING, TRACEROUTE_HOP, HTTP/SSL, DNS probes)
func (h *Handlers) RunDiagnostic(c *fiber.Ctx) error {
	var req monitor.DiagnosticRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if strings.TrimSpace(req.Target) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "target is required"})
	}
	res := monitor.RunDiagnosticProbe(c.Context(), req)
	return c.JSON(res)
}

// ListIncidents handles GET /api/incidents?range=24h
func (h *Handlers) ListIncidents(c *fiber.Ctx) error {
	rangeStr := c.Query("range", "24h")
	incidents, err := h.db.ListIncidents(c.Context(), rangeStr, 250)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(incidents)
}

// GetHistory handles GET /api/monitors/:id/history?range=24h
func (h *Handlers) GetHistory(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	rangeStr := c.Query("range", "recent")
	points, err := h.db.GetHistory(c.Context(), id, rangeStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(points)
}

// GetSettings handles GET /api/settings
func (h *Handlers) GetSettings(c *fiber.Ctx) error {
	settings, err := h.db.GetSettings(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(settings)
}

// UpdateSettings handles PUT /api/settings
func (h *Handlers) UpdateSettings(c *fiber.Ctx) error {
	wasGlobalMaint := h.engine.IsGlobalMaintenance()

	var body map[string]string
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.db.UpdateSettings(c.Context(), body); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	// Notify the notifier to reload settings
	h.engine.ReloadNotifierConfig(c.Context())

	// If global maintenance was changed, immediately apply it across DB, Redis, and SSE
	if val, ok := body["global_maintenance"]; ok {
		nowGlobalMaint := val == "true"
		if nowGlobalMaint != wasGlobalMaint {
			_ = h.db.SetAllMonitorsMaintenance(c.Context(), nowGlobalMaint)
			h.engine.ApplyGlobalMaintenance(c.Context(), nowGlobalMaint)
		}
	}
	return c.JSON(fiber.Map{"ok": true})
}


// --- Export / Import ---

func (h *Handlers) ExportCSV(c *fiber.Ctx) error {
	groups, err := h.db.ListGroups(c.Context())
	if err != nil {
		return c.Status(500).SendString("Error fetching data")
	}

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", `attachment; filename="uptimecore_backup.csv"`)

	writer := csv.NewWriter(c.Response().BodyWriter())
	defer writer.Flush()

	// Header
	writer.Write([]string{
		"GroupName", "GroupDescription", "GroupTags",
		"MonitorName", "MonitorType", "MonitorTarget", "MonitorPort",
		"IntervalSeconds", "TimeoutSeconds", "Retries",
		"SNMPCommunity", "SNMPOID", "SSLExpirationDays",
	})

	for _, g := range groups {
		var tagNames []string
		for _, t := range g.Tags {
			tagNames = append(tagNames, t.Name)
		}
		tagsStr := strings.Join(tagNames, ", ")
		gDesc := ""
		if g.Description != nil {
			gDesc = *g.Description
		}

		if len(g.Monitors) == 0 {
			// Write group only
			writer.Write([]string{
				g.Name, gDesc, tagsStr,
				"", "", "", "",
				"", "", "",
				"", "", "",
			})
			continue
		}

		for _, m := range g.Monitors {
			portStr := ""
			if m.Port != nil {
				portStr = strconv.Itoa(*m.Port)
			}
			snmpComm := ""
			if m.SnmpCommunity != nil { snmpComm = *m.SnmpCommunity }
			snmpOid := ""
			if m.SnmpOID != nil { snmpOid = *m.SnmpOID }
			sslDays := ""
			if m.SslExpirationDays != nil { sslDays = strconv.Itoa(*m.SslExpirationDays) }

			writer.Write([]string{
				g.Name, gDesc, tagsStr,
				m.Name, m.Type, m.Target, portStr,
				strconv.Itoa(m.IntervalSeconds), strconv.Itoa(m.TimeoutSeconds), strconv.Itoa(m.Retries),
				snmpComm, snmpOid, sslDays,
			})
		}
	}
	return nil
}

func (h *Handlers) ImportCSV(c *fiber.Ctx) error {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "No file uploaded"})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not open file"})
	}
	defer file.Close()

	reader := csv.NewReader(file)
	// Relax the fields per record check so it allows ragged CSV files
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid CSV format"})
	}

	if len(records) < 2 {
		return c.Status(400).JSON(fiber.Map{"error": "CSV is empty or missing headers"})
	}

	groupMap := make(map[string]int)
	var warnings []string

	for i, row := range records {
		if i == 0 { continue } // skip header
		if len(row) < 4 { 
			warnings = append(warnings, fmt.Sprintf("Fila %d ignorada: Muy pocas columnas", i+1))
			continue 
		}

		gName := strings.TrimSpace(row[0])
		if gName == "" { continue }

		gDesc := ""
		if len(row) > 1 { gDesc = strings.TrimSpace(row[1]) }
		
		gTagsStr := ""
		if len(row) > 2 { gTagsStr = strings.TrimSpace(row[2]) }
		
		var tags []string
		if gTagsStr != "" {
			for _, t := range strings.Split(gTagsStr, ",") {
				t = strings.TrimSpace(t)
				if t != "" { tags = append(tags, t) }
			}
		}

		var groupID int
		if id, exists := groupMap[gName]; exists {
			groupID = id
		} else {
			g, err := h.db.CreateGroup(c.Context(), gName, gDesc, tags)
			if err == nil {
				groupID = g.ID
				groupMap[gName] = g.ID
			} else {
				warnings = append(warnings, fmt.Sprintf("Fila %d: Error creando grupo '%s': %v", i+1, gName, err))
				continue
			}
		}

		mName := strings.TrimSpace(row[3])
		if mName == "" { continue } // Grupo creado, pero sin monitor

		mType := ""
		if len(row) > 4 { mType = strings.ToUpper(strings.TrimSpace(row[4])) }
		
		mTarget := ""
		if len(row) > 5 { mTarget = strings.TrimSpace(row[5]) }
		
		if mType == "" || mTarget == "" { 
			warnings = append(warnings, fmt.Sprintf("Fila %d: Ignorada, falta Tipo o Target para '%s'", i+1, mName))
			continue 
		}

		var mPort *int
		if len(row) > 6 && strings.TrimSpace(row[6]) != "" {
			if p, err := strconv.Atoi(strings.TrimSpace(row[6])); err == nil {
				mPort = &p
			}
		}

		interval := 60
		if len(row) > 7 {
			if parsed, err := strconv.Atoi(strings.TrimSpace(row[7])); err == nil && parsed >= 10 {
				interval = parsed
			}
		}

		timeout := 10
		if len(row) > 8 {
			if parsed, err := strconv.Atoi(strings.TrimSpace(row[8])); err == nil && parsed >= 1 {
				timeout = parsed
			}
		}

		retries := 3
		if len(row) > 9 {
			if parsed, err := strconv.Atoi(strings.TrimSpace(row[9])); err == nil && parsed >= 1 {
				retries = parsed
			}
		}

		var snmpComm, snmpOid *string
		if len(row) > 10 && strings.TrimSpace(row[10]) != "" { sc := strings.TrimSpace(row[10]); snmpComm = &sc }
		if len(row) > 11 && strings.TrimSpace(row[11]) != "" { so := strings.TrimSpace(row[11]); snmpOid = &so }
		
		var sslDays *int
		if len(row) > 12 {
			if sd, err := strconv.Atoi(strings.TrimSpace(row[12])); err == nil {
				sslDays = &sd
			}
		}

		m := models.Monitor{
			GroupID:         &groupID,
			Name:            mName,
			Type:            mType,
			Target:          mTarget,
			Port:            mPort,
			IntervalSeconds: interval,
			TimeoutSeconds:  timeout,
			Retries:         retries,
			SnmpCommunity:   snmpComm,
			SnmpOID:         snmpOid,
			SslExpirationDays: sslDays,
		}
		
		created, err := h.db.CreateMonitor(c.Context(), m)
		if err == nil {
			h.engine.ScheduleMonitor(created)
		} else {
			warnings = append(warnings, fmt.Sprintf("Fila %d: Error SQL monitor '%s': %v", i+1, mName, err))
		}
	}
	
	if len(warnings) > 0 {
		return c.Status(206).JSON(fiber.Map{"ok": true, "warnings": warnings})
	}
	return c.JSON(fiber.Map{"ok": true})
}
func (h *Handlers) PushAgent(c *fiber.Ctx) error {
	token := c.Params("token")
	var body struct {
		Cpu  *float64 `json:"cpu"`
		Ram  *float64 `json:"ram"`
		Disk *float64 `json:"disk"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}

	// Find monitor by token
	monitors, err := h.db.ListAllActiveMonitors(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db error"})
	}

	var monitor *models.Monitor
	for _, m := range monitors {
		if m.PushToken != nil && *m.PushToken == token {
			mCopy := m
			monitor = &mCopy
			break
		}
	}

	if monitor == nil {
		return c.Status(404).JSON(fiber.Map{"error": "invalid push token"})
	}

	status := models.StatusUP
	var errorMsgs []string

	if monitor.CpuThreshold != nil && body.Cpu != nil && int(*body.Cpu) >= *monitor.CpuThreshold {
		status = models.StatusDEGRADED
		errorMsgs = append(errorMsgs, fmt.Sprintf("CPU al %.0f%%", *body.Cpu))
	}
	if monitor.RamThreshold != nil && body.Ram != nil && int(*body.Ram) >= *monitor.RamThreshold {
		status = models.StatusDEGRADED
		errorMsgs = append(errorMsgs, fmt.Sprintf("RAM al %.0f%%", *body.Ram))
	}
	if monitor.DiskThreshold != nil && body.Disk != nil && int(*body.Disk) >= *monitor.DiskThreshold {
		status = models.StatusDEGRADED
		errorMsgs = append(errorMsgs, fmt.Sprintf("Disco al %.0f%%", *body.Disk))
	}

	errMsg := strings.Join(errorMsgs, ", ")
	if status == models.StatusDEGRADED {
		// Also mark as DOWN if you prefer, but DEGRADED is good for thresholds.
		// For now we will mark it as DOWN so alerts trigger properly, since DEGRADED might have different semantics for users.
		// Actually, the alerting engine triggers for both DOWN and DEGRADED. So DEGRADED is fine.
	}

	result := models.CheckResult{
		MonitorID:  monitor.ID,
		Status:     status,
		LatencyMs:  0,
		ErrorMsg:   errMsg,
		CheckedAt:  time.Now(),
		MetricCpu:  body.Cpu,
		MetricRam:  body.Ram,
		MetricDisk: body.Disk,
	}

	// Route the result through the polling engine's processor (saves to DB, caches, alerts)
	h.engine.ProcessResult(c.Context(), *monitor, result)

	return c.JSON(fiber.Map{"ok": true})
}

// WipeAllData handles DELETE /api/system/wipe
func (h *Handlers) WipeAllData(c *fiber.Ctx) error {
	// Stop all active monitors in memory
	h.engine.StopAll()

	if err := h.db.WipeAllData(c.Context()); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// GetSlaReport handles GET /api/reports/sla
func (h *Handlers) GetSlaReport(c *fiber.Ctx) error {
	rangeStr := c.Query("range", "30d")
	now := time.Now().UTC()
	var startTime, endTime time.Time
	endTime = now

	switch rangeStr {
	case "recent":
		startTime = now.Add(-90 * time.Minute)
	case "3h":
		startTime = now.Add(-3 * time.Hour)
	case "6h":
		startTime = now.Add(-6 * time.Hour)
	case "24h":
		startTime = now.Add(-24 * time.Hour)
	case "7d", "1w":
		startTime = now.AddDate(0, 0, -7)
	case "30d", "1m":
		startTime = now.AddDate(0, 0, -30)
	case "month":
		startTime = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	case "last_month":
		firstOfThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		lastMonthEnd := firstOfThisMonth.Add(-time.Nanosecond)
		startTime = time.Date(lastMonthEnd.Year(), lastMonthEnd.Month(), 1, 0, 0, 0, 0, time.UTC)
		endTime = lastMonthEnd
	case "today":
		startTime = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	case "yesterday":
		y := now.AddDate(0, 0, -1)
		startTime = time.Date(y.Year(), y.Month(), y.Day(), 0, 0, 0, 0, time.UTC)
		endTime = time.Date(y.Year(), y.Month(), y.Day(), 23, 59, 59, 999999999, time.UTC)
	case "custom":
		if sStr := c.Query("start"); sStr != "" {
			if parsed, err := time.Parse(time.RFC3339, sStr); err == nil {
				startTime = parsed
			} else if parsed, err := time.Parse("2006-01-02", sStr); err == nil {
				startTime = parsed
			}
		}
		if eStr := c.Query("end"); eStr != "" {
			if parsed, err := time.Parse(time.RFC3339, eStr); err == nil {
				endTime = parsed
			} else if parsed, err := time.Parse("2006-01-02", eStr); err == nil {
				endTime = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 23, 59, 59, 999999999, time.UTC)
			}
		}
		if startTime.IsZero() {
			startTime = now.AddDate(0, 0, -30)
		}
	default: // "30d"
		startTime = now.AddDate(0, 0, -30)
	}

	var groupID *int
	if gStr := c.Query("group_id"); gStr != "" {
		if gid, err := strconv.Atoi(gStr); err == nil && gid > 0 {
			groupID = &gid
		}
	}

	var monitorID *int
	if mStr := c.Query("monitor_id"); mStr != "" {
		if mid, err := strconv.Atoi(mStr); err == nil && mid > 0 {
			monitorID = &mid
		}
	}

	slaTarget := 99.9
	if tStr := c.Query("sla_target"); tStr != "" {
		if t, err := strconv.ParseFloat(tStr, 64); err == nil && t > 0 && t <= 100 {
			slaTarget = t
		}
	}

	data, err := h.db.GetSlaReportData(c.Context(), startTime, endTime, groupID, monitorID, slaTarget)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

// --- Authentication & Session Handlers ---

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type CreateUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type UpdateUserRequest struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	Password string `json:"password,omitempty"`
}

type ResetPasswordRequest struct {
	Password string `json:"password"`
}

// Login authenticates credentials and returns an active session token.
func (h *Handlers) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Username and password are required"})
	}

	user, hash, err := h.db.GetUserByUsername(c.Context(), req.Username)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Invalid username or password"})
	}

	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Invalid username or password"})
	}

	// Generate 64-char crypto random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to generate security token"})
	}
	token := hex.EncodeToString(tokenBytes)

	sessionData, _ := json.Marshal(user)
	if err := h.cache.SetSession(c.Context(), token, string(sessionData)); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to persist session in cache"})
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user":  user,
	})
}

// Me returns the profile of the currently logged in user.
func (h *Handlers) Me(c *fiber.Ctx) error {
	user, ok := c.Locals("user").(models.User)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
	}
	return c.JSON(fiber.Map{"user": user})
}

// Logout invalidates the active session token.
func (h *Handlers) Logout(c *fiber.Ctx) error {
	token := extractToken(c)
	if token != "" {
		_ = h.cache.DeleteSession(c.Context(), token)
	}
	return c.JSON(fiber.Map{"success": true})
}

// --- User Management Handlers (Admin Only) ---

// ListUsers returns all users in the system.
func (h *Handlers) ListUsers(c *fiber.Ctx) error {
	users, err := h.db.ListUsers(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(users)
}

// CreateUser creates a new user with minimum 6 character password.
func (h *Handlers) CreateUser(c *fiber.Ctx) error {
	var req CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))

	if req.Username == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Username is required"})
	}
	if len(req.Password) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 6 characters long"})
	}
	if req.Role != "admin" && req.Role != "helpdesk" && req.Role != "viewer" {
		return c.Status(400).JSON(fiber.Map{"error": "Role must be 'admin', 'helpdesk', or 'viewer'"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	created, err := h.db.CreateUser(c.Context(), req.Username, string(hash), req.Role)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("Failed to create user: %v", err)})
	}

	return c.Status(201).JSON(created)
}

// UpdateUser edits a user's username, role, and optionally password.
func (h *Handlers) UpdateUser(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var req UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))

	if req.Username == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Username cannot be empty"})
	}
	if req.Role != "admin" && req.Role != "helpdesk" && req.Role != "viewer" {
		return c.Status(400).JSON(fiber.Map{"error": "Role must be 'admin', 'helpdesk', or 'viewer'"})
	}

	// Prevent removing the last admin
	currentUser, err := h.db.GetUserByID(c.Context(), id)
	if err == nil && currentUser.Role == "admin" && req.Role != "admin" {
		adminCount, _ := h.db.CountAdmins(c.Context())
		if adminCount <= 1 {
			return c.Status(400).JSON(fiber.Map{"error": "Cannot change the role of the only administrator"})
		}
	}

	if err := h.db.UpdateUser(c.Context(), id, req.Username, req.Role); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Update password if provided
	if req.Password != "" {
		if len(req.Password) < 6 {
			return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 6 characters long"})
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to hash password"})
		}
		if err := h.db.UpdateUserPassword(c.Context(), id, string(hash)); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	updated, _ := h.db.GetUserByID(c.Context(), id)
	return c.JSON(updated)
}

// ResetUserPassword updates a user's password.
func (h *Handlers) ResetUserPassword(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var req ResetPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if len(req.Password) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 6 characters long"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	if err := h.db.UpdateUserPassword(c.Context(), id, string(hash)); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
}

// DeleteUser deletes a user from the system.
func (h *Handlers) DeleteUser(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	if currentUser, ok := c.Locals("user").(models.User); ok && currentUser.ID == id {
		return c.Status(400).JSON(fiber.Map{"error": "Cannot delete your own active account"})
	}

	target, err := h.db.GetUserByID(c.Context(), id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "User not found"})
	}

	if target.Role == "admin" {
		count, _ := h.db.CountAdmins(c.Context())
		if count <= 1 {
			return c.Status(400).JSON(fiber.Map{"error": "Cannot delete the only administrator"})
		}
	}

	if err := h.db.DeleteUser(c.Context(), id); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
}

// --- History Retention Handlers ---

// GetRetentionStats returns current retention metrics.
func (h *Handlers) GetRetentionStats(c *fiber.Ctx) error {
	total, oldest, err := h.db.GetHistoryRetentionStats(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	var oldestStr *string
	if oldest != nil {
		s := oldest.Format(time.RFC3339)
		oldestStr = &s
	}
	return c.JSON(fiber.Map{
		"retention_days": 90,
		"total_records":  total,
		"oldest_record":  oldestStr,
	})
}

// PurgeRetentionHistory manually runs the 90-day retention cleanup.
func (h *Handlers) PurgeRetentionHistory(c *fiber.Ctx) error {
	purged, err := h.db.PurgeOldHistory(c.Context(), 90)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"success":      true,
		"purged_count": purged,
	})
}

func extractToken(c *fiber.Ctx) string {
	auth := c.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	if tok := c.Get("X-Auth-Token"); tok != "" {
		return tok
	}
	return c.Query("token")
}
