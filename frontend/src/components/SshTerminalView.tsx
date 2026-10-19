/**
 * components/SshTerminalView.tsx
 * Consola Web SSH interactiva con soporte Multi-Tab, 100% local,
 * integración con los sensores del grupo, y menú contextual con clic derecho
 * para Copiar / Pegar sin secuestrar Ctrl+C (preservando el envío de SIGINT a firewalls/servidores).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Terminal as TerminalIcon, Plus, X, Play, Square, RefreshCw,
  Copy, Clipboard, Trash2, Server, ChevronDown
} from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import type { Monitor } from '../types'

interface TabSession {
  id: string
  title: string
  host: string
  port: number
  user: string
  password: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMsg?: string
  fingerprint?: string
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  hasSelection: boolean
}

interface Props {
  initialMonitor?: Monitor | null
  initialGroupName?: string
  groupMonitors?: Monitor[]
}

/** Copia texto al portapapeles de manera segura (HTTPS o fallback textarea) */
async function copyTextSafe(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback
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

/** Limpia host si viene con protocolo o puerto */
function cleanHost(raw?: string | null): string {
  if (!raw) return ''
  let h = raw.trim().replace(/^https?:\/\//i, '')
  const slash = h.indexOf('/')
  if (slash !== -1) h = h.slice(0, slash)
  const col = h.match(/^([^:]+):(\d+)$/)
  if (col) h = col[1]
  return h
}

export function SshTerminalView({ initialMonitor, initialGroupName, groupMonitors }: Props) {
  const defaultHost = cleanHost(initialMonitor?.target) || '192.168.1.1'
  const defaultPort = (initialMonitor?.port && initialMonitor.port > 0) ? initialMonitor.port : 22
  const defaultTitle = initialMonitor ? initialMonitor.name : 'Sesión SSH 1'

  // Lista de sesiones / pestañas
  const [tabs, setTabs] = useState<TabSession[]>([
    {
      id: 'tab-1',
      title: defaultTitle,
      host: defaultHost,
      port: defaultPort,
      user: 'admin',
      password: '',
      status: 'disconnected',
    },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('tab-1')

  // Dropdown para agregar sesión desde sensores del grupo
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Menú contextual flotante con clic derecho
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    hasSelection: false,
  })

  // Modal para fallback de pegado si el navegador bloquea clipboard.readText()
  const [pasteModalOpen, setPasteModalOpen] = useState<boolean>(false)
  const [pasteInputText, setPasteInputText] = useState<string>('')
  const pasteInputRef = useRef<HTMLTextAreaElement>(null)

  // Referencias a los contenedores DOM de cada terminal (id -> HTMLDivElement)
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Referencias a las instancias de xterm (id -> Terminal)
  const termInstances = useRef<Record<string, Terminal>>({})
  // Referencias a FitAddons (id -> FitAddon)
  const fitAddons = useRef<Record<string, FitAddon>>({})
  // Referencias a WebSockets (id -> WebSocket)
  const wsInstances = useRef<Record<string, WebSocket>>({})
  // Referencia a intervalos de ping (id -> number)
  const pingIntervals = useRef<Record<string, number>>({})

  // Cierra menú contextual al hacer clic fuera
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(prev => (prev.visible ? { ...prev, visible: false } : prev))
      setShowAddMenu(false)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  // Inicializa o destruye terminales al cambiar tabs
  useEffect(() => {
    tabs.forEach(tab => {
      const container = containerRefs.current[tab.id]
      if (container && !termInstances.current[tab.id]) {
        const term = new Terminal({
          theme: {
            background: '#090d16',
            foreground: '#f8fafc',
            cursor: '#38bdf8',
            cursorAccent: '#090d16',
            selectionBackground: 'rgba(56, 189, 248, 0.35)',
            black: '#1e293b',
            red: '#f87171',
            green: '#4ade80',
            yellow: '#fbbf24',
            blue: '#60a5fa',
            magenta: '#c084fc',
            cyan: '#38bdf8',
            white: '#f1f5f9',
            brightBlack: '#475569',
            brightRed: '#ef4444',
            brightGreen: '#22c55e',
            brightYellow: '#f59e0b',
            brightBlue: '#3b82f6',
            brightMagenta: '#a855f7',
            brightCyan: '#06b6d4',
            brightWhite: '#ffffff',
          },
          fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', 'Courier New', monospace",
          fontSize: 13,
          lineHeight: 1.25,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 5000,
          allowTransparency: true,
        })

        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(container)
        fit.fit()

        // Escribir mensaje de bienvenida inicial
        term.writeln('\x1b[1;36m┌──────────────────────────────────────────────────────────┐\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[1;37mUptimeCore Web SSH Shell\x1b[0m  \x1b[90m(100% Local / Zero Cloud)\x1b[0m       \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[33mNota:\x1b[0m Ctrl+C envía interrupción remota (SIGINT)          \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  Usa \x1b[1;32mClic Derecho\x1b[0m para Copiar, Pegar o Limpiar           \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m└──────────────────────────────────────────────────────────┘\x1b[0m')
        term.writeln(`\x1b[90mObjetivo configurado: ${tab.host}:${tab.port} · Haz clic en "Conectar"\x1b[0m\r\n`)

        // Enviar teclas directamente al WebSocket
        term.onData(data => {
          const ws = wsInstances.current[tab.id]
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data }))
          }
        })

        termInstances.current[tab.id] = term
        fitAddons.current[tab.id] = fit
      }
    })

    // Redimensionar terminal activa
    const activeFit = fitAddons.current[activeTabId]
    if (activeFit) {
      setTimeout(() => {
        try {
          activeFit.fit()
        } catch {}
      }, 50)
    }
  }, [tabs, activeTabId])

  // Listener para resize de ventana
  useEffect(() => {
    const handleResize = () => {
      const fit = fitAddons.current[activeTabId]
      const term = termInstances.current[activeTabId]
      const ws = wsInstances.current[activeTabId]
      if (fit && term) {
        try {
          fit.fit()
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
          }
        } catch {}
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTabId])

  // Cierra conexiones al desmontar el componente
  useEffect(() => {
    return () => {
      Object.values(wsInstances.current).forEach(ws => {
        try {
          ws.close()
        } catch {}
      })
      Object.values(pingIntervals.current).forEach(id => clearInterval(id))
      Object.values(termInstances.current).forEach(t => {
        try {
          t.dispose()
        } catch {}
      })
    }
  }, [])

  // Iniciar conexión SSH en la pestaña activa
  const handleConnect = useCallback((tab: TabSession) => {
    const term = termInstances.current[tab.id]
    if (!term) return

    // Cerrar conexión anterior si existía
    if (wsInstances.current[tab.id]) {
      try {
        wsInstances.current[tab.id].close()
      } catch {}
    }
    if (pingIntervals.current[tab.id]) {
      clearInterval(pingIntervals.current[tab.id])
    }

    setTabs(prev =>
      prev.map(t =>
        t.id === tab.id ? { ...t, status: 'connecting', statusMsg: `Conectando a ${tab.host}:${tab.port}...` } : t
      )
    )

    term.writeln(`\r\n\x1b[33m➜ Conectando a ${tab.user}@${tab.host}:${tab.port}...\x1b[0m`)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ssh/ws`

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsInstances.current[tab.id] = ws
    } catch (err: any) {
      term.writeln(`\x1b[31m✖ Error creando WebSocket: ${err?.message || err}\x1b[0m\r\n`)
      setTabs(prev =>
        prev.map(t => (t.id === tab.id ? { ...t, status: 'error', statusMsg: 'Error de conexión WebSocket' } : t))
      )
      return
    }

    ws.onopen = () => {
      const cols = term.cols || 100
      const rows = term.rows || 30
      // Enviar solicitud de conexión SSH
      ws.send(
        JSON.stringify({
          type: 'connect',
          host: tab.host.trim(),
          port: tab.port || 22,
          user: tab.user.trim(),
          password: tab.password,
          cols,
          rows,
        })
      )

      // Keep-alive ping cada 25 segundos
      pingIntervals.current[tab.id] = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 25000)
    }

    ws.onmessage = event => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'connected') {
            setTabs(prev =>
              prev.map(t =>
                t.id === tab.id
                  ? {
                      ...t,
                      status: 'connected',
                      statusMsg: `Conectado como ${msg.message || tab.user}`,
                      fingerprint: msg.fingerprint,
                    }
                  : t
              )
            )
            term.writeln(`\x1b[1;32m✔ Sesión SSH establecida exitosamente con ${tab.host}\x1b[0m`)
            if (msg.fingerprint) {
              term.writeln(`\x1b[90m  Huella digital (Host Key): ${msg.fingerprint}\x1b[0m`)
            }
            term.writeln('')
          } else if (msg.type === 'status') {
            setTabs(prev =>
              prev.map(t => (t.id === tab.id ? { ...t, statusMsg: msg.message } : t))
            )
            term.writeln(`\x1b[90m${msg.message}\x1b[0m`)
          } else if (msg.type === 'prompt') {
            // Solicitud interactiva de contraseña o MFA
            const promptTitle = msg.name || 'Autenticación Requerida'
            const question = msg.prompts && msg.prompts[0] ? msg.prompts[0] : 'Contraseña:'
            const ans = window.prompt(`${promptTitle}\n${question}`)
            if (ans !== null && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'prompt_response', answers: [ans] }))
            } else {
              ws.close()
            }
          } else if (msg.type === 'error') {
            setTabs(prev =>
              prev.map(t => (t.id === tab.id ? { ...t, status: 'error', statusMsg: msg.message } : t))
            )
            term.writeln(`\r\n\x1b[1;31m✖ Error SSH: ${msg.message}\x1b[0m\r\n`)
          } else if (msg.type === 'closed') {
            setTabs(prev =>
              prev.map(t => (t.id === tab.id ? { ...t, status: 'disconnected', statusMsg: msg.message } : t))
            )
            term.writeln(`\r\n\x1b[33m● ${msg.message}\x1b[0m\r\n`)
          }
        } catch {
          term.write(event.data)
        }
      } else if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(event.data)
        term.write(text)
      }
    }

    ws.onerror = () => {
      setTabs(prev =>
        prev.map(t => (t.id === tab.id ? { ...t, status: 'error', statusMsg: 'Fallo en WebSocket' } : t))
      )
      term.writeln('\r\n\x1b[31m✖ Conexión con el servidor interrumpida\x1b[0m\r\n')
    }

    ws.onclose = () => {
      if (pingIntervals.current[tab.id]) {
        clearInterval(pingIntervals.current[tab.id])
      }
      setTabs(prev =>
        prev.map(t =>
          t.id === tab.id && t.status !== 'error'
            ? { ...t, status: 'disconnected', statusMsg: 'Sesión desconectada' }
            : t
        )
      )
    }
  }, [])

  // Desconectar sesión activa
  const handleDisconnect = (tabId: string) => {
    const ws = wsInstances.current[tabId]
    if (ws) {
      try {
        ws.close()
      } catch {}
    }
    if (pingIntervals.current[tabId]) {
      clearInterval(pingIntervals.current[tabId])
    }
    const term = termInstances.current[tabId]
    if (term) {
      term.writeln('\r\n\x1b[33m● Sesión cerrada por el usuario\x1b[0m\r\n')
    }
    setTabs(prev =>
      prev.map(t => (t.id === tabId ? { ...t, status: 'disconnected', statusMsg: 'Desconectado' } : t))
    )
  }

  // Cerrar pestaña
  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    handleDisconnect(tabId)

    const term = termInstances.current[tabId]
    if (term) {
      try {
        term.dispose()
      } catch {}
      delete termInstances.current[tabId]
      delete fitAddons.current[tabId]
      delete containerRefs.current[tabId]
    }

    const remaining = tabs.filter(t => t.id !== tabId)
    if (remaining.length === 0) {
      // Si se cierran todas, crear una nueva pestaña limpia
      const newId = `tab-${Date.now()}`
      setTabs([
        {
          id: newId,
          title: 'Sesión SSH',
          host: defaultHost,
          port: 22,
          user: 'admin',
          password: '',
          status: 'disconnected',
        },
      ])
      setActiveTabId(newId)
    } else {
      setTabs(remaining)
      if (activeTabId === tabId) {
        setActiveTabId(remaining[0].id)
      }
    }
  }

  // Agregar pestaña nueva
  const handleAddTab = (preset?: Monitor) => {
    setShowAddMenu(false)
    const newId = `tab-${Date.now()}`
    const host = preset ? cleanHost(preset.target) : ''
    const port = preset?.port && preset.port > 0 ? preset.port : 22
    const title = preset ? preset.name : `Sesión ${tabs.length + 1}`

    setTabs(prev => [
      ...prev,
      {
        id: newId,
        title,
        host: host || defaultHost,
        port,
        user: 'admin',
        password: '',
        status: 'disconnected',
      },
    ])
    setActiveTabId(newId)
  }

  // Manejador del menú contextual con clic derecho
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const activeTerm = termInstances.current[activeTabId]
    const selection = activeTerm ? activeTerm.getSelection().trim() : ''

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      hasSelection: selection.length > 0,
    })
  }

  // Acción: Copiar desde el menú contextual
  const handleMenuCopy = async () => {
    const activeTerm = termInstances.current[activeTabId]
    if (activeTerm) {
      const sel = activeTerm.getSelection()
      if (sel) {
        await copyTextSafe(sel)
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  // Acción: Pegar en la terminal
  const handleMenuPaste = async () => {
    setContextMenu(prev => ({ ...prev, visible: false }))
    const activeTerm = termInstances.current[activeTabId]
    const ws = wsInstances.current[activeTabId]

    // Intentar leer directo de navigator.clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data: text }))
          } else if (activeTerm) {
            activeTerm.write(text)
          }
          return
        }
      }
    } catch {
      // Bloqueado por permisos o contexto HTTP -> abrir modal fallback
    }

    // Fallback: abrir modal de pegado
    setPasteInputText('')
    setPasteModalOpen(true)
    setTimeout(() => pasteInputRef.current?.focus(), 80)
  }

  // Enviar texto pegado desde el modal fallback
  const handleConfirmPasteModal = () => {
    if (pasteInputText) {
      const ws = wsInstances.current[activeTabId]
      const activeTerm = termInstances.current[activeTabId]
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: pasteInputText }))
      } else if (activeTerm) {
        activeTerm.write(pasteInputText)
      }
    }
    setPasteModalOpen(false)
    setPasteInputText('')
  }

  // Acción: Limpiar pantalla
  const handleMenuClear = () => {
    const activeTerm = termInstances.current[activeTabId]
    if (activeTerm) {
      activeTerm.clear()
    }
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  // Acción: Enviar Ctrl+C (Interrupción)
  const handleMenuInterrupt = () => {
    const ws = wsInstances.current[activeTabId]
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data: '\x03' }))
    }
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 480,
        background: '#090d16',
        color: '#f8fafc',
        position: 'relative',
        overflow: 'hidden',
      }}
      onContextMenu={handleContextMenu}
    >
      {/* ── BARRA SUPERIOR DE PESTAÑAS (MULTI-TAB) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#070a12',
          borderBottom: '1px solid rgba(148,163,184,0.14)',
          padding: '4px 12px 0',
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          const statusColor =
            tab.status === 'connected'
              ? '#22c55e'
              : tab.status === 'connecting'
              ? '#fbbf24'
              : tab.status === 'error'
              ? '#ef4444'
              : '#64748b'

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: '8px 8px 0 0',
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#38bdf8' : '#94a3b8',
                background: isActive ? '#0f172a' : 'transparent',
                borderTop: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                borderLeft: isActive ? '1px solid rgba(148,163,184,0.15)' : '1px solid transparent',
                borderRight: isActive ? '1px solid rgba(148,163,184,0.15)' : '1px solid transparent',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Indicador de estado */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusColor,
                  boxShadow: tab.status === 'connected' ? '0 0 6px #22c55e' : 'none',
                }}
              />
              <span>{tab.title}</span>
              <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                ({tab.host}:{tab.port})
              </span>

              {/* Botón cerrar pestaña */}
              <button
                onClick={e => handleCloseTab(e, tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                }}
                title="Cerrar pestaña"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        {/* Botón + para agregar nueva pestaña o sensor del grupo */}
        <div style={{ position: 'relative' }} ref={addMenuRef}>
          <button
            onClick={() => setShowAddMenu(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 6,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: '#38bdf8',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              marginLeft: 4,
            }}
            title="Abrir nueva sesión o elegir sensor del grupo"
          >
            <Plus size={13} />
            <span>Nueva Pestaña</span>
            <ChevronDown size={12} />
          </button>

          {/* Menú desplegable al pulsar + */}
          {showAddMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                width: 280,
                background: '#0f172a',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
                zIndex: 1000,
                padding: '6px 0',
              }}
            >
              <button
                onClick={() => handleAddTab()}
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  textAlign: 'left',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <TerminalIcon size={14} color="#38bdf8" />
                <span>Sesión Personalizada (En blanco)</span>
              </button>

              {groupMonitors && groupMonitors.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '6px 14px 4px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderTop: '1px solid rgba(148,163,184,0.1)',
                      marginTop: 4,
                    }}
                  >
                    Sensores del Grupo {initialGroupName ? `(${initialGroupName})` : ''}
                  </div>
                  {groupMonitors.map(gm => {
                    const hostClean = cleanHost(gm.target)
                    return (
                      <button
                        key={gm.id}
                        onClick={() => handleAddTab(gm)}
                        style={{
                          width: '100%',
                          padding: '7px 14px',
                          background: 'transparent',
                          border: 'none',
                          color: '#e2e8f0',
                          textAlign: 'left',
                          fontSize: 11.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Server size={12} color="#94a3b8" />
                          <span style={{ fontWeight: 600 }}>{gm.name}</span>
                        </div>
                        <span style={{ fontSize: 10.5, color: '#38bdf8', fontFamily: 'monospace' }}>
                          {hostClean}:{gm.port || 22}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BARRA DE PARÁMETROS Y CONEXIÓN DE LA PESTAÑA ACTIVA ── */}
      <div
        style={{
          padding: '8px 16px',
          background: '#0c121e',
          borderBottom: '1px solid rgba(148,163,184,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Host */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Host:</span>
          <input
            type="text"
            value={activeTab.host}
            disabled={activeTab.status === 'connected' || activeTab.status === 'connecting'}
            onChange={e => {
              const val = e.target.value
              setTabs(prev => prev.map(t => (t.id === activeTab.id ? { ...t, host: val } : t)))
            }}
            placeholder="IP o Hostname"
            style={{
              flex: 1,
              padding: '5px 10px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#f8fafc',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>

        {/* Puerto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 110 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Puerto:</span>
          <input
            type="number"
            value={activeTab.port}
            disabled={activeTab.status === 'connected' || activeTab.status === 'connecting'}
            onChange={e => {
              const val = Number(e.target.value)
              setTabs(prev => prev.map(t => (t.id === activeTab.id ? { ...t, port: val } : t)))
            }}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#38bdf8',
              fontSize: 12,
              fontFamily: 'monospace',
              fontWeight: 700,
              outline: 'none',
            }}
          />
        </div>

        {/* Usuario */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 140 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Usuario:</span>
          <input
            type="text"
            value={activeTab.user}
            disabled={activeTab.status === 'connected' || activeTab.status === 'connecting'}
            onChange={e => {
              const val = e.target.value
              setTabs(prev => prev.map(t => (t.id === activeTab.id ? { ...t, user: val } : t)))
            }}
            placeholder="admin"
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#f8fafc',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>

        {/* Contraseña (opcional) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 160 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Clave:</span>
          <input
            type="password"
            value={activeTab.password}
            disabled={activeTab.status === 'connected' || activeTab.status === 'connecting'}
            onChange={e => {
              const val = e.target.value
              setTabs(prev => prev.map(t => (t.id === activeTab.id ? { ...t, password: val } : t)))
            }}
            placeholder="En blanco para terminal"
            title="Déjala en blanco para escribirla directamente en la terminal interactiva"
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#f8fafc',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>

        {/* Botón Conectar / Desconectar */}
        {activeTab.status === 'connected' ? (
          <button
            onClick={() => handleDisconnect(activeTab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 7,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Square size={13} fill="#f87171" /> Desconectar
          </button>
        ) : (
          <button
            onClick={() => handleConnect(activeTab)}
            disabled={activeTab.status === 'connecting' || !activeTab.host || !activeTab.user}
            style={{
              padding: '6px 16px',
              borderRadius: 7,
              background: 'linear-gradient(180deg, #0284c7, #0369a1)',
              border: '1px solid #38bdf8',
              color: '#ffffff',
              fontSize: 11.5,
              fontWeight: 800,
              cursor:
                activeTab.status === 'connecting' || !activeTab.host || !activeTab.user
                  ? 'not-allowed'
                  : 'pointer',
              opacity: activeTab.status === 'connecting' || !activeTab.host || !activeTab.user ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {activeTab.status === 'connecting' ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Play size={13} fill="#ffffff" />
            )}
            <span>{activeTab.status === 'connecting' ? 'Conectando...' : 'Conectar'}</span>
          </button>
        )}

        {/* Estado en vivo de la pestaña activa */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color:
                activeTab.status === 'connected'
                  ? '#4ade80'
                  : activeTab.status === 'connecting'
                  ? '#fbbf24'
                  : activeTab.status === 'error'
                  ? '#f87171'
                  : '#94a3b8',
            }}
          >
            {activeTab.statusMsg || 'Desconectado'}
          </span>
        </div>
      </div>

      {/* ── CONTENEDORES DE LAS TERMINALES (Uno por pestaña, solo visible la activa) ── */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#090d16',
          padding: '8px 12px',
          overflow: 'hidden',
        }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            ref={el => {
              containerRefs.current[tab.id] = el
            }}
            style={{
              display: tab.id === activeTabId ? 'block' : 'none',
              width: '100%',
              height: '100%',
            }}
          />
        ))}
      </div>

      {/* ── BARRA INFERIOR DE AYUDA / HINTS ── */}
      <div
        style={{
          padding: '6px 16px',
          background: '#070a12',
          borderTop: '1px solid rgba(148,163,184,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>
            <strong style={{ color: '#38bdf8' }}>Clic Derecho:</strong> Menú Copiar / Pegar / Limpiar
          </span>
          <span>
            <strong style={{ color: '#fbbf24' }}>Ctrl+C:</strong> Interrupción remota de comandos
          </span>
          <span>
            <strong style={{ color: '#4ade80' }}>Local:</strong> Conexión directa desde Docker sin internet
          </span>
        </div>
        <div>
          {activeTab.fingerprint && (
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>
              SHA256: {activeTab.fingerprint}
            </span>
          )}
        </div>
      </div>

      {/* ── MENÚ CONTEXTUAL FLOTANTE (CLIC DERECHO) ── */}
      {contextMenu.visible && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#0f172a',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 9,
            boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
            zIndex: 99999,
            minWidth: 190,
            padding: '5px 0',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Opción: Copiar */}
          <button
            onClick={handleMenuCopy}
            disabled={!contextMenu.hasSelection}
            style={{
              width: '100%',
              padding: '7px 14px',
              background: 'transparent',
              border: 'none',
              color: contextMenu.hasSelection ? '#f8fafc' : '#475569',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: 600,
              cursor: contextMenu.hasSelection ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={e => {
              if (contextMenu.hasSelection) e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'
            }}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Copy size={13} color={contextMenu.hasSelection ? '#38bdf8' : '#475569'} />
            <span>Copiar Selección</span>
          </button>

          {/* Opción: Pegar */}
          <button
            onClick={handleMenuPaste}
            style={{
              width: '100%',
              padding: '7px 14px',
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Clipboard size={13} color="#4ade80" />
            <span>Pegar Texto</span>
          </button>

          <div style={{ height: 1, background: 'rgba(148,163,184,0.15)', margin: '4px 0' }} />

          {/* Opción: Enviar Ctrl+C */}
          <button
            onClick={handleMenuInterrupt}
            style={{
              width: '100%',
              padding: '7px 14px',
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Square size={12} color="#fbbf24" fill="#fbbf24" />
            <span>Enviar Ctrl+C (Interrumpir)</span>
          </button>

          {/* Opción: Limpiar Pantalla */}
          <button
            onClick={handleMenuClear}
            style={{
              width: '100%',
              padding: '7px 14px',
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              textAlign: 'left',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={13} color="#94a3b8" />
            <span>Limpiar Terminal</span>
          </button>

          {/* Opción: Reconectar si desconectado */}
          {activeTab.status !== 'connected' && (
            <button
              onClick={() => {
                setContextMenu(prev => ({ ...prev, visible: false }))
                handleConnect(activeTab)
              }}
              style={{
                width: '100%',
                padding: '7px 14px',
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                textAlign: 'left',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <RefreshCw size={13} color="#38bdf8" />
              <span>Reconectar</span>
            </button>
          )}
        </div>
      )}

      {/* ── MODAL FALLBACK PARA PEGAR TEXTO (Si el navegador bloquea clipboard.readText) ── */}
      {pasteModalOpen && (
        <div
          onClick={() => setPasteModalOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 500,
              background: '#0f172a',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: 14,
              padding: 20,
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                <Clipboard size={16} color="#4ade80" />
                <span>Pegar comando en la Terminal</span>
              </div>
              <button
                onClick={() => setPasteModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#94a3b8' }}>
              Pega aquí el texto o comando que deseas enviar a la shell activa:
            </p>
            <textarea
              ref={pasteInputRef}
              rows={5}
              value={pasteInputText}
              onChange={e => setPasteInputText(e.target.value)}
              placeholder="Pega aquí con Ctrl+V..."
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 8,
                background: '#070a12',
                border: '1px solid rgba(148,163,184,0.3)',
                color: '#f8fafc',
                fontSize: 12.5,
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleConfirmPasteModal()
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setPasteModalOpen(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 7,
                  background: 'rgba(148,163,184,0.1)',
                  border: '1px solid rgba(148,163,184,0.2)',
                  color: '#cbd5e1',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPasteModal}
                disabled={!pasteInputText.trim()}
                style={{
                  padding: '6px 18px',
                  borderRadius: 7,
                  background: 'linear-gradient(180deg, #0284c7, #0369a1)',
                  border: '1px solid #38bdf8',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: pasteInputText.trim() ? 'pointer' : 'not-allowed',
                  opacity: pasteInputText.trim() ? 1 : 0.5,
                }}
              >
                Enviar a la Shell
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
