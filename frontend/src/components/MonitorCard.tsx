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
  Terminal, Download, ShieldCheck, AlertTriangle
} from 'lucide-react'
import type { MonitorGroup, Monitor, MonitorStatus, HistoryPoint, TimeRange } from '../types'
import type { ModalMode } from './MonitorModal'
import { StatusBadge } from './StatusBadge'
import { UptimeBar } from './UptimeBar'
import { LatencyChart } from './LatencyChart'
import { useMonitorStore, aggregateGroupHistory } from '../store/monitorStore'
import { ConfirmDialog } from './ConfirmDialog'
import { DiagnosticModal } from './DiagnosticModal'

// ── Helpers ───────────────────────────────────────────────────────────────
function statusColor(s?: MonitorStatus) {
  if (s === 'UP') return '#22c55e'
  if (s === 'DOWN') return '#ef4444'
  if (s === 'DEGRADED') return '#f59e0b'
  if (s === 'MAINTENANCE') return '#3b82f6'
  if (s === 'PAUSED') return '#6366f1'
  return '#94a3b8'
}

const RANGE_LABELS: Record<TimeRange, string> = {
  recent: 'Últimos 90 min (Reciente)',
  '3h': 'Últimas 3 Horas',
  '6h': 'Últimas 6 Horas',
  '24h': 'Últimas 24 Horas (Diario)',
  '1w': 'Últimos 7 Días (Semanal)',
  '30d': 'Últimos 30 Días (Mensual)',
}

function formatDurationHuman(totalSec: number): string {
  if (totalSec <= 0) return '0s (Sin caídas)'
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
}

