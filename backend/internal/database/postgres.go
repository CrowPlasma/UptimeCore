// Package database handles all data persistence for UptimeCore.
package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"ping-eye/internal/models"
)

// DB wraps the PostgreSQL/TimescaleDB connection pool.
type DB struct {
	pool *pgxpool.Pool
}

// ConnectPostgres creates a connection pool and waits for the database to be ready.
func ConnectPostgres(url string) *DB {
	for i := 0; i < 15; i++ {
		pool, err := pgxpool.New(context.Background(), url)
		if err == nil {
			if pingErr := pool.Ping(context.Background()); pingErr == nil {
				log.Println("✅ Connected to PostgreSQL/TimescaleDB")
				return &DB{pool: pool}
			}
			pool.Close()
		}
		log.Printf("⏳ Waiting for database... attempt %d/15", i+1)
		time.Sleep(2 * time.Second)
	}
	log.Fatal("❌ Could not connect to database after 15 attempts")
	return nil
}

// Close shuts down the connection pool.
func (db *DB) Close() { db.pool.Close() }

// nullStr converts an empty string to nil for nullable DB columns.
func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}


// --- Tags CRUD ---

func (db *DB) ListTags(ctx context.Context) ([]models.Tag, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, name, color FROM tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []models.Tag
	for rows.Next() {
		var t models.Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color); err == nil {
			tags = append(tags, t)
		}
	}
	return tags, nil
}

func (db *DB) CreateTag(ctx context.Context, name, color string) (models.Tag, error) {
	var t models.Tag
	err := db.pool.QueryRow(ctx,
		`INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING id, name, color`,
		name, color,
	).Scan(&t.ID, &t.Name, &t.Color)
	return t, err
}

func (db *DB) UpdateTag(ctx context.Context, id int, name, color string) error {
	_, err := db.pool.Exec(ctx, `UPDATE tags SET name=$1, color=$2 WHERE id=$3`, name, color, id)
	return err
}

func (db *DB) DeleteTag(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM tags WHERE id=$1`, id)
	return err
}

// --- Monitor Groups ---

// ListGroups returns all monitor groups with their associated monitors and tags.
func (db *DB) ListGroups(ctx context.Context) ([]models.MonitorGroup, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, name, description, created_at FROM monitor_groups ORDER BY created_at ASC, id ASC`)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}
	defer rows.Close()

	var groups []models.MonitorGroup
	groupIdx := map[int]int{}
	for rows.Next() {
		var g models.MonitorGroup
		if err := rows.Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt); err != nil {
			return nil, err
		}
		g.Tags = []models.Tag{}
		g.Monitors = []models.Monitor{}
		g.OverallStatus = models.StatusUNKNOWN
		groupIdx[g.ID] = len(groups)
		groups = append(groups, g)
	}
	rows.Close()

	if len(groups) == 0 {
		return []models.MonitorGroup{}, nil
	}

	// Load tags for all groups.
	tagRows, err := db.pool.Query(ctx, `
		SELECT mgt.group_id, t.id, t.name, t.color
		FROM monitor_group_tags mgt JOIN tags t ON t.id = mgt.tag_id`)
	if err == nil {
		defer tagRows.Close()
		for tagRows.Next() {
			var gid int
			var tag models.Tag
			if err2 := tagRows.Scan(&gid, &tag.ID, &tag.Name, &tag.Color); err2 == nil {
				if idx, ok := groupIdx[gid]; ok {
					groups[idx].Tags = append(groups[idx].Tags, tag)
				}
			}
		}
	}

	// Load monitors for all groups.
	monIdx := map[int][2]int{} // monitorID -> [groupIndex, monitorIndex]
	monRows, err := db.pool.Query(ctx, `
		SELECT id, group_id, name, type, target, port, interval_seconds, timeout_seconds, retries, snmp_community, snmp_oid, ssl_expiration_days, push_token, cpu_threshold, ram_threshold, disk_threshold, value_threshold, is_active, is_maintenance, created_at, updated_at
		FROM monitors ORDER BY created_at ASC, id ASC`)
	if err == nil {
		defer monRows.Close()
		for monRows.Next() {
			var m models.Monitor
			if err2 := monRows.Scan(
				&m.ID, &m.GroupID, &m.Name, &m.Type, &m.Target,
				&m.Port, &m.IntervalSeconds, &m.TimeoutSeconds,
				&m.Retries, &m.SnmpCommunity, &m.SnmpOID, &m.SslExpirationDays, &m.PushToken, &m.CpuThreshold, &m.RamThreshold, &m.DiskThreshold, &m.ValueThreshold, &m.IsActive, &m.IsMaintenance, &m.CreatedAt, &m.UpdatedAt,
			); err2 == nil {
				if !m.IsActive {
					m.IsMaintenance = false
					m.CurrentStatus = models.StatusPAUSED
				} else if m.IsMaintenance {
					m.CurrentStatus = models.StatusMAINTENANCE
				} else {
					m.CurrentStatus = models.StatusUNKNOWN
				}
				m.RecentHistory = []models.HistoryPoint{}
				if m.GroupID != nil {
					if gIdx, ok := groupIdx[*m.GroupID]; ok {
						groups[gIdx].Monitors = append(groups[gIdx].Monitors, m)
						monIdx[m.ID] = [2]int{gIdx, len(groups[gIdx].Monitors) - 1}
					}
				}
			}
		}
	}

	// Fetch recent history (last 60 points) for all monitors
	histRows, err := db.pool.Query(ctx, `
		SELECT time, monitor_id, status, latency_ms FROM (
			SELECT time, monitor_id, status, latency_ms,
				   row_number() OVER(PARTITION BY monitor_id ORDER BY time DESC) as rn
			FROM monitor_history
			WHERE time >= NOW() - INTERVAL '3 hours'
		) t WHERE rn <= 60 ORDER BY monitor_id, time ASC
	`)
	if err == nil {
		defer histRows.Close()
		for histRows.Next() {
			var p models.HistoryPoint
			var mid int
			if err2 := histRows.Scan(&p.Time, &mid, &p.Status, &p.LatencyMs); err2 == nil {
				if loc, ok := monIdx[mid]; ok {
					groups[loc[0]].Monitors[loc[1]].RecentHistory = append(groups[loc[0]].Monitors[loc[1]].RecentHistory, p)
				}
			}
		}
	}

	return groups, nil
}

