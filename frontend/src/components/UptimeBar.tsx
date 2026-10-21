/**
 * components/UptimeBar.tsx
 * Barra de historial de estado estilo Uptime Kuma / NOC.
 * Muestra N barras verticales esbeltas y proporcionadas representando el estado en el tiempo.
 */
import React from 'react'
import type { HistoryPoint } from '../types'

const COLOR: Record<string, string> = {
  UP:          '#22c55e',
  DOWN:        '#ef4444',
  DEGRADED:    '#f59e0b',
  MAINTENANCE: '#3b82f6', // Blue
  PAUSED:      '#6366f1', // Indigo
  UNKNOWN:     '#64748b',
}

interface Props {
  history: HistoryPoint[]
  /** Número máximo de barras a renderizar (homologado a 36 barras esbeltas) */
  maxBars?: number
}

export const UptimeBar = React.memo(function UptimeBar({ history, maxBars = 36 }: Props) {
  // Tomar los últimos N puntos
  const points = history.slice(-maxBars)

  // Rellenar con barras vacías (UNKNOWN) al principio si hay menos datos que maxBars
  const padded: Array<HistoryPoint | null> = [
    ...Array(Math.max(0, maxBars - points.length)).fill(null),
    ...points,
  ]

  return (
    <div style={{
      display: 'flex',
      gap: 3.5,
      alignItems: 'center',
      height: 22,
      width: '100%',
    }}>
      {padded.map((p, i) => {
        const isNewest = i === padded.length - 1 && p != null
        const color = p ? (COLOR[p.status] ?? COLOR.UNKNOWN) : 'rgba(148, 163, 184, 0.22)'
        const title = p
          ? `${new Date(p.time).toLocaleTimeString()} · ${p.status} · ${p.latency_ms}ms`
          : 'Sin datos'
        return (
          <div
            key={p ? `${p.time}-${i}` : `empty-${i}`}
            title={title}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 3.5,
              background: color,
              opacity: p ? 1 : 0.28,
              cursor: 'default',
              transition: 'opacity 0.2s ease, box-shadow 0.2s ease',
              boxShadow: isNewest ? `0 0 7px ${color}90` : 'none',
            }}
          />
        )
      })}
    </div>
  )
})
