/**
 * components/IncidentLogModal.tsx
 * Bitácora de Eventos / Historial de Caídas (Incident Log)
 * Muestra todas las caídas (DOWN) y degradaciones (DEGRADED), su hora de inicio,
 * hora de recuperación, duración exacta y motivo del fallo.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, RefreshCw, Download, AlertOctagon, CheckCircle2, Clock, Activity, Search } from 'lucide-react'

export interface IncidentEvent {
  monitor_id: number
  monitor_name: string
  group_name: string
  type: string
  target: string
  status: 'DOWN' | 'DEGRADED' | string
  started_at: string
  resolved_at?: string | null
  duration_sec: number
  is_ongoing: boolean
  error_msg?: string
}

interface Props {
  onClose: () => void
}

const RANGES = [
  { key: '3h',  label: 'Últimas 3h' },
  { key: '24h', label: 'Últimas 24h' },
  { key: '7d',  label: 'Últimos 7 días' },
  { key: '30d', label: 'Últimos 30 días' },
]

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function IncidentLogModal({ onClose }: Props) {
  const [range, setRange] = useState('24h')
  const [incidents, setIncidents] = useState<IncidentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [stateFilter, setStateFilter] = useState<'all' | 'ongoing' | 'resolved'>('all')
  const [search, setSearch] = useState('')

  const fetchIncidents = useCallback(async (r: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/incidents?range=${r}`)
      if (res.ok) {
        const data = await res.json()
        setIncidents(Array.isArray(data) ? data : [])
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIncidents(range)
  }, [range, fetchIncidents])

  const filtered = useMemo(() => {
    return incidents.filter(inc => {
      if (stateFilter === 'ongoing' && !inc.is_ongoing) return false
      if (stateFilter === 'resolved' && inc.is_ongoing) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const match =
          inc.group_name.toLowerCase().includes(q) ||
          inc.monitor_name.toLowerCase().includes(q) ||
          inc.target.toLowerCase().includes(q) ||
          (inc.error_msg || '').toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [incidents, stateFilter, search])

  const stats = useMemo(() => {
    const total = incidents.length
    const ongoing = incidents.filter(i => i.is_ongoing).length
    const resolvedList = incidents.filter(i => !i.is_ongoing)
    const resolved = resolvedList.length
    const mttrSec = resolved > 0
      ? Math.round(resolvedList.reduce((acc, i) => acc + i.duration_sec, 0) / resolved)
      : 0
    return { total, ongoing, resolved, mttrSec }
  }, [incidents])

  function handleExportCSV() {
    const headers = ['Estado', 'Severidad', 'Grupo', 'Endpoint', 'Protocolo', 'Destino', 'Inicio', 'Fin', 'Duracion', 'Detalle Error']
    const rows = filtered.map(inc => [
      inc.is_ongoing ? 'EN CURSO' : 'RESUELTO',
      inc.status,
      `"${inc.group_name.replace(/"/g, '""')}"`,
      `"${inc.monitor_name.replace(/"/g, '""')}"`,
      inc.type,
      `"${inc.target.replace(/"/g, '""')}"`,
      new Date(inc.started_at).toISOString(),
      inc.resolved_at ? new Date(inc.resolved_at).toISOString() : 'EN CURSO',
      formatDuration(inc.duration_sec),
      `"${(inc.error_msg || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `uptimecore-bitacora-${range}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)', zIndex: 220,
        }}
      />

      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 221,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: '24px 28px',
        width: 'min(1140px, 96vw)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
              📋 Bitácora de Eventos e Incidentes
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Historial cronológico de caídas (DOWN) y degradaciones (DEGRADED) con tiempos exactos de interrupción y recuperación.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 13px', borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-primary)',
                color: 'var(--color-text-secondary)',
                fontSize: 12, fontWeight: 600,
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.5 : 1,
              }}
            >
              <Download size={14} /> Exportar CSV
            </button>
            <button
              onClick={() => fetchIncidents(range)}
              title="Actualizar bitácora"
              style={{
                width: 34, height: 34, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-primary)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-primary)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}>
          <KpiBox
            icon={<Activity size={18} />}
            label="Total de Incidentes"
            value={String(stats.total)}
            color="#6366f1"
          />
          <KpiBox
            icon={<AlertOctagon size={18} />}
            label="Incidentes en Curso"
            value={String(stats.ongoing)}
            color="#ef4444"
          />
          <KpiBox
            icon={<CheckCircle2 size={18} />}
            label="Incidentes Resueltos"
            value={String(stats.resolved)}
            color="#22c55e"
          />
          <KpiBox
            icon={<Clock size={18} />}
            label="Tiempo Medio Recuperación (MTTR)"
            value={stats.resolved > 0 ? formatDuration(stats.mttrSec) : '—'}
            color="#f59e0b"
          />
        </div>

        {/* Barra de filtros */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar por grupo, endpoint, IP o mensaje de error..."
                style={{
                  width: '100%', padding: '8px 12px 8px 34px',
                  borderRadius: 8, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)',
                  fontSize: 12.5, outline: 'none',
                }}
              />
            </div>

            {/* Estado: Todos / En Curso / Resueltos */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--color-bg-primary)', padding: 3, borderRadius: 8, border: '1px solid var(--color-border)' }}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'ongoing', label: 'En Curso' },
                { key: 'resolved', label: 'Resueltos' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStateFilter(tab.key)}
                  style={{
                    padding: '5px 11px', borderRadius: 6, border: 'none',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: stateFilter === tab.key ? 'var(--color-accent)' : 'transparent',
                    color: stateFilter === tab.key ? '#fff' : 'var(--color-text-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selector de rango temporal */}
          <div style={{ display: 'flex', gap: 6 }}>
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${range === r.key ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: range === r.key ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                  color: range === r.key ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla de incidentes */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          background: 'var(--color-bg-primary)',
        }}>
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              Cargando historial de incidentes...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <CheckCircle2 size={36} color="#22c55e" style={{ margin: '0 auto 10px auto', opacity: 0.8 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                Sin incidentes registrados en este periodo
              </div>
              <div style={{ fontSize: 12.5 }}>
                Todos los servicios se han mantenido estables según los filtros seleccionados.
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-muted)',
                  textAlign: 'left',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  <th style={{ padding: '11px 14px' }}>Estado</th>
                  <th style={{ padding: '11px 14px' }}>Grupo / Endpoint</th>
                  <th style={{ padding: '11px 14px' }}>Destino</th>
                  <th style={{ padding: '11px 14px' }}>Inicio</th>
                  <th style={{ padding: '11px 14px' }}>Recuperación</th>
                  <th style={{ padding: '11px 14px' }}>Duración</th>
                  <th style={{ padding: '11px 14px' }}>Motivo / Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc, idx) => {
                  const isDown = inc.status === 'DOWN'
                  return (
                    <tr
                      key={`${inc.monitor_id}-${inc.started_at}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        background: inc.is_ongoing
                          ? (isDown ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)')
                          : 'transparent',
                      }}
                    >
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                            background: inc.is_ongoing
                              ? (isDown ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)')
                              : 'rgba(34, 197, 94, 0.15)',
                            color: inc.is_ongoing
                              ? (isDown ? '#ef4444' : '#f59e0b')
                              : '#22c55e',
                            border: `1px solid ${
                              inc.is_ongoing
                                ? (isDown ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)')
                                : 'rgba(34, 197, 94, 0.35)'
                            }`,
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: inc.is_ongoing ? (isDown ? '#ef4444' : '#f59e0b') : '#22c55e',
                            }} />
                            {inc.is_ongoing ? `ACTIVO (${inc.status})` : `RESUELTO (${inc.status})`}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{inc.group_name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{inc.monitor_name}</div>
                      </td>

                      <td style={{ padding: '11px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, background: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border)', marginRight: 6, fontSize: 10, fontWeight: 700,
                        }}>
                          {inc.type}
                        </span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{inc.target}</span>
                      </td>

                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                        {formatDateTime(inc.started_at)}
                      </td>

                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                        {inc.is_ongoing ? (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>En curso...</span>
                        ) : (
                          <span style={{ color: '#22c55e' }}>{formatDateTime(inc.resolved_at)}</span>
                        )}
                      </td>

                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 6,
                          background: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border)',
                          color: inc.is_ongoing ? '#ef4444' : 'var(--color-text-primary)',
                        }}>
                          {formatDuration(inc.duration_sec)}
                        </span>
                      </td>

                      <td style={{ padding: '11px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: '#ef4444', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inc.error_msg || ''}>
                        {inc.error_msg || 'Sin respuesta / Timeout'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

function KpiBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: `${color}1a`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  )
}