// CreateGroup inserts a new monitor group and links its tags.
func (db *DB) CreateGroup(ctx context.Context, name, description string, tagNames []string) (models.MonitorGroup, error) {
	var g models.MonitorGroup
	err := db.pool.QueryRow(ctx,
		`INSERT INTO monitor_groups (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at`,
		name, nullStr(description),
	).Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt)
	if err != nil {
		return g, fmt.Errorf("create group: %w", err)
	}
	g.Tags = []models.Tag{}
	g.Monitors = []models.Monitor{}
	g.OverallStatus = models.StatusUNKNOWN

	// Link tags.
	tagColors := []string{"#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ef4444", "#ec4899"}
	for i, name := range tagNames {
		if name == "" {
			continue
		}
		color := tagColors[i%len(tagColors)]
		var tagID int
		// Find or create tag.
		err2 := db.pool.QueryRow(ctx,
			`INSERT INTO tags (name, color) VALUES ($1, $2)
			 ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id, color`,
			name, color,
		).Scan(&tagID, &color)
		if err2 != nil {
			continue
		}
		db.pool.Exec(ctx,
			`INSERT INTO monitor_group_tags (group_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			g.ID, tagID,
		)
		g.Tags = append(g.Tags, models.Tag{ID: tagID, Name: name, Color: color})
	}

	return g, nil
}

// UpdateGroup updates the name, description and tags of a group.
func (db *DB) UpdateGroup(ctx context.Context, id int, name, description string, tagNames []string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE monitor_groups SET name=$1, description=$2 WHERE id=$3`,
		name, nullStr(description), id,
	)
	if err != nil {
		return err
	}

	db.pool.Exec(ctx, `DELETE FROM monitor_group_tags WHERE group_id=$1`, id)

	tagColors := []string{"#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ef4444", "#ec4899"}
	for i, tName := range tagNames {
		if tName == "" {
			continue
		}
		color := tagColors[i%len(tagColors)]
		var tagID int
		err2 := db.pool.QueryRow(ctx,
			`INSERT INTO tags (name, color) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
			tName, color,
		).Scan(&tagID)
		if err2 == nil {
			db.pool.Exec(ctx, `INSERT INTO monitor_group_tags (group_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, tagID)
		}
	}
	return nil
}

// DeleteGroup removes a group and all its monitors (cascade).
func (db *DB) DeleteGroup(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM monitor_groups WHERE id=$1`, id)
	return err
}

// --- Monitors ---

// ListAllActiveMonitors returns every active monitor (used by the polling engine).
func (db *DB) ListAllActiveMonitors(ctx context.Context) ([]models.Monitor, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, group_id, name, type, target, port, interval_seconds, timeout_seconds, retries, snmp_community, snmp_oid, ssl_expiration_days, push_token, cpu_threshold, ram_threshold, disk_threshold, value_threshold, is_active, is_maintenance, created_at, updated_at
		 FROM monitors WHERE is_active=true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.Monitor
	for rows.Next() {
		var m models.Monitor
		if err := rows.Scan(
			&m.ID, &m.GroupID, &m.Name, &m.Type, &m.Target,
			&m.Port, &m.IntervalSeconds, &m.TimeoutSeconds,
			&m.Retries, &m.SnmpCommunity, &m.SnmpOID, &m.SslExpirationDays, &m.PushToken, &m.CpuThreshold, &m.RamThreshold, &m.DiskThreshold, &m.ValueThreshold, &m.IsActive, &m.IsMaintenance, &m.CreatedAt, &m.UpdatedAt,
		); err == nil {
			list = append(list, m)
		}
	}
	return list, nil
}

// GetMonitor returns a single monitor by ID.
func (db *DB) GetMonitor(ctx context.Context, id int) (models.Monitor, error) {
	var m models.Monitor
	err := db.pool.QueryRow(ctx,
		`SELECT id, group_id, name, type, target, port, interval_seconds, timeout_seconds, retries, snmp_community, snmp_oid, ssl_expiration_days, push_token, cpu_threshold, ram_threshold, disk_threshold, value_threshold, is_active, is_maintenance, created_at, updated_at
		 FROM monitors WHERE id=$1`, id,
	).Scan(
		&m.ID, &m.GroupID, &m.Name, &m.Type, &m.Target,
		&m.Port, &m.IntervalSeconds, &m.TimeoutSeconds,
		&m.Retries, &m.SnmpCommunity, &m.SnmpOID, &m.SslExpirationDays, &m.PushToken, &m.CpuThreshold, &m.RamThreshold, &m.DiskThreshold, &m.ValueThreshold, &m.IsActive, &m.IsMaintenance, &m.CreatedAt, &m.UpdatedAt,
	)
	return m, err
}

// GetMonitorsByGroup returns all monitors that belong to a specific group.
func (db *DB) GetMonitorsByGroup(ctx context.Context, groupID int) ([]models.Monitor, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, group_id, name, type, target, port, interval_seconds, timeout_seconds, retries, snmp_community, snmp_oid, ssl_expiration_days, push_token, cpu_threshold, ram_threshold, disk_threshold, value_threshold, is_active, is_maintenance, created_at, updated_at
		 FROM monitors WHERE group_id=$1`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.Monitor
	for rows.Next() {
		var m models.Monitor
		if err := rows.Scan(
			&m.ID, &m.GroupID, &m.Name, &m.Type, &m.Target,
			&m.Port, &m.IntervalSeconds, &m.TimeoutSeconds,
			&m.Retries, &m.SnmpCommunity, &m.SnmpOID, &m.SslExpirationDays, &m.PushToken, &m.CpuThreshold, &m.RamThreshold, &m.DiskThreshold, &m.ValueThreshold, &m.IsActive, &m.IsMaintenance, &m.CreatedAt, &m.UpdatedAt,
		); err == nil {
			list = append(list, m)
		}
	}
	return list, nil
}

