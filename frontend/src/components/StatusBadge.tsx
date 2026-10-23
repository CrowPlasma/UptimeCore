/**
 * components/StatusBadge.tsx
 * Componente reutilizable: badge de color con el estado de un monitor.
 * Verde = UP | Rojo = DOWN | Amarillo = DEGRADED | Gris = UNKNOWN/PAUSED
 */
import React from 'react'
import type { MonitorStatus } from '../types'
import { Loader2 } from 'lucide-react'
import { useI18nStore } from '../i18n'

const statusStyle: Record<MonitorStatus, { bg: string; dot: string }> = {
  UP:          { bg: '#22c55e25', dot: '#22c55e' },
  DOWN:        { bg: '#ef444425', dot: '#ef4444' },
  DEGRADED:    { bg: '#f59e0b25', dot: '#f59e0b' },
  UNKNOWN:     { bg: '#9ca3af25', dot: '#9ca3af' },
  PAUSED:      { bg: '#6366f125', dot: '#6366f1' },
  MAINTENANCE: { bg: '#3b82f625', dot: '#3b82f6' },
}

interface Props {
  status: MonitorStatus
  size?: 'sm' | 'md'
}

export const StatusBadge = React.memo(function StatusBadge({ status, size = 'md' }: Props) {
  const isEn = useI18nStore(s => s.language === 'en')
  const cfg = statusStyle[status] ?? statusStyle.UNKNOWN
  const fontSize = size === 'sm' ? '10px' : '12px'
  const padding = size === 'sm' ? '2px 7px' : '3px 10px'

  const label =
    status === 'UP' ? 'UP' :
    status === 'DOWN' ? 'DOWN' :
    status === 'DEGRADED' ? 'DEGRAD.' :
    status === 'PAUSED' ? (isEn ? 'PAUSED' : 'PAUSADO') :
    status === 'MAINTENANCE' ? (isEn ? 'MAINT.' : 'MANT.') :
    (isEn ? 'UNKNWN' : 'DESCON.')

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
      {label}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </span>
  )
})
