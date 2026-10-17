/**
 * components/DiagnosticModal.tsx
 * Consola Interactiva de Diagnóstico en Vivo (estilo PAPING / PING / TRACEROUTE / HTTP-SSL / DNS)
 * Permite diagnosticar cualquier endpoint o IP/Host arbitrario en tiempo real.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Play, Square, Terminal, Wifi, Activity, Route, Globe, Search,
  Copy, Check, Trash2, Sparkles
} from 'lucide-react'
import type { Monitor } from '../types'

export type DiagnosticToolMode = 'PAPING' | 'PING' | 'TRACEROUTE' | 'HTTP' | 'DNS'

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
  onClose: () => void
}

const QUICK_PORTS = [
  { port: 80, label: '80 (HTTP)' },
  { port: 443, label: '443 (HTTPS)' },
  { port: 22, label: '22 (SSH)' },
  { port: 3389, label: '3389 (RDP)' },
  { port: 20754, label: '20754 (WAN/FW)' },
  { port: 8080, label: '8080 (Web)' },
  { port: 5432, label: '5432 (PG)' },
]

export function DiagnosticModal({ initialMonitor, initialGroupName, onClose }: Props) {
  // Determine default tool mode & port from initialMonitor
  const defaultMode: DiagnosticToolMode = (() => {
    if (!initialMonitor) return 'PAPING'
    const t = initialMonitor.type.toUpperCase()
    if (t === 'TCP' || t === 'TCP_PING') return 'PAPING'
    if (t === 'PING') return 'PING'
    if (t === 'HTTP' || t === 'HTTPS' || t === 'SSL') return 'PAPING'
    return 'PAPING'
  })()

  const defaultPort = (() => {
    if (initialMonitor?.port && initialMonitor.port > 0) return initialMonitor.port
    if (initialMonitor?.type === 'HTTPS' || initialMonitor?.type === 'SSL') return 443
    if (initialMonitor?.type === 'HTTP') return 80
    // Try extracting :port from target URL/host
    const m = initialMonitor?.target?.match(/:(\d+)/)
    if (m) return Number(m[1])
    return 443
  })()

  const [mode, setMode] = useState<DiagnosticToolMode>(defaultMode)
  const [target, setTarget] = useState<string>(initialMonitor?.target || '')
  const [port, setPort] = useState<number>(defaultPort)
  const [intervalMs, setIntervalMs] = useState<number>(1000)
  const [maxProbes, setMaxProbes] = useState<number>(0) // 0 = continuo (hasta detener o 100)
  const [maxHops, setMaxHops] = useState<number>(20)

  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [lines, setLines] = useState<ConsoleLine[]>([])
  const [copied, setCopied] = useState<boolean>(false)

  // Live stats for PAPING / PING
  const [sent, setSent] = useState<number>(0)
  const [received, setReceived] = useState<number>(0)
  const [latencies, setLatencies] = useState<number[]>([])

  const stopRef = useRef<boolean>(false)
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
      stopRef.current = true
    }
  }, [])

  const stopDiagnostic = useCallback(() => {
    stopRef.current = true
    setIsRunning(false)
  }, [])

  const clearConsole = () => {
    setLines([])
    setSent(0)
    setReceived(0)
    setLatencies([])
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const startDiagnostic = async () => {
    const cleanTarget = target.trim()
    if (!cleanTarget) return

    stopRef.current = false
    setIsRunning(true)
    setLines([])
    setSent(0)
    setReceived(0)
    setLatencies([])

    if (mode === 'PAPING' || mode === 'PING') {
      const limit = maxProbes > 0 ? maxProbes : 100
      const headerDesc =
        mode === 'PAPING'
          ? `Iniciando PAPING (TCP Port Ping) hacia ${cleanTarget} en puerto TCP ${port}...`
          : `Iniciando PING (ICMP Echo) hacia ${cleanTarget} con 64 bytes de datos...`
      appendLine(headerDesc, 'info')

      let localSent = 0
      let localRecv = 0
      const localLats: number[] = []

      for (let seq = 1; seq <= limit; seq++) {
        if (stopRef.current) break

        try {
          const resp = await fetch('/api/diagnostics/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode,
              target: cleanTarget,
              port: Number(port) || 80,
              seq,
              timeout_ms: 2500,
            }),
          })
          const data = await resp.json()
          if (stopRef.current) break

          localSent++
          setSent(localSent)

          if (data.ok) {
            localRecv++
            setReceived(localRecv)
            const lat = Number(data.latency_ms) || 0
            localLats.push(lat)
            setLatencies([...localLats])
            appendLine(
              data.raw_line || `[#${seq}] Respuesta OK (${lat} ms)`,
              lat > 250 ? 'warn' : 'ok',
              { latencyMs: lat }
            )
          } else {
            appendLine(
              data.raw_line || `[#${seq}] Tiempo de espera agotado / Falló conexión`,
              'err'
            )
          }
        } catch (err) {
          if (stopRef.current) break
          localSent++
          setSent(localSent)
          appendLine(`[#${seq}] Error de comunicación con el servidor de diagnóstico`, 'err')
        }

        if (seq < limit && !stopRef.current) {
          await sleep(intervalMs)
        }
      }

      const lost = localSent - localRecv
      const lossPct = localSent > 0 ? ((lost / localSent) * 100).toFixed(1) : '0.0'
      const minLat = localLats.length > 0 ? Math.min(...localLats).toFixed(2) : '0'
      const maxLat = localLats.length > 0 ? Math.max(...localLats).toFixed(2) : '0'
      const avgLat =
        localLats.length > 0
          ? (localLats.reduce((a, b) => a + b, 0) / localLats.length).toFixed(2)
          : '0'

      appendLine(
        `─── Estadísticas de ${mode} para ${cleanTarget}${mode === 'PAPING' ? `:${port}` : ''} ───`,
        'info'
      )
      appendLine(
        `Paquetes: Enviados = ${localSent}, Recibidos = ${localRecv}, Perdidos = ${lost} (${lossPct}% pérdida) | Mín = ${minLat}ms, Prom = ${avgLat}ms, Máx = ${maxLat}ms`,
        lost === 0 ? 'ok' : lost === localSent ? 'err' : 'warn'
      )
      setIsRunning(false)
      return
    }

    if (mode === 'TRACEROUTE') {
      appendLine(
        `Iniciando Traza de Ruta (TRACEROUTE) hacia ${cleanTarget} (máx. ${maxHops} saltos)...`,
        'info'
      )
      appendLine(`Salto   IP del Router / Nodo   Latencia RTT   Estado`, 'info')

      for (let hop = 1; hop <= maxHops; hop++) {
        if (stopRef.current) break

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
          if (stopRef.current) break

          setSent(hop)
          if (data.ok) {
            setReceived(prev => prev + 1)
            const lat = Number(data.latency_ms) || 0
            setLatencies(prev => [...prev, lat])
            appendLine(
              data.raw_line || `Salto ${hop}: ${data.hop_ip} (${lat} ms)`,
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
                `✅ Traza completada con éxito en ${hop} ${hop === 1 ? 'salto' : 'saltos'} hacia ${data.resolved_ip || cleanTarget}.`,
                'ok'
              )
              break
            }
          } else {
            appendLine(
              data.raw_line || `Salto ${hop}: * * * (Sin respuesta ICMP en este salto)`,
              'warn',
              { hop, hopIp: '*', latencyMs: 0 }
            )
          }
        } catch {
          if (stopRef.current) break
          appendLine(`Salto ${hop}: Error consultando salto`, 'err')
        }
      }

      setIsRunning(false)
      return
    }

    if (mode === 'HTTP' || mode === 'DNS') {
      appendLine(
        mode === 'HTTP'
          ? `Inspeccionando respuesta HTTP/HTTPS y Certificado SSL de ${cleanTarget} (Puerto ${port})...`
          : `Resolviendo registros DNS directos/inversos para ${cleanTarget}...`,
        'info'
      )
      try {
        const resp = await fetch('/api/diagnostics/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            target: cleanTarget,
            port: Number(port) || 443,
            timeout_ms: 5000,
          }),
        })
        const data = await resp.json()
        setSent(1)
        if (data.ok) {
          setReceived(1)
          if (data.latency_ms) setLatencies([Number(data.latency_ms)])
        }
        const outLines: string[] =
          Array.isArray(data.raw_lines) && data.raw_lines.length > 0
            ? data.raw_lines
            : [data.raw_line || 'Sin salida']
        outLines.forEach(l => appendLine(l, data.ok ? 'ok' : 'err'))
      } catch {
        appendLine('Error ejecutando prueba diagnóstica en el servidor.', 'err')
      }
      setIsRunning(false)
    }
  }

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

  const copyOutput = () => {
    const header = [
      `=== UptimeCore Diagnóstico en Vivo (${mode}) ===`,
      `Objetivo : ${target}${mode === 'PAPING' || mode === 'HTTP' ? ` (Puerto TCP: ${port})` : ''}`,
      initialMonitor ? `Sensor   : ${initialMonitor.name}${initialGroupName ? ` (${initialGroupName})` : ''}` : '',
      `Fecha    : ${new Date().toLocaleString('es-MX')}`,
      `Resumen  : Enviados=${sent} | Recibidos=${received} | Pérdida=${lossPercent}% | Mín=${minLatency}ms | Prom=${avgLatency}ms | Máx=${maxLatency}ms | Jitter=${jitterMs}ms`,
      `----------------------------------------`,
    ]
      .filter(Boolean)
      .join('\n')

    const body = lines.map(l => `[${l.timestamp}] ${l.text}`).join('\n')
    navigator.clipboard.writeText(`${header}\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const TOOLS: { id: DiagnosticToolMode; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: 'PAPING', label: 'PAPING (TCP)', sub: 'Ping a puerto TCP', icon: <Wifi size={15} /> },
    { id: 'PING', label: 'PING (ICMP)', sub: 'Ping estándar en vivo', icon: <Activity size={15} /> },
    { id: 'TRACEROUTE', label: 'TRACEROUTE', sub: 'Traza salto a salto', icon: <Route size={15} /> },
    { id: 'HTTP', label: 'HTTP / SSL', sub: 'Headers y vigencia SSL', icon: <Globe size={15} /> },
    { id: 'DNS', label: 'DNS / PTR', sub: 'Resolución de nombres', icon: <Search size={15} /> },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '92vh',
          background: '#0f172a',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: 18,
          boxShadow: '0 25px 70px rgba(0,0,0,0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            padding: '16px 22px',
            background: 'linear-gradient(90deg, rgba(14,165,233,0.14), rgba(30,41,59,0.6))',
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
                width: 40,
                height: 40,
                borderRadius: 11,
                background: 'rgba(14, 165, 233, 0.16)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Terminal size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Consola de Diagnóstico en Vivo
                </h2>
                {initialMonitor && (
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
                    {initialMonitor.name}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Pruebas interactivas en tiempo real estilo <strong>paping</strong> (TCP por puerto), <strong>ping</strong>, <strong>traceroute</strong>, <strong>HTTP/SSL</strong> y <strong>DNS</strong>
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
            title="Cerrar diagnóstico"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── SELECTOR DE HERRAMIENTA ── */}
        <div
          style={{
            padding: '12px 22px',
            background: 'rgba(15,23,42,0.75)',
            borderBottom: '1px solid rgba(148,163,184,0.1)',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
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
                  padding: '9px 11px',
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

        {/* ── PARÁMETROS DE PRUEBA (IP/Host, Puerto TCP estilo Paping, Intervalo) ── */}
        <div
          style={{
            padding: '14px 22px',
            background: 'rgba(30,41,59,0.35)',
            borderBottom: '1px solid rgba(148,163,184,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            {/* Host / IP */}
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                HOST / DIRECCIÓN IP / DOMINIO
              </label>
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="Ej. 3.4.20.253 o fortinet.empresa.com"
                disabled={isRunning}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !isRunning) startDiagnostic()
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
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
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  PUERTO TCP
                </label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={e => setPort(Number(e.target.value))}
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
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
                <div style={{ width: 120 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                    INTERVALO
                  </label>
                  <select
                    value={intervalMs}
                    onChange={e => setIntervalMs(Number(e.target.value))}
                    disabled={isRunning}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: 9,
                      background: '#090d16',
                      border: '1px solid rgba(148,163,184,0.25)',
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <option value={500}>Cada 0.5 seg</option>
                    <option value={1000}>Cada 1 seg</option>
                    <option value={2000}>Cada 2 seg</option>
                  </select>
                </div>

                <div style={{ width: 135 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                    MUESTRAS
                  </label>
                  <select
                    value={maxProbes}
                    onChange={e => setMaxProbes(Number(e.target.value))}
                    disabled={isRunning}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: 9,
                      background: '#090d16',
                      border: '1px solid rgba(148,163,184,0.25)',
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <option value={0}>Continuo (∞)</option>
                    <option value={10}>10 paquetes</option>
                    <option value={25}>25 paquetes</option>
                    <option value={50}>50 paquetes</option>
                  </select>
                </div>
              </>
            )}

            {/* Max Hops para TRACEROUTE */}
            {mode === 'TRACEROUTE' && (
              <div style={{ width: 140 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                  MÁX. SALTOS (TTL)
                </label>
                <select
                  value={maxHops}
                  onChange={e => setMaxHops(Number(e.target.value))}
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 9,
                    background: '#090d16',
                    border: '1px solid rgba(148,163,184,0.25)',
                    color: '#e2e8f0',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <option value={15}>15 saltos</option>
                  <option value={20}>20 saltos</option>
                  <option value={30}>30 saltos</option>
                </select>
              </div>
            )}

            {/* Botones Iniciar / Detener */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!isRunning ? (
                <button
                  onClick={startDiagnostic}
                  disabled={!target.trim()}
                  style={{
                    padding: '9px 18px',
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
                  <Play size={15} fill="#fff" /> Iniciar {mode}
                </button>
              ) : (
                <button
                  onClick={stopDiagnostic}
                  style={{
                    padding: '9px 18px',
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
                  <Square size={14} fill="#f87171" /> Detener
                </button>
              )}
            </div>
          </div>

          {/* Presets rápidos de puertos cuando está en modo PAPING o HTTP */}
          {(mode === 'PAPING' || mode === 'HTTP') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={11} /> Puertos rápidos:
              </span>
              {initialMonitor?.port &&
                !QUICK_PORTS.some(q => q.port === initialMonitor.port) && (
                  <button
                    onClick={() => !isRunning && setPort(initialMonitor.port!)}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border:
                        port === initialMonitor.port
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(148,163,184,0.2)',
                      background:
                        port === initialMonitor.port
                          ? 'rgba(56,189,248,0.2)'
                          : 'rgba(15,23,42,0.6)',
                      color: port === initialMonitor.port ? '#38bdf8' : '#cbd5e1',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {initialMonitor.port} (Del Sensor)
                  </button>
                )}
              {QUICK_PORTS.map(q => {
                const activePort = port === q.port
                return (
                  <button
                    key={q.port}
                    onClick={() => !isRunning && setPort(q.port)}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: activePort
                        ? '1px solid #38bdf8'
                        : '1px solid rgba(148,163,184,0.18)',
                      background: activePort
                        ? 'rgba(56,189,248,0.18)'
                        : 'rgba(15,23,42,0.6)',
                      color: activePort ? '#38bdf8' : '#94a3b8',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {q.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── TARJETAS DE MÉTRICAS EN VIVO (Enviados, Recibidos, Pérdida, Mín/Prom/Máx, Jitter) ── */}
        <div
          style={{
            padding: '10px 22px',
            background: '#0b1120',
            borderBottom: '1px solid rgba(148,163,184,0.1)',
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {[
            { label: mode === 'TRACEROUTE' ? 'SALTOS' : 'ENVIADOS', val: String(sent), color: '#e2e8f0' },
            { label: mode === 'TRACEROUTE' ? 'RESPONDIERON' : 'EXITOSOS', val: String(received), color: '#22c55e' },
            {
              label: 'PÉRDIDA',
              val: `${lossPercent}%`,
              color: Number(lossPercent) > 0 ? '#ef4444' : '#22c55e',
            },
            { label: 'MÍNIMO', val: minLatency === '—' ? '—' : `${minLatency} ms`, color: '#38bdf8' },
            { label: 'PROMEDIO', val: avgLatency === '—' ? '—' : `${avgLatency} ms`, color: '#a855f7' },
            { label: 'MÁXIMO', val: maxLatency === '—' ? '—' : `${maxLatency} ms`, color: '#f59e0b' },
            { label: 'JITTER', val: `${jitterMs} ms`, color: '#14b8a6' },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                padding: '7px 10px',
                borderRadius: 9,
                background: 'rgba(30,41,59,0.45)',
                border: '1px solid rgba(148,163,184,0.1)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: stat.color, fontFamily: 'monospace', marginTop: 2 }}>
                {stat.val}
              </div>
            </div>
          ))}
        </div>

        {/* ── CONSOLA EN TIEMPO REAL ── */}
        <div
          ref={consoleEndRef}
          style={{
            flex: 1,
            minHeight: 280,
            maxHeight: 380,
            overflowY: 'auto',
            padding: '14px 20px',
            background: '#050811',
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
            fontSize: 12.5,
            lineHeight: 1.65,
          }}
        >
          {lines.length === 0 ? (
            <div
              style={{
                height: 240,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                textAlign: 'center',
                gap: 8,
              }}
            >
              <Terminal size={32} style={{ opacity: 0.45 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                Consola lista para diagnosticar{' '}
                <span style={{ color: '#38bdf8' }}>{target || 'cualquier IP / Host'}</span>
                {(mode === 'PAPING' || mode === 'HTTP') && (
                  <span style={{ color: '#38bdf8' }}>:{port}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#475569', maxWidth: 460 }}>
                Haz clic en <strong>Iniciar {mode}</strong> para ver la salida en tiempo real paquete por paquete o salto por salto.
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
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '2px 0',
                    borderBottom: '1px dashed rgba(30,41,59,0.5)',
                  }}
                >
                  <span style={{ color: '#475569', fontSize: 11, userSelect: 'none', flexShrink: 0 }}>
                    [{line.timestamp}]
                  </span>
                  <span style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1 }}>
                    {line.text}
                  </span>
                  {typeof line.latencyMs === 'number' && line.latencyMs > 0 && (
                    <div
                      style={{
                        width: 90,
                        height: 6,
                        background: 'rgba(30,41,59,0.8)',
                        borderRadius: 999,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                      title={`${line.latencyMs} ms`}
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
                  animation: 'pulse 1s infinite',
                }}
              />
              Ejecutando {mode} en tiempo real...
            </div>
          )}
        </div>

        {/* ── FOOTER ACCIONES (Limpiar, Copiar Reporte, Cerrar) ── */}
        <div
          style={{
            padding: '12px 22px',
            background: '#0f172a',
            borderTop: '1px solid rgba(148,163,184,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                opacity: lines.length === 0 || isRunning ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Trash2 size={13} /> Limpiar
            </button>

            <button
              onClick={copyOutput}
              disabled={lines.length === 0}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid rgba(56,189,248,0.3)',
                background: 'rgba(14,165,233,0.12)',
                color: '#38bdf8',
                fontSize: 12,
                fontWeight: 700,
                cursor: lines.length === 0 ? 'not-allowed' : 'pointer',
                opacity: lines.length === 0 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? '¡Copiado al portapapeles!' : 'Copiar resultado para Ticket'}
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
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
