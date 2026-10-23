/**
 * features/Dashboard.tsx  (v3 — datos reales + layout full-width)
 *
 * - Carga grupos desde la API en el mount y refresca cada 15 segundos
 * - Layout sin max-width restrictivo para aprovechar toda la pantalla
 * - Filtro por tag en dropdown
 * - Estado de carga y error
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, Filter, PlusCircle, RefreshCw, Server, Tag, ClipboardList, Monitor as MonitorIcon, Volume2, VolumeX, ArrowUpNarrowWide, Maximize2, Terminal, ChevronsUpDown, ChevronsDownUp, Activity, FileSpreadsheet } from 'lucide-react'
import { CheckCircle, XCircle, AlertTriangle, Pause, Wrench } from 'lucide-react'
import { useMonitorStore } from '../store/monitorStore'
import { MonitorCard } from '../components/MonitorCard'
import { MonitorModal } from '../components/MonitorModal'
import { IncidentLogModal } from '../components/IncidentLogModal'
import { DiagnosticModal } from '../components/DiagnosticModal'
import { SlaReportModal } from '../components/SlaReportModal'
import { NocWallboard } from '../components/NocWallboard'
import { isSoundEnabled, setSoundEnabled, playTestSound } from '../utils/soundAlert'
import { useTranslation } from '../i18n'
import type { ModalMode } from '../components/MonitorModal'

// ── Tarjeta de métrica cuadrada y equilibrada ────────────────────────────────
function StatCard({ icon, label, value, sublabel, color, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; sublabel?: string; color: string; active?: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? `${color}14` : 'var(--color-bg-card)',
        border: active ? `2px solid ${color}` : '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: 72,
        boxShadow: active ? `0 0 0 3px ${color}22` : 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        userSelect: 'none',
      }}
      onMouseOver={e => {
        if (!active && onClick) e.currentTarget.style.borderColor = `${color}99`
      }}
      onMouseOut={e => {
        if (!active && onClick) e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      {/* Encabezado: Etiqueta en mayúsculas y badge de icono */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {label}
        </span>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: color + '1a', color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>

      {/* Pie: Número grande JetBrains Mono y desglose secundario */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          lineHeight: 1,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {value}
        </span>
        {sublabel && (
          <span style={{
            fontSize: 10.5,
            fontWeight: 500,
            color: 'var(--color-text-muted)',
            whiteSpace: 'nowrap',
          }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Regla única de filtrado para garantizar 100% de coincidencia entre Tarjetas Superiores, Dropdown, Modo Normal y Modo NOC ──
function groupMatchesStatusOrTag(g: import('../types').MonitorGroup, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'up') return g.overall_status === 'UP'
  if (filter === 'down') return g.overall_status === 'DOWN'
  if (filter === 'degraded') return g.overall_status === 'DEGRADED'
  if (filter === 'maintenance') {
    return (
      g.overall_status === 'MAINTENANCE' ||
      Boolean(g.monitors?.some(m => m.is_active !== false && (m.current_status === 'MAINTENANCE' || m.is_maintenance)))
    )
  }
  if (filter === 'paused') {
    return (
      g.overall_status === 'PAUSED' ||
      Boolean(g.monitors?.some(m => !m.is_active || m.current_status === 'PAUSED'))
    )
  }
  return Boolean(g.tags?.some(t => t.name === filter))
}

// ── Dropdown de filtro ─────────────────────────────────────────────────────
function TagFilter({ allTagNames, selected, onChange, stats, isEn }: {
  allTagNames: string[]
  selected: string
  onChange: (v: string) => void
  stats: { totalGroups: number; up: number; down: number; degraded: number; maintenance: number; paused: number }
  isEn?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = selected === 'all' ? (isEn ? `All (${stats.totalGroups})` : `Todos (${stats.totalGroups})`)
    : selected === 'up' ? (isEn ? `Online (${stats.up})` : `Operativos (${stats.up})`)
    : selected === 'down' ? (isEn ? `Down (${stats.down})` : `Caídos (${stats.down})`)
    : selected === 'degraded' ? (isEn ? `Degraded (${stats.degraded})` : `Degradados (${stats.degraded})`)
    : selected === 'maintenance' ? (isEn ? `Maintenance (${stats.maintenance})` : `Mantenimiento (${stats.maintenance})`)
    : selected === 'paused' ? (isEn ? `Paused (${stats.paused})` : `En Pausa (${stats.paused})`)
    : selected

  const statusOptions: { label: string; value: string; dot: string | null }[] = [
    { label: isEn ? `All groups (${stats.totalGroups})` : `Todos los grupos (${stats.totalGroups})`, value: 'all', dot: null },
    { label: isEn ? `Online (${stats.up})` : `Operativos (${stats.up})`, value: 'up', dot: '#22c55e' },
    { label: isEn ? `Down (${stats.down})` : `Caídos (${stats.down})`, value: 'down', dot: '#ef4444' },
    { label: isEn ? `Degraded (${stats.degraded})` : `Degradados (${stats.degraded})`, value: 'degraded', dot: '#f59e0b' },
    { label: isEn ? `Maintenance (${stats.maintenance})` : `Mantenimiento (${stats.maintenance})`, value: 'maintenance', dot: '#3b82f6' },
    { label: isEn ? `Paused (${stats.paused})` : `En Pausa (${stats.paused})`, value: 'paused', dot: '#9ca3af' },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px',
        borderRadius: 8, border: selected !== 'all' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        background: selected !== 'all' ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-bg-card)',
        color: selected !== 'all' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
        <Filter size={13} />
        {label}
        <ChevronDown size={13} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 11,
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: 6, minWidth: 230, maxWidth: 280,
            maxHeight: 'min(380px, 65vh)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            boxShadow: '0 10px 32px rgba(0,0,0,0.22)',
          }}>
            {statusOptions.map(opt => {
              const isSelected = selected === opt.value
              return (
                <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', border: 'none',
                  background: isSelected ? 'var(--color-accent)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--color-text-primary)',
                }}>
                  {opt.dot && (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isSelected ? '#fff' : opt.dot,
                      flexShrink: 0,
                    }} />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.label}
                  </span>
                </button>
              )
            })}

            {allTagNames.length > 0 && (
              <>
                <div style={{
                  height: 1,
                  background: 'var(--color-border)',
                  margin: '6px 4px',
                }} />
                <div style={{
                  padding: '4px 10px 2px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-text-muted)',
                }}>
                  {isEn ? `Tags (${allTagNames.length})` : `Etiquetas (${allTagNames.length})`}
                </div>
                {allTagNames.map(tagName => {
                  const isSelected = selected === tagName
                  return (
                    <button key={tagName} onClick={() => { onChange(tagName); setOpen(false) }} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', border: 'none',
                      background: isSelected ? 'var(--color-accent)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--color-text-primary)',
                    }}>
                      <Tag size={12} color={isSelected ? '#fff' : 'var(--color-text-muted)'} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tagName}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Dashboard principal ────────────────────────────────────────────────────
const STATUS_ORDER: Record<string, number> = {
  DOWN: 0,
  DEGRADED: 1,
  MAINTENANCE: 2,
  UP: 3,
  UNKNOWN: 4,
  PAUSED: 5,
}

export function Dashboard() {
  const { t, isEn, interpolate } = useTranslation()
  const groups = useMonitorStore(s => s.groups)
  const allTags = useMonitorStore(s => s.allTags)
  const loading = useMonitorStore(s => s.loading)
  const error = useMonitorStore(s => s.error)
  const setSseConnected = useMonitorStore(s => s.setSseConnected)
  const fetchGroups = useMonitorStore(s => s.fetchGroups)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [modal, setModal] = useState<ModalMode | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showIncidentLog, setShowIncidentLog] = useState(false)
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false)
  const [showSlaReportModal, setShowSlaReportModal] = useState(false)
  const [nocMode, setNocMode] = useState<boolean>(() => {
    try { return localStorage.getItem('uptimecore_noc_mode') === '1' } catch { return false }
  })
  const [sortDownFirst, setSortDownFirst] = useState<boolean>(false)
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled())

  const handleToggleNoc = () => {
    setNocMode(prev => {
      const next = !prev
      try { localStorage.setItem('uptimecore_noc_mode', next ? '1' : '0') } catch {}
      return next
    })
  }

  const handleToggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    setSoundEnabled(next)
    if (next) {
      playTestSound()
    }
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  // Persistencia y restauración de posición del scroll de la vista principal
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null
    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        try {
          sessionStorage.setItem('uptimecore_scroll_pos', String(window.scrollY))
        } catch {}
      }, 100)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [])

  // Restaurar el scroll una vez que los grupos se hayan pintado en pantalla
  useEffect(() => {
    if (groups.length > 0) {
      try {
        const saved = sessionStorage.getItem('uptimecore_scroll_pos')
        if (saved) {
          const y = parseInt(saved, 10)
          if (!isNaN(y) && y > 0 && Math.abs(window.scrollY - y) > 20) {
            requestAnimationFrame(() => {
              window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
            })
          }
        }
      } catch {}
    }
  }, [groups.length])

  // Carga inicial + SSE (Real-Time) con reconexión automática
  useEffect(() => {
    fetchGroups()

    let sse: EventSource | null = null
    let disposed = false
    let hasConnectedOnce = false
    let pendingEvents: any[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let lastActivityAt = Date.now()

    // Watchdog: el backend envía un evento "ping" cada 10s y cientos de eventos de chequeo por minuto.
    // Si no llega NADA en 35s, el stream está muerto (proxy colgado / backend reiniciado) y se recrea.
    const WATCHDOG_MS = 35_000

    const flush = () => {
      if (pendingEvents.length > 0) {
        useMonitorStore.getState().updateMonitorsLiveBatch(pendingEvents)
        pendingEvents = []
      }
      flushTimer = null
    }

    const markActivity = () => {
      lastActivityAt = Date.now()
      if (!useMonitorStore.getState().sseConnected) setSseConnected(true)
      reconnectAttempt = 0
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return
      // Backoff progresivo: 1s, 2s, 4s, 8s ... máx 15s
      const delay = Math.min(15_000, 1000 * Math.pow(2, reconnectAttempt))
      reconnectAttempt++
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (disposed) return
      if (sse) {
        sse.close()
        sse = null
      }
      const es = new EventSource('/api/stream')
      sse = es
      lastActivityAt = Date.now()

      es.onopen = () => {
        markActivity()
        // Tras una reconexión, resincroniza el estado completo para no perder cambios ocurridos durante el corte
        if (hasConnectedOnce) fetchGroups()
        hasConnectedOnce = true
      }

      es.addEventListener('ping', markActivity)

      es.onmessage = (e) => {
        markActivity()
        try {
          const data = JSON.parse(e.data)
          pendingEvents.push(data)
          if (!flushTimer) {
            flushTimer = setTimeout(flush, 400) // Actualiza la UI de forma fluida y rápida
          }
        } catch {}
      }

      es.onerror = () => {
        setSseConnected(false)
        // Si el proxy respondió 502/504 (p.ej. backend reiniciando), el navegador cierra el EventSource
        // de forma PERMANENTE (readyState = CLOSED) y nunca reintenta: lo recreamos manualmente.
        if (es.readyState === EventSource.CLOSED) {
          if (sse === es) sse = null
          scheduleReconnect()
        }
      }
    }

    connect()

    // Watchdog de stream colgado (conexión abierta pero sin datos)
    const watchdog = setInterval(() => {
      if (disposed) return
      if (Date.now() - lastActivityAt > WATCHDOG_MS) {
        setSseConnected(false)
        if (sse) { sse.close(); sse = null }
        scheduleReconnect()
      }
    }, 5_000)

    // Respaldo por HTTP: cada 15s con SSE activo, cada 5s si el tiempo real está caído
    const poll = () => {
      if (disposed) return
      fetchGroups()
      const next = useMonitorStore.getState().sseConnected ? 15_000 : 5_000
      pollTimer = setTimeout(poll, next)
    }
    pollTimer = setTimeout(poll, 15_000)

    // Al volver a la pestaña o recuperar la red, reconecta de inmediato si hace falta
    const revive = () => {
      if (disposed) return
      if (document.visibilityState === 'hidden') return
      if (!sse || sse.readyState === EventSource.CLOSED || Date.now() - lastActivityAt > WATCHDOG_MS) {
        reconnectAttempt = 0
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        connect()
      }
      fetchGroups()
    }
    document.addEventListener('visibilitychange', revive)
    window.addEventListener('online', revive)

    return () => {
      disposed = true
      if (flushTimer) clearTimeout(flushTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pollTimer) clearTimeout(pollTimer)
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', revive)
      window.removeEventListener('online', revive)
      if (sse) sse.close()
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchGroups()
    setTimeout(() => setRefreshing(false), 500)
  }, [fetchGroups])

  const allTagNames = useMemo(() => [...new Set(allTags.map(t => t.name))], [allTags])

  const stats = useMemo(() => {
    let up = 0, down = 0, degraded = 0, maintenance = 0, paused = 0
    let epTotal = 0, epUp = 0, epDown = 0

    groups.forEach(g => {
      const st = g.overall_status || 'UNKNOWN'
      if (st === 'UP') up++
      else if (st === 'DOWN') down++
      else if (st === 'DEGRADED') degraded++
      else if (st === 'MAINTENANCE') maintenance++
      else if (st === 'PAUSED') paused++

      g.monitors?.forEach(m => {
        epTotal++
        if (m.current_status === 'UP') epUp++
        else if (m.current_status === 'DOWN') epDown++
      })
    })

    return {
      totalGroups: groups.length,
      up, down, degraded, maintenance, paused,
      epTotal, epUp, epDown
    }
  }, [groups])

  const filtered = useMemo(() => {
    const list = groups.filter(g => {
      const term = search.trim().toLowerCase()
      const matchSearch = !term ||
        g.name.toLowerCase().includes(term) ||
        (g.description ? g.description.toLowerCase().includes(term) : false) ||
        g.tags?.some(t => t.name.toLowerCase().includes(term)) ||
        g.monitors?.some(m =>
          m.name.toLowerCase().includes(term) ||
          m.target.toLowerCase().includes(term) ||
          (m.port ? `${m.target}:${m.port}`.toLowerCase().includes(term) : false)
        )
      const matchFilter = groupMatchesStatusOrTag(g, tagFilter)
      return matchSearch && matchFilter
    })

    if (!sortDownFirst) return list
    return [...list].sort((a, b) => {
      const pa = STATUS_ORDER[a.overall_status ?? 'UNKNOWN'] ?? 4
      const pb = STATUS_ORDER[b.overall_status ?? 'UNKNOWN'] ?? 4
      if (pa !== pb) return pa - pb
      return 0
    })
  }, [groups, search, tagFilter, sortDownFirst])

  const toggleCardFilter = (val: string) => {
    setTagFilter(prev => prev === val ? 'all' : val)
  }

  // Control reactivo y persistente de grupos expandidos (soporta Expandir/Colapsar todos)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem('uptimecore_expanded_groups')
      if (raw) return new Set(JSON.parse(raw))
    } catch {}
    return new Set()
  })

  const toggleGroupExpand = useCallback((groupId: number) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      try {
        localStorage.setItem('uptimecore_expanded_groups', JSON.stringify([...next]))
      } catch {}
      return next
    })
  }, [])

  const handleExpandAll = useCallback(() => {
    const allFilteredIds = filtered.map(g => g.id)
    setExpandedGroupIds(prev => {
      const next = new Set([...prev, ...allFilteredIds])
      try {
        localStorage.setItem('uptimecore_expanded_groups', JSON.stringify([...next]))
      } catch {}
      return next
    })
  }, [filtered])

  const handleCollapseAll = useCallback(() => {
    setExpandedGroupIds(new Set())
    try {
      localStorage.setItem('uptimecore_expanded_groups', JSON.stringify([]))
    } catch {}
  }, [])

  const expandedCount = useMemo(() => {
    return filtered.filter(g => expandedGroupIds.has(g.id)).length
  }, [filtered, expandedGroupIds])

  return (
    <div style={{ padding: '0 32px 28px 32px', maxWidth: '100%' }}>

      {/* ── Error banner ──── */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 18px', marginBottom: 24, marginTop: 28, fontSize: 13, color: '#b91c1c',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          ⚠️ {isEn ? 'Could not connect to backend:' : 'No se pudo conectar al backend:'} {error}. {isEn ? 'Ensure container ping-eye-backend is running.' : 'Asegúrate de que el contenedor `ping-eye-backend` esté activo.'}
        </div>
      )}

      {/* ── Header Fijo (Estadísticas Cuadradas y Controles Equilibrados) ──── */}
      <div style={{
        position: 'sticky',
        top: 58, // altura del Navbar
        zIndex: 90,
        backgroundColor: 'var(--color-bg-primary)',
        padding: '16px 32px 14px 32px',
        borderBottom: '1px solid var(--color-border)',
        boxShadow: '0 8px 12px -3px var(--color-bg-primary)',
        margin: '0 -32px 18px -32px',
      }}>
        {/* ── Tarjetas resumen cuadradas y equilibradas (7 KPI Cards) ──── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 10, marginBottom: 14,
        }}>
          <StatCard icon={<Server size={14} />}        label={isEn ? "Groups" : "Grupos"}          value={stats.totalGroups} sublabel={isEn ? "Monitored" : "Monitoreados"}                     color="#6366f1" active={tagFilter === 'all'}         onClick={() => setTagFilter('all')} />
          <StatCard icon={<Activity size={14} />}      label="Endpoints"                          value={stats.epTotal}     sublabel={`${stats.epUp} UP · ${stats.epDown} DOWN`} color="#06b6d4" active={false}                  onClick={() => setTagFilter('all')} />
          <StatCard icon={<CheckCircle size={14} />}   label={isEn ? "Online" : "Operativos"}     value={stats.up}          sublabel={`${stats.epUp} ${isEn ? "active eps" : "ep activos"}`}   color="#22c55e" active={tagFilter === 'up'}          onClick={() => toggleCardFilter('up')} />
          <StatCard icon={<XCircle size={14} />}       label={isEn ? "Alerting" : "Caídos"}       value={stats.down}        sublabel={`${stats.epDown} ${isEn ? "down eps" : "ep caídos"}`}    color="#ef4444" active={tagFilter === 'down'}        onClick={() => toggleCardFilter('down')} />
          <StatCard icon={<AlertTriangle size={14} />} label={isEn ? "Degraded" : "Degradados"}  value={stats.degraded}    sublabel={isEn ? "Partial failure" : "Falla parcial"}               color="#f59e0b" active={tagFilter === 'degraded'}    onClick={() => toggleCardFilter('degraded')} />
          <StatCard icon={<Wrench size={14} />}        label={isEn ? "Maintenance" : "Mantenimiento"} value={stats.maintenance} sublabel={isEn ? "0 active" : "0 activos"}                     color="#3b82f6" active={tagFilter === 'maintenance'} onClick={() => toggleCardFilter('maintenance')} />
          <StatCard icon={<Pause size={14} />}         label={isEn ? "Paused" : "En Pausa"}       value={stats.paused}      sublabel={isEn ? "0 active" : "0 activos"}                         color="#9ca3af" active={tagFilter === 'paused'}      onClick={() => toggleCardFilter('paused')} />
        </div>

        {/* ── Barra Unificada de Controles (Búsqueda a la izquierda, Todo a la derecha) ──── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          {/* Bloque Izquierdo: Buscador */}
          <div style={{ flex: '1 1 240px', maxWidth: 360 }}>
            <input
              type="text"
              placeholder={`🔍  ${t.dashboard.searchPlaceholder}`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 36, padding: '0 12px', borderRadius: 8,
                border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 0.15s ease',
              }}
            />
          </div>

          {/* Bloque Derecho: Filtros, Herramientas Operativas, Sync y Nuevo Grupo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Expandir / Colapsar */}
            {!nocMode && groups.length > 0 && (
              <button
                onClick={() => {
                  if (expandedCount > 0) {
                    handleCollapseAll()
                  } else {
                    handleExpandAll()
                  }
                }}
                title={expandedCount > 0 ? (isEn ? "Collapse all groups" : "Colapsar todos los grupos") : (isEn ? "Expand all groups" : "Expandir todos los grupos")}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 36, padding: '0 12px', borderRadius: 8,
                  border: expandedCount > 0 ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  background: expandedCount > 0 ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-bg-card)',
                  color: expandedCount > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {expandedCount > 0 ? (
                  <>
                    <ChevronsDownUp size={14} color="var(--color-accent)" />
                    <span>{isEn ? 'Collapse' : 'Colapsar'}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 99,
                      background: 'var(--color-accent)', color: '#fff', fontWeight: 700,
                    }}>
                      {expandedCount}
                    </span>
                  </>
                ) : (
                  <>
                    <ChevronsUpDown size={14} color="var(--color-accent)" />
                    <span>{isEn ? 'Expand all' : 'Expandir todo'}</span>
                  </>
                )}
              </button>
            )}

            {/* Filtro dropdown */}
            <TagFilter
              allTagNames={allTagNames}
              selected={tagFilter}
              stats={stats}
              onChange={(v) => setTagFilter(v)}
              isEn={isEn}
            />

            {/* Caídos 1º */}
            <button
              onClick={() => setSortDownFirst(v => !v)}
              title={isEn ? "Automatically sort Alerting and Degraded groups first" : "Ordenar automáticamente los grupos Caídos y Degradados al principio de la lista"}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 11px', borderRadius: 8,
                border: sortDownFirst ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid var(--color-border)',
                background: sortDownFirst ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-bg-card)',
                color: sortDownFirst ? '#f87171' : 'var(--color-text-secondary)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <ArrowUpNarrowWide size={14} />
              {isEn ? 'Down 1st' : 'Caídos 1º'}
            </button>

            {/* Separador vertical sutil */}
            <div style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 2px' }} />

            {/* Bitácora */}
            <button
              onClick={() => setShowIncidentLog(true)}
              title={isEn ? "Open Incident and Outage Log" : "Abrir Bitácora de Eventos e Historial de Caídas"}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 12px', borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'border-color 0.15s ease',
              }}
            >
              <ClipboardList size={14} color="var(--color-accent)" />
              {isEn ? 'Incidents' : 'Bitácora'}
              {(stats.down + stats.degraded) > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 99, lineHeight: 1.2,
                }}>
                  {stats.down + stats.degraded}
                </span>
              )}
            </button>

            {/* Diagnóstico */}
            <button
              onClick={() => setShowDiagnosticModal(true)}
              title={isEn ? "Open Live Diagnostics Console (Paping, Ping, Traceroute, HTTP/SSL, DNS)" : "Abrir Consola de Diagnóstico en Vivo (Paping TCP, Ping ICMP, Traceroute, HTTP/SSL, DNS)"}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 12px', borderRadius: 8,
                border: '1px solid rgba(56, 189, 248, 0.35)',
                background: 'rgba(14, 165, 233, 0.1)',
                color: '#38bdf8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Terminal size={14} />
              {isEn ? 'Diagnostics' : 'Diagnóstico'}
            </button>

            {/* Reportes SLA */}
            <button
              onClick={() => setShowSlaReportModal(true)}
              title={isEn ? "Open Executive SLA Report Generator (PDF, Excel, Print)" : "Abrir Generador de Reportes Ejecutivos de SLA (PDF, Excel, Impresión)"}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 12px', borderRadius: 8,
                border: '1px solid rgba(99, 102, 241, 0.35)',
                background: 'rgba(99, 102, 241, 0.1)',
                color: 'var(--color-accent)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <FileSpreadsheet size={14} />
              {isEn ? 'SLA Reports' : 'Reportes SLA'}
            </button>

            {/* Modo NOC */}
            <button
              onClick={handleToggleNoc}
              title={isEn ? "Toggle NOC Wallboard Mode" : "Alternar Modo Pantalla NOC / Wallboard compacto"}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 12px', borderRadius: 8,
                border: nocMode ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: nocMode ? 'var(--color-accent)' : 'var(--color-bg-card)',
                color: nocMode ? '#fff' : 'var(--color-text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <MonitorIcon size={14} />
              {isEn ? 'NOC Mode' : 'Modo NOC'}
            </button>

            {nocMode && (
              <button
                onClick={handleFullscreen}
                title={isEn ? "Fullscreen for wallboard display" : "Pantalla completa para monitor de pared"}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                  color: 'var(--color-text-secondary)', cursor: 'pointer',
                }}
              >
                <Maximize2 size={14} />
              </button>
            )}

            {/* Sonido */}
            <button
              onClick={handleToggleSound}
              title={soundOn ? (isEn ? 'Audio alert ENABLED' : 'Alerta sonora ACTIVADA') : (isEn ? 'Enable audio alert' : 'Activar alerta sonora')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 11px', borderRadius: 8,
                border: soundOn ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid var(--color-border)',
                background: soundOn ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-bg-card)',
                color: soundOn ? '#4ade80' : 'var(--color-text-muted)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {soundOn ? (isEn ? 'Sound ON' : 'Sonido ON') : (isEn ? 'Mute' : 'Silencio')}
            </button>

            {/* Refresco / Sync */}
            <button onClick={handleRefresh} title={isEn ? "Refresh now (Sync)" : "Actualizar ahora (Sync)"} style={{
              width: 36, height: 36, borderRadius: 8, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              color: 'var(--color-text-muted)', cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </button>

            {/* Nuevo Grupo */}
            <button onClick={() => setModal({ type: 'new_group' })} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 16px', borderRadius: 8, border: 'none',
              background: 'var(--color-accent)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
              transition: 'opacity 0.15s ease',
            }}>
              <PlusCircle size={15} /> {t.dashboard.newGroup}
            </button>
          </div>
        </div>
      </div>

      {/* ── Estado de carga ──── */}
      {loading && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ fontWeight: 600 }}>{isEn ? 'Connecting to monitoring engine...' : 'Conectando al motor de monitoreo...'}</p>
        </div>
      )}

      {/* ── Lista de grupos o Modo NOC Wallboard ──── */}
      {!loading || groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.length === 0 && !loading ? (
            <div style={{
              textAlign: 'center', padding: '80px 20px',
              color: 'var(--color-text-muted)', background: 'var(--color-bg-card)',
              borderRadius: 14, border: '2px dashed var(--color-border)',
            }}>
              <Server size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
              <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{t.dashboard.emptyTitle}</p>
              <p style={{ fontSize: 13, marginBottom: 24 }}>
                {t.dashboard.emptySubtitle}
              </p>
              <button onClick={() => setModal({ type: 'new_group' })} style={{
                padding: '11px 28px', borderRadius: 10, background: 'var(--color-accent)',
                color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              }}>
                {t.dashboard.addFirstGroup}
              </button>
            </div>
          ) : nocMode ? (
            <NocWallboard
              groups={filtered}
              onOpenModal={setModal}
              activeFilter={tagFilter}
              searchTerm={search}
              sortDownFirst={sortDownFirst}
              onClearFilter={() => { setTagFilter('all'); setSearch('') }}
            />
          ) : filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '56px 20px',
              color: 'var(--color-text-muted)', background: 'var(--color-bg-card)',
              borderRadius: 14, border: '1px dashed var(--color-border)',
            }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                {isEn ? 'No groups match the selected filter (0 results)' : 'No hay grupos que coincidan con el filtro seleccionado (0 resultados)'}
              </p>
              <p style={{ fontSize: 12.5, marginBottom: 16 }}>
                {isEn ? 'Try clearing the active filter or search term.' : 'Prueba quitando el filtro activo o limpiando el término de búsqueda.'}
              </p>
              <button
                onClick={() => { setTagFilter('all'); setSearch('') }}
                style={{
                  padding: '8px 18px', borderRadius: 8, background: 'var(--color-accent)',
                  color: '#fff', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                }}
              >
                {isEn ? `Show all groups (${stats.totalGroups})` : `Mostrar todos los grupos (${stats.totalGroups})`}
              </button>
            </div>
          ) : (
            filtered.map(group => (
              <MonitorCard
                key={group.id}
                group={group}
                onOpenModal={setModal}
                searchTerm={search}
                activeFilter={tagFilter}
                isExpanded={expandedGroupIds.has(group.id)}
                onToggleExpand={toggleGroupExpand}
              />
            ))
          )}
        </div>
      ) : null}

      {/* ── Footer ──── */}
      {groups.length > 0 && (
        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
          {interpolate(t.dashboard.footerStats, {
            count: filtered.length,
            total: groups.length,
            monitors: groups.reduce((a, g) => a + (g.monitors?.length ?? 0), 0)
          })}
        </div>
      )}

      {/* ── Modal Crear/Editar ──── */}
      {modal && <MonitorModal mode={modal} onClose={() => setModal(null)} />}

      {/* ── Modal Bitácora de Eventos ──── */}
      {showIncidentLog && <IncidentLogModal onClose={() => setShowIncidentLog(false)} />}

      {/* ── Modal Diagnóstico en Vivo ──── */}
      {showDiagnosticModal && <DiagnosticModal onClose={() => setShowDiagnosticModal(false)} />}

      {/* ── Modal Reportes Ejecutivos de SLA ──── */}
      {showSlaReportModal && (
        <SlaReportModal
          onClose={() => setShowSlaReportModal(false)}
          groups={groups}
        />
      )}
    </div>
  )
}