// CreateMonitor inserts a new monitor endpoint.
func (db *DB) CreateMonitor(ctx context.Context, m models.Monitor) (models.Monitor, error) {
	var created models.Monitor
	err := db.pool.QueryRow(ctx,
		`INSERT INTO monitors (group_id, name, type, target, port, interval_seconds, timeout_seconds, retries, snmp_community, snmp_oid, ssl_expiration_days, cpu_threshold, ram_threshold, disk_threshold, value_threshold)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		 RETURNING id, group_id, name, type, target, port, interval_seconds, timeout_seconds, retries, snmp_community, snmp_oid, ssl_expiration_days, push_token, cpu_threshold, ram_threshold, disk_threshold, value_threshold, is_active, is_maintenance, created_at, updated_at`,
		m.GroupID, m.Name, m.Type, m.Target, m.Port, m.IntervalSeconds, m.TimeoutSeconds, m.Retries, m.SnmpCommunity, m.SnmpOID, m.SslExpirationDays, m.CpuThreshold, m.RamThreshold, m.DiskThreshold, m.ValueThreshold,
	).Scan(
		&created.ID, &created.GroupID, &created.Name, &created.Type, &created.Target,
		&created.Port, &created.IntervalSeconds, &created.TimeoutSeconds,
		&created.Retries, &created.SnmpCommunity, &created.SnmpOID, &created.SslExpirationDays, &created.PushToken, &created.CpuThreshold, &created.RamThreshold, &created.DiskThreshold, &created.ValueThreshold, &created.IsActive, &created.IsMaintenance, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		return created, fmt.Errorf("create monitor: %w", err)
	}
	created.CurrentStatus = models.StatusUNKNOWN
	return created, nil
}

// UpdateMonitor updates a monitor's configuration.
func (db *DB) UpdateMonitor(ctx context.Context, id int, m models.Monitor) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE monitors SET name=$1, type=$2, target=$3, port=$4,
		  interval_seconds=$5, retries=$6, snmp_community=$7, snmp_oid=$8, ssl_expiration_days=$9, cpu_threshold=$10, ram_threshold=$11, disk_threshold=$12, value_threshold=$13, updated_at=NOW() WHERE id=$14`,
		m.Name, m.Type, m.Target, m.Port, m.IntervalSeconds, m.Retries, m.SnmpCommunity, m.SnmpOID, m.SslExpirationDays, m.CpuThreshold, m.RamThreshold, m.DiskThreshold, m.ValueThreshold, id,
	)
	return err
}

// DeleteMonitor removes a monitor by ID.
func (db *DB) DeleteMonitor(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM monitors WHERE id=$1`, id)
	return err
}

// ToggleMonitorMaintenance switches the is_maintenance state of a monitor and ensures is_active is true.
func (db *DB) ToggleMonitorMaintenance(ctx context.Context, id int) (bool, error) {
	var isMaintenance bool
	err := db.pool.QueryRow(ctx, `
		UPDATE monitors
		SET is_maintenance = CASE WHEN NOT is_active THEN true ELSE NOT is_maintenance END,
		    is_active = true,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING is_maintenance`, id).Scan(&isMaintenance)
	return isMaintenance, err
}

// ToggleMonitorActive switches the is_active state of a monitor and clears is_maintenance.
func (db *DB) ToggleMonitorActive(ctx context.Context, id int) (bool, error) {
	var isActive bool
	err := db.pool.QueryRow(ctx, `
		UPDATE monitors
		SET is_active = NOT is_active,
		    is_maintenance = false,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING is_active`, id).Scan(&isActive)
	return isActive, err
}

// SetGroupMonitorsActive sets is_active for all monitors in a group and clears is_maintenance.
func (db *DB) SetGroupMonitorsActive(ctx context.Context, groupID int, isActive bool) ([]models.Monitor, error) {
	_, err := db.pool.Exec(ctx, `
		UPDATE monitors
		SET is_active = $1,
		    is_maintenance = false,
		    updated_at = NOW()
		WHERE group_id = $2`, isActive, groupID)
	if err != nil {
		return nil, err
	}
	return db.GetMonitorsByGroup(ctx, groupID)
}

// SetGroupMonitorsMaintenance sets is_maintenance for all monitors in a group and ensures is_active is true.
func (db *DB) SetGroupMonitorsMaintenance(ctx context.Context, groupID int, isMaintenance bool) ([]models.Monitor, error) {
	_, err := db.pool.Exec(ctx, `
		UPDATE monitors
		SET is_maintenance = $1,
		    is_active = true,
		    updated_at = NOW()
		WHERE group_id = $2`, isMaintenance, groupID)
	if err != nil {
		return nil, err
	}
	return db.GetMonitorsByGroup(ctx, groupID)
}