// ── MonitorCard ───────────────────────────────────────────────────────────
export const MonitorCard = React.memo(function MonitorCard({ group, onOpenModal, activeFilter = 'all' }: Props) {
  const { deleteGroup, deleteMonitor, toggleGroup, toggleGroupMaintenance } = useMonitorStore()
  const [expanded, setExpanded] = useState<boolean>(false)
  const [activeMonitorId, setActiveMonitorId] = useState<number | null>(null)
  const [diagnosticMonitor, setDiagnosticMonitor] = useState<Monitor | null>(null)
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

  return (
    <>
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>

        {/* ══ Cabecera del grupo ══ */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '300px 1fr auto', alignItems: 'center', gap: 22, padding: '15px 24px', cursor: 'pointer', position: 'relative',
          }}
          onClick={() => setExpanded(prev => !prev)}
        >
          {/* Franja de color */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
            background: statusColor(stripeStatus),
          }} />

          {/* Nombre + Tags */}
          <div style={{ paddingLeft: 10, paddingRight: 8, wordBreak: 'break-word' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>
                {group.name}
              </span>
              {group.tags?.slice(0, 3).map(t => <TagChip key={t.id} name={t.name} color={t.color} />)}
              {(group.tags?.length ?? 0) > 3 && (
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 }}>
                  +{group.tags.length - 3}
                </span>
              )}
            </div>
            {group.description && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.35 }}>
                {group.description}
              </p>
            )}
          </div>

          {/* Barra de uptime que aprovecha todo el espacio central */}
          <div style={{ minWidth: 0, width: '100%' }}>
            {group.monitors && group.monitors.length > 0 ? (
              <UptimeBar
                history={groupHistory}
                maxBars={22}
              />
            ) : (
              <div style={{ height: 28, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Sin endpoints</span>
              </div>
            )}
          </div>

          {/* Panel derecho */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
            {/* Latencia promedio y último check en vivo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 74, flexShrink: 0 }}>
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: groupMetrics.avgLat != null ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              }}>
                {groupMetrics.avgLat != null ? `${groupMetrics.avgLat} ms` : '—'}
              </span>
              {groupMetrics.lastTimeStr && (
                <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }} title="Última actualización en tiempo real">
                  {groupMetrics.lastTimeStr}
                </span>
              )}
            </div>

            {/* Contador de endpoints operativos */}
            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {groupMetrics.activeCount > 0 ? `${groupMetrics.upCount}/${groupMetrics.activeCount}` : groupMetrics.total} ep
            </span>

            {/* Badges adicionales cuando el grupo tiene sensores en Pausa o Mantenimiento */}
            {groupMetrics.pausedCount > 0 && status !== 'PAUSED' && (
              <span
                title={`${groupMetrics.pausedCount} de ${groupMetrics.total} sensores en pausa`}
                style={{
                  fontSize: 10.5, fontWeight: 800, padding: '4px 9px', borderRadius: 99,
                  background: activeFilter === 'paused' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(100, 116, 139, 0.16)',
                  color: activeFilter === 'paused' ? '#818cf8' : '#94a3b8',
                  border: activeFilter === 'paused' ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid rgba(148, 163, 184, 0.3)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {groupMetrics.pausedCount} EN PAUSA
              </span>
            )}
            {groupMetrics.maintCount > 0 && status !== 'MAINTENANCE' && (
              <span
                title={`${groupMetrics.maintCount} de ${groupMetrics.total} sensores en mantenimiento`}
                style={{
                  fontSize: 10.5, fontWeight: 800, padding: '4px 9px', borderRadius: 99,
                  background: 'rgba(59, 130, 246, 0.18)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.38)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {groupMetrics.maintCount} MANT.
              </span>
            )}

            {/* Badge de estado */}
            <div style={{ flexShrink: 0 }}>
              <StatusBadge status={status} />
            </div>

            {/* Acciones de Grupo Completo */}
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              {groupMetrics.total > 0 && (
                <>
                  <Btn
                    icon={<Terminal size={13} strokeWidth={2.3} />}
                    title="Diagnóstico en Vivo del Grupo (Paping / Ping / Traceroute)"
                    onClick={() => {
                      const firstActive = group.monitors.find(m => m.is_active !== false && m.current_status !== 'PAUSED') || group.monitors[0]
                      setDiagnosticMonitor(firstActive)
                    }}
                    customColor={{ bg: 'rgba(14, 165, 233, 0.14)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8' }}
                  />
                  <Btn
                    icon={<Wrench size={12} strokeWidth={2.5} />}
                    title={groupMetrics.allMaint ? "Quitar Mantenimiento a todo el grupo" : "Poner todo el grupo en Mantenimiento"}
                    onClick={() => toggleGroupMaintenance(group.id)}
                    customColor={groupMetrics.allMaint
                      ? { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#60a5fa' }
                      : undefined
                    }
                  />
                  <Btn
                    icon={!groupMetrics.allPaused ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
                    title={!groupMetrics.allPaused ? "Pausar todo el grupo" : "Reanudar todo el grupo"}
                    onClick={() => toggleGroup(group.id)}
                    customColor={groupMetrics.allPaused
                      ? { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', text: '#34d399' }
                      : undefined
                    }
                  />
                </>
              )}
              <Btn icon={<Plus size={13} />}   title="Agregar endpoint"  onClick={() => { onOpenModal({ type: 'new_monitor', group }); setExpanded(true) }} />
              <Btn icon={<Pencil size={13} />} title="Editar grupo"      onClick={() => onOpenModal({ type: 'edit_group', group })} />
              <Btn icon={<Trash2 size={13} />} title="Eliminar grupo"    danger onClick={() => setConfirmDelete({ type: 'group' })} />
            </div>

            {/* Chevron */}
            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
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
                Sin endpoints configurados. &nbsp;
                <button
                  onClick={() => onOpenModal({ type: 'new_monitor', group })}
                  style={{ color: 'var(--color-accent)', fontWeight: 700 }}
                >
                  + Agregar primero
                </button>
              </div>
            ) : (
              group.monitors.map(monitor => (
                <MonitorRow
                  key={monitor.id}
                  monitor={monitor}
                  group={group}
                  isActive={activeMonitorId === monitor.id}
                  onToggle={() => setActiveMonitorId(id => id === monitor.id ? null : monitor.id)}
                  onEdit={() => onOpenModal({ type: 'edit_monitor', group, monitor })}
                  onDelete={() => setConfirmDelete({ type: 'monitor', monitorId: monitor.id })}
                  onDiagnose={() => setDiagnosticMonitor(monitor)}
                />
              ))
            )}

            {/* Botón add endpoint inline */}
            <div style={{ padding: '12px 24px', borderTop: '1px dashed var(--color-border)' }}>
              <button
                onClick={() => onOpenModal({ type: 'new_monitor', group })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, color: 'var(--color-accent)',
                }}
              >
                <Plus size={13} /> Agregar endpoint
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Diagnóstico en Vivo */}
      {diagnosticMonitor && (
        <DiagnosticModal
          initialMonitor={diagnosticMonitor}
          initialGroupName={group.name}
          groupMonitors={group.monitors}
          onClose={() => setDiagnosticMonitor(null)}
        />
      )}

      {/* Confirmación de borrado (GRUPO) */}
      {confirmDelete?.type === 'group' && (
        <ConfirmDialog
          title={`¿Eliminar GRUPO "${group.name}"?`}
          message="⚠️ ATENCIÓN: Se eliminará todo el grupo, incluyendo todos sus endpoints y el historial completo. Esta acción no se puede deshacer."
          confirmLabel="Eliminar Grupo Completo"
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
          title="¿Eliminar solo este endpoint?"
          message="Se eliminará únicamente este endpoint y su historial. El grupo principal se mantendrá intacto."
          confirmLabel="Eliminar Endpoint"
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
function MonitorRow({ monitor, group, isActive, onToggle, onEdit, onDelete, onDiagnose }: {
  monitor: Monitor
  group: MonitorGroup
  isActive: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onDiagnose: () => void
}) {
  const { toggleMonitor, toggleMaintenance } = useMonitorStore()
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
    if (histRange !== 'recent' && history.length > 0) return history
    if (history.length === 0) return live
    if (live.length === 0) return history
    const lastFetchedTime = new Date(history[history.length - 1].time).getTime()
    const newLive = live.filter(h => new Date(h.time).getTime() > lastFetchedTime)
    return [...history, ...newLive]
  }, [history, monitor.live_history, histRange])

  // ── Cálculo enriquecido de SLA, Disponibilidad, Tiempo Caído, Jitter y P95 ──
  const slaStats = React.useMemo(() => {
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
        if (!prev || prev.status !== 'DOWN') {
          outagesCount++
        }
        if (prev) {
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
  }, [combinedHistory, histRange, monitor.interval_seconds])

  // Exportar Reporte SLA + Historial del sensor en CSV
  const exportMonitorSlaCsv = () => {
    const rows: string[][] = [
      ['REPORTE DE DISPONIBILIDAD Y SLA - UPTIMECORE'],
      ['Sitio / Grupo', group.name],
      ['Sensor / Enlace', monitor.name],
      ['Objetivo (IP/Host)', `${monitor.target}${monitor.port ? ':' + monitor.port : ''}`],
      ['Protocolo', monitor.type],
      ['Periodo Evaluado', RANGE_LABELS[histRange] || histRange],
      ['Disponibilidad SLA (%)', slaStats.slaPctFormatted ? `${slaStats.slaPctFormatted}%` : 'N/A'],
      ['Tiempo Caido Estimado', formatDurationHuman(slaStats.downtimeSec)],
      ['Cortes Registrados', String(slaStats.outagesCount)],
      ['Latencia Promedio (ms)', slaStats.avgLat != null ? String(slaStats.avgLat) : 'N/A'],
      ['Latencia Minima (ms)', slaStats.minLat != null ? String(slaStats.minLat) : 'N/A'],
      ['Latencia Maxima Pico (ms)', slaStats.maxLat != null ? String(slaStats.maxLat) : 'N/A'],
      ['Percentil P95 (ms)', slaStats.p95Lat != null ? String(slaStats.p95Lat) : 'N/A'],
      ['Jitter Estabilidad (ms)', String(slaStats.jitterMs)],
      [],
      ['Fecha y Hora', 'Estado', 'Latencia (ms)'],
      ...combinedHistory.map(h => [
        new Date(h.time).toLocaleString('es-MX'),
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
    const safeName = `${group.name}_${monitor.name}_${histRange}`.replace(/[^a-zA-Z0-9_-]/g, '_')
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
      {/* Fila principal */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: '14px 14px 236px 1fr auto', alignItems: 'center', gap: 14, padding: '14px 24px 14px 40px',
          cursor: 'pointer',
          background: isActive ? 'var(--color-bg-primary)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onClick={onToggle}
      >
        {/* Indicador lateral */}
        <div style={{ width: 14, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          {status === 'UNKNOWN' ? (
            <Loader2 size={14} color="var(--color-text-muted)" className="animate-spin" />
          ) : (
            <div style={{ width: 4, height: 34, borderRadius: 4, background: statusColor(status) }} />
          )}
        </div>

        {/* Icono de protocolo */}
        <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: isPaused ? 0.5 : 1 }}>
          {TYPE_ICON[monitor.type] ?? <Activity size={14} />}
        </span>

        {/* Nombre + target */}
        <div style={{ paddingRight: 8, wordBreak: 'break-word', opacity: isPaused ? 0.55 : 1, transition: 'opacity 0.2s' }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
            {monitor.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4, fontSize: 12, fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace" }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: '1px 6px', borderRadius: 4,
              color: 'var(--color-accent)', background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.3)',
            }}>
              {monitor.type}
            </span>
            <a
              href={
                monitor.target.startsWith('http')
                  ? monitor.target
                  : `${monitor.type === 'HTTP' ? 'http' : 'https'}://${monitor.target}${monitor.port && monitor.port !== 80 && monitor.port !== 443 ? ':' + monitor.port : ''}`
              }
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--color-text-secondary)', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#8b5cf6'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            >
              {monitor.target}{monitor.port ? `:${monitor.port}` : ''}
            </a>
          </div>
          {monitor.type === 'SSL' && monitor.current_msg && !isPaused && !isMaint && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: status === 'UP' ? '#ecfdf5' : '#fef2f2', color: status === 'UP' ? '#059669' : '#ef4444', border: `1px solid ${status === 'UP' ? '#a7f3d0' : '#fecaca'}` }}>
                {monitor.current_msg}
              </span>
            </div>
          )}
          {monitor.type === 'SNMP' && (monitor as any).current_value != null && !isPaused && !isMaint && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                Valor OID: {(monitor as any).current_value}
              </span>
            </div>
          )}
          {(status === 'DOWN' || status === 'DEGRADED') && monitor.current_msg && monitor.type !== 'SSL' && (
            <div style={{ marginTop: 5, fontSize: 11, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", opacity: 0.9 }}>
              {monitor.current_msg}
            </div>
          )}
        </div>

        {/* Barra de uptime alineada con la cabecera */}
        <div style={{ minWidth: 0, width: '100%', opacity: isPaused ? 0.45 : 1, filter: isPaused ? 'grayscale(0.4)' : 'none', transition: 'opacity 0.2s' }}>
          <UptimeBar history={combinedHistory} maxBars={22} />
        </div>

        {/* Panel derecho (Latencia + Hora, Badge, Acciones con Diagnóstico) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 66 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {status === 'DOWN' || status === 'PAUSED' || status === 'MAINTENANCE' || status === 'UNKNOWN' ? '—' : `${monitor.current_latency_ms ?? '?'} ms`}
            </span>
            {status === 'PAUSED' ? (
              <span style={{ fontSize: 10, color: '#818cf8', marginTop: 2, fontWeight: 600 }}>
                En pausa
              </span>
            ) : status === 'MAINTENANCE' ? (
              <span style={{ fontSize: 10, color: '#60a5fa', marginTop: 2, fontWeight: 600 }}>
                Mantenimiento
              </span>
            ) : status === 'UNKNOWN' ? (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Verificando...
              </span>
            ) : combinedHistory.length > 0 ? (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                {new Date(combinedHistory[combinedHistory.length - 1].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            ) : null}
          </div>

          <div style={{ flexShrink: 0 }}>
            <StatusBadge status={status} size="sm" />
          </div>

          {/* Acciones del sensor (incluye botón de Diagnóstico en Vivo estilo Paping/Traceroute) */}
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <Btn
              icon={<Terminal size={13} strokeWidth={2.3} />}
              title="Diagnóstico en Vivo (Paping / Ping / Traceroute)"
              onClick={onDiagnose}
              customColor={{ bg: 'rgba(14, 165, 233, 0.14)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8' }}
            />
            <Btn 
              icon={<Wrench size={12} strokeWidth={2.5} />} 
              title={isMaint ? "Quitar Mantenimiento" : "Modo Mantenimiento"} 
              onClick={() => toggleMaintenance(group.id, monitor.id)} 
              customColor={isMaint 
                ? { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#60a5fa' }
                : undefined
              }
            />
            <Btn 
              icon={!isPaused ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />} 
              title={!isPaused ? "Pausar monitoreo" : "Reanudar monitoreo"} 
              onClick={() => toggleMonitor(group.id, monitor.id)} 
              customColor={isPaused 
                ? { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', text: '#34d399' }
                : undefined
              }
            />
            <Btn icon={<Pencil size={12} />} title="Editar" onClick={onEdit} />
            <Btn icon={<Trash2 size={12} />} title="Eliminar" danger onClick={onDelete} />
          </div>

          <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {isActive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </div>

      {/* ══ Panel expandido: Resumen Ejecutivo de SLA, Calidad de Enlace + Gráfica ══ */}
      {isActive && (
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
                📊 Resumen de Disponibilidad y SLA · <span style={{ color: 'var(--color-accent)' }}>{RANGE_LABELS[histRange]}</span>
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
                    ? 'SLA Óptimo (≥99.9%)'
                    : slaStats.slaPctNum >= 99.0
                    ? 'SLA Aceptable (≥99.0%)'
                    : 'SLA Crítico (<99.0%)'}
                </span>
              )}

              {histLoading && (
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={13} /> Actualizando periodo...
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={onDiagnose}
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
                <Terminal size={13} /> Diagnóstico en Vivo (Paping / Traza)
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
                title="Descargar reporte CSV de SLA e historial de este enlace"
              >
                <Download size={13} /> Exportar SLA (CSV)
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
              label="DISPONIBILIDAD / SLA"
              value={slaStats.slaPctFormatted != null ? `${slaStats.slaPctFormatted}%` : '—'}
              sub={`${slaStats.upSamples}/${slaStats.totalSamples} muestras OK`}
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
              label="TIEMPO CAÍDO (DOWNTIME)"
              value={formatDurationHuman(slaStats.downtimeSec)}
              sub={
                slaStats.outagesCount === 0
                  ? '0 incidentes en el periodo'
                  : `${slaStats.outagesCount} ${slaStats.outagesCount === 1 ? 'corte registrado' : 'cortes registrados'}`
              }
              color={slaStats.downtimeSec > 0 ? '#f87171' : '#22c55e'}
            />
            <SlaMetricCard
              label="LATENCIA ACTUAL / PROM"
              value={
                status === 'DOWN' || status === 'PAUSED' || status === 'MAINTENANCE' || status === 'UNKNOWN'
                  ? '—'
                  : `${monitor.current_latency_ms ?? '?'} ms`
              }
              sub={`Promedio: ${slaStats.avgLat != null ? `${slaStats.avgLat} ms` : '—'}`}
            />
            <SlaMetricCard
              label="MÍNIMA / PICO MÁXIMO"
              value={
                slaStats.minLat != null && slaStats.maxLat != null
                  ? `${slaStats.minLat} / ${slaStats.maxLat} ms`
                  : '—'
              }
              sub={
                slaStats.degradedSamples > 0
                  ? `${slaStats.degradedSamples} muestras con lentitud`
                  : 'Sin picos fuera de umbral'
              }
            />
            <SlaMetricCard
              label="ESTABILIDAD (JITTER / P95)"
              value={`${slaStats.jitterMs} ms`}
              sub={`Percentil P95: ${slaStats.p95Lat != null ? `${slaStats.p95Lat} ms` : '—'}`}
              color={slaStats.jitterMs > 35 ? '#f59e0b' : '#38bdf8'}
            />
            <SlaMetricCard
              label="CONFIGURACIÓN SENSOR"
              value={`${monitor.type}${monitor.port ? `:${monitor.port}` : ''}`}
              sub={`Cada ${monitor.interval_seconds}s · ${monitor.retries} reintentos`}
            />
          </div>

          {/* Gráfica interactiva con selector Reciente | 3h | 6h | 24h | 7d | 30d */}
          <LatencyChart
            data={combinedHistory}
            onRangeChange={(r) => setHistRange(r)}
          />
        </div>
      )}
    </div>
  )
}

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

// ── Historia "skeleton" mientras no hay datos reales ──────────────────────
function buildFakeHistory(status?: MonitorStatus): HistoryPoint[] {
  return Array.from({ length: 60 }, (_, i) => ({
    time: new Date(Date.now() - (60 - i) * 60_000).toISOString(),
    status: status ?? 'UNKNOWN',
    latency_ms: 0,
  }))
}
