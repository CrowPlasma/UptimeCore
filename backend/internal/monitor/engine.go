package monitor

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"strconv"
	"strings"
	"time"

	"ping-eye/internal/config"
	"ping-eye/internal/database"
	"ping-eye/internal/models"
	"ping-eye/internal/notifications"
)

// EventBroadcaster interface to push live updates to the UI
type EventBroadcaster interface {
	Broadcast(r models.CheckResult)
}

// Engine schedules and runs all monitor checks using goroutines.
type Engine struct {
	db          *database.DB
	cache       *database.Cache
	notifier    *notifications.Dispatcher
	broadcaster EventBroadcaster
	mu          sync.Mutex
	jobs        map[int]context.CancelFunc // monitorID → cancel function
	resultsChan chan models.CheckResult
}

// NewEngine creates a new polling engine.
func NewEngine(db *database.DB, cache *database.Cache, cfg config.Config, b EventBroadcaster) *Engine {
	return &Engine{
		db:          db,
		cache:       cache,
		notifier:    notifications.NewDispatcher(cfg),
		broadcaster: b,
		jobs:        make(map[int]context.CancelFunc),
		resultsChan: make(chan models.CheckResult, 50000),
	}
}

// Start loads all active monitors from the database and schedules goroutines.
func (e *Engine) Start(ctx context.Context) {
	// Load dispatcher settings from DB on startup
	e.ReloadNotifierConfig(ctx)

	// Start bulk DB writer
	go e.batchWriter(ctx)

	// Start automatic 90-day retention purger
	go e.startRetentionCleaner(ctx)

	monitors, err := e.db.ListAllActiveMonitors(ctx)
	if err != nil {
		log.Printf("⚠️  Engine: could not load monitors: %v", err)
		return
	}
	total := len(monitors)
	for i, m := range monitors {
		intervalMs := m.IntervalSeconds * 1000
		if intervalMs <= 0 {
			intervalMs = 60000
		}
		// Distribute monitors evenly across the full interval so checks stream continuously every second
		var staggerDelay time.Duration
		if total > 1 {
			staggerDelay = time.Duration((i*intervalMs)/total) * time.Millisecond
		}
		e.scheduleMonitorWithDelay(m, staggerDelay, true)
	}
	log.Printf("🚀 Engine: scheduling %d monitors (staggered evenly across interval)", total)
}

// ScheduleMonitor adds or replaces a monitor in the polling scheduler and runs an immediate check (0ms delay).
func (e *Engine) ScheduleMonitor(m models.Monitor) {
	e.scheduleMonitorWithDelay(m, 0, false)
}

// ScheduleMonitorAfter adds or replaces a monitor in the polling scheduler and waits initialDelay before its first check.
func (e *Engine) ScheduleMonitorAfter(m models.Monitor, initialDelay time.Duration) {
	e.scheduleMonitorWithDelay(m, initialDelay, false)
}

func (e *Engine) scheduleMonitorWithDelay(m models.Monitor, initialDelay time.Duration, isBoot bool) {
	e.mu.Lock()
	if cancelOld, ok := e.jobs[m.ID]; ok {
		cancelOld()
	}
	jobCtx, cancel := context.WithCancel(context.Background())
	e.jobs[m.ID] = cancel
	e.mu.Unlock()

	go func() {
		// On boot, if Redis has no cached status yet, run a quick warm-up check first
		if isBoot && initialDelay > 3*time.Second {
			st, _, _, _ := e.cache.GetStatus(jobCtx, m.ID)
			if st == "UNKNOWN" || st == "" {
				warmJitter := time.Duration(rand.Intn(3000)) * time.Millisecond
				select {
				case <-time.After(warmJitter):
					e.executeCheck(jobCtx, m)
				case <-jobCtx.Done():
					return
				}
			}
		}

		if initialDelay > 0 {
			select {
			case <-time.After(initialDelay):
			case <-jobCtx.Done():
				return
			}
		}

		if jobCtx.Err() != nil {
			return
		}

		// Run check and start periodic ticker
		e.executeCheck(jobCtx, m)
		intervalSec := m.IntervalSeconds
		if intervalSec <= 0 {
			intervalSec = 60
		}
		ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if jobCtx.Err() != nil {
					return
				}
				e.executeCheck(jobCtx, m)
			case <-jobCtx.Done():
				return
			}
		}
	}()
}