// SetAllMonitorsMaintenance sets is_maintenance for all active monitors (used by Global Maintenance mode).
func (db *DB) SetAllMonitorsMaintenance(ctx context.Context, isMaintenance bool) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE monitors
		SET is_maintenance = $1,
		    updated_at = NOW()
		WHERE is_active = true`, isMaintenance)
	return err
}

// ListIncidents returns recent DOWN and DEGRADED state transitions with outage durations.
func (db *DB) ListIncidents(ctx context.Context, rangeStr string, limit int) ([]models.IncidentEvent, error) {
	var interval string
	switch rangeStr {
	case "recent":
		interval = "90 minutes"
	case "3h":
		interval = "3 hours"
	case "6h":
		interval = "6 hours"
	case "24h":
		interval = "24 hours"
	case "7d", "1w":
		interval = "7 days"
	case "30d", "1m", "month":
		interval = "30 days"
	default:
		interval = "24 hours"
	}
	if limit <= 0 || limit > 500 {
		limit = 250
	}

	rows, err := db.pool.Query(ctx, `
		WITH transitions AS (
			SELECT
				time,
				monitor_id,
				status,
				COALESCE(error_msg, '') AS error_msg,
				LAG(status) OVER (PARTITION BY monitor_id ORDER BY time ASC) AS prev_status
			FROM monitor_history
			WHERE time >= NOW() - $1::interval
			  AND status IN ('UP', 'DOWN', 'DEGRADED', 'MAINTENANCE')
		),
		changes AS (
			SELECT
				time AS started_at,
				monitor_id,
				status,
				error_msg,
				prev_status,
				LEAD(time) OVER (PARTITION BY monitor_id ORDER BY time ASC) AS ended_at
			FROM transitions
			WHERE prev_status IS DISTINCT FROM status
		),
		enriched AS (
			SELECT
				c.monitor_id,
				m.name AS monitor_name,
				m.type AS monitor_type,
				m.target AS monitor_target,
				COALESCE(m.group_id, 0) AS group_id,
				COALESCE(g.name, 'Sin Grupo') AS group_name,
				c.status,
				c.started_at,
				CASE
					WHEN c.ended_at IS NOT NULL THEN c.ended_at
					WHEN NOT m.is_active OR m.is_maintenance THEN m.updated_at
					ELSE NULL
				END AS resolved_at,
				CASE
					WHEN c.ended_at IS NULL AND m.is_active AND NOT m.is_maintenance THEN true
					ELSE false
				END AS is_ongoing,
				c.error_msg
			FROM changes c
			JOIN monitors m ON m.id = c.monitor_id
			LEFT JOIN monitor_groups g ON g.id = m.group_id
			WHERE c.status IN ('DOWN', 'DEGRADED')
		)
		SELECT
			monitor_id,
			monitor_name,
			monitor_type,
			monitor_target,
			group_id,
			group_name,
			status,
			started_at,
			resolved_at,
			GREATEST(1, COALESCE(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - started_at))::int, 1)) AS duration_sec,
			is_ongoing,
			error_msg
		FROM enriched
		ORDER BY is_ongoing DESC, started_at DESC
		LIMIT $2
	`, interval, limit)
	if err != nil {
		return []models.IncidentEvent{}, err
	}
	defer rows.Close()

	var list []models.IncidentEvent
	for rows.Next() {
		var ev models.IncidentEvent
		if err := rows.Scan(
			&ev.MonitorID,
			&ev.MonitorName,
			&ev.MonitorType,
			&ev.MonitorTarget,
			&ev.GroupID,
			&ev.GroupName,
			&ev.Status,
			&ev.StartedAt,
			&ev.ResolvedAt,
			&ev.DurationSec,
			&ev.IsOngoing,
			&ev.ErrorMsg,
		); err == nil {
			list = append(list, ev)
		}
	}
	if list == nil {
		return []models.IncidentEvent{}, nil
	}
	return list, nil
}

// GetSlaReportData computes executive SLA metrics, per-monitor breakdowns, and incident logs for a given period and scope.
func (db *DB) GetSlaReportData(ctx context.Context, startTime, endTime time.Time, groupID *int, monitorID *int, slaTarget float64) (*models.SlaReportResponse, error) {
	if slaTarget <= 0 {
		slaTarget = 99.9
	}
	totalPeriodSec := int(endTime.Sub(startTime).Seconds())
	if totalPeriodSec <= 0 {
		totalPeriodSec = 1
	}

	// 1. Fetch all matching monitors in the requested scope
	monQuery := `
		SELECT 
			m.id, 
			m.name, 
			m.type, 
			m.target, 
			m.group_id, 
			COALESCE(g.name, 'Sin Grupo') AS group_name
		FROM monitors m
		LEFT JOIN monitor_groups g ON g.id = m.group_id
		WHERE ($1::int IS NULL OR m.group_id = $1)
		  AND ($2::int IS NULL OR m.id = $2)
		ORDER BY g.name ASC, m.name ASC
	`
	monRows, err := db.pool.Query(ctx, monQuery, groupID, monitorID)
	if err != nil {
		return nil, fmt.Errorf("query monitors: %w", err)
	}
	defer monRows.Close()

	monMap := make(map[int]*models.SlaReportMonitor)
	var orderedMonitors []*models.SlaReportMonitor

	for monRows.Next() {
		var m models.SlaReportMonitor
		if err := monRows.Scan(&m.MonitorID, &m.MonitorName, &m.MonitorType, &m.MonitorTarget, &m.GroupID, &m.GroupName); err == nil {
			m.AvailabilityPct = 100.0
			m.UptimeSeconds = totalPeriodSec
			m.MeetsSla = true
			monMap[m.MonitorID] = &m
			orderedMonitors = append(orderedMonitors, &m)
		}
	}
	monRows.Close()

	if len(orderedMonitors) == 0 {
		return &models.SlaReportResponse{
			Overall: models.SlaReportOverall{
				TotalMonitors:   0,
				EvaluatedPeriod: fmt.Sprintf("%s - %s", startTime.Format("2006-01-02 15:04"), endTime.Format("2006-01-02 15:04")),
				StartTime:       startTime,
				EndTime:         endTime,
				GlobalSlaPct:    100.0,
				TargetSlaPct:    slaTarget,
				MeetsSla:        true,
			},
			Monitors:  []models.SlaReportMonitor{},
			Incidents: []models.IncidentEvent{},
		}, nil
	}

	// 2. Aggregate history samples & latencies across TimescaleDB hypertable
	histQuery := `
		SELECT 
			m.id,
			COUNT(h.time) AS total_samples,
			COUNT(h.time) FILTER (WHERE h.status = 'UP') AS up_samples,
			COUNT(h.time) FILTER (WHERE h.status = 'DOWN') AS down_samples,
			COUNT(h.time) FILTER (WHERE h.status = 'DEGRADED') AS degraded_samples,
			COUNT(h.time) FILTER (WHERE h.status = 'MAINTENANCE') AS maint_samples,
			COALESCE(ROUND(AVG(h.latency_ms))::int, 0) AS avg_lat,
			COALESCE(ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY h.latency_ms))::int, 0) AS p95_lat,
			COALESCE(MAX(h.latency_ms), 0) AS max_lat
		FROM monitors m
		JOIN monitor_history h ON h.monitor_id = m.id
		WHERE h.time >= $1 AND h.time <= $2
		  AND ($3::int IS NULL OR m.group_id = $3)
		  AND ($4::int IS NULL OR m.id = $4)
		GROUP BY m.id
	`
	histRows, err := db.pool.Query(ctx, histQuery, startTime, endTime, groupID, monitorID)
	if err == nil {
		defer histRows.Close()
		for histRows.Next() {
			var mid, total, up, down, deg, maint, avgLat, p95Lat, maxLat int
			if err := histRows.Scan(&mid, &total, &up, &down, &deg, &maint, &avgLat, &p95Lat, &maxLat); err == nil {
				if m, ok := monMap[mid]; ok {
					m.TotalSamples = total
					m.UpSamples = up
					m.DownSamples = down
					m.DegradedSamples = deg
					m.MaintSamples = maint
					m.AvgLatencyMs = avgLat
					m.P95LatencyMs = p95Lat
					m.MaxLatencyMs = maxLat
				}
			}
		}
		histRows.Close()
	}

	// 3. Outage counts & downtime duration per monitor via transition changes
	outageQuery := `
		WITH transitions AS (
			SELECT
				time,
				monitor_id,
				status,
				LAG(status) OVER (PARTITION BY monitor_id ORDER BY time ASC) AS prev_status
			FROM monitor_history
			WHERE time >= $1 AND time <= $2
			  AND status IN ('UP', 'DOWN', 'DEGRADED', 'MAINTENANCE')
			  AND ($3::int IS NULL OR monitor_id IN (SELECT id FROM monitors WHERE group_id = $3))
			  AND ($4::int IS NULL OR monitor_id = $4)
		),
		changes AS (
			SELECT
				time AS started_at,
				monitor_id,
				status,
				prev_status,
				LEAD(time) OVER (PARTITION BY monitor_id ORDER BY time ASC) AS ended_at
			FROM transitions
			WHERE prev_status IS DISTINCT FROM status
		)
		SELECT 
			monitor_id,
			COUNT(*) AS outage_count,
			SUM(GREATEST(1, EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, $2), $2) - GREATEST(started_at, $1)))::int)) AS outage_duration_sec
		FROM changes
		WHERE status = 'DOWN'
		GROUP BY monitor_id
	`
	outageRows, err := db.pool.Query(ctx, outageQuery, startTime, endTime, groupID, monitorID)
	if err == nil {
		defer outageRows.Close()
		for outageRows.Next() {
			var mid, count, duration int
			if err := outageRows.Scan(&mid, &count, &duration); err == nil {
				if m, ok := monMap[mid]; ok {
					m.OutagesCount = count
					m.DowntimeSeconds = duration
				}
			}
		}
		outageRows.Close()
	}

	// 4. Retrieve Incidents log during the period
	incidentQuery := `
		WITH transitions AS (
			SELECT
				time,
				monitor_id,
				status,
				COALESCE(error_msg, '') AS error_msg,
				LAG(status) OVER (PARTITION BY monitor_id ORDER BY time ASC) AS prev_status
			FROM monitor_history
			WHERE time >= $1 AND time <= $2
			  AND status IN ('UP', 'DOWN', 'DEGRADED', 'MAINTENANCE')
			  AND ($3::int IS NULL OR monitor_id IN (SELECT id FROM monitors WHERE group_id = $3))
			  AND ($4::int IS NULL OR monitor_id = $4)
		),
		changes AS (
			SELECT
				time AS started_at,
				monitor_id,
				status,
				error_msg,
				prev_status,
				LEAD(time) OVER (PARTITION BY monitor_id ORDER BY time ASC) AS ended_at
			FROM transitions
			WHERE prev_status IS DISTINCT FROM status
		),
		enriched AS (
			SELECT
				c.monitor_id,
				m.name AS monitor_name,
				m.type AS monitor_type,
				m.target AS monitor_target,
				COALESCE(m.group_id, 0) AS group_id,
				COALESCE(g.name, 'Sin Grupo') AS group_name,
				c.status,
				c.started_at,
				c.ended_at AS resolved_at,
				(c.ended_at IS NULL AND m.is_active AND NOT m.is_maintenance) AS is_ongoing,
				c.error_msg
			FROM changes c
			JOIN monitors m ON m.id = c.monitor_id
			LEFT JOIN monitor_groups g ON g.id = m.group_id
			WHERE c.status IN ('DOWN', 'DEGRADED')
		)
		SELECT
			monitor_id,
			monitor_name,
			monitor_type,
			monitor_target,
			group_id,
			group_name,
			status,
			started_at,
			resolved_at,
			GREATEST(1, COALESCE(EXTRACT(EPOCH FROM (COALESCE(resolved_at, $2) - started_at))::int, 1)) AS duration_sec,
			is_ongoing,
			error_msg
		FROM enriched
		ORDER BY started_at DESC
		LIMIT 500
	`
	incidentRows, err := db.pool.Query(ctx, incidentQuery, startTime, endTime, groupID, monitorID)
	var incidents []models.IncidentEvent
	if err == nil {
		defer incidentRows.Close()
		for incidentRows.Next() {
			var ev models.IncidentEvent
			if err := incidentRows.Scan(
				&ev.MonitorID,
				&ev.MonitorName,
				&ev.MonitorType,
				&ev.MonitorTarget,
				&ev.GroupID,
				&ev.GroupName,
				&ev.Status,
				&ev.StartedAt,
				&ev.ResolvedAt,
				&ev.DurationSec,
				&ev.IsOngoing,
				&ev.ErrorMsg,
			); err == nil {
				incidents = append(incidents, ev)
			}
		}
		incidentRows.Close()
	}
	if incidents == nil {
		incidents = []models.IncidentEvent{}
	}

	// 5. Finalize individual monitor calculations and overall aggregates
	totalOutages := 0
	totalDowntimeSec := 0
	sumAvailPct := 0.0
	sumAvgLat := 0
	sumP95Lat := 0
	validMonitorCount := 0

	var resultMonitors []models.SlaReportMonitor

	for _, m := range orderedMonitors {
		if m.DownSamples > 0 && m.DowntimeSeconds == 0 {
			if m.TotalSamples > 0 {
				m.DowntimeSeconds = int((float64(m.DownSamples) / float64(m.TotalSamples)) * float64(totalPeriodSec))
			} else {
				m.DowntimeSeconds = totalPeriodSec
			}
			if m.OutagesCount == 0 {
				m.OutagesCount = 1
			}
		}
		if m.DowntimeSeconds > totalPeriodSec {
			m.DowntimeSeconds = totalPeriodSec
		}
		m.UptimeSeconds = totalPeriodSec - m.DowntimeSeconds
		if m.UptimeSeconds < 0 {
			m.UptimeSeconds = 0
		}

		validSamples := m.UpSamples + m.DownSamples + m.DegradedSamples
		if validSamples > 0 {
			m.AvailabilityPct = float64(int(((float64(m.UpSamples+m.DegradedSamples)/float64(validSamples))*100.0)*1000+0.5)) / 1000.0
		} else if m.DowntimeSeconds > 0 {
			m.AvailabilityPct = float64(int(((float64(m.UptimeSeconds)/float64(totalPeriodSec))*100.0)*1000+0.5)) / 1000.0
		} else {
			m.AvailabilityPct = 100.0
		}

		m.MeetsSla = m.AvailabilityPct >= slaTarget

		if m.OutagesCount > 0 {
			m.MttrSeconds = m.DowntimeSeconds / m.OutagesCount
			m.MtbfSeconds = m.UptimeSeconds / m.OutagesCount
		} else {
			m.MttrSeconds = 0
			m.MtbfSeconds = totalPeriodSec
		}

		totalOutages += m.OutagesCount
		totalDowntimeSec += m.DowntimeSeconds
		sumAvailPct += m.AvailabilityPct
		sumAvgLat += m.AvgLatencyMs
		sumP95Lat += m.P95LatencyMs
		validMonitorCount++

		resultMonitors = append(resultMonitors, *m)
	}

	globalSla := 100.0
	avgLatGlobal := 0
	p95LatGlobal := 0
	if validMonitorCount > 0 {
		globalSla = float64(int((sumAvailPct/float64(validMonitorCount))*1000+0.5)) / 1000.0
		avgLatGlobal = sumAvgLat / validMonitorCount
		p95LatGlobal = sumP95Lat / validMonitorCount
	}

	overallMttr := 0
	overallMtbf := totalPeriodSec
	if totalOutages > 0 {
		overallMttr = totalDowntimeSec / totalOutages
		totalOperationalSec := (totalPeriodSec * validMonitorCount) - totalDowntimeSec
		if totalOperationalSec > 0 {
			overallMtbf = totalOperationalSec / totalOutages
		}
	}

	overall := models.SlaReportOverall{
		TotalMonitors:    len(resultMonitors),
		EvaluatedPeriod:  fmt.Sprintf("%s - %s", startTime.Format("2006-01-02 15:04"), endTime.Format("2006-01-02 15:04")),
		StartTime:        startTime,
		EndTime:          endTime,
		GlobalSlaPct:     globalSla,
		TargetSlaPct:     slaTarget,
		MeetsSla:         globalSla >= slaTarget,
		TotalOutages:     totalOutages,
		TotalDowntimeSec: totalDowntimeSec,
		MttrSeconds:      overallMttr,
		MtbfSeconds:      overallMtbf,
		AvgLatencyMs:     avgLatGlobal,
		P95LatencyMs:     p95LatGlobal,
	}

	return &models.SlaReportResponse{
		Overall:   overall,
		Monitors:  resultMonitors,
		Incidents: incidents,
	}, nil
}


// --- History (TimescaleDB hypertable) ---

// SaveCheckResult persists a single polling result to the time-series table.
func (db *DB) SaveCheckResult(ctx context.Context, r models.CheckResult) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO monitor_history (time, monitor_id, status, latency_ms, error_msg, metric_cpu, metric_ram, metric_disk, metric_value)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		r.CheckedAt, r.MonitorID, string(r.Status), r.LatencyMs, nullStr(r.ErrorMsg), r.MetricCpu, r.MetricRam, r.MetricDisk, r.MetricValue,
	)
	return err
}
// SaveCheckResultsBulk inserts multiple polling results efficiently using COPY.
func (db *DB) SaveCheckResultsBulk(ctx context.Context, results []models.CheckResult) error {
	if len(results) == 0 {
		return nil
	}

	_, err := db.pool.CopyFrom(
		ctx,
		pgx.Identifier{"monitor_history"},
		[]string{"time", "monitor_id", "status", "latency_ms", "error_msg", "metric_cpu", "metric_ram", "metric_disk", "metric_value"},
		pgx.CopyFromSlice(len(results), func(i int) ([]any, error) {
			return []any{
				results[i].CheckedAt,
				results[i].MonitorID,
				string(results[i].Status),
				results[i].LatencyMs,
				nullStr(results[i].ErrorMsg),
				results[i].MetricCpu,
				results[i].MetricRam,
				results[i].MetricDisk,
				results[i].MetricValue,
			}, nil
		}),
	)
	return err
}


// GetHistory returns time-series data for a monitor within the requested time range.
// Uses TimescaleDB's time_bucket_gapfill to generate uniform buckets across the full requested range.
func (db *DB) GetHistory(ctx context.Context, monitorID int, rangeStr string) ([]models.HistoryPoint, error) {
	var interval string
	var bucket string

	switch rangeStr {
	case "3h":
		interval = "3 hours"
		bucket = "2 minutes"
	case "6h":
		interval = "6 hours"
		bucket = "5 minutes"
	case "24h":
		interval = "24 hours"
		bucket = "15 minutes"
	case "1w", "7d":
		interval = "7 days"
		bucket = "2 hours"
	case "30d", "1m":
		interval = "30 days"
		bucket = "6 hours"
	default: // "recent"
		interval = "90 minutes"
		bucket = "1 minute"
	}

	query := `
		SELECT 
			time_bucket_gapfill($1::interval, time, NOW() - $2::interval, NOW()) AS bucket,
			COALESCE(
				CASE
					WHEN bool_or(status = 'DOWN') THEN 'DOWN'
					WHEN bool_or(status = 'DEGRADED') THEN 'DEGRADED'
					WHEN bool_or(status = 'MAINTENANCE') THEN 'MAINTENANCE'
					WHEN bool_or(status = 'UP') THEN 'UP'
					ELSE NULL
				END,
				'UNKNOWN'
			) AS status,
			COALESCE(AVG(latency_ms)::int, 0) AS latency_ms
		FROM monitor_history
		WHERE monitor_id = $3 AND time >= NOW() - $2::interval AND time <= NOW()
		GROUP BY bucket
		ORDER BY bucket ASC
		LIMIT 2000
	`

	rows, err := db.pool.Query(ctx, query, bucket, interval, monitorID)
	if err != nil {
		return []models.HistoryPoint{}, nil
	}
	defer rows.Close()

	var points []models.HistoryPoint
	for rows.Next() {
		var p models.HistoryPoint
		if err := rows.Scan(&p.Time, &p.Status, &p.LatencyMs); err == nil {
			points = append(points, p)
		}
	}
	if points == nil {
		return []models.HistoryPoint{}, nil
	}
	return points, nil
}

// GetGroupName returns the name of a group by its ID.
func (db *DB) GetGroupName(ctx context.Context, id int) string {
	var name string
	err := db.pool.QueryRow(ctx, "SELECT name FROM monitor_groups WHERE id=$1", id).Scan(&name)
	if err != nil {
		return "Grupo Desconocido"
	}
	return name
}

// --- Settings ---

// GetSettings retrieves all key-value settings.
func (db *DB) GetSettings(ctx context.Context) (map[string]string, error) {
	rows, err := db.pool.Query(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			settings[k] = v
		}
	}
	return settings, nil
}

// UpdateSettings inserts or updates multiple settings.
func (db *DB) UpdateSettings(ctx context.Context, settings map[string]string) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for k, v := range settings {
		_, err := tx.Exec(ctx,
			`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
			k, v,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// AutoMigrate creates all necessary tables if they don't exist
