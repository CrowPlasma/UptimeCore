/**
 * components/MonitorCard.tsx  (v3 — más espaciado, datos reales)
 * Tarjeta de MonitorGroup con:
 *  - Filas con padding generoso (no líneas apretadas)
 *  - Gráfica real de historia cuando se expande un endpoint
 *  - Botones de editar/eliminar funcionales
 *  - Historia real desde API (/api/monitors/:id/history)
 */
import React, { useState, useEffect } from 'react'
import {
  ChevronDown, ChevronUp, Plus, Pencil, Trash2,
  Globe, Wifi, Activity, Clock, TrendingUp, Loader2, Pause, Play, Wrench,
  Terminal, Download, ShieldCheck, AlertTriangle, FileSpreadsheet
} from 'lucide-react'
import type { MonitorGroup, Monitor, MonitorStatus, HistoryPoint, TimeRange } from '../types'
import type { ModalMode } from './MonitorModal'
import { StatusBadge } from './StatusBadge'
import { UptimeBar } from './UptimeBar'
import { LatencyChart } from './LatencyChart'
import { useMonitorStore, aggregateGroupHistory } from '../store/monitorStore'
import { useAuthStore } from '../store/authStore'
import { ConfirmDialog } from './ConfirmDialog'
import { DiagnosticModal } from './DiagnosticModal'
import { SlaReportModal } from './SlaReportModal'
import { useTranslation } from '../i18n'

// ── Helpers ───────────────────────────────────────────────────────────────
function statusColor(s?: MonitorStatus) {
  if (s === 'UP') return '#22c55e'
  if (s === 'DOWN') return '#ef4444'
  if (s === 'DEGRADED') return '#f59e0b'
  if (s === 'MAINTENANCE') return '#3b82f6'
  if (s === 'PAUSED') return '#6366f1'
  return '#94a3b8'
}

function formatDurationHuman(totalSec: number, isEn?: boolean): string {
  if (totalSec <= 0) return isEn ? '0s (No outages)' : '0s (Sin caídas)'
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  HTTP: <Globe size={14} />, HTTPS: <Globe size={14} />,
  PING: <Activity size={14} />, TCP: <Wifi size={14} />, TCP_PING: <Wifi size={14} />,
}

function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
      background: color + '20', color, border: `1px solid ${color}40`,
    }}>
      {name}
    </span>
  )
}

interface Props {
  group: MonitorGroup
  onOpenModal: (mode: ModalMode) => void
  searchTerm?: string
  activeFilter?: string
  isExpanded?: boolean
  onToggleExpand?: (groupId: number) => void
}

