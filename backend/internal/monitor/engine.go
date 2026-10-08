package monitor

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"strconv"
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
	jobs        map[int]chan struct{} // monitorID → stop channel
	resultsChan chan models.CheckResult
}

// NewEngine creates a new polling engine.
func NewEngine(db *database.DB, cache *database.Cache, cfg config.Config, b EventBroadcaster) *Engine {
	return &Engine{
		db:          db,
		cache:       cache,
		notifier:    notifications.NewDispatcher(cfg),
		broadcaster: b,
		jobs:        make(map[int]chan struct{}),
		resultsChan: make(chan models.CheckResult, 50000),
	}
}

// Start loads all active monitors from the database and schedules goroutines.
func (e *Engine) Start(ctx context.Context) {
	// Load dispatcher settings from DB on startup
	e.ReloadNotifierConfig(ctx)

	// Start bulk DB writer
	go e.batchWriter(ctx)

	monitors, err := e.db.ListAllActiveMonitors(ctx)
	if err != nil {
		log.Printf("⚠️  Engine: could not load monitors: %v", err)
		return
	}
	for _, m := range monitors {
		e.ScheduleMonitor(m)
	}
	log.Printf("🚀 Engine: scheduling %d monitors", len(monitors))
}

// ScheduleMonitor adds or replaces a monitor in the polling scheduler.
func (e *Engine) ScheduleMonitor(m models.Monitor) {
	e.mu.Lock()
	if stop, ok := e.jobs[m.ID]; ok {
		close(stop)
	}
	stop := make(chan struct{})
	e.jobs[m.ID] = stop
	e.mu.Unlock()

	go func() {
		// JITTER: random offset to prevent the "thundering herd" problem
		// Capped at 5 seconds so the UI doesn't look frozen on startup
		if m.IntervalSeconds > 0 {
			maxJitter := m.IntervalSeconds
			if maxJitter > 5 {
				maxJitter = 5
			}
			jitter := time.Duration(rand.Intn(maxJitter*1000)) * time.Millisecond
			time.Sleep(jitter)
		}

		// Run immediately on first schedule
		e.executeCheck(context.Background(), m)

		ticker := time.NewTicker(time.Duration(m.IntervalSeconds) * time.Second)
		defer ticker.Stop()
		for {
			// Prevent ghost goroutines by prioritizing the stop signal
			select {
			case <-stop:
				return
			default:
			}

			select {
			case <-ticker.C:
				e.executeCheck(context.Background(), m)
			case <-stop:
				return
			}
		}
	}()
}

// StopMonitor terminates the goroutine for a specific monitor.
func (e *Engine) StopMonitor(monitorID int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if stop, ok := e.jobs[monitorID]; ok {
		close(stop)
		delete(e.jobs, monitorID)
	}
}

// executeCheck runs the check, saves to DB, updates cache, and triggers alerts.
func (e *Engine) executeCheck(ctx context.Context, m models.Monitor) {
	if e.notifier.GetSetting("global_maintenance", "") == "true" {
		result := models.CheckResult{
			MonitorID: m.ID,
			Status:    "MAINTENANCE",
			LatencyMs: 0,
			ErrorMsg:  "Mantenimiento Global",
			CheckedAt: time.Now(),
		}
		if err := e.db.SaveCheckResult(ctx, result); err != nil {
			// ignore
		}
		e.cache.SetStatus(ctx, m.ID, "MAINTENANCE", 0, "Mantenimiento Global", nil)
		if e.broadcaster != nil {
			e.broadcaster.Broadcast(result)
		}
		return
	}

	result := RunCheck(m)
	e.ProcessResult(ctx, m, result)
}

func (e *Engine) ProcessResult(ctx context.Context, m models.Monitor, result models.CheckResult) {
	// Threshold check for generic MetricValue (e.g. from SNMP)
	if m.ValueThreshold != nil && result.MetricValue != nil {
		if *result.MetricValue >= float64(*m.ValueThreshold) {
			result.Status = models.StatusDEGRADED
			result.ErrorMsg = fmt.Sprintf("Valor %.2f > Límite %d", *result.MetricValue, *m.ValueThreshold)
		}
	}

	if m.IsMaintenance {
		result.Status = models.StatusMAINTENANCE
	}

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
		if fails >= m.Retries {
			groupName := "Sin Grupo"
			if m.GroupID != nil {
				groupName = e.db.GetGroupName(ctx, *m.GroupID)
			}

			if !e.cache.IsAlerted(ctx, m.ID) {
				log.Printf("🚨 ALERT: Monitor %s is %s after %d retries", m.Name, statusStr, fails)
				e.notifier.Send(m, groupName, statusStr, result.ErrorMsg)
				e.cache.SetAlerted(ctx, m.ID, true)
				// Guardar el tiempo exacto en el que caímos
				e.cache.SetDownSince(ctx, m.ID, time.Now().Unix())
			} else {
				// Ya enviamos la alerta inicial. Comprobar escalación.
				downSince := e.cache.GetDownSince(ctx, m.ID)
				if downSince > 0 && !e.cache.IsEscalated(ctx, m.ID) {
					// Leer timeout de escalación (por defecto 30 minutos)
					thresholdStr := e.notifier.GetSetting("escalation_timeout_minutes", "30")
					thresholdMinutes, _ := strconv.Atoi(thresholdStr)
					if thresholdMinutes > 0 && time.Now().Unix() - downSince >= int64(thresholdMinutes * 60) {
						log.Printf("⚠️  ESCALATION: Monitor %s has been %s for %d minutes", m.Name, statusStr, thresholdMinutes)
						e.notifier.SendEscalation(m, groupName, statusStr, result.ErrorMsg)
						e.cache.SetEscalated(ctx, m.ID, true)
					}
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
			
			// Si estaba escalado, enviamos un aviso de recuperación a los escalados también
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

// RestartAll stops and reschedules all monitors to force an immediate check.
func (e *Engine) RestartAll(ctx context.Context) {
	monitors, err := e.db.ListAllActiveMonitors(ctx)
	if err != nil {
		return
	}
	for _, m := range monitors {
		e.ScheduleMonitor(m)
	}
}

// maxPendingBatch caps how many results are kept in memory while the database is unreachable.
const maxPendingBatch = 50000

// batchWriter aggregates check results and inserts them in bulk to TimescaleDB.
// If an insert fails the batch is kept and retried, so a transient DB problem
// does not silently drop history.
func (e *Engine) batchWriter(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
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
	for id, stop := range e.jobs {
		close(stop)
		delete(e.jobs, id)
	}
}