// BroadcastStatus immediately updates Redis and pushes a status change over SSE (e.g. PAUSED / MAINTENANCE).
func (e *Engine) BroadcastStatus(ctx context.Context, monitorID int, status models.MonitorStatus, latencyMs int, msg string, isActive bool, isMaintenance bool) {
	e.cache.SetStatus(ctx, monitorID, string(status), latencyMs, msg, nil)
	if status == models.StatusPAUSED || status == models.StatusMAINTENANCE {
		e.cache.ResetFails(ctx, monitorID)
		e.cache.SetAlerted(ctx, monitorID, false)
		e.cache.SetEscalated(ctx, monitorID, false)
		e.cache.ClearDownSince(ctx, monitorID)
	}
	if e.broadcaster != nil {
		e.broadcaster.Broadcast(models.CheckResult{
			MonitorID:     monitorID,
			Status:        status,
			LatencyMs:     latencyMs,
			ErrorMsg:      msg,
			CheckedAt:     time.Now(),
			IsActive:      &isActive,
			IsMaintenance: &isMaintenance,
		})
	}
}

// StopMonitor terminates the goroutine and any in-flight check for a specific monitor.
func (e *Engine) StopMonitor(monitorID int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if cancel, ok := e.jobs[monitorID]; ok {
		cancel()
		delete(e.jobs, monitorID)
	}
}

// IsGlobalMaintenance returns true if global maintenance mode is currently active in settings.
func (e *Engine) IsGlobalMaintenance() bool {
	return e.notifier.GetSetting("global_maintenance", "") == "true"
}

// executeCheck runs the check, saves to DB, updates cache, and triggers alerts.
func (e *Engine) executeCheck(ctx context.Context, m models.Monitor) {
	if ctx.Err() != nil || !m.IsActive {
		return
	}

	isGlobalMaint := e.IsGlobalMaintenance()
	if isGlobalMaint || m.IsMaintenance {
		msg := "En Mantenimiento"
		if isGlobalMaint {
			msg = "Mantenimiento Global"
		}
		isActive := true
		isMaint := true
		result := models.CheckResult{
			MonitorID:     m.ID,
			Status:        models.StatusMAINTENANCE,
			LatencyMs:     0,
			ErrorMsg:      msg,
			CheckedAt:     time.Now(),
			IsActive:      &isActive,
			IsMaintenance: &isMaint,
		}
		if ctx.Err() != nil {
			return
		}
		select {
		case e.resultsChan <- result:
		default:
		}
		e.cache.SetStatus(ctx, m.ID, "MAINTENANCE", 0, msg, nil)
		e.cache.ResetFails(ctx, m.ID)
		e.cache.SetAlerted(ctx, m.ID, false)
		e.cache.SetEscalated(ctx, m.ID, false)
		e.cache.ClearDownSince(ctx, m.ID)
		if e.broadcaster != nil {
			e.broadcaster.Broadcast(result)
		}
		return
	}

	retries := m.Retries
	if retries < 1 {
		retries = 1
	}

	var result models.CheckResult
	for attempt := 1; attempt <= retries; attempt++ {
		if ctx.Err() != nil {
			return
		}
		result = RunCheck(ctx, m)
		if ctx.Err() != nil {
			return
		}

		// Threshold check for generic MetricValue (e.g. from SNMP)
		if m.ValueThreshold != nil && *m.ValueThreshold > 0 && result.MetricValue != nil {
			if *result.MetricValue >= float64(*m.ValueThreshold) {
				result.Status = models.StatusDEGRADED
				result.ErrorMsg = fmt.Sprintf("Valor %.2f > Límite %d", *result.MetricValue, *m.ValueThreshold)
			}
		}

		// If check succeeded, or we reached max retries, or monitor is already in confirmed DOWN state, stop retrying
		if result.Status == models.StatusUP || attempt >= retries || e.cache.IsAlerted(ctx, m.ID) {
			break
		}

		log.Printf("[RETRY %d/%d] [%-8s] %-30s -> %s (%s)",
			attempt, retries, m.Type, m.Target, result.Status, result.ErrorMsg)

		select {
		case <-time.After(2 * time.Second):
		case <-ctx.Done():
			return
		}
	}

	if ctx.Err() != nil {
		return
	}
	e.ProcessResult(ctx, m, result)
}

