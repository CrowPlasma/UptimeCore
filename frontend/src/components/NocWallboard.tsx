/**
 * components/NocWallboard.tsx
 * Modo Pantalla NOC / Wallboard con 2 Vistas seleccionables:
 *  1. "mosaic" (NOC Mosaico PRTG): Vista ultra-compacta de "cuadritos" estilo PRTG
 *     (Por Grupos o Todos los Sensores). Al hacer clic en cualquier cuadrito abre
 *     la tarjeta de inspección rápida con detalles del grupo y sus sensores.
 *  2. "cards"  (NOC Tarjetas): Tarjetas compactas con lista de endpoints por grupo.
 */
import { useState, useMemo } from 'react'
import { Wrench, Pause, Play, Plus, LayoutGrid, Grid, Layers, X, Pencil } from 'lucide-react'
import type { MonitorGroup, Monitor, MonitorStatus } from '../types'
import type { ModalMode } from './MonitorModal'
import { useMonitorStore } from '../store/monitorStore'

export type NocViewType = 'cards' | 'mosaic'

interface Props {
  groups: MonitorGroup[]
  onOpenModal: (mode: ModalMode) => void
  viewType?: NocViewType
  onChangeViewType?: (v: NocViewType) => void
}

const STATUS_PRIORITY: Record<string, number> = {
  DOWN: 0,
  DEGRADED: 1,
  MAINTENANCE: 2,
  UP: 3,
  UNKNOWN: 4,
  PAUSED: 5,
}

const STATUS_COLOR: Record<MonitorStatus, string> = {
  UP: '#22c55e',
  DOWN: '#ef4444',
  DEGRADED: '#f59e0b',
  MAINTENANCE: '#3b82f6',
  PAUSED: '#64748b',
  UNKNOWN: '#6b7280',
}

const STATUS_LABEL: Record<MonitorStatus, string> = {
  UP: 'OPERATIVO',
  DOWN: 'CAÍDO',
  DEGRADED: 'DEGRADADO',
  MAINTENANCE: 'MANTENIMIENTO',
  PAUSED: 'PAUSADO',
  UNKNOWN: 'DESCONOCIDO',
}

function getMonitorEffectiveStatus(m: Monitor): MonitorStatus {
  if (!m.is_active || m.current_status === 'PAUSED') return 'PAUSED'
  if (m.is_maintenance || m.current_status === 'MAINTENANCE') return 'MAINTENANCE'
  return m.current_status || 'UNKNOWN'
}

