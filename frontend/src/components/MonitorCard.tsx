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
  Globe, Wifi, Activity, Clock, TrendingUp, Loader2, Pause, Play, Wrench
} from 'lucide-react'
import type { MonitorGroup, Monitor, MonitorStatus, HistoryPoint, TimeRange } from '../types'
import type { ModalMode } from './MonitorModal'
import { StatusBadge } from './StatusBadge'
import { UptimeBar } from './UptimeBar'
import { LatencyChart } from './LatencyChart'
import { useMonitorStore, aggregateGroupHistory } from '../store/monitorStore'
import { ConfirmDialog } from './ConfirmDialog'

// ── Helpers ───────────────────────────────────────────────────────────────
function statusColor(s?: MonitorStatus) {
  if (s === 'UP') return '#22c55e'
  if (s === 'DOWN') return '#ef4444'
  if (s === 'DEGRADED') return '#f59e0b'
  if (s === 'MAINTENANCE') return '#3b82f6'
  if (s === 'PAUSED') return '#6366f1'
  return '#94a3b8'
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
}

// ── MonitorCard ───────────────────────────────────────────────────────────
export const MonitorCard = React.memo(function MonitorCard({ group, onOpenModal }: Props) {
  const { deleteGroup, deleteMonitor, toggleGroup, toggleGroupMaintenance } = useMonitorStore()
  const [expanded, setExpanded] = useState<boolean>(false)
  const [activeMonitorId, setActiveMonitorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<
    { type: 'group' } | { type: 'monitor'; monitorId: number } | null
  >(null)

  const status = group.overall_status ?? 'UNKNOWN'
  const groupHistory = React.useMemo(() => aggregateGroupHistory(group.monitors || []), [group.monitors])

  const groupMetrics = React.useMemo(() => {
    const mons = group.monitors || []
    const active = mons.filter(m => m.is_active !== false && m.current_status !== 'PAUSED')
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
      upCount: active.filter(m => m.current_status === 'UP').length,
      avgLat,
      lastTimeStr,
      allPaused,
      allMaint,
    }
  }, [group.monitors, groupHistory])

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
            display: 'grid', gridTemplateColumns: '220px 1fr auto', alignItems: 'center', gap: 16, padding: '22px 28px', cursor: 'pointer', position: 'relative',
          }}
          onClick={() => setExpanded(prev => !prev)}
        >
          {/* Franja de color */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
            background: statusColor(status),
          }} />

          {/* Nombre + Tags */}
          <div style={{ paddingLeft: 12, paddingRight: 16, wordBreak: 'break-word' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>
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
              <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
                {group.description}
              </p>
            )}
          </div>

          {/* Barra de uptime (flexible) */}
          <div style={{ minWidth: 0 }}>
            {group.monitors && group.monitors.length > 0 ? (
              <UptimeBar
                history={groupHistory}
                maxBars={30}
              />
            ) : (
              <div style={{ height: 34, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Sin endpoints</span>
              </div>
            )}
          </div>

          {/* Panel derecho */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
            {/* Latencia promedio y último check en vivo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 78, flexShrink: 0 }}>
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

            {/* Badge de estado */}
            <div style={{ flexShrink: 0 }}>
              <StatusBadge status={status} />
            </div>

            {/* Acciones de Grupo Completo */}
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              {groupMetrics.total > 0 && (
                <>
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

        {/* Confirmación de borrado (GRUPO) */}
      {confirmDelete?.type === 'group' && (
        <ConfirmDialog
          title={`¿Eliminar GRUPO "${group.name}"?`}
          message="⚠️ ATENCIÓN: Se eliminará todo el grupo, incluyendo todos sus endpoints y el historial completo. Esta acción no se puede deshacer."
          confirmLabel="Eliminar Grupo Completo"
          onConfirm={async () => {
            console.log('🗑️ Eliminando grupo:', group.id)
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
            console.log('🗑️ Eliminando monitor:', mid, 'del grupo:', group.id)
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
function MonitorRow({ monitor, group, isActive, onToggle, onEdit, onDelete }: {
  monitor: Monitor
  group: MonitorGroup
  isActive: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
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
      setHistory(data)
    } catch {
      setHistory([])
    } finally {
      setHistLoading(false)
    }
  }

  // Combine fetched history with live_history (SSE)
  const combinedHistory = (() => {
    const live = monitor.live_history || []
    if (history.length === 0) return live
    if (live.length === 0) return history
    const lastFetchedTime = new Date(history[history.length - 1].time).getTime()
    const newLive = live.filter(h => new Date(h.time).getTime() > lastFetchedTime)
    return [...history, ...newLive]
  })()

  // Calcular uptime % del historial
  const uptimePct = combinedHistory.length
    ? Math.round(combinedHistory.filter(h => h.status === 'UP').length / combinedHistory.length * 100)
    : null

  const avgLatency = combinedHistory.length
    ? Math.round(combinedHistory.filter(h => h.latency_ms > 0).reduce((a, h) => a + h.latency_ms, 0) / Math.max(1, combinedHistory.filter(h => h.latency_ms > 0).length))
    : null

  return (
    <div style={{ 
      borderBottom: '1px solid var(--color-border)',
      transition: 'background 0.2s ease',
    }}>
      {/* Fila principal */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: '14px 14px 220px 1fr auto', alignItems: 'center', gap: 16, padding: '22px 28px 22px 48px',
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
            <div style={{ width: 4, height: 38, borderRadius: 4, background: statusColor(status) }} />
          )}
        </div>

        {/* Icono de protocolo */}
        <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: isPaused ? 0.5 : 1 }}>
          {TYPE_ICON[monitor.type] ?? <Activity size={14} />}
        </span>

        {/* Nombre + target */}
        <div style={{ paddingRight: 16, wordBreak: 'break-word', opacity: isPaused ? 0.55 : 1, transition: 'opacity 0.2s' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
            {monitor.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5, fontSize: 12.5, fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace" }}>
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
          {monitor.type === 'SNMP' && monitor.current_value != null && !isPaused && !isMaint && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                Valor OID: {monitor.current_value}
              </span>
            </div>
          )}
          {(status === 'DOWN' || status === 'DEGRADED') && monitor.current_msg && monitor.type !== 'SSL' && (
            <div style={{ marginTop: 5, fontSize: 11, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", opacity: 0.9 }}>
              {monitor.current_msg}
            </div>
          )}
        </div>

        {/* Barra de uptime */}
        <div style={{ minWidth: 0, opacity: isPaused ? 0.45 : 1, filter: isPaused ? 'grayscale(0.4)' : 'none', transition: 'opacity 0.2s' }}>
          <UptimeBar history={combinedHistory} maxBars={30} />
        </div>

          {/* Panel derecho (Latencia + Hora, Badge, Acciones) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 68 }}>
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

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
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

      {/* Panel expandido: estadísticas + gráfica */}
      {isActive && (
        <div style={{
          padding: '24px 32px 28px 56px',
          background: 'var(--color-bg-primary)',
          borderTop: '1px solid var(--color-border)',
        }}>
          {/* Stats rápidas */}
          <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <QuickStat label="Ping actual"    value={status === 'DOWN' || status === 'PAUSED' || status === 'MAINTENANCE' || status === 'UNKNOWN' ? '—' : `${monitor.current_latency_ms ?? '?'} ms`} />
            <QuickStat label="Avg. Ping"      value={avgLatency != null ? `${avgLatency} ms` : '—'} />
            <QuickStat
              label="Uptime"
              value={uptimePct != null ? `${uptimePct}%` : '—'}
              color={uptimePct == null ? undefined : uptimePct > 99 ? '#22c55e' : uptimePct > 95 ? '#f59e0b' : '#ef4444'}
            />
            <QuickStat label="Intervalo"      value={`${monitor.interval_seconds}s`} />
            <QuickStat label="Reintentos"     value={String(monitor.retries)} />
            <QuickStat label="Tipo"           value={monitor.type} />
            {histLoading && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendingUp size={13} /> Cargando historial...
              </span>
            )}
          </div>

          {/* Gráfica */}
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

// ── Estadística rápida ────────────────────────────────────────────────────
function QuickStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? 'var(--color-text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4, fontWeight: 500 }}>
        {label}
      </div>
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
