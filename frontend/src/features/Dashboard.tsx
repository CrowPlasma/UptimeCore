/**
 * features/Dashboard.tsx  (v3 — datos reales + layout full-width)
 *
 * - Carga grupos desde la API en el mount y refresca cada 15 segundos
 * - Layout sin max-width restrictivo para aprovechar toda la pantalla
 * - Filtro por tag en dropdown
 * - Estado de carga y error
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, Filter, PlusCircle, RefreshCw, Server, Tag } from 'lucide-react'
import { CheckCircle, XCircle, AlertTriangle, Pause, Wrench } from 'lucide-react'
import { useMonitorStore } from '../store/monitorStore'
import { MonitorCard } from '../components/MonitorCard'
import { MonitorModal } from '../components/MonitorModal'
import type { ModalMode } from '../components/MonitorModal'

// ── Tarjeta de métrica ─────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string
}) {
  return (
    <div style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 14, padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 18,
      boxShadow: 'var(--shadow-card)',
    }}>
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

// ── Dropdown de filtro ─────────────────────────────────────────────────────
function TagFilter({ allTagNames, selected, onChange }: {
  allTagNames: string[]; selected: string; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const label = selected === 'all' ? 'Todas las etiquetas'
    : selected === 'down' ? 'Caídos'
    : selected === 'degraded' ? 'Degradados'
    : selected === 'maintenance' ? 'Mantenimiento'
    : selected === 'paused' ? 'Pausados'
    : selected

  const options = [
    { label: 'Todas las etiquetas', value: 'all', dot: null },
    { label: 'Caídos', value: 'down', dot: '#ef4444' },
    { label: 'Degradados', value: 'degraded', dot: '#f59e0b' },
    { label: 'Mantenimiento', value: 'maintenance', dot: '#3b82f6' },
    { label: 'Pausados', value: 'paused', dot: '#9ca3af' },
    ...allTagNames.map(t => ({ label: t, value: t, isTag: true })),
  ]

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
        borderRadius: 9, border: '1px solid var(--color-border)',
        background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)',
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
            borderRadius: 12, padding: 6, minWidth: 210,
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
export function Dashboard() {
  const { groups, allTags, loading, error, fetchGroups } = useMonitorStore()
    const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [tagFilter, setTagFilter] = useState('all')
  const [modal, setModal] = useState<ModalMode | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Carga inicial + SSE (Real-Time)
  useEffect(() => {
    fetchGroups()

    // 1. Sincronización en tiempo real con buffering para evitar colapso de renders
    const sse = new EventSource('/api/stream')
    let firstOpen = true
    sse.onopen = () => {
      if (!firstOpen) fetchGroups()
      firstOpen = false
    }

    let pendingEvents: any[] = []
    let flushInterval: any = null

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        pendingEvents.push(data)
        
        if (!flushInterval) {
          flushInterval = setTimeout(() => {
            // Mandamos todos los eventos juntos para hacer 1 solo re-render
            useMonitorStore.getState().updateMonitorsLiveBatch(pendingEvents)
            pendingEvents = []
            flushInterval = null
          }, 1000) // Actualiza la UI máximo 1 vez por segundo
        }
      } catch (err) {}
    }

    // 2. Respaldo (fallback polling ultra lento) por si se pierde la conexión
    const interval = setInterval(fetchGroups, 120_000)

    return () => {
      sse.close()
      clearInterval(interval)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchGroups()
    setTimeout(() => setRefreshing(false), 500)
  }, [fetchGroups])

  const allTagNames = useMemo(() => [...new Set(allTags.map(t => t.name))], [allTags])

  const stats = useMemo(() => {
    let up = 0, down = 0, degraded = 0, maintenance = 0, paused = 0;
    groups.forEach(g => {
      g.monitors?.forEach(m => {
        if (m.current_status === 'UP') up++;
        if (m.current_status === 'DOWN') down++;
        if (m.current_status === 'DEGRADED') degraded++;
        if (m.current_status === 'MAINTENANCE') maintenance++;
        if (m.current_status === 'PAUSED' || !m.is_active) paused++;
      })
    });
    return { totalGroups: groups.length, up, down, degraded, maintenance, paused };
  }, [groups])

  const filtered = useMemo(() => groups.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = (() => {
      if (tagFilter === 'all') return true;
      if (tagFilter === 'down') return g.monitors?.some(m => m.current_status === 'DOWN') || g.overall_status === 'DOWN';
      if (tagFilter === 'degraded') return g.overall_status === 'DEGRADED';
      if (tagFilter === 'maintenance') return g.monitors?.some(m => m.current_status === 'MAINTENANCE') || g.overall_status === 'MAINTENANCE';
      if (tagFilter === 'paused') return g.monitors?.some(m => !m.is_active || m.current_status === 'PAUSED') || g.overall_status === 'PAUSED';
      return g.tags?.some(t => t.name === tagFilter);
    })();
    return matchSearch && matchFilter
  }), [groups, search, tagFilter])

  // Paginación para Alta Concurrencia
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filtered.slice(start, start + itemsPerPage)
  }, [filtered, currentPage])
  
  const totalPages = Math.ceil(filtered.length / itemsPerPage)


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
          <StatCard icon={<Server size={22} />}        label="Grupos de monitor"  value={stats.totalGroups}    color="#6366f1" />
          <StatCard icon={<CheckCircle size={22} />}   label="Operativos"         value={stats.up}       color="#22c55e" />
          <StatCard icon={<XCircle size={22} />}       label="Caídos"             value={stats.down}     color="#ef4444" />
          <StatCard icon={<AlertTriangle size={22} />} label="Degradados"         value={stats.degraded} color="#f59e0b" />
          <StatCard icon={<Wrench size={22} />} label="Mantenimiento" value={stats.maintenance} color="#3b82f6" />
          <StatCard icon={<Pause size={22} />} label="En Pausa" value={stats.paused} color="#9ca3af" />
        </div>

        {/* ── Barra de controles ──── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍  Buscar por nombre..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            style={{
              flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 9,
              border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />

          <TagFilter allTagNames={allTagNames} selected={tagFilter} onChange={(v) => { setTagFilter(v); setCurrentPage(1); }} />

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

      {/* ── Lista de grupos ──── */}
      {!loading || groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {filtered.length === 0 && search === "" && !loading ? (
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
          ) : (
            paginatedGroups.map(group => (
              <MonitorCard key={group.id} group={group} onOpenModal={setModal} />
            ))
          )}
        </div>
      ) : null}

      {/* ── Footer ──── */}
      {groups.length > 0 && (
        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
          PingEye Enterprise · {groups.length} grupos · {groups.reduce((a, g) => a + (g.monitors?.length ?? 0), 0)} endpoints · Actualización cada 15s
        </div>
      )}

      {/* ── Modal ──── */}
      {modal && <MonitorModal mode={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
