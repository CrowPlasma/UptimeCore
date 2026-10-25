/**
 * components/DiagnosticModal.tsx
 * Consola Interactiva de Diagnóstico en Vivo (PAPING TCP / PING ICMP / TRACEROUTE / HTTP-SSL / DNS)
 * - Diseño panorámico (1180px) sin cortes de línea
 * - Selector rápido de sensores del grupo
 * - Autoinicio inteligente al abrir o cambiar de herramienta
 * - Copia de Texto compatible con HTTP (fallback textarea) + Descarga .TXT + Captura en Imagen (.PNG)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Play, Square, Terminal, Wifi, Activity, Route, Globe, Search,
  Copy, Check, Trash2, Sparkles, FileText, Camera, Server
} from 'lucide-react'
import type { Monitor } from '../types'
import { SshTerminalView } from './SshTerminalView'
import { useTranslation } from '../i18n'
import { useAuthStore } from '../store/authStore'

export type DiagnosticToolMode = 'PAPING' | 'PING' | 'TRACEROUTE' | 'HTTP' | 'DNS' | 'SSH'

interface ConsoleLine {
  id: number
  timestamp: string
  text: string
  status: 'ok' | 'err' | 'info' | 'warn'
  latencyMs?: number
  hop?: number
  hopIp?: string
  reached?: boolean
}

interface Props {
  initialMonitor?: Monitor | null
  initialGroupName?: string
  groupMonitors?: Monitor[]
  onClose: () => void
}

const QUICK_PORTS = [
  { port: 80, label: '80 (HTTP)' },
  { port: 443, label: '443 (HTTPS)' },
  { port: 22, label: '22 (SSH)' },
  { port: 3389, label: '3389 (RDP)' },
  { port: 8443, label: '8443 (HTTPS-Alt)' },
  { port: 8080, label: '8080 (Web)' },
  { port: 5432, label: '5432 (PG)' },
]

/** Extrae host limpio y puerto si vienen juntos (ej. "192.168.1.100:443" o "https://sitio.com:8443/login") */
function parseMonitorTargetAndPort(m?: Monitor | null): { host: string; port: number; mode: DiagnosticToolMode } {
  if (!m) return { host: '', port: 443, mode: 'PAPING' }

  let raw = (m.target || '').trim()
  let detectedPort = m.port && m.port > 0 ? m.port : 0

  if (/^https:\/\//i.test(raw)) {
    if (!detectedPort) detectedPort = 443
    raw = raw.replace(/^https:\/\//i, '')
  } else if (/^http:\/\//i.test(raw)) {
    if (!detectedPort) detectedPort = 80
    raw = raw.replace(/^http:\/\//i, '')
  }

  const slashIdx = raw.indexOf('/')
  if (slashIdx !== -1) raw = raw.slice(0, slashIdx)

  const colonMatch = raw.match(/^([^:]+):(\d+)$/)
  if (colonMatch) {
    raw = colonMatch[1]
    if (!detectedPort) detectedPort = Number(colonMatch[2])
  }

  if (!detectedPort) {
    detectedPort = m.type === 'HTTP' ? 80 : 443
  }

  const t = (m.type || '').toUpperCase()
  const mode: DiagnosticToolMode =
    t === 'PING' ? 'PING' : t === 'HTTP' || t === 'HTTPS' || t === 'SSL' ? 'PAPING' : 'PAPING'

  return { host: raw, port: detectedPort, mode }
}

/** Copia texto al portapapeles funcionando tanto en HTTPS como en HTTP (ej. http://192.168.1.50) */
async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function DiagnosticModal({ initialMonitor, initialGroupName, groupMonitors, onClose }: Props) {
  const { canOperate } = useAuthStore()
  if (!canOperate()) {
    return null
  }

  const { t, isEn } = useTranslation()
  const initialParsed = parseMonitorTargetAndPort(initialMonitor)

  const [selectedMonitor, setSelectedMonitor] = useState<Monitor | null>(initialMonitor ?? null)
  const [mode, setMode] = useState<DiagnosticToolMode>(initialParsed.mode)
  const [target, setTarget] = useState<string>(initialParsed.host)
  const [port, setPort] = useState<number>(initialParsed.port)
  const [intervalMs, setIntervalMs] = useState<number>(1000)
  const [maxProbes, setMaxProbes] = useState<number>(10) // Por defecto 10 muestras (o continuo)
  const [maxHops, setMaxHops] = useState<number>(20)

  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [lines, setLines] = useState<ConsoleLine[]>([])
  const [copiedTxt, setCopiedTxt] = useState<boolean>(false)
  const [exportedImg, setExportedImg] = useState<boolean>(false)

  // Live stats
  const [sent, setSent] = useState<number>(0)
  const [received, setReceived] = useState<number>(0)
  const [latencies, setLatencies] = useState<number[]>([])

  const runIdRef = useRef<number>(0)
  const consoleEndRef = useRef<HTMLDivElement | null>(null)
  const lineIdRef = useRef<number>(1)

  const appendLine = useCallback((
    text: string,
    status: 'ok' | 'err' | 'info' | 'warn' = 'info',
    extra?: Partial<ConsoleLine>
  ) => {
    const now = new Date().toLocaleTimeString('es-MX', { hour12: false })
    setLines(prev => [
      ...prev,
      {
        id: lineIdRef.current++,
        timestamp: now,
        text,
        status,
        ...extra,
      },
    ])
  }, [])

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollTop = consoleEndRef.current.scrollHeight
    }
  }, [lines])

  // Stop running loop on unmount
  useEffect(() => {
    return () => {
      runIdRef.current++
    }
  }, [])

  const stopDiagnostic = useCallback(() => {
    runIdRef.current++
    setIsRunning(false)
  }, [])

  const clearConsole = () => {
    setLines([])
    setSent(0)
    setReceived(0)
    setLatencies([])
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const executeRun = useCallback(async (
    runMode: DiagnosticToolMode,
    runTarget: string,
    runPort: number,
    runIntervalMs: number,
    runMaxProbes: number,
    runMaxHops: number
  ) => {
    const cleanTarget = runTarget.trim()
    if (!cleanTarget) return

    const myRunId = ++runIdRef.current
    setIsRunning(true)
    setLines([])
    setSent(0)
    setReceived(0)
    setLatencies([])

    if (runMode === 'PAPING' || runMode === 'PING') {
      const limit = runMaxProbes > 0 ? runMaxProbes : 100
      const headerDesc =
        runMode === 'PAPING'
          ? (isEn
              ? `▶ Running PAPING (TCP Port Ping) to ${cleanTarget} on TCP port ${runPort} (${runMaxProbes === 0 ? 'Continuous' : `${limit} packets`})...`
              : `▶ Ejecutando PAPING (TCP Port Ping) hacia ${cleanTarget} en puerto TCP ${runPort} (${runMaxProbes === 0 ? 'Continuo' : `${limit} paquetes`})...`)
          : (isEn
              ? `▶ Running PING (ICMP Echo) to ${cleanTarget} with 64 bytes of data (${runMaxProbes === 0 ? 'Continuous' : `${limit} packets`})...`
              : `▶ Ejecutando PING (ICMP Echo) hacia ${cleanTarget} con 64 bytes de datos (${runMaxProbes === 0 ? 'Continuo' : `${limit} paquetes`})...`)
      appendLine(headerDesc, 'info')

      let localSent = 0
      let localRecv = 0
      const localLats: number[] = []

      for (let seq = 1; seq <= limit; seq++) {
        if (runIdRef.current !== myRunId) break

        try {
          const resp = await fetch('/api/diagnostics/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: runMode,
              target: cleanTarget,
              port: Number(runPort) || 80,
              seq,
              timeout_ms: 2500,
            }),
          })
          const data = await resp.json()
          if (runIdRef.current !== myRunId) break

          localSent++
          setSent(localSent)

          if (data.ok) {
            localRecv++
            setReceived(localRecv)
            const lat = Number(data.latency_ms) || 0
            localLats.push(lat)
            setLatencies([...localLats])
            appendLine(
              data.raw_line || (isEn ? `[#${seq}] Response OK (${lat} ms)` : `[#${seq}] Respuesta OK (${lat} ms)`),
              lat > 250 ? 'warn' : 'ok',
              { latencyMs: lat }
            )
          } else {
            appendLine(
              data.raw_line || (isEn ? `[#${seq}] Request timed out / Connection failed` : `[#${seq}] Tiempo de espera agotado / Falló conexión`),
              'err'
            )
          }
        } catch {
          if (runIdRef.current !== myRunId) break
          localSent++
          setSent(localSent)
          appendLine(isEn ? `[#${seq}] Communication error with diagnostic server` : `[#${seq}] Error de comunicación con el servidor de diagnóstico`, 'err')
        }

        if (seq < limit && runIdRef.current === myRunId) {
          await sleep(runIntervalMs)
        }
      }

      if (runIdRef.current === myRunId || localSent > 0) {
        const lost = localSent - localRecv
        const lossPct = localSent > 0 ? ((lost / localSent) * 100).toFixed(1) : '0.0'
        const minLat = localLats.length > 0 ? Math.min(...localLats).toFixed(2) : '0'
        const maxLat = localLats.length > 0 ? Math.max(...localLats).toFixed(2) : '0'
        const avgLat =
          localLats.length > 0
            ? (localLats.reduce((a, b) => a + b, 0) / localLats.length).toFixed(2)
            : '0'

        appendLine(
          isEn
            ? `─── ${runMode} Summary (${cleanTarget}${runMode === 'PAPING' ? `:${runPort}` : ''}): Sent=${localSent}, Successful=${localRecv}, Lost=${lost} (${lossPct}%) | Min=${minLat}ms · Avg=${avgLat}ms · Max=${maxLat}ms ───`
            : `─── Resumen ${runMode} (${cleanTarget}${runMode === 'PAPING' ? `:${runPort}` : ''}): Enviados=${localSent}, Exitosos=${localRecv}, Perdidos=${lost} (${lossPct}%) | Mín=${minLat}ms · Prom=${avgLat}ms · Máx=${maxLat}ms ───`,
          lost === 0 ? 'ok' : lost === localSent ? 'err' : 'warn'
        )
      }
      if (runIdRef.current === myRunId) setIsRunning(false)
      return
    }

    if (runMode === 'TRACEROUTE') {
      appendLine(
        isEn
          ? `▶ Running Route Trace (TRACEROUTE ICMP/UDP) to ${cleanTarget} (max. ${runMaxHops} hops)...`
          : `▶ Ejecutando Traza de Ruta (TRACEROUTE ICMP/UDP) hacia ${cleanTarget} (máx. ${runMaxHops} saltos)...`,
        'info'
      )
      appendLine(isEn ? `Hop        Router / Node IP          RTT Latency` : `Salto      IP del Router / Nodo      Latencia RTT`, 'info')

      for (let hop = 1; hop <= runMaxHops; hop++) {
        if (runIdRef.current !== myRunId) break

        try {
          const resp = await fetch('/api/diagnostics/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'TRACEROUTE_HOP',
              target: cleanTarget,
              hop,
              timeout_ms: 2500,
            }),
          })
          const data = await resp.json()
          if (runIdRef.current !== myRunId) break

          setSent(hop)
          if (data.ok) {
            setReceived(prev => prev + 1)
            const lat = Number(data.latency_ms) || 0
            setLatencies(prev => [...prev, lat])
            appendLine(
              data.raw_line || (isEn ? `Hop ${hop}: ${data.hop_ip} (${lat} ms)` : `Salto ${hop}: ${data.hop_ip} (${lat} ms)`),
              data.reached ? 'ok' : lat > 200 ? 'warn' : 'ok',
              {
                hop,
                hopIp: data.hop_ip,
                latencyMs: lat,
                reached: Boolean(data.reached),
              }
            )
            if (data.reached) {
              appendLine(
                isEn
                  ? `✅ Trace completed successfully in ${hop} ${hop === 1 ? 'hop' : 'hops'} to ${data.resolved_ip || cleanTarget}.`
                  : `✅ Traza completada con éxito en ${hop} ${hop === 1 ? 'salto' : 'saltos'} hacia ${data.resolved_ip || cleanTarget}.`,
                'ok'
              )
              break
            }
          } else {
            appendLine(
              data.raw_line || (isEn ? `Hop ${hop}: * * * (No ICMP response at this hop)` : `Salto ${hop}: * * * (Sin respuesta ICMP en este salto)`),
              'warn',
              { hop, hopIp: '*', latencyMs: 0 }
            )
          }
        } catch {
          if (runIdRef.current !== myRunId) break
          appendLine(isEn ? `Hop ${hop}: Error querying hop` : `Salto ${hop}: Error consultando salto`, 'err')
        }
      }

      if (runIdRef.current === myRunId) setIsRunning(false)
      return
    }

    if (runMode === 'HTTP' || runMode === 'DNS') {
      appendLine(
        runMode === 'HTTP'
          ? (isEn
              ? `▶ Inspecting HTTP/HTTPS response and SSL Certificate of ${cleanTarget} (Port ${runPort})...`
              : `▶ Inspeccionando respuesta HTTP/HTTPS y Certificado SSL de ${cleanTarget} (Puerto ${runPort})...`)
          : (isEn
              ? `▶ Resolving forward and reverse (PTR) DNS records for ${cleanTarget}...`
              : `▶ Resolviendo registros DNS directos e inversos (PTR) para ${cleanTarget}...`),
        'info'
      )
      try {
        const resp = await fetch('/api/diagnostics/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: runMode,
            target: cleanTarget,
            port: Number(runPort) || 443,
            timeout_ms: 5000,
          }),
        })
        const data = await resp.json()
        if (runIdRef.current !== myRunId) return
        setSent(1)
        if (data.ok) {
          setReceived(1)
          if (data.latency_ms) setLatencies([Number(data.latency_ms)])
        }
        const outLines: string[] =
          Array.isArray(data.raw_lines) && data.raw_lines.length > 0
            ? data.raw_lines
            : [data.raw_line || (isEn ? 'No output' : 'Sin salida')]
        outLines.forEach(l => appendLine(l, data.ok ? 'ok' : 'err'))
      } catch {
        if (runIdRef.current !== myRunId) return
        appendLine(isEn ? '❌ Error executing diagnostic test on server.' : '❌ Error ejecutando prueba diagnóstica en el servidor.', 'err')
      }
      if (runIdRef.current === myRunId) setIsRunning(false)
    }
  }, [appendLine])

  // Computed live stats
  const lostCount = Math.max(0, sent - received)
  const lossPercent = sent > 0 ? ((lostCount / sent) * 100).toFixed(1) : '0.0'
  const minLatency = latencies.length > 0 ? Math.min(...latencies).toFixed(2) : '—'
  const maxLatency = latencies.length > 0 ? Math.max(...latencies).toFixed(2) : '—'
  const avgLatency =
    latencies.length > 0
      ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)
      : '—'
  const jitterMs = (() => {
    if (latencies.length < 2) return '0.00'
    let diffSum = 0
    for (let i = 1; i < latencies.length; i++) {
      diffSum += Math.abs(latencies[i] - latencies[i - 1])
    }
    return (diffSum / (latencies.length - 1)).toFixed(2)
  })()

  const buildReportText = () => {
    const header = (isEn ? [
      `====================================================================`,
      `  UPTIMECORE - LIVE DIAGNOSTIC REPORT (${mode})`,
      `====================================================================`,
      selectedMonitor ? `Site / Sensor : ${initialGroupName ? `${initialGroupName} · ` : ''}${selectedMonitor.name}` : '',
      `Target        : ${target}${mode === 'PAPING' || mode === 'HTTP' ? ` (TCP Port: ${port})` : ''}`,
      `Date & Time   : ${new Date().toLocaleString('en-US')}`,
      `Statistics    : Sent=${sent} | Received=${received} | Loss=${lossPercent}% | Min=${minLatency}ms | Avg=${avgLatency}ms | Max=${maxLatency}ms | Jitter=${jitterMs}ms`,
      `--------------------------------------------------------------------`,
    ] : [
      `====================================================================`,
      `  UPTIMECORE - REPORTE DE DIAGNÓSTICO EN VIVO (${mode})`,
      `====================================================================`,
      selectedMonitor ? `Sitio / Sensor : ${initialGroupName ? `${initialGroupName} · ` : ''}${selectedMonitor.name}` : '',
      `Objetivo       : ${target}${mode === 'PAPING' || mode === 'HTTP' ? ` (Puerto TCP: ${port})` : ''}`,
      `Fecha y Hora   : ${new Date().toLocaleString('es-MX')}`,
      `Estadísticas   : Enviados=${sent} | Exitosos=${received} | Pérdida=${lossPercent}% | Mín=${minLatency}ms | Prom=${avgLatency}ms | Máx=${maxLatency}ms | Jitter=${jitterMs}ms`,
      `--------------------------------------------------------------------`,
    ])
      .filter(Boolean)
      .join('\r\n')

    const body = lines.map(l => `[${l.timestamp}] ${l.text}`).join('\r\n')
    return `${header}\r\n${body}\r\n`
  }

  // 1. Copiar Texto al Portapapeles (con soporte HTTP)
  const handleCopyText = async () => {
    const txt = buildReportText()
    const ok = await copyTextSafe(txt)
    if (ok) {
      setCopiedTxt(true)
      setTimeout(() => setCopiedTxt(false), 2500)
    }
  }

  // 2. Descargar archivo .TXT
  const handleDownloadTxt = () => {
    const txt = buildReportText()
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeHost = (target || 'host').replace(/[^a-zA-Z0-9._-]/g, '_')
    a.href = url
    a.download = `Diagnostico_${mode}_${safeHost}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 3. Capturar y Descargar Imagen (.PNG) lista para pegar en Ticket / WhatsApp / Teams
  const handleExportImagePng = () => {
    const visibleLines = lines.slice(-28)
    const width = 1060
    const rowHeight = 22
    const headerHeight = 165
    const footerHeight = 36
    const height = Math.max(360, headerHeight + visibleLines.length * rowHeight + footerHeight)

    const canvas = document.createElement('canvas')
    canvas.width = width * 2 // Retina 2x
    canvas.height = height * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)

    // Background
    ctx.fillStyle = '#070b14'
    ctx.fillRect(0, 0, width, height)

    // Top banner
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, 74)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

    // Title
    ctx.fillStyle = '#38bdf8'
    ctx.font = 'bold 16px Consolas, monospace'
    ctx.fillText(isEn ? `UPTIMECORE · LIVE DIAGNOSTICS [${mode}]` : `UPTIMECORE · DIAGNÓSTICO EN VIVO [${mode}]`, 24, 30)

    ctx.fillStyle = '#cbd5e1'
    ctx.font = '12.5px Consolas, monospace'
    const subtitle = `${selectedMonitor ? `${initialGroupName ? initialGroupName + ' · ' : ''}${selectedMonitor.name}  |  ` : ''}Host: ${target}${mode === 'PAPING' || mode === 'HTTP' ? `:${port}` : ''}  |  ${new Date().toLocaleString(isEn ? 'en-US' : 'es-MX')}`
    ctx.fillText(subtitle, 24, 54)

    // KPI boxes
    const kpis = [
      { label: mode === 'TRACEROUTE' ? (isEn ? 'HOPS' : 'SALTOS') : (isEn ? 'SENT' : 'ENVIADOS'), val: String(sent), color: '#f8fafc' },
      { label: mode === 'TRACEROUTE' ? (isEn ? 'RESPONDED' : 'RESPONDIERON') : (isEn ? 'SUCCESSFUL' : 'EXITOSOS'), val: String(received), color: '#4ade80' },
      { label: isEn ? 'LOSS' : 'PÉRDIDA', val: `${lossPercent}%`, color: Number(lossPercent) > 0 ? '#f87171' : '#4ade80' },
      { label: isEn ? 'MIN' : 'MÍNIMO', val: minLatency === '—' ? '—' : `${minLatency} ms`, color: '#38bdf8' },
      { label: isEn ? 'AVG' : 'PROMEDIO', val: avgLatency === '—' ? '—' : `${avgLatency} ms`, color: '#c084fc' },
      { label: isEn ? 'MAX' : 'MÁXIMO', val: maxLatency === '—' ? '—' : `${maxLatency} ms`, color: '#fbbf24' },
      { label: 'JITTER', val: `${jitterMs} ms`, color: '#2dd4bf' },
    ]
    const boxW = (width - 48 - 6 * 8) / 7
    kpis.forEach((k, idx) => {
      const bx = 24 + idx * (boxW + 8)
      const by = 86
      ctx.fillStyle = '#111c33'
      ctx.fillRect(bx, by, boxW, 50)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
      ctx.strokeRect(bx, by, boxW, 50)

      ctx.fillStyle = '#64748b'
      ctx.font = 'bold 9.5px Consolas, monospace'
      ctx.fillText(k.label, bx + 10, by + 18)

      ctx.fillStyle = k.color
      ctx.font = 'bold 13px Consolas, monospace'
      ctx.fillText(k.val, bx + 10, by + 39)
    })

    // Console lines
    let y = headerHeight
    visibleLines.forEach(l => {
      ctx.fillStyle = '#475569'
      ctx.font = '11.5px Consolas, monospace'
      ctx.fillText(`[${l.timestamp}]`, 24, y)

      ctx.fillStyle =
        l.status === 'ok'
          ? '#4ade80'
          : l.status === 'err'
          ? '#f87171'
          : l.status === 'warn'
          ? '#fbbf24'
          : '#93c5fd'
      ctx.font = '12px Consolas, monospace'
      ctx.fillText(l.text.slice(0, 118), 108, y)
      y += rowHeight
    })

    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safeHost = (target || 'host').replace(/[^a-zA-Z0-9._-]/g, '_')
      a.href = url
      a.download = `Diagnostico_${mode}_${safeHost}.png`
      a.click()
      URL.revokeObjectURL(url)
      setExportedImg(true)
      setTimeout(() => setExportedImg(false), 2500)
    }, 'image/png')
  }

  const TOOLS: { id: DiagnosticToolMode; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: 'PAPING', label: 'PAPING (TCP)', sub: isEn ? 'TCP port connectivity ping' : 'Ping a puerto TCP específico', icon: <Wifi size={15} /> },
    { id: 'PING', label: 'PING (ICMP)', sub: isEn ? 'Real-time standard ICMP ping' : 'Ping ICMP estándar en vivo', icon: <Activity size={15} /> },
    { id: 'TRACEROUTE', label: 'TRACEROUTE', sub: isEn ? 'Hop-by-hop route trace' : 'Traza de ruta salto a salto', icon: <Route size={15} /> },
    { id: 'HTTP', label: 'HTTP / SSL', sub: isEn ? 'Web response & SSL validity' : 'Respuesta web y vigencia SSL', icon: <Globe size={15} /> },
    { id: 'DNS', label: 'DNS / PTR', sub: isEn ? 'Forward & reverse DNS lookup' : 'Resolución directa e inversa', icon: <Search size={15} /> },
    { id: 'SSH', label: 'SHELL (SSH)', sub: isEn ? 'Interactive multi-tab terminal' : 'Terminal interactiva multi-tab', icon: <Terminal size={15} /> },
  ]

  return (
    <div
      onClick={() => {
        stopDiagnostic()
        onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '95vw',
          maxWidth: 1240,
          height: mode === 'SSH' ? '88vh' : undefined,
          maxHeight: '92vh',
          background: '#0f172a',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: 18,
          boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            padding: '14px 24px',
            background: 'linear-gradient(90deg, rgba(14,165,233,0.15), rgba(30,41,59,0.65))',
            borderBottom: '1px solid rgba(148,163,184,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(14, 165, 233, 0.16)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Terminal size={19} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {isEn ? 'Live Diagnostics Console' : 'Consola de Diagnóstico en Vivo'}
                </h2>
                {selectedMonitor && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    {initialGroupName ? `${initialGroupName} · ` : ''}
                    {selectedMonitor.name}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
                {isEn ? 'Choose tool, target, and protocol, then click Run when ready' : 'Elige la herramienta, el puerto o protocolo deseado y haz clic en Ejecutar cuando estés listo'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopDiagnostic()
              onClose()
            }}
            style={{
              background: 'rgba(148,163,184,0.1)',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#cbd5e1',
              width: 34,
              height: 34,
              borderRadius: 9,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isEn ? 'Close diagnostics' : 'Cerrar diagnóstico'}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── SELECTOR RÁPIDO DE SENSORES DEL GRUPO (si el grupo tiene varios endpoints) ── */}
        {groupMonitors && groupMonitors.length > 1 && (
          <div
            style={{
              padding: '8px 24px',
              background: '#090f1d',
              borderBottom: '1px solid rgba(148,163,184,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
              <Server size={12} /> {isEn ? 'Group Sensors:' : 'Sensores del grupo:'}
            </span>
            {groupMonitors.map(gm => {
              const isSel = selectedMonitor?.id === gm.id
              const parsed = parseMonitorTargetAndPort(gm)
              return (
                <button
                  key={gm.id}
                  onClick={() => {
                    stopDiagnostic()
                    setSelectedMonitor(gm)
                    setTarget(parsed.host)
                    if (mode === 'SSH') {
                      setPort(gm.type === 'SSH' && gm.port ? gm.port : 22)
                    } else {
                      setPort(parsed.port)
                      setMode(parsed.mode)
                    }
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 7,
                    cursor: 'pointer',
                    border: isSel ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,0.18)',
                    background: isSel ? 'rgba(14,165,233,0.2)' : 'rgba(30,41,59,0.5)',
                    color: isSel ? '#38bdf8' : '#cbd5e1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{gm.name}</span>
                  <span style={{ fontSize: 10, color: isSel ? '#bae6fd' : '#64748b', fontFamily: 'monospace' }}>
                    ({parsed.host}{gm.type === 'TCP' || gm.type === 'TCP_PING' || gm.port ? `:${parsed.port}` : ''})
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── SELECTOR DE HERRAMIENTA (Solo selecciona el modo sin ejecutar hasta que el usuario lo indique) ── */}
        <div
          style={{
            padding: '10px 24px',
            background: 'rgba(15,23,42,0.75)',
            borderBottom: '1px solid rgba(148,163,184,0.1)',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {TOOLS.map(t => {
            const active = mode === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (isRunning) stopDiagnostic()
                  setMode(t.id)
                }}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: active
                    ? '1px solid #38bdf8'
                    : '1px solid rgba(148,163,184,0.14)',
                  background: active
                    ? 'linear-gradient(180deg, rgba(14,165,233,0.22), rgba(14,165,233,0.08))'
                    : 'rgba(30,41,59,0.45)',
                  color: active ? '#f8fafc' : '#94a3b8',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 12, color: active ? '#38bdf8' : '#e2e8f0' }}>
                  {t.icon} {t.label}
                </div>
                <span style={{ fontSize: 10, color: active ? '#bae6fd' : '#64748b' }}>{t.sub}</span>
              </button>
            )
          })}
        </div>

        {mode === 'SSH' ? (
          <div style={{ flex: 1, minHeight: 480, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SshTerminalView
              initialMonitor={selectedMonitor}
              initialGroupName={initialGroupName}
              groupMonitors={groupMonitors}
            />
          </div>
        ) : (
          <>
            {/* ── PARÁMETROS DE PRUEBA (IP/Host, Puerto TCP estilo Paping, Intervalo) ── */}
            <div
          style={{
            padding: '12px 24px',
            background: 'rgba(30,41,59,0.35)',
            borderBottom: '1px solid rgba(148,163,184,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            {/* Host / IP */}
            <div style={{ flex: '1 1 260px' }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                {isEn ? 'HOST / IP ADDRESS / DOMAIN' : 'HOST / DIRECCIÓN IP / DOMINIO'}
              </label>
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder={isEn ? 'e.g. 192.168.1.1 or router.example.com' : 'Ej. 192.168.1.1 o router.ejemplo.com'}
                onKeyDown={e => {
                  if (e.key === 'Enter' && target.trim() && !isRunning) {
                    executeRun(mode, target, port, intervalMs, maxProbes, maxHops)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 9,
                  background: '#090d16',
                  border: '1px solid rgba(148,163,184,0.25)',
                  color: '#f8fafc',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
            </div>

            {/* Puerto TCP (para PAPING y HTTP/SSL) */}
            {(mode === 'PAPING' || mode === 'HTTP') && (
              <div style={{ width: 130 }}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  {isEn ? 'TCP PORT' : 'PUERTO TCP'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={e => setPort(Number(e.target.value))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && target.trim() && !isRunning) {
                      executeRun(mode, target, port, intervalMs, maxProbes, maxHops)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 9,
                    background: '#090d16',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    color: '#38bdf8',
                    fontSize: 13,
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Intervalo y Cantidad para PAPING / PING */}
            {(mode === 'PAPING' || mode === 'PING') && (
              <>
                <div style={{ width: 125 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                    {isEn ? 'INTERVAL' : 'INTERVALO'}
                  </label>
                  <select
                    value={intervalMs}
                    onChange={e => setIntervalMs(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 9,
                      background: '#090d16',
                      border: '1px solid rgba(148,163,184,0.25)',
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <option value={500}>{isEn ? 'Every 0.5s' : 'Cada 0.5 seg'}</option>
                    <option value={1000}>{isEn ? 'Every 1s' : 'Cada 1 seg'}</option>
                    <option value={2000}>{isEn ? 'Every 2s' : 'Cada 2 seg'}</option>
                  </select>
                </div>

                <div style={{ width: 145 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                    {isEn ? 'SAMPLES' : 'MUESTRAS'}
                  </label>
                  <select
                    value={maxProbes}
                    onChange={e => setMaxProbes(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 9,
                      background: '#090d16',
                      border: '1px solid rgba(148,163,184,0.25)',
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <option value={10}>{isEn ? '10 packets' : '10 paquetes'}</option>
                    <option value={25}>{isEn ? '25 packets' : '25 paquetes'}</option>
                    <option value={50}>{isEn ? '50 packets' : '50 paquetes'}</option>
                    <option value={0}>{isEn ? 'Continuous (∞)' : 'Continuo (∞)'}</option>
                  </select>
                </div>
              </>
            )}

            {/* Max Hops para TRACEROUTE */}
            {mode === 'TRACEROUTE' && (
              <div style={{ width: 140 }}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                  {isEn ? 'MAX HOPS (TTL)' : 'MÁX. SALTOS (TTL)'}
                </label>
                <select
                  value={maxHops}
                  onChange={e => setMaxHops(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 9,
                    background: '#090d16',
                    border: '1px solid rgba(148,163,184,0.25)',
                    color: '#e2e8f0',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <option value={15}>{isEn ? '15 hops' : '15 saltos'}</option>
                  <option value={20}>{isEn ? '20 hops' : '20 saltos'}</option>
                  <option value={30}>{isEn ? '30 hops' : '30 saltos'}</option>
                </select>
              </div>
            )}

            {/* Botones Iniciar / Detener */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!isRunning ? (
                <button
                  onClick={() => executeRun(mode, target, port, intervalMs, maxProbes, maxHops)}
                  disabled={!target.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 9,
                    border: 'none',
                    background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: target.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                  }}
                >
                  <Play size={14} fill="#fff" /> {isEn ? `Run ${mode}` : `Ejecutar ${mode}`}
                </button>
              ) : (
                <button
                  onClick={stopDiagnostic}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 9,
                    border: '1px solid rgba(239,68,68,0.5)',
                    background: 'rgba(239,68,68,0.2)',
                    color: '#f87171',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <Square size={13} fill="#f87171" /> {isEn ? 'Stop' : 'Detener'}
                </button>
              )}
            </div>
          </div>

          {/* Presets rápidos de puertos cuando está en modo PAPING o HTTP */}
          {(mode === 'PAPING' || mode === 'HTTP') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={11} /> {isEn ? 'Quick port select:' : 'Seleccionar puerto rápido:'}
              </span>
              {selectedMonitor?.port &&
                !QUICK_PORTS.some(q => q.port === selectedMonitor.port) && (
                  <button
                    onClick={() => {
                      if (isRunning) stopDiagnostic()
                      setPort(selectedMonitor.port!)
                    }}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 9px',
                      borderRadius: 6,
                      border:
                        port === selectedMonitor.port
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(148,163,184,0.2)',
                      background:
                        port === selectedMonitor.port
                          ? 'rgba(56,189,248,0.2)'
                          : 'rgba(15,23,42,0.6)',
                      color: port === selectedMonitor.port ? '#38bdf8' : '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedMonitor.port} {isEn ? '(From Sensor)' : '(Del Sensor)'}
                  </button>
                )}
              {QUICK_PORTS.map(q => {
                const activePort = port === q.port
                return (
                  <button
                    key={q.port}
                    onClick={() => {
                      if (isRunning) stopDiagnostic()
                      setPort(q.port)
                    }}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 9px',
                      borderRadius: 6,
                      border: activePort
                        ? '1px solid #38bdf8'
                        : '1px solid rgba(148,163,184,0.18)',
                      background: activePort
                        ? 'rgba(56,189,248,0.18)'
                        : 'rgba(15,23,42,0.6)',
                      color: activePort ? '#38bdf8' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    {q.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── TARJETAS DE MÉTRICAS EN VIVO ── */}
        <div
          style={{
            padding: '10px 24px',
            background: '#0b1120',
            borderBottom: '1px solid rgba(148,163,184,0.1)',
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {[
            { label: mode === 'TRACEROUTE' ? (isEn ? 'HOPS' : 'SALTOS') : (isEn ? 'SENT' : 'ENVIADOS'), val: String(sent), color: '#e2e8f0' },
            { label: mode === 'TRACEROUTE' ? (isEn ? 'RESPONDED' : 'RESPONDIERON') : (isEn ? 'SUCCESSFUL' : 'EXITOSOS'), val: String(received), color: '#22c55e' },
            {
              label: isEn ? 'LOSS' : 'PÉRDIDA',
              val: `${lossPercent}%`,
              color: Number(lossPercent) > 0 ? '#ef4444' : '#22c55e',
            },
            { label: isEn ? 'MIN' : 'MÍNIMO', val: minLatency === '—' ? '—' : `${minLatency} ms`, color: '#38bdf8' },
            { label: isEn ? 'AVG' : 'PROMEDIO', val: avgLatency === '—' ? '—' : `${avgLatency} ms`, color: '#a855f7' },
            { label: isEn ? 'MAX' : 'MÁXIMO', val: maxLatency === '—' ? '—' : `${maxLatency} ms`, color: '#f59e0b' },
            { label: 'JITTER', val: `${jitterMs} ms`, color: '#14b8a6' },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(30,41,59,0.45)',
                border: '1px solid rgba(148,163,184,0.1)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: stat.color, fontFamily: 'monospace', marginTop: 2 }}>
                {stat.val}
              </div>
            </div>
          ))}
        </div>

        {/* ── CONSOLA EN TIEMPO REAL (Sin cortes de línea feos) ── */}
        <div
          ref={consoleEndRef}
          style={{
            flex: 1,
            minHeight: 270,
            maxHeight: 370,
            overflowY: 'auto',
            overflowX: 'auto',
            padding: '14px 24px',
            background: '#050811',
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
            fontSize: 12.5,
            lineHeight: 1.65,
          }}
        >
          {lines.length === 0 ? (
            <div
              style={{
                height: 230,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                textAlign: 'center',
                gap: 8,
              }}
            >
              <Terminal size={30} style={{ opacity: 0.45 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                {isEn ? `Type an IP or domain above and click Run ${mode}` : `Escribe una IP o dominio arriba y presiona Ejecutar ${mode}`}
              </div>
            </div>
          ) : (
            lines.map(line => {
              const color =
                line.status === 'ok'
                  ? '#4ade80'
                  : line.status === 'err'
                  ? '#f87171'
                  : line.status === 'warn'
                  ? '#fbbf24'
                  : '#93c5fd'
              return (
                <div
                  key={line.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    padding: '2.5px 0',
                    borderBottom: '1px dashed rgba(30,41,59,0.45)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                    <span style={{ color: '#475569', fontSize: 11, userSelect: 'none', flexShrink: 0 }}>
                      [{line.timestamp}]
                    </span>
                    <span style={{ color }}>
                      {line.text}
                    </span>
                  </div>

                  {typeof line.latencyMs === 'number' && line.latencyMs > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 10.5, color: '#64748b', width: 58, textAlign: 'right' }}>
                        {line.latencyMs.toFixed(1)} ms
                      </span>
                      <div
                        style={{
                          width: 90,
                          height: 6,
                          background: 'rgba(30,41,59,0.85)',
                          borderRadius: 999,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(8, (line.latencyMs / 300) * 100))}%`,
                            height: '100%',
                            background:
                              line.latencyMs > 200
                                ? '#f59e0b'
                                : line.latencyMs > 80
                                ? '#38bdf8'
                                : '#22c55e',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
          {isRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: '#38bdf8', fontSize: 12 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#38bdf8',
                  display: 'inline-block',
                }}
              />
              {isEn ? `Running ${mode} in real time...` : `Ejecutando ${mode} en tiempo real...`}
            </div>
          )}
        </div>

        {/* ── FOOTER ACCIONES CLARAS (Copiar Texto, Descargar .TXT, Capturar Imagen .PNG) ── */}
        <div
          style={{
            padding: '12px 24px',
            background: '#0f172a',
            borderTop: '1px solid rgba(148,163,184,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={clearConsole}
              disabled={lines.length === 0 || isRunning}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(30,41,59,0.5)',
                color: '#cbd5e1',
                fontSize: 12,
                fontWeight: 600,
                cursor: lines.length === 0 || isRunning ? 'not-allowed' : 'pointer',
                opacity: lines.length === 0 || isRunning ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Trash2 size={13} /> {isEn ? 'Clear' : 'Limpiar'}
            </button>

            {/* 1. Copiar Texto al Portapapeles */}
            <button
              onClick={handleCopyText}
              disabled={lines.length === 0}
              style={{
                padding: '7px 13px',
                borderRadius: 8,
                border: copiedTxt ? '1px solid #22c55e' : '1px solid rgba(56,189,248,0.35)',
                background: copiedTxt ? 'rgba(34,197,94,0.18)' : 'rgba(14,165,233,0.12)',
                color: copiedTxt ? '#4ade80' : '#38bdf8',
                fontSize: 12,
                fontWeight: 700,
                cursor: lines.length === 0 ? 'not-allowed' : 'pointer',
                opacity: lines.length === 0 ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              title={isEn ? 'Copy report in text format to clipboard (Ctrl+V)' : 'Copia el reporte en formato TEXTO al portapapeles para pegarlo con Ctrl+V'}
            >
              {copiedTxt ? <Check size={14} /> : <Copy size={13} />}
              {copiedTxt ? (isEn ? 'Text copied (Ctrl+V)!' : '¡Texto copiado (Ctrl+V)!') : (isEn ? 'Copy Text (Clipboard)' : 'Copiar Texto (Portapapeles)')}
            </button>

            {/* 2. Descargar archivo .TXT */}
            <button
              onClick={handleDownloadTxt}
              disabled={lines.length === 0}
              style={{
                padding: '7px 13px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.25)',
                background: 'rgba(30,41,59,0.65)',
                color: '#e2e8f0',
                fontSize: 12,
                fontWeight: 700,
                cursor: lines.length === 0 ? 'not-allowed' : 'pointer',
                opacity: lines.length === 0 ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              title={isEn ? 'Download output as text file (.txt)' : 'Descarga el resultado como archivo de texto (.txt)'}
            >
              <FileText size={13} /> {isEn ? 'Download .TXT' : 'Descargar .TXT'}
            </button>

            {/* 3. Capturar y Descargar Imagen (.PNG) */}
            <button
              onClick={handleExportImagePng}
              disabled={lines.length === 0}
              style={{
                padding: '7px 13px',
                borderRadius: 8,
                border: exportedImg ? '1px solid #22c55e' : '1px solid rgba(168,85,247,0.4)',
                background: exportedImg ? 'rgba(34,197,94,0.18)' : 'rgba(168,85,247,0.14)',
                color: exportedImg ? '#4ade80' : '#c084fc',
                fontSize: 12,
                fontWeight: 700,
                cursor: lines.length === 0 ? 'not-allowed' : 'pointer',
                opacity: lines.length === 0 ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              title={isEn ? 'Generate and download a PNG screenshot of the console and metrics' : 'Genera y descarga una captura en IMAGEN (.PNG) de la consola y sus métricas'}
            >
              {exportedImg ? <Check size={14} /> : <Camera size={13} />}
              {exportedImg ? (isEn ? 'PNG Image Downloaded!' : '¡Imagen .PNG descargada!') : (isEn ? 'Download Image (.PNG)' : 'Descargar Imagen (.PNG)')}
            </button>
          </div>

          <button
            onClick={() => {
              stopDiagnostic()
              onClose()
            }}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(30,41,59,0.8)',
              color: '#e2e8f0',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.common.close}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