func (db *DB) AutoMigrate(ctx context.Context) error {
	queries := []string{
		`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`,
		
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(50) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role VARCHAR(20) DEFAULT 'viewer',
			created_at TIMESTAMPTZ DEFAULT NOW()
		);`,

		`CREATE TABLE IF NOT EXISTS tags (
			id SERIAL PRIMARY KEY,
			name VARCHAR(50) UNIQUE NOT NULL,
			color VARCHAR(7) DEFAULT '#000000'
		);`,

		`CREATE TABLE IF NOT EXISTS monitor_groups (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			description TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);`,

		`CREATE TABLE IF NOT EXISTS monitor_group_tags (
			group_id INTEGER REFERENCES monitor_groups(id) ON DELETE CASCADE,
			tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (group_id, tag_id)
		);`,

		`CREATE TABLE IF NOT EXISTS monitors (
			id SERIAL PRIMARY KEY,
			group_id INTEGER REFERENCES monitor_groups(id) ON DELETE CASCADE,
			name VARCHAR(100) NOT NULL,
			type VARCHAR(20) NOT NULL,
			target VARCHAR(255) NOT NULL,
			port INTEGER,
			interval_seconds INTEGER DEFAULT 60,
			timeout_seconds INTEGER DEFAULT 10,
			retries INTEGER DEFAULT 3,
			value_threshold INTEGER,
			snmp_community VARCHAR(100),
			snmp_oid VARCHAR(255),
			ssl_expiration_days INTEGER,
			push_token VARCHAR(255),
			cpu_threshold INTEGER,
			ram_threshold INTEGER,
			disk_threshold INTEGER,
			is_active BOOLEAN DEFAULT TRUE,
			is_maintenance BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		);`,

		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS ssl_expiration_days INTEGER;`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS push_token VARCHAR(255);`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS cpu_threshold INTEGER;`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS ram_threshold INTEGER;`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS disk_threshold INTEGER;`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS value_threshold INTEGER;`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS snmp_community VARCHAR(100);`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS snmp_oid VARCHAR(255);`,
		`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS is_maintenance BOOLEAN DEFAULT FALSE;`,

		// Key/value store used by GetSettings / UpdateSettings (notifications, maintenance, etc.)
		`CREATE TABLE IF NOT EXISTS settings (
			key VARCHAR(100) PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		);`,

		`CREATE TABLE IF NOT EXISTS monitor_history (
			time TIMESTAMPTZ NOT NULL,
			monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
			status VARCHAR(20) NOT NULL,
			latency_ms INTEGER NOT NULL,
			error_msg TEXT,
			metric_cpu DOUBLE PRECISION,
			metric_ram DOUBLE PRECISION,
			metric_disk DOUBLE PRECISION,
			metric_value DOUBLE PRECISION
		);`,

		// Patch databases created by an older AutoMigrate (missing metric columns made every bulk insert fail).
		`ALTER TABLE monitor_history ADD COLUMN IF NOT EXISTS error_msg TEXT;`,
		`ALTER TABLE monitor_history ADD COLUMN IF NOT EXISTS metric_cpu DOUBLE PRECISION;`,
		`ALTER TABLE monitor_history ADD COLUMN IF NOT EXISTS metric_ram DOUBLE PRECISION;`,
		`ALTER TABLE monitor_history ADD COLUMN IF NOT EXISTS metric_disk DOUBLE PRECISION;`,
		`ALTER TABLE monitor_history ADD COLUMN IF NOT EXISTS metric_value DOUBLE PRECISION;`,

		`SELECT create_hypertable('monitor_history', 'time', if_not_exists => TRUE, migrate_data => TRUE);`,
		`CREATE INDEX IF NOT EXISTS ix_monitor_history_monitor_id_time ON monitor_history (monitor_id, time DESC);`,
		`SELECT add_retention_policy('monitor_history', INTERVAL '90 days', if_not_exists => TRUE);`,
	}

	for _, q := range queries {
		_, err := db.pool.Exec(ctx, q)
		if err != nil {
			log.Printf("⚠️ AutoMigrate warning for query: %v", err)
			// Continue executing even if one fails
		}
	}

	if seedErr := db.SeedDefaultAdmin(ctx); seedErr != nil {
		log.Printf("⚠️ SeedDefaultAdmin error: %v", seedErr)
	}

	return nil
}
func (db *DB) WipeAllData(ctx context.Context) error {
	_, err := db.pool.Exec(ctx, `TRUNCATE TABLE tags, monitor_groups, monitors, monitor_history CASCADE;`)
	return err
}

// --- Users & RBAC ---

func (db *DB) SeedDefaultAdmin(ctx context.Context) error {
	var count int
	err := db.pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		_, err = db.pool.Exec(ctx,
			`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)`,
			"admin", string(hash), "admin",
		)
		if err == nil {
			log.Println("🔑 [Security] Seeded default administrator user 'admin' (password: admin123)")
		}
		return err
	}
	return nil
}

func (db *DB) ListUsers(ctx context.Context) ([]models.User, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, username, role, created_at FROM users ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.CreatedAt); err == nil {
			users = append(users, u)
		}
	}
	if users == nil {
		users = []models.User{}
	}
	return users, nil
}

func (db *DB) GetUserByUsername(ctx context.Context, username string) (models.User, string, error) {
	var u models.User
	var passwordHash string
	err := db.pool.QueryRow(ctx,
		`SELECT id, username, password_hash, role, created_at FROM users WHERE username = $1`,
		username,
	).Scan(&u.ID, &u.Username, &passwordHash, &u.Role, &u.CreatedAt)
	return u, passwordHash, err
}

func (db *DB) GetUserByID(ctx context.Context, id int) (models.User, error) {
	var u models.User
	err := db.pool.QueryRow(ctx,
		`SELECT id, username, role, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Username, &u.Role, &u.CreatedAt)
	return u, err
}

