/**
 * components/SlaReportModal.tsx
 * Generador Ejecutivo de Reportes de SLA y Disponibilidad de Red
 * Formatos: Vista Previa Ejecutiva, Impresión / PDF Aislado (Exacto 1 página) y Excel / CSV.
 * Plataforma: UptimeCore
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  X,
  Printer,
  Download,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Activity,
  CheckCircle2,
  FileSpreadsheet,
  Server,
  Zap,
  Info,
} from 'lucide-react'
import type { MonitorGroup } from '../types'
import { useMonitorStore } from '../store/monitorStore'

export interface SlaReportMonitor {
  monitor_id: number
  monitor_name: string
  type: string
  target: string
  group_id: number | null
  group_name: string
  total_samples: number
  up_samples: number
  down_samples: number
  degraded_samples: number
  maint_samples: number
  availability_pct: number
  uptime_seconds: number
  downtime_seconds: number
  outages_count: number
  avg_latency_ms: number
  p95_latency_ms: number
  max_latency_ms: number
  mttr_seconds: number
  mtbf_seconds: number
  meets_sla: boolean
}

export interface SlaReportOverall {
  total_monitors: number
  evaluated_period: string
  start_time: string
  end_time: string
  global_sla_pct: number
  target_sla_pct: number
  meets_sla: boolean
  total_outages: number
  total_downtime_sec: number
  mttr_seconds: number
  mtbf_seconds: number
  avg_latency_ms: number
  p95_latency_ms: number
}

export interface SlaIncident {
  monitor_id: number
  monitor_name: string
  type: string
  target: string
  group_id: number
  group_name: string
  status: string
  started_at: string
  resolved_at?: string | null
  duration_sec: number
  is_ongoing: boolean
  error_msg?: string
}

export interface SlaReportResponse {
  overall: SlaReportOverall
  monitors: SlaReportMonitor[]
  incidents: SlaIncident[]
}

interface SlaReportModalProps {
  onClose: () => void
  initialGroupId?: number | null
  initialMonitorId?: number | null
  groups?: MonitorGroup[]
}

function formatDurationHuman(sec: number): string {
  if (sec <= 0) return '0s'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 && d === 0) parts.push(`${s}s`)
  return parts.join(' ') || '0s'
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

/**
 * Genera el documento HTML puro e independiente para impresión.
 * Esto aísla el reporte del resto del DOM (dashboard, barra, otros monitores),
 * garantizando que NADA de la aplicación de fondo se filtre en la impresión.
 */
