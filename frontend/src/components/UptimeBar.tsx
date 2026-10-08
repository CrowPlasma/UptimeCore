/**
 * components/UptimeBar.tsx
 * Barra de historial de estado estilo Uptime Kuma.
 * Muestra N barras verticales coloreadas representando el estado en el tiempo.
 */
import React from 'react'
import type { HistoryPoint } from '../types'

const COLOR: Record<string, string> = {
  UP:       '#34d399',
  DOWN:     '#f87171',
  DEGRADED: '#f59e0b',
  MAINTENANCE: '#60a5fa', // Blue
  UNKNOWN:  '#6b7280',
}

interface Props {
  history: HistoryPoint[]
  /** Número máximo de barras a renderizar */
  maxBars?: number
}

export const UptimeBar = React.memo(function UptimeBar({ history, maxBars = 60 }: Props) {
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
      gap: 3,
      alignItems: 'flex-end',
      height: 28,
      width: '100%',
    }}>
      {padded.map((p, i) => {
        const color = p ? (COLOR[p.status] ?? COLOR.UNKNOWN) : '#e2e8f0'
        const title = p
          ? `${new Date(p.time).toLocaleTimeString()} · ${p.status} · ${p.latency_ms}ms`
          : 'Sin datos'
        return (
          <div
            key={i}
            title={title}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 6,
              background: color,
              opacity: p ? 1 : 0.25,
              cursor: 'default',
              transition: 'opacity 0.15s',
            }}
          />
        )
      })}
    </div>
  )
}