export function NocWallboard({ groups, onOpenModal, viewType: externalView, onChangeViewType }: Props) {
  const { toggleGroup, toggleGroupMaintenance, toggleMonitor, toggleMaintenance } = useMonitorStore()

  const [internalView, setInternalView] = useState<NocViewType>(() => {
    try {
      return (localStorage.getItem('uptimecore_noc_subview') as NocViewType) || 'mosaic'
    } catch {
      return 'mosaic'
    }
  })

  const activeView = externalView ?? internalView
  const setView = (v: NocViewType) => {
    setInternalView(v)
    try { localStorage.setItem('uptimecore_noc_subview', v) } catch {}
    onChangeViewType?.(v)
  }

  // En modo Mosaico PRTG: permite ver cuadritos por Grupo o todos los Endpoints individuales
  const [mosaicGranularity, setMosaicGranularity] = useState<'groups' | 'endpoints'>('groups')
  // Grupo y sensor seleccionados al hacer clic en un cuadrito del mosaico para inspección rápida
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null)

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.overall_status] ?? 4
      const pb = STATUS_PRIORITY[b.overall_status] ?? 4
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name)
    })
  }, [groups])

  const allEndpoints = useMemo(() => {
    const list: { group: MonitorGroup; monitor: Monitor; status: MonitorStatus }[] = []
    sortedGroups.forEach(g => {
      ;(g.monitors ?? []).forEach(m => {
        list.push({ group: g, monitor: m, status: getMonitorEffectiveStatus(m) })
      })
    })
    return list.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 4
      const pb = STATUS_PRIORITY[b.status] ?? 4
      if (pa !== pb) return pa - pb
      return a.group.name.localeCompare(b.group.name)
    })
  }, [sortedGroups])

  const inspectedGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  )

  const closeInspector = () => {
    setSelectedGroupId(null)
    setSelectedMonitorId(null)
  }

  return (
    <div>
      <style>{`
        @keyframes nocPulseRed {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55), inset 0 0 18px rgba(239, 68, 68, 0.25); }
          50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0), inset 0 0 28px rgba(239, 68, 68, 0.4); }
        }
        @keyframes tilePulseRed {
          0%, 100% { transform: scale(1); box-shadow: 0 0 12px rgba(239, 68, 68, 0.65); }
          50% { transform: scale(1.02); box-shadow: 0 0 22px rgba(239, 68, 68, 0.95); }
        }
      `}</style>

      {/* Sub-barra de control del Modo NOC */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
        padding: '10px 16px',
        borderRadius: 12,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tipo de Vista NOC:
          </span>

          <div style={{
            display: 'flex', gap: 4, background: 'var(--color-bg-primary)',
            padding: 4, borderRadius: 9, border: '1px solid var(--color-border)',
          }}>
            <button
              type="button"
              onClick={() => setView('mosaic')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 6, border: 'none',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: activeView === 'mosaic' ? 'var(--color-accent)' : 'transparent',
                color: activeView === 'mosaic' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              <Grid size={14} />
              Mosaico PRTG (Cuadritos)
            </button>
            <button
              type="button"
              onClick={() => setView('cards')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 6, border: 'none',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: activeView === 'cards' ? 'var(--color-accent)' : 'transparent',
                color: activeView === 'cards' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              <LayoutGrid size={14} />
              Tarjetas NOC (Detallado)
            </button>
          </div>

          {activeView === 'mosaic' && (
            <div style={{
              display: 'flex', gap: 4, background: 'var(--color-bg-primary)',
              padding: 4, borderRadius: 9, border: '1px solid var(--color-border)',
            }}>
              <button
                type="button"
                onClick={() => setMosaicGranularity('groups')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 6, border: 'none',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  background: mosaicGranularity === 'groups' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: mosaicGranularity === 'groups' ? '#818cf8' : 'var(--color-text-muted)',
                }}
              >
                <Layers size={13} />
                Por Grupos ({sortedGroups.length})
              </button>
              <button
                type="button"
                onClick={() => setMosaicGranularity('endpoints')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 6, border: 'none',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  background: mosaicGranularity === 'endpoints' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: mosaicGranularity === 'endpoints' ? '#818cf8' : 'var(--color-text-muted)',
                }}
              >
                <Grid size={13} />
                Todos los Sensores ({allEndpoints.length})
              </button>
            </div>
          )}
        </div>

        {/* Leyenda rápida estilo PRTG */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
          <LegendDot color="#ef4444" label="Caído" />
          <LegendDot color="#f59e0b" label="Degradado" />
          <LegendDot color="#22c55e" label="Operativo" />
          <LegendDot color="#3b82f6" label="Mantenimiento" />
          <LegendDot color="#64748b" label="Pausa" />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          VISTA 1: MOSAICO PRTG (CUADRITOS DE ALTA DENSIDAD SIN SCROLL)
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeView === 'mosaic' && mosaicGranularity === 'groups' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
          gap: 8,
        }}>
          {sortedGroups.map(group => {
            const st = group.overall_status || 'UNKNOWN'
            const monitors = group.monitors ?? []
            const downCount = monitors.filter(m => getMonitorEffectiveStatus(m) === 'DOWN').length
            const upCount = monitors.filter(m => getMonitorEffectiveStatus(m) === 'UP').length

            const tileStyle = getPrtgTileColors(st)

            return (
              <div
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id)
                  setSelectedMonitorId(null)
                }}
                title={`${group.name} — Estado: ${STATUS_LABEL[st]} (${upCount}/${monitors.length} UP). Clic para ver detalle del grupo.`}
                style={{
                  background: tileStyle.bg,
                  border: `1.5px solid ${tileStyle.border}`,
                  borderRadius: 8,
                  padding: '8px 9px',
                  minHeight: 74,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  animation: st === 'DOWN' ? 'tilePulseRed 1.8s infinite' : 'none',
                  transition: 'transform 0.12s ease, filter 0.12s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Nombre del grupo compacto */}
                <div style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1.2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                  wordBreak: 'break-word',
                }}>
                  {group.name}
                </div>

                {/* Mini cuadritos internos por cada endpoint del grupo + contador */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: '72%' }}>
                    {monitors.map(m => {
                      const ms = getMonitorEffectiveStatus(m)
                      return (
                        <span
                          key={m.id}
                          title={`${m.name}: ${ms}`}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: STATUS_COLOR[ms],
                            border: '1px solid rgba(255,255,255,0.65)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                          }}
                        />
                      )
                    })}
                  </div>

                  <span style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#fff',
                    background: 'rgba(0,0,0,0.28)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}>
                    {downCount > 0 ? `${downCount} DOWN` : `${upCount}/${monitors.length}`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mosaico PRTG por Sensores / Endpoints individuales */}
      {activeView === 'mosaic' && mosaicGranularity === 'endpoints' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
          gap: 6,
        }}>
          {allEndpoints.map(({ group, monitor: m, status: st }) => {
            const tileStyle = getPrtgTileColors(st)
            return (
              <div
                key={m.id}
                onClick={() => {
                  // Abre el mismo inspector detallado de grupo resaltando el sensor seleccionado
                  setSelectedGroupId(group.id)
                  setSelectedMonitorId(m.id)
                }}
                title={`Grupo: ${group.name}\nSensor: ${m.name}\nDestino: ${m.target}\nEstado: ${STATUS_LABEL[st]} (${m.current_latency_ms ?? 0}ms)\nClic para ver detalles`}
                style={{
                  background: tileStyle.bg,
                  border: `1.5px solid ${tileStyle.border}`,
                  borderRadius: 7,
                  padding: '6px 8px',
                  minHeight: 62,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  animation: st === 'DOWN' ? 'tilePulseRed 1.8s infinite' : 'none',
                }}
              >
                <div>
                  <div style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.82)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {group.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 1,
                    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}>
                    {m.name}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{
                    fontSize: 8.5,
                    fontWeight: 800,
                    color: '#fff',
                    background: 'rgba(0,0,0,0.28)',
                    padding: '1px 4px',
                    borderRadius: 3,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {m.type}
                  </span>
                  <span style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    color: '#fff',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {st === 'PAUSED' ? 'PAUSA'
                      : st === 'MAINTENANCE' ? 'MANT'
                      : st === 'DOWN' ? 'DOWN'
                      : `${m.current_latency_ms ?? 0}ms`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal rápido de inspección de Grupo y Sensores al hacer clic en cualquier cuadrito del Mosaico PRTG */}
      {inspectedGroup && (
        <>
          <div
            onClick={closeInspector}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(3px)', zIndex: 210,
            }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 211,
            width: 'min(580px, 95vw)',
            background: 'var(--color-bg-card)',
            border: `2px solid ${STATUS_COLOR[inspectedGroup.overall_status || 'UNKNOWN']}`,
            borderRadius: 14,
            padding: '20px 22px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                    {inspectedGroup.name}
                  </span>
                  {inspectedGroup.tags?.map(t => (
                    <span key={t.id} style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                      background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}44`,
                    }}>
                      {t.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                  Estado del grupo: <strong style={{ color: STATUS_COLOR[inspectedGroup.overall_status || 'UNKNOWN'] }}>
                    {STATUS_LABEL[inspectedGroup.overall_status || 'UNKNOWN']}
                  </strong>
                  {inspectedGroup.description ? ` · ${inspectedGroup.description}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => toggleGroupMaintenance(inspectedGroup.id)}
                  title="Alternar Mantenimiento en todo el grupo"
                  style={{
                    padding: '6px 10px', borderRadius: 7, border: '1px solid #3b82f6',
                    background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                    fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Wrench size={12} /> Mant. Grupo
                </button>
                <button
                  onClick={() => toggleGroup(inspectedGroup.id)}
                  title="Pausar o Reanudar todo el grupo"
                  style={{
                    padding: '6px 10px', borderRadius: 7, border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)',
                    fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Pause size={12} /> Pausa Grupo
                </button>
                <button
                  onClick={() => {
                    const g = inspectedGroup
                    closeInspector()
                    onOpenModal({ type: 'edit_group', group: g })
                  }}
                  title="Editar Grupo"
                  style={{
                    width: 30, height: 30, borderRadius: 7, border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={closeInspector}
                  style={{
                    width: 30, height: 30, borderRadius: 7, border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-primary)', color: 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '62vh', overflowY: 'auto' }}>
              {(inspectedGroup.monitors ?? []).map(m => {
                const st = getMonitorEffectiveStatus(m)
                const col = STATUS_COLOR[st]
                const isPaused = st === 'PAUSED'
                const isMaint = st === 'MAINTENANCE'
                const isSelectedSensor = selectedMonitorId === m.id
                const history = (m.live_history || []).slice(-24)

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: isSelectedSensor
                        ? 'rgba(99, 102, 241, 0.10)'
                        : 'var(--color-bg-primary)',
                      border: isSelectedSensor
                        ? '2px solid var(--color-accent)'
                        : `1px solid ${st === 'DOWN' ? '#ef4444' : 'var(--color-border)'}`,
                      boxShadow: isSelectedSensor ? '0 0 0 3px rgba(99, 102, 241, 0.18)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: col, flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>{m.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {m.type}
                          </span>
                          {isSelectedSensor && (
                            <span style={{
                              fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99,
                              background: 'var(--color-accent)', color: '#fff',
                            }}>
                              Sensor seleccionado
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 3, paddingLeft: 16, wordBreak: 'break-all' }}>
                          {m.target}{m.port ? `:${m.port}` : ''} · cada {m.interval_seconds}s ({m.retries} reintentos)
                        </div>
                        {m.current_msg && (
                          <div style={{ fontSize: 11.5, color: st === 'DOWN' ? '#f87171' : '#fbbf24', fontFamily: "'JetBrains Mono', monospace", marginTop: 2, paddingLeft: 16, wordBreak: 'break-all' }}>
                            {m.current_msg}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: col, marginRight: 2 }}>
                          {isPaused ? 'PAUSA' : isMaint ? 'MANT.' : st === 'DOWN' ? 'CAÍDO' : `${m.current_latency_ms ?? 0}ms`}
                        </span>
                        <button
                          onClick={() => toggleMaintenance(inspectedGroup.id, m.id)}
                          title="Alternar Mantenimiento"
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            border: isMaint ? '1px solid #3b82f6' : '1px solid var(--color-border)',
                            background: isMaint ? 'rgba(59,130,246,0.2)' : 'var(--color-bg-card)',
                            color: isMaint ? '#60a5fa' : 'var(--color-text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          }}
                        >
                          <Wrench size={12} />
                        </button>
                        <button
                          onClick={() => toggleMonitor(inspectedGroup.id, m.id)}
                          title={isPaused ? 'Reanudar' : 'Pausar'}
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            border: isPaused ? '1px solid #22c55e' : '1px solid var(--color-border)',
                            background: isPaused ? 'rgba(34,197,94,0.2)' : 'var(--color-bg-card)',
                            color: isPaused ? '#4ade80' : 'var(--color-text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          }}
                        >
                          {isPaused ? <Play size={12} /> : <Pause size={12} />}
                        </button>
                        <button
                          onClick={() => {
                            const g = inspectedGroup
                            closeInspector()
                            onOpenModal({ type: 'edit_monitor', group: g, monitor: m })
                          }}
                          title="Editar configuración del sensor"
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-card)',
                            color: 'var(--color-text-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Mini barra de historial reciente del sensor */}
                    {history.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 16 }}>
                        {history.map((pt, idx) => {
                          const ptColor = STATUS_COLOR[pt.status] || '#6b7280'
                          return (
                            <span
                              key={idx}
                              title={`${new Date(pt.time).toLocaleTimeString()} — ${pt.status} (${pt.latency_ms}ms)`}
                              style={{
                                flex: 1,
                                height: 6,
                                maxWidth: 14,
                                borderRadius: 2,
                                background: ptColor,
                                opacity: 0.85,
                              }}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VISTA 2: NOC TARJETAS (DETALLADO POR GRUPO)
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeView === 'cards' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
          gap: 14,
        }}>
          {sortedGroups.map(group => {
            const st = group.overall_status || 'UNKNOWN'
            const color = STATUS_COLOR[st] || '#6b7280'
            const isDown = st === 'DOWN'
            const isDegraded = st === 'DEGRADED'
            const monitors = group.monitors ?? []

            const allGroupPaused = monitors.length > 0 && monitors.every(m => !m.is_active || m.current_status === 'PAUSED')
            const allGroupMaint = monitors.length > 0 && monitors.every(m => m.is_active && (m.is_maintenance || m.current_status === 'MAINTENANCE'))

            return (
              <div
                key={group.id}
                style={{
                  background: isDown
                    ? 'linear-gradient(180deg, rgba(239,68,68,0.11) 0%, var(--color-bg-card) 100%)'
                    : isDegraded
                    ? 'linear-gradient(180deg, rgba(245,158,11,0.09) 0%, var(--color-bg-card) 100%)'
                    : 'var(--color-bg-card)',
                  border: isDown
                    ? '2px solid #ef4444'
                    : isDegraded
                    ? '1.5px solid #f59e0b'
                    : `1px solid var(--color-border)`,
                  borderLeft: `5px solid ${color}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  animation: isDown ? 'nocPulseRed 2s infinite' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Encabezado compacto del grupo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => { setSelectedGroupId(group.id); setSelectedMonitorId(null) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: color,
                        boxShadow: isDown || st === 'UP' ? `0 0 8px ${color}` : 'none',
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={group.name}>
                        {group.name}
                      </span>
                    </div>
                    {group.tags && group.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {group.tags.map(t => (
                          <span key={t.id} style={{
                            fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                            background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}44`,
                          }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Controles rápidos de grupo + badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {monitors.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleGroupMaintenance(group.id)}
                          title={allGroupMaint ? 'Quitar Mantenimiento del Grupo' : 'Poner Grupo en Mantenimiento'}
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: allGroupMaint ? '1px solid #3b82f6' : '1px solid var(--color-border)',
                            background: allGroupMaint ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-bg-primary)',
                            color: allGroupMaint ? '#60a5fa' : 'var(--color-text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          <Wrench size={11} />
                        </button>
                        <button
                          onClick={() => toggleGroup(group.id)}
                          title={allGroupPaused ? 'Reanudar Grupo' : 'Pausar Grupo'}
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: allGroupPaused ? '1px solid #22c55e' : '1px solid var(--color-border)',
                            background: allGroupPaused ? 'rgba(34, 197, 94, 0.2)' : 'var(--color-bg-primary)',
                            color: allGroupPaused ? '#4ade80' : 'var(--color-text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {allGroupPaused ? <Play size={11} /> : <Pause size={11} />}
                        </button>
                      </>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
                      background: `${color}20`, color, border: `1px solid ${color}45`,
                      letterSpacing: '0.03em',
                    }}>
                      {STATUS_LABEL[st]}
                    </span>
                  </div>
                </div>

                {/* Lista densa de endpoints */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {monitors.length === 0 ? (
                    <div style={{
                      fontSize: 11.5, color: 'var(--color-text-muted)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 6px',
                    }}>
                      <span>Sin endpoints</span>
                      <button
                        onClick={() => onOpenModal({ type: 'new_monitor', group })}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 11, color: 'var(--color-accent)', background: 'transparent',
                          border: 'none', cursor: 'pointer', fontWeight: 700,
                        }}
                      >
                        <Plus size={12} /> Añadir
                      </button>
                    </div>
                  ) : (
                    monitors.map(m => {
                      const mStatus = getMonitorEffectiveStatus(m)
                      const isPaused = mStatus === 'PAUSED'
                      const isMaint = mStatus === 'MAINTENANCE'
                      const mColor = STATUS_COLOR[mStatus] || '#6b7280'

                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '5px 8px',
                            borderRadius: 7,
                            background: mStatus === 'DOWN'
                              ? 'rgba(239, 68, 68, 0.14)'
                              : mStatus === 'DEGRADED'
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'var(--color-bg-primary)',
                            border: mStatus === 'DOWN'
                              ? '1px solid rgba(239, 68, 68, 0.45)'
                              : '1px solid var(--color-border)',
                            opacity: isPaused ? 0.65 : 1,
                          }}
                        >
                          <div
                            onClick={() => {
                              setSelectedGroupId(group.id)
                              setSelectedMonitorId(m.id)
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1, cursor: 'pointer' }}
                            title={`${m.name} (${m.type}: ${m.target}) — Clic para ver detalle`}
                          >
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: mColor, flexShrink: 0,
                            }} />
                            <span style={{
                              fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {m.name}
                            </span>
                            <span style={{
                              fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 4,
                              background: 'var(--color-bg-card)', color: 'var(--color-text-muted)',
                              fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
                            }}>
                              {m.type}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 11,
                              fontWeight: 700,
                              color: mStatus === 'DOWN' ? '#ef4444'
                                : mStatus === 'DEGRADED' ? '#f59e0b'
                                : mStatus === 'MAINTENANCE' ? '#60a5fa'
                                : mStatus === 'PAUSED' ? '#9ca3af'
                                : '#22c55e',
                            }}>
                              {isPaused ? 'PAUSA'
                                : isMaint ? 'MANT.'
                                : mStatus === 'DOWN' ? 'DOWN'
                                : `${m.current_latency_ms ?? 0}ms`}
                            </span>

                            <button
                              onClick={() => toggleMaintenance(group.id, m.id)}
                              title={m.is_maintenance ? 'Salir de Mantenimiento' : 'Mantenimiento'}
                              style={{
                                width: 20, height: 20, borderRadius: 4, border: 'none',
                                background: isMaint ? 'rgba(59,130,246,0.25)' : 'transparent',
                                color: isMaint ? '#60a5fa' : 'var(--color-text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Wrench size={10} />
                            </button>
                            <button
                              onClick={() => toggleMonitor(group.id, m.id)}
                              title={m.is_active ? 'Pausar' : 'Reanudar'}
                              style={{
                                width: 20, height: 20, borderRadius: 4, border: 'none',
                                background: isPaused ? 'rgba(34,197,94,0.2)' : 'transparent',
                                color: isPaused ? '#4ade80' : 'var(--color-text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              {m.is_active ? <Pause size={10} /> : <Play size={10} />}
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getPrtgTileColors(status: MonitorStatus): { bg: string; border: string } {
  switch (status) {
    case 'DOWN':
      return {
        bg: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
        border: '#f87171',
      }
    case 'DEGRADED':
      return {
        bg: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
        border: '#fbbf24',
      }
    case 'UP':
      return {
        bg: 'linear-gradient(135deg, #16a34a 0%, #14532d 100%)',
        border: '#4ade80',
      }
    case 'MAINTENANCE':
      return {
        bg: 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)',
        border: '#60a5fa',
      }
    case 'PAUSED':
      return {
        bg: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
        border: '#94a3b8',
      }
    default:
      return {
        bg: 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)',
        border: '#9ca3af',
      }
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {label}
    </span>
  )
}