function buildPrintableHtml(
  report: SlaReportResponse,
  entity: { name: string; logo: string },
  scopeLabel: string,
  slaTarget: number
): string {
  const isSingle = report.monitors.length === 1
  const m = isSingle ? report.monitors[0] : null
  const meets = report.overall.meets_sla

  const logoHtml = entity.logo
    ? `<img src="${entity.logo}" alt="Logo" style="max-height: 42px; max-width: 140px; object-fit: contain;" />`
    : `<div style="width: 36px; height: 36px; border-radius: 6px; background: #4f46e5; color: #fff; font-weight: 900; font-size: 16px; display: flex; align-items: center; justify-content: center;">U</div>`

  const kpisHtml = `
    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; margin-bottom: 11px;">
      <div style="padding: 7px 9px; border-radius: 5px; border: 1px solid ${meets ? '#bbf7d0' : '#fecaca'}; background: ${meets ? '#f0fdf4' : '#fef2f2'};">
        <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Disponibilidad SLA</div>
        <div style="font-size: 17px; font-weight: 800; font-family: monospace; color: ${meets ? '#15803d' : '#b91c1c'}; line-height: 1.1; margin: 2px 0;">
          ${report.overall.global_sla_pct.toFixed(2)}%
        </div>
        <div style="font-size: 7.5px; font-weight: 600; color: ${meets ? '#15803d' : '#b91c1c'};">
          ${meets ? 'CUMPLE' : 'CRÍTICO'} (≥${report.overall.target_sla_pct.toFixed(2)}%)
        </div>
      </div>

      <div style="padding: 7px 9px; border-radius: 5px; border: 1px solid #e2e8f0; background: #f8fafc;">
        <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Cortes (Outages)</div>
        <div style="font-size: 17px; font-weight: 800; font-family: monospace; color: ${report.overall.total_outages > 0 ? '#d97706' : '#0f172a'}; line-height: 1.1; margin: 2px 0;">
          ${report.overall.total_outages}
        </div>
        <div style="font-size: 7.5px; color: #64748b;">Interrupciones</div>
      </div>

      <div style="padding: 7px 9px; border-radius: 5px; border: 1px solid #e2e8f0; background: #f8fafc;">
        <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Tiempo Fuera</div>
        <div style="font-size: 15px; font-weight: 800; font-family: monospace; color: ${report.overall.total_downtime_sec > 0 ? '#b91c1c' : '#15803d'}; line-height: 1.15; margin: 2px 0;">
          ${formatDurationHuman(report.overall.total_downtime_sec)}
        </div>
        <div style="font-size: 7.5px; color: #64748b;">Downtime total</div>
      </div>

      <div style="padding: 7px 9px; border-radius: 5px; border: 1px solid #e2e8f0; background: #f8fafc;">
        <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">MTTR (Recuperación)</div>
        <div style="font-size: 15px; font-weight: 800; font-family: monospace; color: #0f172a; line-height: 1.15; margin: 2px 0;">
          ${report.overall.total_outages > 0 ? formatDurationHuman(report.overall.mttr_seconds) : '0s'}
        </div>
        <div style="font-size: 7.5px; color: #64748b;">${report.overall.total_outages > 0 ? 'Media por corte' : 'Sin fallas'}</div>
      </div>

      <div style="padding: 7px 9px; border-radius: 5px; border: 1px solid #e2e8f0; background: #f8fafc;">
        <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">MTBF (Estabilidad)</div>
        <div style="font-size: 15px; font-weight: 800; font-family: monospace; color: #15803d; line-height: 1.15; margin: 2px 0;">
          ${report.overall.total_outages > 0 ? formatDurationHuman(report.overall.mtbf_seconds) : 'Continuo'}
        </div>
        <div style="font-size: 7.5px; color: #64748b;">${report.overall.total_outages > 0 ? 'Media entre fallas' : '100% en línea'}</div>
      </div>

      <div style="padding: 7px 9px; border-radius: 5px; border: 1px solid #e2e8f0; background: #f8fafc;">
        <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Latencia Prom.</div>
        <div style="font-size: 17px; font-weight: 800; font-family: monospace; color: #0f172a; line-height: 1.1; margin: 2px 0;">
          ${report.overall.avg_latency_ms} ms
        </div>
        <div style="font-size: 7.5px; color: #64748b;">P95: ${report.overall.p95_latency_ms} ms</div>
      </div>
    </div>
  `

  let detailSectionHtml = ''
  if (isSingle && m) {
    detailSectionHtml = `
      <div style="border: 1px solid #cbd5e1; border-radius: 5px; margin-bottom: 11px; overflow: hidden;">
        <div style="padding: 5px 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; font-size: 10px; font-weight: 800; color: #1e293b;">
          Especificaciones Técnicas del Enlace Auditado
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 12px; padding: 8px 10px; font-size: 9px;">
          <div><span style="color: #64748b;">Nombre del Enlace:</span> <strong>${m.monitor_name}</strong></div>
          <div><span style="color: #64748b;">Grupo / Ubicación:</span> <strong>${m.group_name || 'Sin Grupo'}</strong></div>
          <div><span style="color: #64748b;">Host / IP Destino:</span> <strong style="font-family: monospace;">${m.target}</strong></div>
          <div><span style="color: #64748b;">Tipo de Sensor:</span> <strong>${m.type}</strong></div>
          <div><span style="color: #64748b;">Muestras Totales:</span> <strong>${m.total_samples.toLocaleString()} (${m.up_samples.toLocaleString()} OK / ${m.down_samples.toLocaleString()} Fallas)</strong></div>
          <div><span style="color: #64748b;">Latencia Pico Máxima:</span> <strong>${m.max_latency_ms} ms</strong></div>
        </div>
      </div>
    `
  } else {
    const rows = report.monitors.map(mon => {
      const ok = mon.availability_pct >= slaTarget
      return `
        <tr>
          <td style="padding: 5px 6px; font-weight: 700; border-bottom: 1px solid #e2e8f0;">${mon.monitor_name}<div style="font-size: 7.5px; font-weight: 400; color: #64748b;">${mon.target}</div></td>
          <td style="padding: 5px 6px; border-bottom: 1px solid #e2e8f0;">${mon.group_name || 'Sin Grupo'}</td>
          <td style="padding: 5px 6px; border-bottom: 1px solid #e2e8f0;"><span style="font-size: 8px; font-weight: 700; padding: 1px 3px; background: #e2e8f0; border-radius: 2px;">${mon.type}</span></td>
          <td style="padding: 5px 6px; text-align: right; font-family: monospace; font-weight: 800; color: ${ok ? '#15803d' : '#b91c1c'}; border-bottom: 1px solid #e2e8f0;">${mon.availability_pct.toFixed(2)}%</td>
          <td style="padding: 5px 6px; text-align: center; border-bottom: 1px solid #e2e8f0;"><span style="font-size: 7.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: ${ok ? '#dcfce7' : '#fee2e2'}; color: ${ok ? '#15803d' : '#b91c1c'};">${ok ? 'CUMPLE' : 'CRÍTICO'}</span></td>
          <td style="padding: 5px 6px; text-align: right; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${mon.outages_count}</td>
          <td style="padding: 5px 6px; text-align: right; font-family: monospace; color: ${mon.downtime_seconds > 0 ? '#b91c1c' : '#15803d'}; font-weight: 700; border-bottom: 1px solid #e2e8f0;">${formatDurationHuman(mon.downtime_seconds)}</td>
        </tr>
      `
    }).join('')

    detailSectionHtml = `
      <div style="border: 1px solid #cbd5e1; border-radius: 5px; margin-bottom: 11px; overflow: hidden;">
        <div style="padding: 5px 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; font-size: 10px; font-weight: 800; color: #1e293b; display: flex; justify-content: space-between;">
          <span>Desglose de Monitores y Cumplimiento Individual (${report.monitors.length} enlaces)</span>
          <span>Meta: ≥${slaTarget.toFixed(2)}%</span>
        </div>
        <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5px;">
          <thead>
            <tr style="background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 8px;">
              <th style="width: 28%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Monitor / Enlace</th>
              <th style="width: 22%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Grupo / Sede</th>
              <th style="width: 10%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Tipo</th>
              <th style="width: 14%; padding: 5px 6px; text-align: right; border-bottom: 1px solid #cbd5e1;">Disponibilidad</th>
              <th style="width: 12%; padding: 5px 6px; text-align: center; border-bottom: 1px solid #cbd5e1;">Estado</th>
              <th style="width: 6%; padding: 5px 6px; text-align: right; border-bottom: 1px solid #cbd5e1;">Cortes</th>
              <th style="width: 8%; padding: 5px 6px; text-align: right; border-bottom: 1px solid #cbd5e1;">T. Fuera</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  let incidentsHtml = ''
  if (report.incidents.length === 0) {
    incidentsHtml = `
      <div style="border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 5px; padding: 8px; text-align: center; color: #15803d; font-size: 9.5px; font-weight: 700; margin-bottom: 11px;">
        ✓ Cero interrupciones o caídas registradas durante el periodo evaluado. Operación 100% continua.
      </div>
    `
  } else {
    const incRows = report.incidents.slice(0, 15).map(inc => `
      <tr>
        <td style="padding: 4px 6px; font-weight: 700; border-bottom: 1px solid #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inc.monitor_name} <span style="font-size: 7.5px; color: #64748b;">(${inc.type})</span></td>
        <td style="padding: 4px 6px; border-bottom: 1px solid #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inc.group_name || 'Sin Grupo'}</td>
        <td style="padding: 4px 6px; font-family: monospace; font-size: 8px; border-bottom: 1px solid #e2e8f0;">${formatDate(inc.started_at)}</td>
        <td style="padding: 4px 6px; font-family: monospace; font-size: 8px; color: ${inc.is_ongoing ? '#b91c1c' : '#0f172a'}; border-bottom: 1px solid #e2e8f0;">${inc.resolved_at ? formatDate(inc.resolved_at) : (inc.is_ongoing ? 'EN CURSO' : '—')}</td>
        <td style="padding: 4px 6px; text-align: right; font-family: monospace; font-weight: 700; color: ${inc.duration_sec > 600 ? '#b91c1c' : '#d97706'}; border-bottom: 1px solid #e2e8f0;">${formatDurationHuman(inc.duration_sec)}</td>
        <td style="padding: 4px 6px; color: #475569; font-size: 8px; border-bottom: 1px solid #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inc.error_msg || 'Caída de enlace'}</td>
      </tr>
    `).join('')

    incidentsHtml = `
      <div style="border: 1px solid #cbd5e1; border-radius: 5px; margin-bottom: 11px; overflow: hidden;">
        <div style="padding: 5px 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; font-size: 10px; font-weight: 800; color: #1e293b; display: flex; justify-content: space-between;">
          <span>Registro de Incidentes y Caídas en el Periodo</span>
          <span style="font-size: 8.5px; padding: 1px 5px; border-radius: 3px; background: #fee2e2; color: #b91c1c; font-weight: 700;">${report.incidents.length} evento(s)</span>
        </div>
        <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5px;">
          <thead>
            <tr style="background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 8px;">
              <th style="width: 22%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Monitor / Endpoint</th>
              <th style="width: 18%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Grupo</th>
              <th style="width: 18%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Inicio de Corte</th>
              <th style="width: 18%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Restablecimiento</th>
              <th style="width: 10%; padding: 5px 6px; text-align: right; border-bottom: 1px solid #cbd5e1;">Duración</th>
              <th style="width: 14%; padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Diagnóstico</th>
            </tr>
          </thead>
          <tbody>${incRows}</tbody>
        </table>
      </div>
    `
  }

  const signaturesHtml = `
    <div style="border: 1px solid #cbd5e1; border-radius: 5px; padding: 9px 12px; background: #ffffff;">
      <div style="font-size: 8px; color: #64748b; line-height: 1.35; margin-bottom: 12px;">
        <strong>Cálculo de Disponibilidad (Estándar ITIL v4):</strong> Disponibilidad = <code>(Tiempo Operativo / Tiempo Elegible) × 100</code>.
        Mantenimientos programados y monitores pausados se excluyen para no penalizar labores preventivas autorizadas.
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 36px; text-align: center;">
        <div>
          <div style="width: 70%; height: 1px; background: #94a3b8; margin: 0 auto 3px auto;"></div>
          <div style="font-size: 9px; font-weight: 700; color: #0f172a;">Operaciones NOC & Monitoreo</div>
          <div style="font-size: 7.5px; color: #64748b;">Generado y auditado por UptimeCore</div>
        </div>
        <div>
          <div style="width: 70%; height: 1px; background: #94a3b8; margin: 0 auto 3px auto;"></div>
          <div style="font-size: 9px; font-weight: 700; color: #0f172a;">Dirección de TI / Infraestructura</div>
          <div style="font-size: 7.5px; color: #64748b;">Firma de Conformidad & Aprobación</div>
        </div>
      </div>
    </div>
  `

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Reporte SLA - ${entity.name || 'UptimeCore'}</title>
      <style>
        @page {
          size: letter portrait;
          margin: 10mm 12mm 10mm 12mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          margin: 0;
          padding: 0;
          font-size: 9.5px;
          line-height: 1.35;
        }
      </style>
    </head>
    <body>
      <div style="width: 100%; max-width: 100%; margin: 0 auto;">
        <div style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 5px; margin-bottom: 11px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${logoHtml}
            <div>
              <div style="font-size: 15px; font-weight: 800; color: #0f172a; line-height: 1.1;">${entity.name || 'UptimeCore'}</div>
              <div style="font-size: 9.5px; font-weight: 700; color: #4f46e5; text-transform: uppercase; margin-top: 2px;">INFORME TÉCNICO DE NIVEL DE SERVICIO (SLA) & DISPONIBILIDAD</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 8.5px; line-height: 1.3;">
            <div>Alcance: <strong style="color: #4f46e5;">${scopeLabel}</strong></div>
            <div style="color: #64748b;">Periodo: <strong>${report.overall.evaluated_period}</strong></div>
            <div style="color: #64748b;">Emisión: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>

        ${kpisHtml}
        ${detailSectionHtml}
        ${incidentsHtml}
        ${signaturesHtml}
      </div>
    </body>
    </html>
  `
}

export function SlaReportModal({
  onClose,
  initialGroupId = null,
  initialMonitorId = null,
  groups: propGroups,
}: SlaReportModalProps) {
  const storeGroups = useMonitorStore(s => s.groups)
  const effectiveGroups = useMemo(() => {
    if (propGroups && propGroups.length > 1) return propGroups
    if (storeGroups && storeGroups.length > 0) return storeGroups
    return propGroups || []
  }, [propGroups, storeGroups])

  // ── Parámetros de consulta ──
  const [selectedRange, setSelectedRange] = useState<string>('month')
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [scopeType, setScopeType] = useState<'all' | 'group' | 'monitor'>(() => {
    if (initialMonitorId) return 'monitor'
    if (initialGroupId) return 'group'
    return 'all'
  })
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(initialGroupId)
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(initialMonitorId)
  const [slaTarget, setSlaTarget] = useState<number>(99.9)

  // ── Estado de datos ──
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [reportData, setReportData] = useState<SlaReportResponse | null>(null)

  // ── Configuración corporativa ──
  const [entity, setEntity] = useState<{ name: string; logo: string }>({ name: '', logo: '' })

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d) {
          setEntity({
            name: d.entity_name || 'UptimeCore',
            logo: d.entity_logo || '',
          })
        }
      })
      .catch(() => {
        setEntity({ name: 'UptimeCore', logo: '' })
      })
  }, [])

  // Lista plana de todos los monitores para el selector
  const allMonitors = useMemo(() => {
    const list: { id: number; name: string; groupName: string; groupId: number | null }[] = []
    effectiveGroups.forEach(g => {
      g.monitors?.forEach(m => {
        list.push({
          id: m.id,
          name: m.name,
          groupName: g.name,
          groupId: g.id,
        })
      })
    })
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [effectiveGroups])

  // Carga de reporte desde el backend
  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('range', selectedRange)
      params.set('sla_target', String(slaTarget))

      if (selectedRange === 'custom') {
        if (customStart) params.set('start', customStart)
        if (customEnd) params.set('end', customEnd)
      }

      if (scopeType === 'group' && selectedGroupId) {
        params.set('group_id', String(selectedGroupId))
      } else if (scopeType === 'monitor' && selectedMonitorId) {
        params.set('monitor_id', String(selectedMonitorId))
      }

      const res = await fetch(`/api/reports/sla?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Error ${res.status}: Fallo al calcular reporte SLA`)
      }
      const data: SlaReportResponse = await res.json()
      setReportData(data)
    } catch (err: any) {
      setError(err?.message || 'Error al obtener datos de SLA')
    } finally {
      setLoading(false)
    }
  }, [selectedRange, customStart, customEnd, scopeType, selectedGroupId, selectedMonitorId, slaTarget])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const scopeLabel = useMemo(() => {
    if (scopeType === 'all') return 'Toda la Infraestructura'
    if (scopeType === 'group') {
      const g = effectiveGroups.find(x => x.id === selectedGroupId)
      return g ? `Grupo: ${g.name}` : 'Grupo Seleccionado'
    }
    if (scopeType === 'monitor') {
      const m = allMonitors.find(x => x.id === selectedMonitorId)
      return m ? `Monitor: ${m.name} (${m.groupName})` : 'Monitor Seleccionado'
    }
    return 'Red'
  }, [scopeType, selectedGroupId, selectedMonitorId, effectiveGroups, allMonitors])

  // Monitor único evaluado (si aplica)
  const singleMonitor = useMemo(() => {
    if (reportData && reportData.monitors.length === 1) {
      return reportData.monitors[0]
    }
    return null
  }, [reportData])

  // ── IMPRESIÓN AISLADA EN IFRAME LIMPIO (Cero contaminación del Dashboard) ──
  const handlePrint = () => {
    if (!reportData) return

    // Limpiar iframe previo si existiera
    const oldIframe = document.getElementById('sla-isolated-print-frame')
    if (oldIframe && oldIframe.parentNode) {
      oldIframe.parentNode.removeChild(oldIframe)
    }

    const iframe = document.createElement('iframe')
    iframe.id = 'sla-isolated-print-frame'
    iframe.style.position = 'fixed'
    iframe.style.top = '-9999px'
    iframe.style.left = '-9999px'
    iframe.style.width = '1000px'
    iframe.style.height = '1000px'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) return

    const html = buildPrintableHtml(reportData, entity, scopeLabel, slaTarget)
    doc.open()
    doc.write(html)
    doc.close()

    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        } catch {}
      }, 3000)
    }, 250)
  }

  // Exportar a Excel / CSV
  const handleExportCsv = () => {
    if (!reportData) return

    const lines: string[] = []
    lines.push(`"INFORME EJECUTIVO DE NIVEL DE SERVICIO (SLA) Y DISPONIBILIDAD"`)
    lines.push(`"Organización","${entity.name || 'UptimeCore'}"`)
    lines.push(`"Periodo Evaluado","${reportData.overall.evaluated_period}"`)
    lines.push(`"Fecha de Generación","${new Date().toLocaleString('es-MX')}"`)
    lines.push(`"Meta SLA","${slaTarget}%"`)
    lines.push(`"SLA Global Obtenido","${reportData.overall.global_sla_pct.toFixed(2)}%"`)
    lines.push(`"Cumplimiento Global","${reportData.overall.meets_sla ? 'CUMPLE SLA' : 'NO CUMPLE SLA'}"`)
    lines.push(`"Total Monitores","${reportData.overall.total_monitors}"`)
    lines.push(`"Total Cortes (Eventos)","${reportData.overall.total_outages}"`)
    lines.push(`"Tiempo Fuera de Servicio","${formatDurationHuman(reportData.overall.total_downtime_sec)}"`)
    lines.push(`"Tiempo Medio de Recuperación (MTTR)","${formatDurationHuman(reportData.overall.mttr_seconds)}"`)
    lines.push(`"Tiempo Operativo sin Fallas (MTBF)","${formatDurationHuman(reportData.overall.mtbf_seconds)}"`)
    lines.push(`"Latencia Promedio (ms)","${reportData.overall.avg_latency_ms}"`)
    lines.push(`"Latencia P95 (ms)","${reportData.overall.p95_latency_ms}"`)
    lines.push('')

    // Tabla 1: Desglose de Monitores
    lines.push(`"DESGLOSE DE DISPONIBILIDAD POR MONITOR"`)
    lines.push([
      `"Monitor"`,
      `"Grupo / Sede"`,
      `"Tipo"`,
      `"Destino"`,
      `"Disponibilidad SLA (%)"`,
      `"Cumple Meta"`,
      `"Cortes (Eventos)"`,
      `"Tiempo Fuera (s)"`,
      `"Tiempo Fuera (Formato)"`,
      `"Latencia Prom (ms)"`,
      `"Latencia P95 (ms)"`,
      `"Latencia Máx (ms)"`,
      `"MTTR"`,
      `"Muestras Totales"`,
      `"Muestras OK"`,
      `"Muestras Down"`,
    ].join(','))

    reportData.monitors.forEach(m => {
      lines.push([
        `"${m.monitor_name.replace(/"/g, '""')}"`,
        `"${(m.group_name || 'Sin Grupo').replace(/"/g, '""')}"`,
        `"${m.type}"`,
        `"${m.target}"`,
        `"${m.availability_pct.toFixed(2)}%"`,
        `"${m.meets_sla ? 'SI' : 'NO'}"`,
        `"${m.outages_count}"`,
        `"${m.downtime_seconds}"`,
        `"${formatDurationHuman(m.downtime_seconds)}"`,
        `"${m.avg_latency_ms}"`,
        `"${m.p95_latency_ms}"`,
        `"${m.max_latency_ms}"`,
        `"${formatDurationHuman(m.mttr_seconds)}"`,
        `"${m.total_samples}"`,
        `"${m.up_samples}"`,
        `"${m.down_samples}"`,
      ].join(','))
    })

    lines.push('')
    // Tabla 2: Registro de Incidentes
    lines.push(`"REGISTRO DETALLADO DE INCIDENTES EN EL PERÍODO"`)
    lines.push([
      `"Monitor"`,
      `"Grupo"`,
      `"Tipo"`,
      `"Estado"`,
      `"Inicio de Corte"`,
      `"Restablecimiento"`,
      `"Duración"`,
      `"Estado Actual"`,
      `"Diagnóstico / Error"`,
    ].join(','))

    if (reportData.incidents.length === 0) {
      lines.push(`"Sin caídas registradas en este periodo"`)
    } else {
      reportData.incidents.forEach(inc => {
        lines.push([
          `"${inc.monitor_name.replace(/"/g, '""')}"`,
          `"${(inc.group_name || 'Sin Grupo').replace(/"/g, '""')}"`,
          `"${inc.type}"`,
          `"${inc.status}"`,
          `"${formatDate(inc.started_at)}"`,
          `"${inc.resolved_at ? formatDate(inc.resolved_at) : (inc.is_ongoing ? 'EN CURSO' : '—')}"`,
          `"${formatDurationHuman(inc.duration_sec)}"`,
          `"${inc.is_ongoing ? 'ACTIVO' : 'RESUELTO'}"`,
          `"${(inc.error_msg || 'Sin respuesta').replace(/"/g, '""')}"`,
        ].join(','))
      })
    }

    const csvContent = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeScope = scopeType === 'all' ? 'TodaLaRed' : (scopeType === 'group' ? 'Grupo' : 'Monitor')
    a.download = `Reporte_SLA_${safeScope}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Contenedor Modal */}
      <div
        style={{
          width: '100%',
          maxWidth: 1140,
          maxHeight: '94vh',
          background: 'var(--color-bg-card)',
          borderRadius: 14,
          border: '1px solid var(--color-border)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── BARRA SUPERIOR DE CONTROLES ── */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Fila 1: Título y Botones */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  Reporte de SLA y Disponibilidad de Red
                </h2>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  UptimeCore · Motor de Auditoría y Cumplimiento de Nivel de Servicio
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Botón Imprimir / PDF */}
              <button
                onClick={handlePrint}
                disabled={loading || !reportData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                }}
                title="Generar e Imprimir PDF en 1 hoja limpia y aislada"
              >
                <Printer size={15} color="var(--color-accent)" />
                Imprimir / PDF
              </button>

              {/* Botón Excel / CSV */}
              <button
                onClick={handleExportCsv}
                disabled={loading || !reportData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#22c55e',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                }}
                title="Descargar archivo estructurado compatible con Microsoft Excel (.CSV)"
              >
                <Download size={15} />
                Exportar Excel
              </button>

              {/* Botón Refrescar */}
              <button
                onClick={loadReport}
                disabled={loading}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-muted)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
                title="Recalcular métricas"
              >
                <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>

              <div style={{ width: 1, height: 22, background: 'var(--color-border)', margin: '0 2px' }} />

              {/* Cerrar */}
              <button
                onClick={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Fila 2: Selectores de Filtro */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Alcance (Scope) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Alcance:</span>
              <select
                value={scopeType}
                onChange={e => {
                  const val = e.target.value as 'all' | 'group' | 'monitor'
                  setScopeType(val)
                  if (val === 'group' && !selectedGroupId && effectiveGroups.length > 0) {
                    setSelectedGroupId(effectiveGroups[0].id)
                  }
                  if (val === 'monitor' && !selectedMonitorId && allMonitors.length > 0) {
                    setSelectedMonitorId(allMonitors[0].id)
                  }
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 6,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                <option value="all">🌐 Toda la Infraestructura ({allMonitors.length} Monitores)</option>
                <option value="group">🏢 Por Grupo ({effectiveGroups.length} Grupos)</option>
                <option value="monitor">📍 Por Monitor Individual</option>
              </select>
            </div>

            {/* Sub-selector de Grupo */}
            {scopeType === 'group' && (
              <select
                value={selectedGroupId || ''}
                onChange={e => setSelectedGroupId(Number(e.target.value))}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 6,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  fontWeight: 600,
                  maxWidth: 260,
                  outline: 'none',
                }}
              >
                {effectiveGroups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.monitors?.length || 0} enlaces)
                  </option>
                ))}
              </select>
            )}

            {/* Sub-selector de Monitor */}
            {scopeType === 'monitor' && (
              <select
                value={selectedMonitorId || ''}
                onChange={e => setSelectedMonitorId(Number(e.target.value))}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 6,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  fontWeight: 600,
                  maxWidth: 320,
                  outline: 'none',
                }}
              >
                {allMonitors.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.groupName}
                  </option>
                ))}
              </select>
            )}

            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />

            {/* Periodo de Tiempo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Periodo:</span>
              <select
                value={selectedRange}
                onChange={e => setSelectedRange(e.target.value)}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 6,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                <option value="month">📅 Este Mes (Acumulado)</option>
                <option value="last_month">⏮️ Mes Anterior Completo</option>
                <option value="7d">⚡ Últimos 7 Días</option>
                <option value="30d">📆 Últimos 30 Días</option>
                <option value="today">☀️ Hoy (00:00 - Actual)</option>
                <option value="yesterday">🌙 Ayer (Día Completo)</option>
                <option value="custom">🛠️ Rango Personalizado...</option>
              </select>
            </div>

            {/* Fechas personalizadas */}
            {selectedRange === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  style={{
                    height: 32,
                    padding: '0 8px',
                    borderRadius: 6,
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    fontSize: 11.5,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>al</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={{
                    height: 32,
                    padding: '0 8px',
                    borderRadius: 6,
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    fontSize: 11.5,
                  }}
                />
              </div>
            )}

            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />

            {/* Meta SLA con explicación de tolerancia mensual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Meta SLA:</span>
              <select
                value={slaTarget}
                onChange={e => setSlaTarget(Number(e.target.value))}
                style={{
                  height: 32,
                  padding: '0 8px',
                  borderRadius: 6,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  outline: 'none',
                }}
              >
                <option value={99.9}>99.90% · Alta Disponibilidad (Máx. 43m/mes fuera)</option>
                <option value={99.5}>99.50% · Estándar Corporativo (Máx. 3.6h/mes fuera)</option>
                <option value={99.0}>99.00% · Operación Regular (Máx. 7.2h/mes fuera)</option>
                <option value={95.0}>95.00% · Servicios Básicos (Máx. 36h/mes fuera)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── CUERPO DEL REPORTE (VISTA EN PANTALLA) ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
            background: 'var(--color-bg-primary)',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 380,
                gap: 12,
              }}
            >
              <RefreshCw size={28} className="spin" color="var(--color-accent)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Consultando motor de series temporales y calculando SLA...
              </span>
            </div>
          ) : error ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                minHeight: 280,
                color: '#ef4444',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={20} />
              {error}
            </div>
          ) : !reportData ? null : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* ══ 1. ENCABEZADO CORPORATIVO ══ */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderRadius: 10,
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {entity.logo ? (
                    <img
                      src={entity.logo}
                      alt="Logo"
                      style={{
                        maxHeight: 46,
                        maxWidth: 150,
                        objectFit: 'contain',
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: 18,
                      }}
                    >
                      U
                    </div>
                  )}

                  <div>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--color-text-primary)',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {entity.name || 'UptimeCore'}
                    </h1>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--color-accent)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginTop: 2,
                      }}
                    >
                      Informe Técnico de Nivel de Servicio (SLA) & Disponibilidad
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Alcance: <span style={{ color: 'var(--color-accent)' }}>{scopeLabel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Periodo:{' '}
                    <strong style={{ color: 'var(--color-text-secondary)' }}>
                      {reportData.overall.evaluated_period}
                    </strong>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                    Emisión: {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* ══ 2. TARJETAS DE INDICADORES CLAVE (KPI SUMMARY) ══ */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 10,
                }}
              >
                {/* KPI 1: Disponibilidad SLA */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    border: `1px solid ${
                      reportData.overall.meets_sla ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.4)'
                    }`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      Disponibilidad SLA
                    </span>
                    {reportData.overall.meets_sla ? (
                      <ShieldCheck size={15} color="#22c55e" />
                    ) : (
                      <AlertTriangle size={15} color="#ef4444" />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: reportData.overall.meets_sla ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {reportData.overall.global_sla_pct.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Meta: ≥{reportData.overall.target_sla_pct.toFixed(2)}% ·{' '}
                    <strong style={{ color: reportData.overall.meets_sla ? '#22c55e' : '#ef4444' }}>
                      {reportData.overall.meets_sla ? 'CUMPLE' : 'NO CUMPLE'}
                    </strong>
                  </div>
                </div>

                {/* KPI 2: Total Cortes (Outages) */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      Cortes (Outages)
                    </span>
                    <AlertTriangle size={15} color="#f59e0b" />
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: reportData.overall.total_outages > 0 ? '#f59e0b' : 'var(--color-text-primary)',
                    }}
                  >
                    {reportData.overall.total_outages}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    Interrupciones registradas
                  </div>
                </div>

                {/* KPI 3: Tiempo Fuera de Servicio */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      Tiempo Fuera
                    </span>
                    <Clock size={15} color="var(--color-accent)" />
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: reportData.overall.total_downtime_sec > 0 ? '#ef4444' : '#22c55e',
                    }}
                  >
                    {formatDurationHuman(reportData.overall.total_downtime_sec)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    Downtime acumulado
                  </div>
                </div>

                {/* KPI 4: Tiempo Medio de Recuperación (MTTR) */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      MTTR (Recuperación)
                    </span>
                    <Zap size={15} color="#38bdf8" />
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {reportData.overall.total_outages > 0 ? formatDurationHuman(reportData.overall.mttr_seconds) : '0s'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    {reportData.overall.total_outages > 0 ? 'Duración promedio por corte' : 'Sin interrupciones'}
                  </div>
                </div>

                {/* KPI 5: Tiempo Operativo sin Fallas (MTBF) */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      MTBF (Estabilidad)
                    </span>
                    <ShieldCheck size={15} color="#10b981" />
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#10b981',
                    }}
                  >
                    {reportData.overall.total_outages > 0
                      ? formatDurationHuman(reportData.overall.mtbf_seconds)
                      : 'Continuo'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    {reportData.overall.total_outages > 0 ? 'Tiempo medio entre fallas' : '100% en línea'}
                  </div>
                </div>

                {/* KPI 6: Latencia Promedio */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      Latencia Prom.
                    </span>
                    <Activity size={15} color="#818cf8" />
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {reportData.overall.avg_latency_ms} <span style={{ fontSize: 13, fontWeight: 600 }}>ms</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    Percentil P95: <strong>{reportData.overall.p95_latency_ms} ms</strong>
                  </div>
                </div>
              </div>

              {/* ══ 3. CASO A: MONITOR INDIVIDUAL → FICHA TÉCNICA (Cero Repetición) ══ */}
              {singleMonitor ? (
                <div
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-card)',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                    <Info size={15} color="var(--color-accent)" />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      Ficha Técnica del Enlace Evaluado
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                      fontSize: 11.5,
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Nombre del Enlace:</span>{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>{singleMonitor.monitor_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Grupo / Ubicación:</span>{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>{singleMonitor.group_name || 'Sin Grupo'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Destino / Host IP:</span>{' '}
                      <strong style={{ color: 'var(--color-text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{singleMonitor.target}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Protocolo / Sensor:</span>{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>{singleMonitor.type}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Muestras de Verificación:</span>{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {singleMonitor.total_samples.toLocaleString()} pruebas ({singleMonitor.up_samples.toLocaleString()} OK / {singleMonitor.down_samples.toLocaleString()} Fallas)
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Latencia Pico Máxima:</span>{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>{singleMonitor.max_latency_ms} ms</strong>
                    </div>
                  </div>
                </div>
              ) : (
                /* ══ 3. CASO B: MÚLTIPLES MONITORES → TABLA DE DESGLOSE COMPLETA ══ */
                <div
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-card)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 18px',
                      borderBottom: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Server size={15} color="var(--color-accent)" />
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                        Desglose de Monitores y Cumplimiento Individual
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: '1px 6px',
                          borderRadius: 10,
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {reportData.monitors.length} monitores
                      </span>
                    </div>

                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      Meta: <strong>≥{slaTarget.toFixed(2)}%</strong>
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        tableLayout: 'fixed',
                        borderCollapse: 'collapse',
                        fontSize: 11,
                        textAlign: 'left',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: '1px solid var(--color-border)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          <th style={{ width: '28%', padding: '8px 10px' }}>Monitor / Enlace</th>
                          <th style={{ width: '22%', padding: '8px 10px' }}>Grupo / Sede</th>
                          <th style={{ width: '10%', padding: '8px 8px' }}>Tipo</th>
                          <th style={{ width: '16%', padding: '8px 10px', textAlign: 'right' }}>Disponibilidad</th>
                          <th style={{ width: '12%', padding: '8px 6px', textAlign: 'center' }}>SLA</th>
                          <th style={{ width: '12%', padding: '8px 10px', textAlign: 'right' }}>Tiempo Fuera</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.monitors.map((mon, idx) => {
                          const meets = mon.availability_pct >= slaTarget
                          return (
                            <tr
                              key={mon.monitor_id}
                              style={{
                                borderBottom: idx === reportData.monitors.length - 1 ? 'none' : '1px solid var(--color-border)',
                                background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                              }}
                            >
                              <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {mon.monitor_name}
                                </div>
                                <div style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {mon.target}
                                </div>
                              </td>
                              <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {mon.group_name || 'Sin Grupo'}
                              </td>
                              <td style={{ padding: '8px 8px' }}>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    padding: '2px 5px',
                                    borderRadius: 3,
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    color: 'var(--color-text-muted)',
                                  }}
                                >
                                  {mon.type}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  textAlign: 'right',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontWeight: 800,
                                  color: meets ? '#22c55e' : '#ef4444',
                                }}
                              >
                                {mon.availability_pct.toFixed(2)}%
                              </td>
                              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 8,
                                    background: meets ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: meets ? '#22c55e' : '#ef4444',
                                    border: `1px solid ${meets ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                  }}
                                >
                                  {meets ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                  {meets ? 'CUMPLE' : 'CRÍTICO'}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  textAlign: 'right',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: mon.downtime_seconds > 0 ? '#ef4444' : '#22c55e',
                                }}
                              >
                                {formatDurationHuman(mon.downtime_seconds)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ══ 4. BITÁCORA DE INCIDENTES EN EL PERÍODO ══ */}
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={15} color="var(--color-accent)" />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      Registro de Incidentes y Caídas durante el Período Evaluado
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background:
                          reportData.incidents.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: reportData.incidents.length > 0 ? '#ef4444' : '#22c55e',
                        fontWeight: 700,
                      }}
                    >
                      {reportData.incidents.length} incidentes
                    </span>
                  </div>
                </div>

                {reportData.incidents.length === 0 ? (
                  <div
                    style={{
                      padding: '24px 20px',
                      textAlign: 'center',
                      color: '#22c55e',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 size={26} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      Cero incidentes registrados en el periodo seleccionado. Operación 100% continua.
                    </span>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        tableLayout: 'fixed',
                        borderCollapse: 'collapse',
                        fontSize: 11,
                        textAlign: 'left',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: '1px solid var(--color-border)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          <th style={{ width: '22%', padding: '8px 10px' }}>Monitor / Endpoint</th>
                          <th style={{ width: '18%', padding: '8px 10px' }}>Grupo</th>
                          <th style={{ width: '18%', padding: '8px 10px' }}>Inicio de Corte</th>
                          <th style={{ width: '18%', padding: '8px 10px' }}>Restablecimiento</th>
                          <th style={{ width: '10%', padding: '8px 8px', textAlign: 'right' }}>Duración</th>
                          <th style={{ width: '14%', padding: '8px 10px' }}>Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.incidents.map((inc, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom:
                                i === reportData.incidents.length - 1 ? 'none' : '1px solid var(--color-border)',
                              background: i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                            }}
                          >
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inc.monitor_name}
                              <span style={{ fontSize: 9.5, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                                ({inc.type})
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inc.group_name || 'Sin Grupo'}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                fontFamily: "'JetBrains Mono', monospace",
                                color: 'var(--color-text-secondary)',
                                fontSize: 10,
                              }}
                            >
                              {formatDate(inc.started_at)}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                fontFamily: "'JetBrains Mono', monospace",
                                color: inc.is_ongoing ? '#ef4444' : 'var(--color-text-secondary)',
                                fontSize: 10,
                              }}
                            >
                              {inc.resolved_at ? (
                                formatDate(inc.resolved_at)
                              ) : inc.is_ongoing ? (
                                <span style={{ fontWeight: 800, color: '#ef4444' }}>EN CURSO</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td
                              style={{
                                padding: '8px 8px',
                                textAlign: 'right',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: 700,
                                color: inc.duration_sec > 600 ? '#ef4444' : '#f59e0b',
                              }}
                            >
                              {formatDurationHuman(inc.duration_sec)}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                color: 'var(--color-text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={inc.error_msg || 'Sin respuesta'}
                            >
                              {inc.error_msg || 'Caída de enlace'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ══ 5. FIRMAS Y AVISO DE AUDITORÍA ITIL ══ */}
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
                  <strong>Cálculo de Disponibilidad (Estándar ITIL v4):</strong> La disponibilidad se calcula como{' '}
                  <code style={{ fontFamily: 'monospace' }}>(Tiempo Operativo / Tiempo Elegible) × 100</code>.
                  Las ventanas de mantenimiento programado y monitores en pausa se excluyen del cálculo para no penalizar
                  labores preventivas autorizadas.
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 30,
                    paddingTop: 10,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '75%', height: 1, background: 'var(--color-border)', marginBottom: 2 }} />
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      Operaciones NOC & Monitoreo
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      Generado y auditado por UptimeCore
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '75%', height: 1, background: 'var(--color-border)', marginBottom: 2 }} />
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      Dirección de TI / Infraestructura
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      Firma de Conformidad & Aprobación
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
