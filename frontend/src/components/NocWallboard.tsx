/**
 * components/NocWallboard.tsx
 * Modo Pantalla NOC / Wallboard de Alta Densidad.
 * - Muestra todos los grupos en una cuadrícula compacta sin paginación.
 * - Ordena automáticamente por criticidad: DOWN → DEGRADED → MAINTENANCE → UP → PAUSED.
 * - Resalta visualmente los grupos caídos con borde rojo pulsante.
 */
import { useMemo } from 'react'
import { Wrench, Pause, Play, Plus } from 'lucide-react'
import type { MonitorGroup, MonitorStatus } from '../types'
import type { ModalMode } from './MonitorModal'
import { useMonitorStore } from '../store/monitorStore'

interface Props {
  groups: MonitorGroup[]
  onOpenModal: (mode: ModalMode) => void
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
  PAUSED: '#9ca3af',
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

export function NocWallboard({ groups, onOpenModal }: Props) {
  const { toggleGroup, toggleGroupMaintenance, toggleMonitor, toggleMaintenance } = useMonitorStore()

  // Ordenar siempre por severidad en Modo NOC
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.overall_status] ?? 4
      const pb = STATUS_PRIORITY[b.overall_status] ?? 4
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name)
    })
  }, [groups])

  return (
    <div>
      <style>{`
        @keyframes nocPulseRed {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45), inset 0 0 18px rgba(239, 68, 68, 0.12); }
          50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0), inset 0 0 28px rgba(239, 68, 68, 0.22); }
        }
      `}</style>

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
                <div style={{ minWidth: 0, flex: 1 }}>
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
                        onClick={() => toggleGroupMaintenance(group.id, !allGroupMaint)}
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
                        onClick={() => toggleGroup(group.id, allGroupPaused)}
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
                    const isPaused = !m.is_active || m.current_status === 'PAUSED'
                    const isMaint = m.is_active && (m.is_maintenance || m.current_status === 'MAINTENANCE')
                    const mStatus: MonitorStatus = isPaused
                      ? 'PAUSED'
                      : isMaint
                      ? 'MAINTENANCE'
                      : (m.current_status || 'UNKNOWN')
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
                          onClick={() => onOpenModal({ type: 'edit_monitor', group, monitor: m })}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1, cursor: 'pointer' }}
                          title={`${m.name} (${m.type}: ${m.target}) — Click para editar`}
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
                            onClick={() => toggleMaintenance(group.id, m.id, !m.is_maintenance)}
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
                            onClick={() => toggleMonitor(group.id, m.id, !m.is_active)}
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
    </div>
  )
}
