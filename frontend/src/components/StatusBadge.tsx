/**
 * components/StatusBadge.tsx
 * Componente reutilizable: badge de color con el estado de un monitor.
 * Verde = UP | Rojo = DOWN | Amarillo = DEGRADED | Gris = UNKNOWN/PAUSED
 */
import type { MonitorStatus } from '../types'
import { Loader2 } from 'lucide-react'

const statusConfig: Record<MonitorStatus, { label: string; bg: string; dot: string }> = {
  UP:       { label: 'UP',      bg: '#22c55e25', dot: '#22c55e' },
  DOWN:     { label: 'DOWN',    bg: '#ef444425', dot: '#ef4444' },
  DEGRADED: { label: 'DEGRAD.', bg: '#f59e0b25', dot: '#f59e0b' },
  UNKNOWN:  { label: 'UNKNWN', bg: '#9ca3af25', dot: '#9ca3af' },
  PAUSED:   { label: 'PAUSADO', bg: '#6366f125', dot: '#6366f1' },
  MAINTENANCE: { label: 'MANTENIMIENTO', bg: '#3b82f625', dot: '#3b82f6' }, // Blue color for Maintenance
}

interface Props {
  status: MonitorStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const cfg = statusConfig[status] ?? statusConfig.UNKNOWN
  const fontSize = size === 'sm' ? '10px' : '12px'
  const padding = size === 'sm' ? '2px 7px' : '3px 10px'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: cfg.bg,
      borderRadius: 999,
      padding,
      fontSize,
      fontWeight: 700,
      letterSpacing: '0.04em',
      color: cfg.dot,
    }}>
      {status === 'UNKNOWN' ? (
        <Loader2 size={size === 'sm' ? 10 : 12} color={cfg.dot} className="animate-spin" />
      ) : (
        <span style={{
          width: size === 'sm' ? 6 : 8,
          height: size === 'sm' ? 6 : 8,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
          animation: status === 'UP' ? 'pulse 2s infinite' : 'none',
        }} />
      )}
      {cfg.label}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </span>
  )
}