func (e *Engine) ProcessResult(ctx context.Context, m models.Monitor, result models.CheckResult) {
	if ctx.Err() != nil {
		return
	}
	// Threshold check for generic MetricValue (e.g. from SNMP)
	if m.ValueThreshold != nil && *m.ValueThreshold > 0 && result.MetricValue != nil {
		if *result.MetricValue >= float64(*m.ValueThreshold) {
			result.Status = models.StatusDEGRADED
			result.ErrorMsg = fmt.Sprintf("Valor %.2f > Límite %d", *result.MetricValue, *m.ValueThreshold)
		}
	}

	if m.IsMaintenance || e.IsGlobalMaintenance() {
		result.Status = models.StatusMAINTENANCE
		result.LatencyMs = 0
		result.ErrorMsg = "En Mantenimiento"
		m.IsMaintenance = true
	}

	isActive := m.IsActive
	isMaint := m.IsMaintenance
	result.IsActive = &isActive
	result.IsMaintenance = &isMaint

	statusStr := string(result.Status)
	if result.ErrorMsg != "" {
		log.Printf("[%-8s] %-30s -> %-8s (%4dms) %s",
			m.Type, m.Target, statusStr, result.LatencyMs, result.ErrorMsg)
	} else {
		log.Printf("[%-8s] %-30s -> %-8s (%4dms)",
			m.Type, m.Target, statusStr, result.LatencyMs)
	}

	// Persist to TimescaleDB asynchronously via Batch Channel
	select {
	case e.resultsChan <- result:
	default:
		log.Printf("⚠️  Engine results buffer full, dropping metric for monitor %d", m.ID)
	}

	// Cache latest status in Redis
	e.cache.SetStatus(ctx, m.ID, statusStr, result.LatencyMs, result.ErrorMsg, result.MetricValue)

	// --- ALERTING LOGIC ---
	if result.Status == models.StatusDOWN || result.Status == models.StatusDEGRADED {
		fails := e.cache.IncFails(ctx, m.ID)
		groupName := "Sin Grupo"
		if m.GroupID != nil {
			groupName = e.db.GetGroupName(ctx, *m.GroupID)
		}

		if !e.cache.IsAlerted(ctx, m.ID) {
			log.Printf("🚨 ALERT: Monitor %s is %s (confirmed after %d retries)", m.Name, statusStr, m.Retries)
			e.notifier.Send(m, groupName, statusStr, result.ErrorMsg)
			e.cache.SetAlerted(ctx, m.ID, true)
			e.cache.SetDownSince(ctx, m.ID, time.Now().Unix())
		} else {
			// Ya enviamos la alerta inicial. Comprobar escalación.
			_ = fails
			downSince := e.cache.GetDownSince(ctx, m.ID)
			if downSince > 0 && !e.cache.IsEscalated(ctx, m.ID) {
				thresholdStr := e.notifier.GetSetting("escalation_timeout_minutes", "30")
				thresholdMinutes, _ := strconv.Atoi(thresholdStr)
				if thresholdMinutes > 0 && time.Now().Unix()-downSince >= int64(thresholdMinutes*60) {
					log.Printf("⚠️  ESCALATION: Monitor %s has been %s for %d minutes", m.Name, statusStr, thresholdMinutes)
					e.notifier.SendEscalation(m, groupName, statusStr, result.ErrorMsg)
					e.cache.SetEscalated(ctx, m.ID, true)
				}
			}
		}
	} else if result.Status == models.StatusUP {
		if e.cache.IsAlerted(ctx, m.ID) {
			log.Printf("✅ RECOVERED: Monitor %s is back UP", m.Name)
			groupName := "Sin Grupo"
			if m.GroupID != nil {
				groupName = e.db.GetGroupName(ctx, *m.GroupID)
			}
			e.notifier.Send(m, groupName, "UP", "Servicio recuperado exitosamente.")

			if e.cache.IsEscalated(ctx, m.ID) {
				e.notifier.SendEscalation(m, groupName, "UP", "Servicio recuperado tras escalación.")
			}

			e.cache.SetAlerted(ctx, m.ID, false)
			e.cache.SetEscalated(ctx, m.ID, false)
			e.cache.ClearDownSince(ctx, m.ID)
		}
		e.cache.ResetFails(ctx, m.ID)
	}

	// --- REAL-TIME UI PUSH ---
	if e.broadcaster != nil {
		e.broadcaster.Broadcast(result)
	}
}

// ReloadNotifierConfig updates the dispatcher settings from the database.
func (e *Engine) ReloadNotifierConfig(ctx context.Context) {
	settings, err := e.db.GetSettings(ctx)
	if err == nil {
		e.notifier.UpdateSettings(settings)
	}
}

