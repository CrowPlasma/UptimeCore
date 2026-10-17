/**
 * components/IncidentLogModal.tsx
 * Bitácora de Eventos / Historial de Caídas (Incident Log)
 * Diseño ejecutivo, claro y a prueba de errores (null-safe).
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, RefreshCw, Download, AlertOctagon, CheckCircle2, Clock, Activity, Search, Filter } from 'lucide-react'

export interface RawIncidentEvent {
  monitor_id?: number
  monitor_name?: string
  group_name?: string
  type?: string
  monitor_type?: string
  target?: string
  monitor_target?: string
  status?: string
  started_at?: string
  resolved_at?: string | null
  ended_at?: string | null
  duration_sec?: number
  is_ongoing?: boolean
  is_resolved?: boolean
  error_msg?: string
}

export interface NormalizedIncident {
  monitor_id: number
  monitor_name: string
  group_name: string
  type: string
  target: string
  status: string
  started_at: string
  resolved_at: string | null
  duration_sec: number
  is_ongoing: boolean
  error_msg: string
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
  const sec = Math.max(0, Math.floor(Number(seconds) || 0))
  if (sec === 0) return '1s'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 && d === 0) parts.push(`${s}s`)
  return parts.join(' ') || '1s'
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Traduce errores técnicos crudos a un diagnóstico claro en español */
function humanizeError(rawError: string, protocol: string): { summary: string; detail: string } {
  const err = (rawError || '').trim()
  const lower = err.toLowerCase()

  if (!err) {
    return { summary: 'Sin respuesta del host', detail: `El chequeo ${protocol} no obtuvo respuesta.` }
  }
  if (lower.includes('ping: exit status 1') || lower.includes('100% packet loss')) {
    return { summary: 'Sin respuesta a Ping (Host inalcanzable)', detail: err }
  }
  if (lower.includes('i/o timeout') || lower.includes('context deadline exceeded') || lower.includes('timeout')) {
    return { summary: 'Tiempo de espera agotado (Timeout)', detail: err }
  }
  if (lower.includes('connection refused')) {
    return { summary: 'Conexión rechazada (Puerto cerrado)', detail: err }
  }
  if (lower.includes('no such host')) {
    return { summary: 'Error DNS (Host no encontrado)', detail: err }
  }
  if (lower.includes('network is unreachable') || lower.includes('no route to host')) {
    return { summary: 'Red o ruta inalcanzable', detail: err }
  }
  if (lower.includes('certificate') || lower.includes('x509') || lower.includes('ssl')) {
    return { summary: 'Problema con Certificado SSL/TLS', detail: err }
  }
  if (lower.startsWith('http ')) {
    return { summary: `Respuesta HTTP inválida (${err})`, detail: 'El servidor devolvió un código de error HTTP.' }
  }
  return { summary: err, detail: '' }
}

function normalizeIncident(raw: RawIncidentEvent): NormalizedIncident {
  const resolvedAt = raw.resolved_at ?? raw.ended_at ?? null
  const isOngoing =
    raw.is_ongoing !== undefined
      ? Boolean(raw.is_ongoing)
      : raw.is_resolved !== undefined
      ? !raw.is_resolved
      : !resolvedAt

  return {
    monitor_id: Number(raw.monitor_id ?? 0),
    monitor_name: String(raw.monitor_name ?? 'Endpoint'),
    group_name: String(raw.group_name ?? 'Sin Grupo'),
    type: String(raw.type ?? raw.monitor_type ?? 'PING').toUpperCase(),
    target: String(raw.target ?? raw.monitor_target ?? '—'),
    status: String(raw.status ?? 'DOWN').toUpperCase(),
    started_at: String(raw.started_at ?? new Date().toISOString()),
    resolved_at: resolvedAt ? String(resolvedAt) : null,
    duration_sec: Math.max(1, Number(raw.duration_sec ?? 1)),
    is_ongoing: isOngoing,
    error_msg: String(raw.error_msg ?? ''),
  }
}

