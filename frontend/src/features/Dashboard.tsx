/**
 * features/Dashboard.tsx  (v3 — datos reales + layout full-width)
 *
 * - Carga grupos desde la API en el mount y refresca cada 15 segundos
 * - Layout sin max-width restrictivo para aprovechar toda la pantalla
 * - Filtro por tag en dropdown
 * - Estado de carga y error
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, Filter, PlusCircle, RefreshCw, Server, Tag, ClipboardList, Monitor as MonitorIcon, Volume2, VolumeX, ArrowUpNarrowWide, Maximize2, Terminal } from 'lucide-react'
import { CheckCircle, XCircle, AlertTriangle, Pause, Wrench } from 'lucide-react'
import { useMonitorStore } from '../store/monitorStore'
import { MonitorCard } from '../components/MonitorCard'
import { MonitorModal } from '../components/MonitorModal'
import { IncidentLogModal } from '../components/IncidentLogModal'
import { DiagnosticModal } from '../components/DiagnosticModal'
import { NocWallboard } from '../components/NocWallboard'
import { isSoundEnabled, setSoundEnabled, playTestSound } from '../utils/soundAlert'
import type { ModalMode } from '../components/MonitorModal'

// ── Tarjeta de métrica ─────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string; active?: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-bg-card)',
        border: active ? `2px solid ${color}` : '1px solid var(--color-border)',
        borderRadius: 14, padding: '20px 24px',
        display: 'flex', alignItems: 'center', gap: 18,
        boxShadow: active ? `0 0 0 3px ${color}22` : 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.18s ease',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: color + '1a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 5, fontWeight: 500 }}>
          {label}
        </div>
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
function TagFilter({ allTagNames, selected, onChange, stats }: {
  allTagNames: string[]
  selected: string
  onChange: (v: string) => void
  stats: { totalGroups: number; up: number; down: number; degraded: number; maintenance: number; paused: number }
}) {
  const [open, setOpen] = useState(false)
  const label = selected === 'all' ? `Todos (${stats.totalGroups})`
    : selected === 'up' ? `Operativos (${stats.up})`
    : selected === 'down' ? `Caídos (${stats.down})`
    : selected === 'degraded' ? `Degradados (${stats.degraded})`
    : selected === 'maintenance' ? `Mantenimiento (${stats.maintenance})`
    : selected === 'paused' ? `En Pausa (${stats.paused})`
    : selected

  const options: { label: string; value: string; dot: string | null; isTag?: boolean }[] = [
    { label: `Todos los grupos (${stats.totalGroups})`, value: 'all', dot: null },
    { label: `Operativos (${stats.up})`, value: 'up', dot: '#22c55e' },
    { label: `Caídos (${stats.down})`, value: 'down', dot: '#ef4444' },
    { label: `Degradados (${stats.degraded})`, value: 'degraded', dot: '#f59e0b' },
    { label: `Mantenimiento (${stats.maintenance})`, value: 'maintenance', dot: '#3b82f6' },
    { label: `En Pausa (${stats.paused})`, value: 'paused', dot: '#9ca3af' },
    ...allTagNames.map(t => ({ label: t, value: t, isTag: true, dot: null })),
  ]

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
        borderRadius: 9, border: selected !== 'all' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        background: selected !== 'all' ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-bg-card)',
        color: selected !== 'all' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
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
            borderRadius: 12, padding: 6, minWidth: 230,
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          }}>
            {options.map(opt => {
              const isSelected = selected === opt.value;
              return (
                <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', border: 'none',
                  background: isSelected ? 'var(--color-accent)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--color-text-primary)',
                }}>
                  {opt.dot && (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isSelected ? '#fff' : opt.dot
                    }} />
                  )}
                  {opt.isTag && (
                    <Tag size={12} color={isSelected ? '#fff' : 'var(--color-text-muted)'} />
                  )}
                  {opt.label}
                </button>
              )
            })}
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
  const { groups, allTags, loading, error, lastEventAt, sseConnected, setSseConnected, fetchGroups } = useMonitorStore()
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [modal, setModal] = useState<ModalMode | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showIncidentLog, setShowIncidentLog] = useState(false)
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false)
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
    groups.forEach(g => {
      if (groupMatchesStatusOrTag(g, 'up')) up++
      if (groupMatchesStatusOrTag(g, 'down')) down++
      if (groupMatchesStatusOrTag(g, 'degraded')) degraded++
      if (groupMatchesStatusOrTag(g, 'maintenance')) maintenance++
      if (groupMatchesStatusOrTag(g, 'paused')) paused++
    })
    return { totalGroups: groups.length, up, down, degraded, maintenance, paused }
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

  return (
    <div style={{ padding: '0 32px 28px 32px', maxWidth: '100%' }}>

      {/* ── Error banner ──── */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 18px', marginBottom: 24, marginTop: 28, fontSize: 13, color: '#b91c1c',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          ⚠️ No se pudo conectar al backend: {error}. Asegúrate de que el contenedor `ping-eye-backend` esté activo.
        </div>
      )}

      {/* ── Header Fijo (Estadísticas y Controles) ──── */}
      <div style={{
        position: 'sticky',
        top: 58, // altura del Navbar
        zIndex: 90,
        backgroundColor: 'var(--color-bg-primary)',
        paddingTop: 28,
        paddingBottom: 16,
        borderBottom: '1px solid var(--color-border)',
        boxShadow: '0 10px 15px -3px var(--color-bg-primary)', // Suaviza la transición hacia abajo
        margin: '0 -32px 24px -32px',
        padding: '28px 32px 16px 32px',
      }}>
        {/* ── Tarjetas resumen ──── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16, marginBottom: 24,
        }}>
          <StatCard icon={<Server size={22} />}        label="Grupos de monitor"  value={stats.totalGroups} color="#6366f1" active={tagFilter === 'all'}         onClick={() => setTagFilter('all')} />
          <StatCard icon={<CheckCircle size={22} />}   label="Operativos"         value={stats.up}          color="#22c55e" active={tagFilter === 'up'}          onClick={() => toggleCardFilter('up')} />
          <StatCard icon={<XCircle size={22} />}       label="Caídos"             value={stats.down}        color="#ef4444" active={tagFilter === 'down'}        onClick={() => toggleCardFilter('down')} />
          <StatCard icon={<AlertTriangle size={22} />} label="Degradados"         value={stats.degraded}    color="#f59e0b" active={tagFilter === 'degraded'}    onClick={() => toggleCardFilter('degraded')} />
          <StatCard icon={<Wrench size={22} />}        label="Mantenimiento"      value={stats.maintenance} color="#3b82f6" active={tagFilter === 'maintenance'} onClick={() => toggleCardFilter('maintenance')} />
          <StatCard icon={<Pause size={22} />}         label="En Pausa"           value={stats.paused}      color="#9ca3af" active={tagFilter === 'paused'}      onClick={() => toggleCardFilter('paused')} />
        </div>

        {/* ── Barra de controles ──── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍  Buscar por nombre o IP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 9,
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />

          <TagFilter
            allTagNames={allTagNames}
            selected={tagFilter}
            stats={stats}
            onChange={(v) => setTagFilter(v)}
          />

          {/* Priorizar Caídos 1º */}
          <button
            onClick={() => setSortDownFirst(v => !v)}
            title="Ordenar automáticamente los grupos Caídos y Degradados al principio de la lista"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 9,
              border: sortDownFirst ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid var(--color-border)',
              background: sortDownFirst ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-bg-card)',
              color: sortDownFirst ? '#f87171' : 'var(--color-text-secondary)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <ArrowUpNarrowWide size={14} />
            Caídos 1º
          </button>

          {/* Bitácora de Eventos / Historial de Caídas */}
          <button
            onClick={() => setShowIncidentLog(true)}
            title="Abrir Bitácora de Eventos e Historial de Caídas"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 13px', borderRadius: 9,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <ClipboardList size={14} color="var(--color-accent)" />
            Bitácora
            {(stats.down + stats.degraded) > 0 && (
              <span style={{
                background: '#ef4444', color: '#fff', fontSize: 10.5, fontWeight: 800,
                padding: '1px 6px', borderRadius: 99, lineHeight: 1.3,
              }}>
                {stats.down + stats.degraded}
              </span>
            )}
          </button>

          {/* Consola de Diagnóstico en Vivo (Paping / Ping / Traceroute) */}
          <button
            onClick={() => setShowDiagnosticModal(true)}
            title="Abrir Consola de Diagnóstico en Vivo (Paping TCP por Puerto, Ping ICMP, Traceroute, HTTP/SSL, DNS)"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 13px', borderRadius: 9,
              border: '1px solid rgba(56, 189, 248, 0.35)',
              background: 'rgba(14, 165, 233, 0.12)',
              color: '#38bdf8',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Terminal size={14} />
            Diagnóstico
          </button>

          {/* Modo Pantalla NOC / Wallboard */}
          <button
            onClick={handleToggleNoc}
            title="Alternar Modo Pantalla NOC / Wallboard compacto de alta densidad"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 13px', borderRadius: 9,
              border: nocMode ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              background: nocMode ? 'var(--color-accent)' : 'var(--color-bg-card)',
              color: nocMode ? '#fff' : 'var(--color-text-primary)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <MonitorIcon size={14} />
            Modo NOC
          </button>

          {nocMode && (
            <button
              onClick={handleFullscreen}
              title="Pantalla completa para monitor de pared"
              style={{
                width: 36, height: 36, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                color: 'var(--color-text-secondary)', cursor: 'pointer',
              }}
            >
              <Maximize2 size={14} />
            </button>
          )}

          {/* Alerta Sonora opcional */}
          <button
            onClick={handleToggleSound}
            title={soundOn ? 'Alerta sonora ACTIVADA (suena al caer o recuperarse un monitor)' : 'Activar alerta sonora para caídas en vivo'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 9,
              border: soundOn ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid var(--color-border)',
              background: soundOn ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-bg-card)',
              color: soundOn ? '#4ade80' : 'var(--color-text-muted)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {soundOn ? 'Sonido ON' : 'Silencio'}
          </button>

          {/* Indicador SSE en Tiempo Real */}
          <div
            title={lastEventAt ? `Último evento recibido: ${new Date(lastEventAt).toLocaleTimeString()}` : 'Conectado al stream en tiempo real'}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
              borderRadius: 9, border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)', fontSize: 11.5, fontWeight: 600,
              color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: sseConnected ? '#22c55e' : '#f59e0b',
              boxShadow: sseConnected ? '0 0 8px #22c55e' : 'none',
            }} />
            <span>{sseConnected ? 'EN VIVO' : 'SYNC'}</span>
            {lastEventAt && (
              <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                · {new Date(lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>

          {/* Botón refresh manual */}
          <button onClick={handleRefresh} title="Actualizar ahora" style={{
            width: 38, height: 38, borderRadius: 9, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
            color: 'var(--color-text-muted)', cursor: 'pointer',
          }}>
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>

          {/* Nuevo grupo */}
          <button onClick={() => setModal({ type: 'new_group' })} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: 'var(--color-accent)', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            <PlusCircle size={15} /> Nuevo Grupo
          </button>
        </div>
      </div>

      {/* ── Estado de carga ──── */}
      {loading && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ fontWeight: 600 }}>Conectando al motor de monitoreo...</p>
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
              <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Sin monitores aún</p>
              <p style={{ fontSize: 13, marginBottom: 24 }}>
                Crea tu primer grupo de monitores para comenzar a supervisar servicios.
              </p>
              <button onClick={() => setModal({ type: 'new_group' })} style={{
                padding: '11px 28px', borderRadius: 10, background: 'var(--color-accent)',
                color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              }}>
                + Crear primer monitor
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
                No hay grupos que coincidan con el filtro seleccionado (0 resultados)
              </p>
              <p style={{ fontSize: 12.5, marginBottom: 16 }}>
                Prueba quitando el filtro activo o limpiando el término de búsqueda.
              </p>
              <button
                onClick={() => { setTagFilter('all'); setSearch('') }}
                style={{
                  padding: '8px 18px', borderRadius: 8, background: 'var(--color-accent)',
                  color: '#fff', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                }}
              >
                Mostrar todos los grupos ({stats.totalGroups})
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
              />
            ))
          )}
        </div>
      ) : null}

      {/* ── Footer ──── */}
      {groups.length > 0 && (
        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
          UptimeCore · Mostrando {filtered.length} de {groups.length} grupos · {groups.reduce((a, g) => a + (g.monitors?.length ?? 0), 0)} endpoints · Actualización en tiempo real (SSE)
        </div>
      )}

      {/* ── Modal Crear/Editar ──── */}
      {modal && <MonitorModal mode={modal} onClose={() => setModal(null)} />}

      {/* ── Modal Bitácora de Eventos ──── */}
      {showIncidentLog && <IncidentLogModal onClose={() => setShowIncidentLog(false)} />}

      {/* ── Modal Diagnóstico en Vivo ──── */}
      {showDiagnosticModal && <DiagnosticModal onClose={() => setShowDiagnosticModal(false)} />}
    </div>
  )
}
