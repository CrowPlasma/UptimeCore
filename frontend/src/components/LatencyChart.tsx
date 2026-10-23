/**
 * components/LatencyChart.tsx
 * Gráfica de línea de latencia por rango de tiempo con dominio temporal estricto.
 * Soporta los rangos: recent (90m) | 3h | 6h | 24h | 1w (7d) | 30d
 * Plataforma: UptimeCore
 */
import React, { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea,
} from 'recharts'
import type { HistoryPoint, TimeRange } from '../types'
import { useTranslation } from '../i18n'

const RANGE_DURATIONS_MS: Record<TimeRange, number> = {
  recent: 90 * 60 * 1000,
  '3h': 3 * 3600 * 1000,
  '6h': 6 * 3600 * 1000,
  '24h': 24 * 3600 * 1000,
  '1w': 7 * 86400 * 1000,
  '30d': 30 * 86400 * 1000,
}

interface Props {
  /** Todos los puntos del monitor en el rango */
  data: HistoryPoint[]
  /** Rango activo controlado por el padre */
  range?: TimeRange
  onRangeChange?: (range: TimeRange) => void
}

export const LatencyChart = React.memo(function LatencyChart({ data, range: propRange, onRangeChange }: Props) {
  const { t, locale } = useTranslation()
  const [internalRange, setInternalRange] = useState<TimeRange>(propRange || 'recent')
  const activeRange = propRange || internalRange

  const ranges = useMemo(() => [
    { label: t.monitor.rangeRecent, value: 'recent' as TimeRange },
    { label: t.monitor.range3h,     value: '3h' as TimeRange },
    { label: t.monitor.range6h,     value: '6h' as TimeRange },
    { label: t.monitor.range24h,    value: '24h' as TimeRange },
    { label: t.monitor.range7d,     value: '1w' as TimeRange },
    { label: t.monitor.range30d,    value: '30d' as TimeRange },
  ], [t])

  const handleRange = (r: TimeRange) => {
    setInternalRange(r)
    onRangeChange?.(r)
  }

  // Dominio temporal estricto: el eje X SIEMPRE abarca la duración total del filtro
  const nowMs = Date.now()
  const durationMs = RANGE_DURATIONS_MS[activeRange] || 90 * 60 * 1000
  const endMs = Math.max(nowMs, data.length > 0 ? new Date(data[data.length - 1].time).getTime() : nowMs)
  const startMs = endMs - durationMs

  const formatXAxis = (val: number) => {
    const d = new Date(val)
    if (activeRange === '30d') {
      return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
    }
    if (activeRange === '1w') {
      return (
        d.toLocaleDateString(locale, { day: '2-digit', month: 'short' }) +
        ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      )
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Formatear datos para recharts usando timestamps numéricos
  const chartData = data.map((p, index) => {
    let timeMs = new Date(p.time).getTime()
    if (index > 0 && new Date(data[index - 1].time).getTime() === timeMs) {
      timeMs += 1 // Evitar colisiones exactas en Recharts
    }
    return {
      raw_time: timeMs,
      latency: p.status === 'DOWN' ? 0 : p.status === 'UNKNOWN' ? null : p.latency_ms,
      status: p.status,
    }
  })

  // Identificar bloques continuos de mantenimiento y caídas
  const maintenanceBlocks: { start: number; end: number }[] = []
  let currentMaint: { start: number; end: number } | null = null

  const downBlocks: { start: number; end: number }[] = []
  let currentDown: { start: number; end: number } | null = null

  chartData.forEach(d => {
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
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#22c55e', display: 'inline-block' }} /> {t.chart.latencyMs}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f87171', display: 'inline-block' }} /> {t.chart.outageWindow}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#60a5fa', display: 'inline-block' }} /> {t.chart.maintenanceWindow}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ranges.map(r => (
            <button
              key={r.value}
              onClick={() => handleRange(r.value)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeRange === r.value ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                color: activeRange === r.value ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${activeRange === r.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfica con eje X proporcional al periodo completo */}
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
            domain={[startMs, endMs]}
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
            labelFormatter={(label: any) => (label ? new Date(label).toLocaleString(locale) : '')}
            formatter={(val: any, _name: any, props: any) => {
              const status = props?.payload?.status
              if (status === 'UNKNOWN' || val == null) {
                return [t.chart.noDataPoint, t.chart.statusLabel]
              }
              const suffix =
                status === 'MAINTENANCE'
                  ? t.chart.suffixMaint
                  : status === 'DOWN'
                  ? t.chart.suffixDown
                  : status === 'DEGRADED'
                  ? t.chart.suffixDegraded
                  : ''
              return [`${val} ms${suffix}`, t.chart.latencyLabel]
            }}
          />
          <Area
            type="monotone"
            dataKey="latency"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#latencyGrad)"
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#22c55e' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
})