func (db *DB) CreateUser(ctx context.Context, username, passwordHash, role string) (models.User, error) {
	var u models.User
	err := db.pool.QueryRow(ctx,
		`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at`,
		username, passwordHash, role,
	).Scan(&u.ID, &u.Username, &u.Role, &u.CreatedAt)
	return u, err
}

func (db *DB) UpdateUser(ctx context.Context, id int, username, role string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET username = $1, role = $2 WHERE id = $3`,
		username, role, id,
	)
	return err
}

func (db *DB) UpdateUserPassword(ctx context.Context, id int, passwordHash string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1 WHERE id = $2`,
		passwordHash, id,
	)
	return err
}

func (db *DB) DeleteUser(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

func (db *DB) CountAdmins(ctx context.Context) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'admin'`).Scan(&count)
	return count, err
}

// --- History Retention ---

func (db *DB) PurgeOldHistory(ctx context.Context, days int) (int64, error) {
	tag, err := db.pool.Exec(ctx,
		`DELETE FROM monitor_history WHERE time < NOW() - ($1 || ' days')::INTERVAL`,
		days,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (db *DB) GetHistoryRetentionStats(ctx context.Context) (int64, *time.Time, error) {
	var total int64
	var oldest *time.Time
	err := db.pool.QueryRow(ctx,
		`SELECT count(*), min(time) FROM monitor_history`,
	).Scan(&total, &oldest)
	return total, oldest, err
}
