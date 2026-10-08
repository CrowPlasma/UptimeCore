// Package api contains the HTTP handlers and route definitions for UptimeCore.
package api

import (
	"encoding/csv"
	"fmt"
	"time"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
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
	hasUp, hasDeg, hasDown, hasMaint, hasPaused := false, false, false, false, false

	for _, m := range monitors {
		switch m.CurrentStatus {
		case models.StatusUP:
			hasUp = true
		case models.StatusDEGRADED:
			hasDeg = true
		case models.StatusDOWN:
			hasDown = true
		case models.StatusMAINTENANCE:
			hasMaint = true
		case models.StatusPAUSED:
			hasPaused = true
		}
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
	if hasPaused {
		return models.StatusPAUSED
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
	// Enrich each monitor with live status from Redis cache.
	for i := range groups {
		for j := range groups[i].Monitors {
			m := &groups[i].Monitors[j]
			statusStr, latency, msg, mVal := h.cache.GetStatus(c.Context(), m.ID)
			if !m.IsActive {
				m.CurrentStatus = models.StatusPAUSED
				m.CurrentLatency = 0
			} else if m.IsMaintenance {
				m.CurrentStatus = models.StatusMAINTENANCE
				m.CurrentLatency = 0
			} else if statusStr != "UNKNOWN" && statusStr != "MAINTENANCE" && statusStr != "PAUSED" {
				m.CurrentStatus = models.MonitorStatus(statusStr)
				m.CurrentLatency = latency
				m.CurrentMsg = msg
			m.CurrentValue = mVal
			} else if n := len(m.RecentHistory); n > 0 {
				// Redis has no state (restart / eviction): fall back to the last persisted check
				// so the dashboard never "resets" while history exists in TimescaleDB.
				last := m.RecentHistory[n-1]
				m.CurrentStatus = last.Status
				m.CurrentLatency = last.LatencyMs
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
		// Removed SetStatus UNKNOWN so the frontend sees a direct UP -> DOWN transition for toasts
		
		h.engine.ScheduleMonitor(updated)
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
	isActive, err := h.db.ToggleMonitorActive(c.Context(), id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if isActive {
		if updated, err := h.db.GetMonitor(c.Context(), id); err == nil {
			h.engine.ScheduleMonitor(updated)
		}
	} else {
		h.engine.StopMonitor(id)
		h.cache.SetStatus(c.Context(), id, "MAINTENANCE", 0, "", nil)
	}
	
	return c.JSON(fiber.Map{"ok": true, "is_active": isActive})
}

// ToggleMaintenance handles PUT /api/monitors/:id/maintenance
func (h *Handlers) ToggleMaintenance(c *fiber.Ctx) error {
	id, _ := strconv.Atoi(c.Params("id"))
	isMaint, err := h.db.ToggleMonitorMaintenance(c.Context(), id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if updated, err := h.db.GetMonitor(c.Context(), id); err == nil {
		// Just re-schedule to update the memory struct
		h.engine.ScheduleMonitor(updated)
	}

	return c.JSON(fiber.Map{"ok": true, "is_maintenance": isMaint})
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
	var body map[string]string
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.db.UpdateSettings(c.Context(), body); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	// Notify the notifier to reload settings
	h.engine.ReloadNotifierConfig(c.Context())

	// If global maintenance was toggled, we want immediate UI feedback.
	if _, ok := body["global_maintenance"]; ok {
		h.engine.RestartAll(c.Context())
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