export function IncidentLogModal({ onClose }: Props) {
  const [range, setRange] = useState('24h')
  const [incidents, setIncidents] = useState<NormalizedIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [stateFilter, setStateFilter] = useState<'all' | 'ongoing' | 'resolved'>('all')
  const [hideMicroCuts, setHideMicroCuts] = useState<boolean>(true)
  const [search, setSearch] = useState('')

  const fetchIncidents = useCallback(async (r: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/incidents?range=${r}`)
      if (res.ok) {
        const data = await res.json()
        const arr: RawIncidentEvent[] = Array.isArray(data) ? data : []
        setIncidents(arr.map(normalizeIncident))
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

  // Incidentes base tras aplicar o no el filtro de micro-cortes (< 90s ya resueltos)
  const baseIncidents = useMemo(() => {
    if (!hideMicroCuts) return incidents
    return incidents.filter(inc => inc.is_ongoing || inc.duration_sec >= 90)
  }, [incidents, hideMicroCuts])

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    return baseIncidents.filter(inc => {
      if (stateFilter === 'ongoing' && !inc.is_ongoing) return false
      if (stateFilter === 'resolved' && inc.is_ongoing) return false
      if (q) {
        const groupName = (inc.group_name || '').toLowerCase()
        const monName = (inc.monitor_name || '').toLowerCase()
        const target = (inc.target || '').toLowerCase()
        const type = (inc.type || '').toLowerCase()
        const err = (inc.error_msg || '').toLowerCase()
        const diag = humanizeError(inc.error_msg, inc.type).summary.toLowerCase()
        if (
          !groupName.includes(q) &&
          !monName.includes(q) &&
          !target.includes(q) &&
          !type.includes(q) &&
          !err.includes(q) &&
          !diag.includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [baseIncidents, stateFilter, search])

  const stats = useMemo(() => {
    const total = baseIncidents.length
    const ongoing = baseIncidents.filter(i => i.is_ongoing).length
    const resolvedList = baseIncidents.filter(i => !i.is_ongoing)
    const resolved = resolvedList.length
    const mttrSec = resolved > 0
      ? Math.round(resolvedList.reduce((acc, i) => acc + (i.duration_sec || 0), 0) / resolved)
      : 0
    return { total, ongoing, resolved, mttrSec }
  }, [baseIncidents])

  function handleExportCSV() {
    if (filtered.length === 0) return
    const esc = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`

    const headers = [
      'Estado Actual',
      'Tipo de Evento',
      'Grupo',
      'Endpoint',
      'Protocolo',
      'IP / Destino',
      'Inicio de Falla',
      'Hora de Recuperacion',
      'Duracion',
      'Duracion (Segundos)',
      'Diagnostico',
      'Detalle Tecnico',
    ]

    const rows = filtered.map(inc => {
      const diag = humanizeError(inc.error_msg, inc.type)
      return [
        esc(inc.is_ongoing ? 'ACTIVO (SIN RESPUESTA)' : 'RECUPERADO'),
        esc(inc.status === 'DEGRADED' ? 'Degradacion' : 'Caida Total'),
        esc(inc.group_name),
        esc(inc.monitor_name),
        esc(inc.type),
        esc(inc.target),
        esc(formatDateTime(inc.started_at)),
        esc(inc.is_ongoing ? 'Sigue caido' : formatDateTime(inc.resolved_at)),
        esc(formatDuration(inc.duration_sec)),
        String(inc.duration_sec),
        esc(diag.summary),
        esc(inc.error_msg),
      ].join(',')
    })

    // BOM UTF-8 (\uFEFF) para que Microsoft Excel abra acentos y columnas correctamente
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `bitacora-incidentes-${range}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const microCutsCount = Math.max(0, incidents.length - baseIncidents.length)

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
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
        width: 'min(1200px, 96vw)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
              📋 Bitácora de Caídas y Recuperaciones
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Registro detallado de cuándo dejó de responder cada servicio, cuándo se restableció y cuánto tiempo estuvo afectado.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid rgba(99, 102, 241, 0.45)',
                background: filtered.length === 0 ? 'var(--color-bg-primary)' : 'rgba(99, 102, 241, 0.14)',
                color: filtered.length === 0 ? 'var(--color-text-muted)' : '#818cf8',
                fontSize: 12.5, fontWeight: 700,
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.5 : 1,
              }}
            >
              <Download size={14} /> Exportar CSV ({filtered.length})
            </button>
            <button
              type="button"
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
              type="button"
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}>
          <KpiBox
            icon={<AlertOctagon size={18} />}
            label="Caídos en este momento"
            value={String(stats.ongoing)}
            sub={stats.ongoing > 0 ? 'Requieren atención' : 'Todo operativo ahora'}
            color={stats.ongoing > 0 ? '#ef4444' : '#22c55e'}
          />
          <KpiBox
            icon={<CheckCircle2 size={18} />}
            label="Incidentes ya Recuperados"
            value={String(stats.resolved)}
            sub="Restablecidos en el periodo"
            color="#22c55e"
          />
          <KpiBox
            icon={<Activity size={18} />}
            label="Total de Eventos"
            value={String(stats.total)}
            sub={`En rango de ${range}`}
            color="#6366f1"
          />
          <KpiBox
            icon={<Clock size={18} />}
            label="Tiempo Promedio de Caída (MTTR)"
            value={stats.resolved > 0 ? formatDuration(stats.mttrSec) : '—'}
            sub="Promedio en recuperarse"
            color="#f59e0b"
          />
        </div>

        {/* Barra de filtros */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 240, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por grupo, endpoint, IP/host o causa..."
                style={{
                  width: '100%', padding: '8px 12px 8px 34px',
                  borderRadius: 8, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)',
                  fontSize: 12.5, outline: 'none',
                }}
              />
            </div>

            {/* Estado: Todos / En Curso / Recuperados */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--color-bg-primary)', padding: 3, borderRadius: 8, border: '1px solid var(--color-border)' }}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'ongoing', label: `Caídos Ahora (${stats.ongoing})` },
                { key: 'resolved', label: `Recuperados (${stats.resolved})` },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStateFilter(tab.key)}
                  style={{
                    padding: '5px 11px', borderRadius: 6, border: 'none',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: stateFilter === tab.key ? 'var(--color-accent)' : 'transparent',
                    color: stateFilter === tab.key ? '#fff' : 'var(--color-text-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filtro de micro-cortes */}
            <button
              type="button"
              onClick={() => setHideMicroCuts(v => !v)}
              title="Oculta parpadeos breves menores a 90 segundos que se recuperaron solos en el siguiente chequeo"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                cursor: 'pointer',
                border: hideMicroCuts ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid var(--color-border)',
                background: hideMicroCuts ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-bg-primary)',
                color: hideMicroCuts ? '#34d399' : 'var(--color-text-muted)',
              }}
            >
              <Filter size={12} />
              {hideMicroCuts
                ? `Sin micro-cortes ${microCutsCount > 0 ? `(${microCutsCount} ocultos)` : ''}`
                : 'Mostrando micro-cortes (<90s)'}
            </button>
          </div>

          {/* Selector de rango temporal */}
          <div style={{ display: 'flex', gap: 6 }}>
            {RANGES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
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
              <CheckCircle2 size={38} color="#22c55e" style={{ margin: '0 auto 10px auto', opacity: 0.85 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                No hay caídas que coincidan con el filtro actual
              </div>
              <div style={{ fontSize: 12.5 }}>
                {hideMicroCuts && microCutsCount > 0
                  ? `Se ocultaron ${microCutsCount} micro-cortes breves (< 90s). Haz clic en "Sin micro-cortes" arriba si deseas inspeccionarlos.`
                  : 'Todos los servicios se han mantenido estables en este rango de tiempo.'}
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
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                }}>
                  <th style={{ padding: '12px 14px' }}>Estado del Evento</th>
                  <th style={{ padding: '12px 14px' }}>Grupo / Endpoint</th>
                  <th style={{ padding: '12px 14px' }}>Protocolo y Destino</th>
                  <th style={{ padding: '12px 14px' }}>Inicio de Falla</th>
                  <th style={{ padding: '12px 14px' }}>Hora de Recuperación</th>
                  <th style={{ padding: '12px 14px' }}>Tiempo Caído</th>
                  <th style={{ padding: '12px 14px' }}>Diagnóstico / Causa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc, idx) => {
                  const isDown = inc.status === 'DOWN'
                  const diag = humanizeError(inc.error_msg, inc.type)
                  return (
                    <tr
                      key={`${inc.monitor_id}-${inc.started_at}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        background: inc.is_ongoing
                          ? (isDown ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)')
                          : 'transparent',
                      }}
                    >
                      {/* 1. Estado del Evento (Sin contradicciones tipo "RESUELTO (DOWN)") */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {inc.is_ongoing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content',
                              padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                              background: isDown ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: isDown ? '#f87171' : '#fbbf24',
                              border: `1px solid ${isDown ? 'rgba(239, 68, 68, 0.5)' : 'rgba(245, 158, 11, 0.5)'}`,
                            }}>
                              <span style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: isDown ? '#ef4444' : '#f59e0b',
                                boxShadow: `0 0 8px ${isDown ? '#ef4444' : '#f59e0b'}`,
                              }} />
                              {isDown ? 'CAÍDO AHORA' : 'DEGRADADO AHORA'}
                            </span>
                            <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                              Incidente en curso
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content',
                              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                              background: 'rgba(34, 197, 94, 0.14)',
                              color: '#4ade80',
                              border: '1px solid rgba(34, 197, 94, 0.35)',
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                              RECUPERADO
                            </span>
                            <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                              {isDown ? 'Fue caída total' : 'Fue degradación'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2. Grupo / Endpoint */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 13 }}>
                          {inc.group_name}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          Endpoint: <strong style={{ color: 'var(--color-text-secondary)' }}>{inc.monitor_name}</strong>
                        </div>
                      </td>

                      {/* 3. Protocolo y Destino */}
                      <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: 5,
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: '#818cf8',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            fontSize: 10, fontWeight: 800,
                          }}>
                            {inc.type}
                          </span>
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                            {inc.target}
                          </span>
                        </div>
                      </td>

                      {/* 4. Inicio de Falla */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                        {formatDateTime(inc.started_at)}
                      </td>

                      {/* 5. Hora de Recuperación */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                        {inc.is_ongoing ? (
                          <span style={{ color: '#f87171', fontWeight: 700 }}>
                            Sigue sin responder...
                          </span>
                        ) : (
                          <span style={{ color: '#4ade80', fontWeight: 600 }}>
                            {formatDateTime(inc.resolved_at)}
                          </span>
                        )}
                      </td>

                      {/* 6. Tiempo Caído */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        <span style={{
                          padding: '4px 9px', borderRadius: 6,
                          background: inc.is_ongoing ? 'rgba(239, 68, 68, 0.18)' : 'var(--color-bg-card)',
                          border: `1px solid ${inc.is_ongoing ? 'rgba(239, 68, 68, 0.4)' : 'var(--color-border)'}`,
                          color: inc.is_ongoing ? '#f87171' : 'var(--color-text-primary)',
                        }}>
                          {formatDuration(inc.duration_sec)}
                        </span>
                      </td>

                      {/* 7. Diagnóstico / Causa */}
                      <td style={{ padding: '12px 14px', maxWidth: 280 }} title={inc.error_msg}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: isDown ? '#f87171' : '#fbbf24' }}>
                          {diag.summary}
                        </div>
                        {diag.detail && (
                          <div style={{
                            fontSize: 10.5,
                            color: 'var(--color-text-muted)',
                            fontFamily: "'JetBrains Mono', monospace",
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: 2,
                          }}>
                            {diag.detail}
                          </div>
                        )}
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

function KpiBox({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
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
        width: 38, height: 38, borderRadius: 9,
        background: `${color}1a`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}
