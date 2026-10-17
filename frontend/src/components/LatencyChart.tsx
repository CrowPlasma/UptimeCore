/**
 * components/LatencyChart.tsx
 * Gráfica de línea de latencia por rango de tiempo.
 * Soporta los rangos: recent | 3h | 6h | 24h | 1w (igual que Uptime Kuma)
 */
import React, { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea,
} from 'recharts'
import type { HistoryPoint, TimeRange } from '../types'

const RANGES: { label: string; value: TimeRange }[] = [
  { label: 'Reciente', value: 'recent' },
  { label: '3h',       value: '3h' },
  { label: '6h',       value: '6h' },
  { label: '24h',      value: '24h' },
  { label: '7d (Sem)', value: '1w' },
  { label: '30d (Mes)', value: '30d' },
]

interface Props {
  /** Todos los puntos del monitor (el padre filtra por range) */
  data: HistoryPoint[]
  onRangeChange?: (range: TimeRange) => void
}

export const LatencyChart = React.memo(function LatencyChart({ data, onRangeChange }: Props) {
  const [range, setRange] = useState<TimeRange>('recent')

  const handleRange = (r: TimeRange) => {
    setRange(r)
    onRangeChange?.(r)
  }

  const formatXAxis = (val: number) => {
    const d = new Date(val)
    if (range === '1w' || range === '30d') {
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Formatear datos para recharts usando timestamps
  const chartData = data.map((p, index) => {
    let timeMs = new Date(p.time).getTime()
    if (index > 0 && new Date(data[index-1].time).getTime() === timeMs) {
       timeMs += 1; // Evitar colisiones exactas en Recharts
    }
    return {
      raw_time: timeMs,
      latency: p.status === 'DOWN' ? 0 : p.latency_ms,
      status: p.status,
    }
  })

  // Identificar bloques continuos
  const maintenanceBlocks: { start: number, end: number }[] = []
  let currentMaint: { start: number, end: number } | null = null

  const downBlocks: { start: number, end: number }[] = []
  let currentDown: { start: number, end: number } | null = null

  chartData.forEach((d) => {
    if (d.status === 'MAINTENANCE') {
      if (!currentMaint) currentMaint = { start: d.raw_time, end: d.raw_time }
      else currentMaint.end = d.raw_time
    } else {
      if (currentMaint) {
        maintenanceBlocks.push(currentMaint)
        currentMaint = null
      }
    }

    if (d.status === 'DOWN') {
      if (!currentDown) currentDown = { start: d.raw_time, end: d.raw_time }
      else currentDown.end = d.raw_time
    } else {
      if (currentDown) {
        downBlocks.push(currentDown)
        currentDown = null
      }
    }
  })
  if (currentMaint) maintenanceBlocks.push(currentMaint)
  if (currentDown) downBlocks.push(currentDown)


  return (
    <div>
      {/* Selector de rango */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--color-text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#22c55e', display: 'inline-block' }} /> Latencia (ms)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f87171', display: 'inline-block' }} /> Ventana Caída
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#60a5fa', display: 'inline-block' }} /> Mantenimiento
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => handleRange(r.value)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                background: range === r.value ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                color: range === r.value ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${range === r.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfica */}
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          {maintenanceBlocks.map((b, i) => (
            <ReferenceArea
              key={`maint-${i}`}
              x1={b.start}
              x2={b.end}
              fill="#bfdbfe"
              fillOpacity={0.4}
            />
          ))}
          {downBlocks.map((b, i) => (
            <ReferenceArea
              key={`down-${i}`}
              x1={b.start}
              x2={b.end}
              fill="#fecaca"
              fillOpacity={0.4}
            />
          ))}
          <XAxis
            dataKey="raw_time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatXAxis}
            tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
            tickLine={false}
            axisLine={false}
            unit="ms"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(label) => new Date(label).toLocaleString('es-MX')}
            formatter={(val: number, _name: string, props: any) => {
              const status = props.payload.status;
              const suffix =
                status === 'MAINTENANCE'
                  ? ' (En Mantenimiento)'
                  : status === 'DOWN'
                  ? ' (Caído)'
                  : status === 'DEGRADED'
                  ? ' (Degradado)'
                  : '';
              return [`${val} ms${suffix}`, 'Latencia'];
            }}
          />
          <Area
            type="monotone"
            dataKey="latency"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#latencyGrad)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#22c55e' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
})