// ── MonitorCard ───────────────────────────────────────────────────────────
export const MonitorCard = React.memo(function MonitorCard({
  group, onOpenModal, activeFilter = 'all', isExpanded: controlledExpanded, onToggleExpand,
}: Props) {
  const { t, isEn } = useTranslation()
  const { isAdmin, canOperate } = useAuthStore()
  const deleteGroup = useMonitorStore(s => s.deleteGroup)
  const deleteMonitor = useMonitorStore(s => s.deleteMonitor)
  const toggleGroup = useMonitorStore(s => s.toggleGroup)
  const toggleGroupMaintenance = useMonitorStore(s => s.toggleGroupMaintenance)

  // Soporte de estado controlado por Dashboard (Expandir/Colapsar todos) con fallback local persistente
  const [localExpanded, setLocalExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('uptimecore_expanded_groups')
      if (raw) {
        const ids: number[] = JSON.parse(raw)
        return ids.includes(group.id)
      }
    } catch {}
    return false
  })

  const expanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded

  const handleToggle = React.useCallback(() => {
    if (onToggleExpand) {
      onToggleExpand(group.id)
    } else {
      setLocalExpanded(prev => {
        const next = !prev
        try {
          const raw = localStorage.getItem('uptimecore_expanded_groups')
          let ids: number[] = raw ? JSON.parse(raw) : []
          if (next) {
            if (!ids.includes(group.id)) ids.push(group.id)
          } else {
            ids = ids.filter(id => id !== group.id)
          }
          localStorage.setItem('uptimecore_expanded_groups', JSON.stringify(ids))
        } catch {}
        return next
      })
    }
  }, [group.id, onToggleExpand])

  // Persistencia del monitor activo (con gráfica/SLA abierta)
  const [activeMonitorId, setActiveMonitorIdState] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(`uptimecore_active_mon_${group.id}`)
      return saved ? Number(saved) : null
    } catch {
      return null
    }
  })

  const setActiveMonitorId = React.useCallback((action: number | null | ((prev: number | null) => number | null)) => {
    setActiveMonitorIdState(prev => {
      const next = typeof action === 'function' ? action(prev) : action
      try {
        if (next != null) {
          localStorage.setItem(`uptimecore_active_mon_${group.id}`, String(next))
        } else {
          localStorage.removeItem(`uptimecore_active_mon_${group.id}`)
        }
      } catch {}
      return next
    })
  }, [group.id])

  const [diagnosticMonitor, setDiagnosticMonitor] = useState<Monitor | null>(null)
  const [slaReportTarget, setSlaReportTarget] = useState<{ monitor: Monitor; range: TimeRange } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<
    { type: 'group' } | { type: 'monitor'; monitorId: number } | null
  >(null)

  const status = group.overall_status ?? 'UNKNOWN'
  const groupHistory = React.useMemo(() => aggregateGroupHistory(group.monitors || []), [group.monitors])

  const groupMetrics = React.useMemo(() => {
    const mons = group.monitors || []
    const active = mons.filter(m => m.is_active !== false && m.current_status !== 'PAUSED')
    const pausedCount = mons.filter(m => !m.is_active || m.current_status === 'PAUSED').length
    const maintCount = mons.filter(m => m.is_active !== false && (m.is_maintenance || m.current_status === 'MAINTENANCE')).length
    const upMons = active.filter(m => m.current_status === 'UP' || m.current_status === 'DEGRADED')
    const withLat = upMons.filter(m => (m.current_latency_ms ?? 0) > 0)
    const avgLat = withLat.length > 0
      ? Math.round(withLat.reduce((acc, m) => acc + (m.current_latency_ms || 0), 0) / withLat.length)
      : null
    const lastPt = groupHistory.length > 0 ? groupHistory[groupHistory.length - 1] : null
    const lastTimeStr = lastPt?.time
      ? new Date(lastPt.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : null
    const allPaused = mons.length > 0 && active.length === 0
    const allMaint = mons.length > 0 && mons.every(m => m.is_active !== false && (m.is_maintenance || m.current_status === 'MAINTENANCE'))
    return {
      total: mons.length,
      activeCount: active.length,
      pausedCount,
      maintCount,
      upCount: active.filter(m => m.current_status === 'UP').length,
      avgLat,
      lastTimeStr,
      allPaused,
      allMaint,
    }
  }, [group.monitors, groupHistory])

  const stripeStatus: MonitorStatus =
    activeFilter === 'paused' && groupMetrics.pausedCount > 0
      ? 'PAUSED'
      : activeFilter === 'maintenance' && groupMetrics.maintCount > 0
      ? 'MAINTENANCE'
      : status

  const groupRef = React.useRef(group)
  groupRef.current = group

  const handleToggleMonitor = React.useCallback((mid: number) => {
    setActiveMonitorId(id => id === mid ? null : mid)
  }, [setActiveMonitorId])

  const handleEditMonitor = React.useCallback((m: Monitor) => {
    onOpenModal({ type: 'edit_monitor', group: groupRef.current, monitor: m })
  }, [onOpenModal])

  const handleDeleteMonitor = React.useCallback((mid: number) => {
    setConfirmDelete({ type: 'monitor', monitorId: mid })
  }, [])

  const handleDiagnoseMonitor = React.useCallback((m: Monitor) => {
    setDiagnosticMonitor(m)
  }, [])

  const handleSlaReport = React.useCallback((m: Monitor, range: TimeRange) => {
    setSlaReportTarget({ monitor: m, range })
  }, [])

  return (
    <>
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>

        {/* ══ Cabecera del grupo (homologada a 350px | 1fr | 560px) ══ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '350px 1fr 560px',
            alignItems: 'center',
            gap: 14,
            padding: '10px 24px',
            cursor: 'pointer',
            position: 'relative',
          }}
          onClick={handleToggle}
        >
          {/* Franja de color */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
            background: statusColor(stripeStatus),
          }} />

          {/* Columna 1: Nombre + Comentarios + Etiquetas abajo (optimizado para espacio) */}
          <div style={{ paddingLeft: 10, paddingRight: 6, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span
              title={group.name}
              style={{
                fontWeight: 700,
                fontSize: 14.5,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%',
              }}
            >
              {group.name}
            </span>
            {group.description && (
              <p
                title={group.description}
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-text-secondary)',
                  marginTop: 2,
                  lineHeight: 1.35,
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  width: '100%',
                }}
              >
                {group.description}
              </p>
            )}
            {group.tags && group.tags.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                {group.tags.slice(0, 4).map(t => <TagChip key={t.id} name={t.name} color={t.color} />)}
                {group.tags.length > 4 && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    +{group.tags.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Columna 2: Barra de uptime que aprovecha todo el espacio central */}
          <div style={{ minWidth: 0, width: '100%' }}>
            {group.monitors && group.monitors.length > 0 ? (
              <UptimeBar
                history={groupHistory}
                maxBars={36}
              />
            ) : (
              <div style={{ height: 22, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{isEn ? 'No endpoints' : 'Sin endpoints'}</span>
              </div>
            )}
          </div>

          {/* Columna 3: Panel derecho homologado con slots holgados sin sobreposición (560px) */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 105px 105px 214px 24px', alignItems: 'center', gap: 8, width: 560 }}>
            {/* Slot 1: Latencia promedio (sin hora para eliminar ruido visual) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: 80 }}>
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: groupMetrics.avgLat != null ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              }}>
                {groupMetrics.avgLat != null ? `${groupMetrics.avgLat} ms` : '—'}
              </span>
            </div>

            {/* Slot 2: Contador de endpoints o badges de pausa/mantenimiento */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, width: 105, overflow: 'hidden' }}>
              {groupMetrics.pausedCount > 0 && status !== 'PAUSED' ? (
                <span
                  title={isEn ? `${groupMetrics.pausedCount} of ${groupMetrics.total} sensors paused` : `${groupMetrics.pausedCount} de ${groupMetrics.total} sensores en pausa`}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 99,
                    background: activeFilter === 'paused' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(100, 116, 139, 0.16)',
                    color: activeFilter === 'paused' ? '#818cf8' : '#94a3b8',
                    border: activeFilter === 'paused' ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid rgba(148, 163, 184, 0.3)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {groupMetrics.pausedCount} {isEn ? 'PAUSED' : 'PAUSA'}
                </span>
              ) : groupMetrics.maintCount > 0 && status !== 'MAINTENANCE' ? (
                <span
                  title={isEn ? `${groupMetrics.maintCount} of ${groupMetrics.total} sensors in maintenance` : `${groupMetrics.maintCount} de ${groupMetrics.total} sensores en mantenimiento`}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 99,
                    background: 'rgba(59, 130, 246, 0.18)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.38)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {groupMetrics.maintCount} {isEn ? 'MAINT.' : 'MANT.'}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {groupMetrics.activeCount > 0 ? `${groupMetrics.upCount}/${groupMetrics.activeCount}` : groupMetrics.total} ep
                </span>
              )}
            </div>

            {/* Slot 3: Badge de estado */}
            <div style={{ display: 'flex', justifyContent: 'center', width: 105 }}>
              <StatusBadge status={status} />
            </div>

            {/* Slot 4: Acciones de Grupo Completo (214px holgado para los 6 botones) */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', width: '100%' }} onClick={e => e.stopPropagation()}>
              {groupMetrics.total > 0 && canOperate() && (
                <>
                  <Btn
                    icon={<Terminal size={13} strokeWidth={2.3} />}
                    title={isEn ? "Live Group Diagnostics (Paping / Ping / Traceroute)" : "Diagnóstico en Vivo del Grupo (Paping / Ping / Traceroute)"}
                    onClick={() => {
                      const firstActive = group.monitors.find(m => m.is_active !== false && m.current_status !== 'PAUSED') || group.monitors[0]
                      setDiagnosticMonitor(firstActive)
                    }}
                    customColor={{ bg: 'rgba(14, 165, 233, 0.14)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8' }}
                  />
                  <Btn
                    icon={<Wrench size={12} strokeWidth={2.5} />}
                    title={groupMetrics.allMaint ? (isEn ? "Remove maintenance from entire group" : "Quitar Mantenimiento a todo el grupo") : (isEn ? "Set entire group into maintenance" : "Poner todo el grupo en Mantenimiento")}
                    onClick={() => toggleGroupMaintenance(group.id)}
                    customColor={groupMetrics.allMaint
                      ? { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#60a5fa' }
                      : undefined
                    }
                  />
                  <Btn
                    icon={!groupMetrics.allPaused ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
                    title={!groupMetrics.allPaused ? (isEn ? "Pause entire group" : "Pausar todo el grupo") : (isEn ? "Resume entire group" : "Reanudar todo el grupo")}
                    onClick={() => toggleGroup(group.id)}
                    customColor={groupMetrics.allPaused
                      ? { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', text: '#34d399' }
                      : undefined
                    }
                  />
                </>
              )}
              {isAdmin() && (
                <>
                  <Btn icon={<Plus size={13} />}   title={isEn ? "Add endpoint" : "Agregar endpoint"}  onClick={() => { onOpenModal({ type: 'new_monitor', group }); if (!expanded) handleToggle(); }} />
                  <Btn icon={<Pencil size={13} />} title={isEn ? "Edit group" : "Editar grupo"}      onClick={() => onOpenModal({ type: 'edit_group', group })} />
                  <Btn icon={<Trash2 size={13} />} title={isEn ? "Delete group" : "Eliminar grupo"}    danger onClick={() => setConfirmDelete({ type: 'group' })} />
                </>
              )}
            </div>

            {/* Slot 5: Chevron */}
            <div style={{ display: 'flex', justifyContent: 'center', width: 24 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </div>
          </div>
        </div>

        {/* ══ Acordeón con endpoints ══ */}
        {expanded && (
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            {!group.monitors || group.monitors.length === 0 ? (
              <div style={{
                padding: '32px 28px', textAlign: 'center',
                color: 'var(--color-text-muted)', fontSize: 13,
              }}>
                {t.monitor.noEndpoints} &nbsp;
                <button
                  onClick={() => onOpenModal({ type: 'new_monitor', group })}
                  style={{ color: 'var(--color-accent)', fontWeight: 700 }}
                >
                  {t.monitor.addFirstEndpoint}
                </button>
              </div>
            ) : (
              group.monitors.map(monitor => (
                <MonitorRow
                  key={monitor.id}
                  monitor={monitor}
                  groupId={group.id}
                  groupName={group.name}
                  isActive={activeMonitorId === monitor.id}
                  onToggle={handleToggleMonitor}
                  onEdit={handleEditMonitor}
                  onDelete={handleDeleteMonitor}
                  onDiagnose={handleDiagnoseMonitor}
                  onSlaReport={handleSlaReport}
                />
              ))
            )}

            {/* Botón add endpoint inline (Solo Administradores) */}
            {isAdmin() && (
              <div style={{ padding: '12px 24px', borderTop: '1px dashed var(--color-border)' }}>
                <button
                  onClick={() => onOpenModal({ type: 'new_monitor', group })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 600, color: 'var(--color-accent)',
                  }}
                >
                  <Plus size={13} /> {isEn ? 'Add endpoint' : 'Agregar endpoint'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Diagnóstico en Vivo */}
      {diagnosticMonitor && canOperate() && (
        <DiagnosticModal
          initialMonitor={diagnosticMonitor}
          initialGroupName={group.name}
          groupMonitors={group.monitors}
          onClose={() => setDiagnosticMonitor(null)}
        />
      )}

      {/* Modal de Reporte Ejecutivo de SLA individual */}
      {slaReportTarget && (
        <SlaReportModal
          onClose={() => setSlaReportTarget(null)}
          initialGroupId={group.id}
          initialMonitorId={slaReportTarget.monitor.id}
          initialRange={slaReportTarget.range}
          groups={useMonitorStore.getState().groups}
        />
      )}

      {/* Confirmación de borrado (GRUPO) */}
      {confirmDelete?.type === 'group' && (
        <ConfirmDialog
          title={isEn ? `Delete GROUP "${group.name}"?` : `¿Eliminar GRUPO "${group.name}"?`}
          message={isEn ? "⚠️ ATTENTION: The entire group, including all its endpoints and history will be deleted. This cannot be undone." : "⚠️ ATENCIÓN: Se eliminará todo el grupo, incluyendo todos sus endpoints y el historial completo. Esta acción no se puede deshacer."}
          confirmLabel={isEn ? "Delete Entire Group" : "Eliminar Grupo Completo"}
          onConfirm={async () => {
            await deleteGroup(group.id)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Confirmación de borrado (ENDPOINT/MONITOR) */}
      {confirmDelete?.type === 'monitor' && (
        <ConfirmDialog
          title={isEn ? "Delete this endpoint only?" : "¿Eliminar solo este endpoint?"}
          message={isEn ? "Only this endpoint and its history will be deleted. The parent group will remain intact." : "Se eliminará únicamente este endpoint y su historial. El grupo principal se mantendrá intacto."}
          confirmLabel={isEn ? "Delete Endpoint" : "Eliminar Endpoint"}
          onConfirm={async () => {
            const mid = (confirmDelete as { type: 'monitor'; monitorId: number }).monitorId
            await deleteMonitor(group.id, mid)
            setConfirmDelete(null)
            if (activeMonitorId === mid) setActiveMonitorId(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  )
})

// ── Fila de endpoint hijo ─────────────────────────────────────────────────
const MonitorRow = React.memo(function MonitorRow({
  monitor,
  groupId,
  groupName,
  isActive,
  onToggle,
  onEdit,
  onDelete,
  onDiagnose,
  onSlaReport,
}: {
  monitor: Monitor
  groupId: number
  groupName: string
  isActive: boolean
  onToggle: (id: number) => void
  onEdit: (m: Monitor) => void
  onDelete: (id: number) => void
  onDiagnose: (m: Monitor) => void
  onSlaReport: (m: Monitor, range: TimeRange) => void
}) {
  const toggleMonitor = useMonitorStore(s => s.toggleMonitor)
  const toggleMaintenance = useMonitorStore(s => s.toggleMaintenance)
  const { isAdmin, canOperate } = useAuthStore()
  const { t, isEn, locale } = useTranslation()
  const isPaused = monitor.is_active === false || monitor.current_status === 'PAUSED'
  const isMaint = !isPaused && (monitor.is_maintenance === true || monitor.current_status === 'MAINTENANCE')
  const status: MonitorStatus = isPaused
    ? 'PAUSED'
    : isMaint
      ? 'MAINTENANCE'
      : (monitor.current_status ?? 'UNKNOWN')
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [histRange, setHistRange] = useState<TimeRange>('recent')
  const [histLoading, setHistLoading] = useState(false)

  const getRangeLabel = (range: TimeRange) => {
    switch (range) {
      case 'recent': return t.monitor.rangeLabelRecent
      case '3h': return t.monitor.rangeLabel3h
      case '6h': return t.monitor.rangeLabel6h
      case '24h': return t.monitor.rangeLabel24h
      case '1w': return t.monitor.rangeLabel7d
      case '30d': return t.monitor.rangeLabel30d
      default: return range
    }
  }

  // Cargar historia cuando se activa el panel
  useEffect(() => {
    if (!isActive) return
    loadHistory(histRange)
  }, [isActive, histRange, monitor.id])

  async function loadHistory(range: TimeRange) {
    setHistLoading(true)
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/history?range=${range}`)
      const data: HistoryPoint[] = await res.json()
      setHistory(Array.isArray(data) ? data : [])
    } catch {
      setHistory([])
    } finally {
      setHistLoading(false)
    }
  }

  // Combine fetched history with live_history (SSE) for 'recent'
  const combinedHistory = React.useMemo(() => {
    const live = monitor.live_history || []
    if (!isActive) return live
    if (histRange !== 'recent' && history.length > 0) return history
    if (history.length === 0) return live
    if (live.length === 0) return history
    const lastFetchedTime = new Date(history[history.length - 1].time).getTime()
    const newLive = live.filter(h => new Date(h.time).getTime() > lastFetchedTime)
    return [...history, ...newLive]
  }, [isActive, history, monitor.live_history, histRange])

  // ── Cálculo enriquecido de SLA, Disponibilidad, Tiempo Caído, Jitter y P95 ──
  const slaStats = React.useMemo(() => {
    if (!isActive) return null
    // Excluir muestras en mantenimiento/pausa del cálculo de penalización SLA
    const operational = combinedHistory.filter(
      h => h.status !== 'MAINTENANCE' && h.status !== 'PAUSED' && h.status !== 'UNKNOWN'
    )
    const upSamples = operational.filter(h => h.status === 'UP' || h.status === 'DEGRADED').length
    const downSamples = operational.filter(h => h.status === 'DOWN').length
    const degradedSamples = operational.filter(h => h.status === 'DEGRADED').length

    const slaPctNum = operational.length > 0 ? (upSamples / operational.length) * 100 : null
    const slaPctFormatted = slaPctNum != null ? slaPctNum.toFixed(2) : null

    // Contar cortes (transiciones a DOWN) y estimar segundos de caída en el periodo
    let outagesCount = 0
    let downtimeSec = 0
    const defaultStepSec =
      histRange === 'recent'
        ? monitor.interval_seconds || 60
        : histRange === '3h'
        ? 120
        : histRange === '6h'
        ? 300
        : histRange === '24h'
        ? 900
        : histRange === '1w'
        ? 7200
        : 21600 // 30d bucket = 6h

    for (let i = 0; i < combinedHistory.length; i++) {
      const cur = combinedHistory[i]
      const prev = i > 0 ? combinedHistory[i - 1] : null
      if (cur.status === 'DOWN') {
        if (!prev || (prev.status !== 'DOWN' && prev.status !== 'UNKNOWN')) {
          outagesCount++
        }
        if (prev && prev.status !== 'UNKNOWN') {
          const deltaSec = Math.max(
            1,
            Math.round((new Date(cur.time).getTime() - new Date(prev.time).getTime()) / 1000)
          )
          // Cap single gap to 2x defaultStepSec so app restarts don't inflate downtime
          downtimeSec += Math.min(deltaSec, defaultStepSec * 2)
        } else {
          downtimeSec += defaultStepSec
        }
      }
    }

    // Latencias válidas (> 0 y no DOWN)
    const validLats = combinedHistory
      .filter(h => h.status !== 'DOWN' && h.latency_ms > 0)
      .map(h => h.latency_ms)

    const minLat = validLats.length > 0 ? Math.min(...validLats) : null
    const maxLat = validLats.length > 0 ? Math.max(...validLats) : null
    const avgLat =
      validLats.length > 0
        ? Math.round(validLats.reduce((a, b) => a + b, 0) / validLats.length)
        : null

    // Percentil P95
    const p95Lat = (() => {
      if (validLats.length === 0) return null
      const sorted = [...validLats].sort((a, b) => a - b)
      const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
      return sorted[idx]
    })()

    // Jitter (variación media entre muestras consecutivas)
    const jitterMs = (() => {
      if (validLats.length < 2) return 0
      let sumDiff = 0
      for (let i = 1; i < validLats.length; i++) {
        sumDiff += Math.abs(validLats[i] - validLats[i - 1])
      }
      return Math.round((sumDiff / (validLats.length - 1)) * 10) / 10
    })()

    return {
      totalSamples: operational.length,
      upSamples,
      downSamples,
      degradedSamples,
      slaPctNum,
      slaPctFormatted,
      outagesCount,
      downtimeSec,
      minLat,
      maxLat,
      avgLat,
      p95Lat,
      jitterMs,
    }
  }, [isActive, combinedHistory, histRange, monitor.interval_seconds])

  // Exportar Reporte SLA + Historial del sensor en CSV
  const exportMonitorSlaCsv = () => {
    if (!slaStats) return
    const rows: string[][] = isEn ? [
      ['AVAILABILITY & SLA REPORT - UPTIMECORE'],
      ['Site / Group', groupName],
      ['Sensor / Link', monitor.name],
      ['Target (IP/Host)', `${monitor.target}${monitor.port ? ':' + monitor.port : ''}`],
      ['Protocol', monitor.type],
      ['Evaluated Period', getRangeLabel(histRange)],
      ['SLA Availability (%)', slaStats.slaPctFormatted ? `${slaStats.slaPctFormatted}%` : 'N/A'],
      ['Estimated Downtime', formatDurationHuman(slaStats.downtimeSec, isEn)],
      ['Recorded Outages', String(slaStats.outagesCount)],
      ['Average Latency (ms)', slaStats.avgLat != null ? String(slaStats.avgLat) : 'N/A'],
      ['Minimum Latency (ms)', slaStats.minLat != null ? String(slaStats.minLat) : 'N/A'],
      ['Peak Maximum Latency (ms)', slaStats.maxLat != null ? String(slaStats.maxLat) : 'N/A'],
      ['P95 Percentile (ms)', slaStats.p95Lat != null ? String(slaStats.p95Lat) : 'N/A'],
      ['Stability Jitter (ms)', String(slaStats.jitterMs)],
      [],
      ['Timestamp', 'Status', 'Latency (ms)'],
      ...combinedHistory.map(h => [
        new Date(h.time).toLocaleString(locale),
        h.status,
        String(h.latency_ms ?? 0),
      ]),
    ] : [
      ['REPORTE DE DISPONIBILIDAD Y SLA - UPTIMECORE'],
      ['Sitio / Grupo', groupName],
      ['Sensor / Enlace', monitor.name],
      ['Objetivo (IP/Host)', `${monitor.target}${monitor.port ? ':' + monitor.port : ''}`],
      ['Protocolo', monitor.type],
      ['Periodo Evaluado', getRangeLabel(histRange)],
      ['Disponibilidad SLA (%)', slaStats.slaPctFormatted ? `${slaStats.slaPctFormatted}%` : 'N/A'],
      ['Tiempo Caido Estimado', formatDurationHuman(slaStats.downtimeSec, isEn)],
      ['Cortes Registrados', String(slaStats.outagesCount)],
      ['Latencia Promedio (ms)', slaStats.avgLat != null ? String(slaStats.avgLat) : 'N/A'],
      ['Latencia Minima (ms)', slaStats.minLat != null ? String(slaStats.minLat) : 'N/A'],
      ['Latencia Maxima Pico (ms)', slaStats.maxLat != null ? String(slaStats.maxLat) : 'N/A'],
      ['Percentil P95 (ms)', slaStats.p95Lat != null ? String(slaStats.p95Lat) : 'N/A'],
      ['Jitter Estabilidad (ms)', String(slaStats.jitterMs)],
      [],
      ['Fecha y Hora', 'Estado', 'Latencia (ms)'],
      ...combinedHistory.map(h => [
        new Date(h.time).toLocaleString(locale),
        h.status,
        String(h.latency_ms ?? 0),
      ]),
    ]

    const csvContent =
      '\uFEFF' +
      rows
        .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = `${groupName}_${monitor.name}_${histRange}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    a.href = url
    a.download = `SLA_${safeName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ 
      borderBottom: '1px solid var(--color-border)',
      transition: 'background 0.2s ease',
    }}>
      {/* Fila principal homologada a 350px | 1fr | 560px */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '350px 1fr 560px',
          alignItems: 'center',
          gap: 14,
          padding: '12px 24px',
          cursor: 'pointer',
          background: isActive ? 'var(--color-bg-primary)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onClick={() => onToggle(monitor.id)}
      >
        {/* Columna 1: Identidad del Endpoint (350px balanceado) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0, paddingLeft: 10, paddingRight: 6, overflow: 'hidden' }}>
          <div style={{ width: 14, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            {status === 'UNKNOWN' ? (
              <Loader2 size={13} color="var(--color-text-muted)" className="animate-spin" />
            ) : (
              <div style={{ width: 4, height: 28, borderRadius: 4, background: statusColor(status) }} />
            )}
          </div>

          <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: isPaused ? 0.5 : 1 }}>
            {TYPE_ICON[monitor.type] ?? <Activity size={13} />}
          </span>

          <div style={{ minWidth: 0, flex: 1, paddingRight: 6, wordBreak: 'break-word', opacity: isPaused ? 0.55 : 1, transition: 'opacity 0.2s' }}>
            <div
              title={monitor.name}
              style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {monitor.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', marginTop: 3, fontSize: 11, fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", minWidth: 0 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, padding: '1px 5px', borderRadius: 4,
                color: 'var(--color-accent)', background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.3)', flexShrink: 0,
              }}>
                {monitor.type}
              </span>
              <a
                title={monitor.target}
                href={
                  monitor.target.startsWith('http')
                    ? monitor.target
                    : `${monitor.type === 'HTTP' ? 'http' : 'https'}://${monitor.target}${monitor.port && monitor.port !== 80 && monitor.port !== 443 ? ':' + monitor.port : ''}`
                }
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--color-text-secondary)', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#8b5cf6'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
              >
                {monitor.target}{monitor.port ? `:${monitor.port}` : ''}
              </a>
            </div>
          </div>
        </div>

        {/* Columna 2: Barra de uptime alineada exactamente con la cabecera */}
        <div style={{ minWidth: 0, width: '100%', opacity: isPaused ? 0.45 : 1, filter: isPaused ? 'grayscale(0.4)' : 'none', transition: 'opacity 0.2s' }}>
          <UptimeBar history={combinedHistory} maxBars={36} />
        </div>

        {/* Columna 3: Panel derecho homologado con slots idénticos (560px) */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px 105px 105px 214px 24px', alignItems: 'center', gap: 8, width: 560 }}>
          {/* Slot 1: Latencia (sin hora para evitar ruido visual) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: 80 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {status === 'DOWN' || status === 'PAUSED' || status === 'MAINTENANCE' || status === 'UNKNOWN' ? '—' : `${monitor.current_latency_ms ?? '?'} ms`}
            </span>
          </div>

          {/* Slot 2: Intervalo de chequeo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: 105 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace" }} title={isEn ? "Check interval" : "Intervalo de verificación"}>
              ⏱ {monitor.interval_seconds}s
            </span>
          </div>

          {/* Slot 3: StatusBadge */}
          <div style={{ display: 'flex', justifyContent: 'center', width: 105 }}>
            <StatusBadge status={status} size="sm" />
          </div>

          {/* Slot 4: Acciones del sensor (214px con flex-end) */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', width: '100%' }} onClick={e => e.stopPropagation()}>
            {canOperate() && (
              <>
                <Btn
                  icon={<Terminal size={13} strokeWidth={2.3} />}
                  title={t.monitor.liveDiag}
                  onClick={() => onDiagnose(monitor)}
                  customColor={{ bg: 'rgba(14, 165, 233, 0.14)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8' }}
                />
                <Btn 
                  icon={<Wrench size={12} strokeWidth={2.5} />} 
                  title={isMaint ? t.monitor.maintMonitorOff : t.monitor.maintMonitorOn} 
                  onClick={() => toggleMaintenance(groupId, monitor.id)} 
                  customColor={isMaint 
                    ? { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#60a5fa' }
                    : undefined
                  }
                />
                <Btn 
                  icon={!isPaused ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />} 
                  title={!isPaused ? t.monitor.pauseMonitor : t.monitor.resumeMonitor} 
                  onClick={() => toggleMonitor(groupId, monitor.id)} 
                  customColor={isPaused 
                    ? { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', text: '#34d399' }
                    : undefined
                  }
                />
              </>
            )}
            {isAdmin() && (
              <>
                <Btn icon={<Pencil size={12} />} title={t.common.edit} onClick={() => onEdit(monitor)} />
                <Btn icon={<Trash2 size={12} />} title={t.common.delete} danger onClick={() => onDelete(monitor.id)} />
              </>
            )}
          </div>

          {/* Slot 5: Chevron */}
          <div style={{ display: 'flex', justifyContent: 'center', width: 24 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {isActive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </div>
        </div>
      </div>

      {/* ══ Panel expandido: Resumen Ejecutivo de SLA, Calidad de Enlace + Gráfica ══ */}
      {isActive && slaStats && (
        <div style={{
          padding: '20px 30px 26px 48px',
          background: 'var(--color-bg-primary)',
          borderTop: '1px solid var(--color-border)',
        }}>
          {/* Barra superior del panel: Periodo SLA + Cumplimiento + Botones Diagnóstico y Exportar CSV */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                {t.monitor.slaSummaryTitle}<span style={{ color: 'var(--color-accent)' }}>{getRangeLabel(histRange)}</span>
              </span>

              {slaStats.slaPctNum != null && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background:
                    slaStats.slaPctNum >= 99.9
                      ? 'rgba(34, 197, 94, 0.14)'
                      : slaStats.slaPctNum >= 99.0
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                  color:
                    slaStats.slaPctNum >= 99.9
                      ? '#22c55e'
                      : slaStats.slaPctNum >= 99.0
                      ? '#f59e0b'
                      : '#ef4444',
                  border: `1px solid ${
                    slaStats.slaPctNum >= 99.9
                      ? 'rgba(34, 197, 94, 0.35)'
                      : slaStats.slaPctNum >= 99.0
                      ? 'rgba(245, 158, 11, 0.35)'
                      : 'rgba(239, 68, 68, 0.35)'
                  }`,
                }}>
                  {slaStats.slaPctNum >= 99.0 ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                  {slaStats.slaPctNum >= 99.9
                    ? t.monitor.slaOptimal
                    : slaStats.slaPctNum >= 99.0
                    ? t.monitor.slaAcceptable
                    : t.monitor.slaCritical}
                </span>
              )}

              {histLoading && (
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={13} /> {isEn ? 'Updating period...' : 'Actualizando periodo...'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {canOperate() && (
                <button
                  onClick={() => onDiagnose(monitor)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 7,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(14, 165, 233, 0.14)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                  }}
                >
                  <Terminal size={13} /> {isEn ? 'Live Diagnostics (Paping / Trace)' : 'Diagnóstico en Vivo (Paping / Traza)'}
                </button>
              )}

              <button
                onClick={() => onSlaReport(monitor, histRange)}
                style={{
                  padding: '5px 11px',
                  borderRadius: 7,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(99, 102, 241, 0.14)',
                  color: 'var(--color-accent)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                }}
                title={isEn ? "Generate technical report and print or export SLA for this link" : "Generar informe técnico e imprimir o exportar SLA para este enlace"}
              >
                <FileSpreadsheet size={13} /> {t.monitor.slaReportBtn}
              </button>

              <button
                onClick={exportMonitorSlaCsv}
                style={{
                  padding: '5px 11px',
                  borderRadius: 7,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
                title={isEn ? "Download CSV SLA report and history for this link" : "Descargar reporte CSV de SLA e historial de este enlace"}
              >
                <Download size={13} /> {t.monitor.exportCsvBtn}
              </button>
            </div>
          </div>

          {/* Grid de 6 Tarjetas de Métricas Enriquecidas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
            gap: 10,
            marginBottom: 18,
          }}>
            <SlaMetricCard
              label={t.monitor.kpiAvailability}
              value={slaStats.slaPctFormatted != null ? `${slaStats.slaPctFormatted}%` : '—'}
              sub={`${slaStats.upSamples}/${slaStats.totalSamples} ${t.monitor.samplesOk}`}
              color={
                slaStats.slaPctNum == null
                  ? undefined
                  : slaStats.slaPctNum >= 99.9
                  ? '#22c55e'
                  : slaStats.slaPctNum >= 99.0
                  ? '#f59e0b'
                  : '#ef4444'
              }
            />
            <SlaMetricCard
              label={t.monitor.kpiDowntime}
              value={formatDurationHuman(slaStats.downtimeSec, isEn)}
              sub={
                slaStats.outagesCount === 0
                  ? t.monitor.noOutagesRecorded
                  : `${slaStats.outagesCount} ${slaStats.outagesCount === 1 ? t.monitor.outageCountSingular : t.monitor.outageCountPlural}`
              }
              color={slaStats.downtimeSec > 0 ? '#f87171' : '#22c55e'}
            />
            <SlaMetricCard
              label={t.monitor.kpiCurrentAvgLatency}
              value={
                status === 'DOWN' || status === 'PAUSED' || status === 'MAINTENANCE' || status === 'UNKNOWN'
                  ? '—'
                  : `${monitor.current_latency_ms ?? '?'} ms`
              }
              sub={`${t.monitor.avgLabel} ${slaStats.avgLat != null ? `${slaStats.avgLat} ms` : '—'}`}
            />
            <SlaMetricCard
              label={t.monitor.kpiMinMaxLatency}
              value={
                slaStats.minLat != null && slaStats.maxLat != null
                  ? `${slaStats.minLat} / ${slaStats.maxLat} ms`
                  : '—'
              }
              sub={
                slaStats.degradedSamples > 0
                  ? `${slaStats.degradedSamples} ${t.monitor.degradedSamplesNotice}`
                  : t.monitor.noLatencySpikes
              }
            />
            <SlaMetricCard
              label={t.monitor.kpiStability}
              value={`${slaStats.jitterMs} ms`}
              sub={`${t.monitor.p95Label} ${slaStats.p95Lat != null ? `${slaStats.p95Lat} ms` : '—'}`}
              color={slaStats.jitterMs > 35 ? '#f59e0b' : '#38bdf8'}
            />
            <SlaMetricCard
              label={t.monitor.kpiSensorConfig}
              value={`${monitor.type}${monitor.port ? `:${monitor.port}` : ''}`}
              sub={`${t.monitor.intervalLabel} ${monitor.interval_seconds}s · ${monitor.retries} ${t.monitor.retriesLabel}`}
            />
          </div>

          {/* Gráfica interactiva con selector Reciente | 3h | 6h | 24h | 7d | 30d */}
          <LatencyChart
            range={histRange}
            data={combinedHistory}
            onRangeChange={(r) => setHistRange(r)}
          />
        </div>
      )}
    </div>
  )
})

// ── Botón de acción pequeño ────────────────────────────────────────────────
function Btn({ icon, title, onClick, danger, customColor }: {
  icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean; customColor?: { text: string, bg: string, border: string }
}) {
  const bg = customColor ? customColor.bg : danger ? 'rgba(239,68,68,0.12)' : 'var(--color-bg-primary)'
  const border = customColor ? customColor.border : danger ? 'rgba(239,68,68,0.35)' : 'var(--color-border)'
  const text = customColor ? customColor.text : danger ? '#f87171' : 'var(--color-text-secondary)'

  return (
    <button title={title} onClick={onClick} style={{
      width: 30, height: 30, borderRadius: 7,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${border}`,
      background: bg,
      color: text,
      cursor: 'pointer', flexShrink: 0,
      transition: 'all 0.15s'
    }}>
      {icon}
    </button>
  )
}

// ── Tarjeta de métrica SLA enriquecida ─────────────────────────────────────
function SlaMetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      padding: '10px 13px',
      borderRadius: 10,
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 4,
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{
        fontSize: 16,
        fontWeight: 800,
        color: color ?? 'var(--color-text-primary)',
        fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