// ApplyGlobalMaintenance immediately transitions all active monitors into or out of maintenance mode without lag or resets.
func (e *Engine) ApplyGlobalMaintenance(ctx context.Context, enabled bool) {
	// Cancel all in-flight checks first so nothing overwrites the new state
	e.StopAll()

	monitors, err := e.db.ListAllActiveMonitors(ctx)
	if err != nil {
		return
	}
	total := len(monitors)
	for i, m := range monitors {
		m.IsMaintenance = enabled
		intervalSec := m.IntervalSeconds
		if intervalSec <= 0 {
			intervalSec = 60
		}

		if enabled {
			e.BroadcastStatus(ctx, m.ID, models.StatusMAINTENANCE, 0, "Mantenimiento Global", true, true)
			e.ScheduleMonitorAfter(m, time.Duration(intervalSec)*time.Second)
		} else {
			e.BroadcastStatus(ctx, m.ID, models.StatusUNKNOWN, 0, "", true, false)
			e.cache.SetStatus(ctx, m.ID, "CHECKING", 0, "", nil)
			// Fast stagger (0..1.5s total) so all monitors quickly check their live status
			var fastDelay time.Duration
			if total > 1 {
				fastDelay = time.Duration((i*1500)/total) * time.Millisecond
			}
			e.scheduleMonitorWithDelay(m, fastDelay, false)
		}
	}
}

// RestartAll stops and reschedules all monitors with uniform staggering.
func (e *Engine) RestartAll(ctx context.Context) {
	monitors, err := e.db.ListAllActiveMonitors(ctx)
	if err != nil {
		return
	}
	total := len(monitors)
	for i, m := range monitors {
		intervalMs := m.IntervalSeconds * 1000
		if intervalMs <= 0 {
			intervalMs = 60000
		}
		var staggerDelay time.Duration
		if total > 1 {
			staggerDelay = time.Duration((i*intervalMs)/total) * time.Millisecond
		}
		e.scheduleMonitorWithDelay(m, staggerDelay, false)
	}
}

// maxPendingBatch caps how many results are kept in memory while the database is unreachable.
const maxPendingBatch = 50000

// batchWriter aggregates check results and inserts them in bulk to TimescaleDB.
// If an insert fails the batch is kept and retried, so a transient DB problem
// does not silently drop history.
func (e *Engine) batchWriter(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	var batch []models.CheckResult
	var lastFail time.Time

	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := e.db.SaveCheckResultsBulk(ctx, batch); err != nil {
			lastFail = time.Now()
			log.Printf("⚠️  Bulk insert failed (%d results kept for retry): %v", len(batch), err)
			
			// Discard batch if a monitor was deleted
			if strings.Contains(err.Error(), "23503") || strings.Contains(err.Error(), "foreign key") {
				log.Printf("🚮 Discarding batch due to foreign key violation (deleted monitor)")
				batch = nil
				return
			}
			
			if len(batch) > maxPendingBatch {
				batch = batch[len(batch)-maxPendingBatch:]
			}
			return
		}
		batch = nil
	}

	for {
		select {
		case <-ctx.Done():
			if len(batch) > 0 {
				e.db.SaveCheckResultsBulk(context.Background(), batch)
			}
			return
		case res := <-e.resultsChan:
			batch = append(batch, res)
			if len(batch) >= 1000 && time.Since(lastFail) > 5*time.Second {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// StopAll terminates all running polling goroutines.
func (e *Engine) StopAll() {
	e.mu.Lock()
	defer e.mu.Unlock()
	for id, cancel := range e.jobs {
		cancel()
		delete(e.jobs, id)
	}
}

// startRetentionCleaner periodically purges telemetry points older than 90 days.
func (e *Engine) startRetentionCleaner(ctx context.Context) {
	// First run 30s after startup
	select {
	case <-time.After(30 * time.Second):
		if purged, err := e.db.PurgeOldHistory(ctx, 90); err == nil && purged > 0 {
			log.Printf("🧹 [Retention] Purged %d history points older than 90 days", purged)
		}
	case <-ctx.Done():
		return
	}

	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if purged, err := e.db.PurgeOldHistory(ctx, 90); err == nil && purged > 0 {
				log.Printf("🧹 [Retention] Purged %d history points older than 90 days", purged)
			}
		case <-ctx.Done():
			return
		}
	}
}
