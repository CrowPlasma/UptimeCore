/**
 * components/SshTerminalView.tsx
 * Consola Web SSH interactiva con soporte Multi-Tab ergonómico, 100% local,
 * integración 1-clic con los sensores del grupo, autenticación 100% in-app (sin window.prompt),
 * y compatibilidad nativa con Ctrl+C (copiar si hay texto seleccionado, SIGINT si no lo hay).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, X, Play, Square, RefreshCw,
  Copy, Clipboard, Trash2, Server, Eye, EyeOff, KeyRound
} from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import type { Monitor } from '../types'

interface TabSession {
  id: string
  title: string
  monitorId?: number
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

interface AuthPromptState {
  tabId: string
  title: string
  promptText: string
  answer: string
  isSecret: boolean
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

/** Obtiene puerto seguro para SSH (siempre 22 salvo que el monitor sea explícitamente SSH) */
function getSshPort(m?: Monitor | null): number {
  if (!m) return 22
  if (m.type === 'SSH' && m.port && m.port > 0) return m.port
  return 22
}

export function SshTerminalView({ initialMonitor, initialGroupName: _initialGroupName, groupMonitors }: Props) {
  const defaultHost = cleanHost(initialMonitor?.target) || '192.168.1.1'
  const defaultPort = getSshPort(initialMonitor)
  const defaultTitle = initialMonitor ? initialMonitor.name : 'Sesión SSH 1'

  // Lista de sesiones / pestañas
  const [tabs, setTabs] = useState<TabSession[]>([
    {
      id: 'tab-1',
      title: defaultTitle,
      monitorId: initialMonitor?.id,
      host: defaultHost,
      port: defaultPort,
      user: 'admin',
      password: '',
      status: 'disconnected',
    },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('tab-1')

  // Estado para mostrar/ocultar clave en la barra superior
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({})

  // Modal in-app para solicitud de clave o MFA (reemplaza por completo el window.prompt)
  const [authPrompt, setAuthPrompt] = useState<AuthPromptState | null>(null)
  const [showPromptSecret, setShowPromptSecret] = useState<boolean>(false)
  const authInputRef = useRef<HTMLInputElement>(null)

  // Notificación breve de copiado ("Copiado")
  const [copyNotification, setCopyNotification] = useState<string | null>(null)

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

  // Mostrar notificación temporal
  const triggerToast = (msg: string) => {
    setCopyNotification(msg)
    setTimeout(() => setCopyNotification(null), 1800)
  }

  // Cierra menú contextual al hacer clic fuera
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(prev => (prev.visible ? { ...prev, visible: false } : prev))
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  // Si cambia el initialMonitor desde el header del modal, sincronizar o cambiar a su pestaña
  useEffect(() => {
    if (!initialMonitor) return
    const host = cleanHost(initialMonitor.target)
    const port = getSshPort(initialMonitor)

    setTabs(prev => {
      const existing = prev.find(t => t.monitorId === initialMonitor.id || t.host === host)
      if (existing) {
        setActiveTabId(existing.id)
        return prev
      }
      const newId = `tab-${Date.now()}`
      const newTab: TabSession = {
        id: newId,
        title: initialMonitor.name,
        monitorId: initialMonitor.id,
        host,
        port,
        user: 'admin',
        password: '',
        status: 'disconnected',
      }
      setActiveTabId(newId)
      return [...prev, newTab]
    })
  }, [initialMonitor])

  // Pegar desde portapapeles hacia la shell activa
  const handlePasteClipboard = useCallback(
    async (tabId: string) => {
      const ws = wsInstances.current[tabId]
      const term = termInstances.current[tabId]

      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText()
          if (text) {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(text)
            } else if (term) {
              term.write(text)
            }
            triggerToast('Pegado desde portapapeles')
            return
          }
        }
      } catch {
        // Bloqueado por permisos del navegador (HTTP) -> abrir modal fallback
      }

      setPasteInputText('')
      setPasteModalOpen(true)
      setTimeout(() => pasteInputRef.current?.focus(), 80)
    },
    []
  )

  // Inicializa o redimensiona terminales
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
            selectionBackground: 'rgba(56, 189, 248, 0.4)',
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
        container.onclick = () => term.focus()
        setTimeout(() => {
          try {
            fit.fit()
          } catch {}
        }, 60)

        // Escribir mensaje de bienvenida
        term.writeln('\x1b[1;36m┌──────────────────────────────────────────────────────────┐\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[1;37mUptimeCore Web SSH Shell\x1b[0m  \x1b[90m(100% Local / Zero Cloud)\x1b[0m       \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[32m✔ Ctrl + Shift + C:\x1b[0m Copia selección al portapapeles    \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[36m✔ Ctrl + Shift + V:\x1b[0m Pega comandos en la shell          \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[33m✔ Ctrl + C:\x1b[0m         Interrupción remota (SIGINT nativo) \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m│\x1b[0m  \x1b[35m✔ Clic Derecho:\x1b[0m     Menú contextual desplegable        \x1b[1;36m│\x1b[0m')
        term.writeln('\x1b[1;36m└──────────────────────────────────────────────────────────┘\x1b[0m')
        term.writeln(`\x1b[90mObjetivo: ${tab.host}:${tab.port} · Haz clic en "Conectar"\x1b[0m\r\n`)

        // Enviar teclas directamente al WebSocket (texto plano directo, cero overhead)
        term.onData(data => {
          const ws = wsInstances.current[tab.id]
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data)
          }
        })

        // GESTIÓN DE TECLADO: Ctrl+Shift+C (Copiar), Ctrl+Shift+V (Pegar), Ctrl+C (SIGINT nativo a la shell)
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          // Ctrl + Shift + C: Copiar selección al portapapeles
          if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
            if (e.type === 'keydown') {
              const sel = term.getSelection()
              if (sel) {
                copyTextSafe(sel)
                triggerToast('Copiado al portapapeles')
              }
            }
            return false
          }

          // Ctrl + Shift + V: Pegar texto desde portapapeles
          if (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
            if (e.type === 'keydown') {
              handlePasteClipboard(tab.id)
            }
            return false
          }

          // Ctrl + C (sin Shift): Interrupción remota nativa (SIGINT \x03) hacia la shell
          if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
            if (e.type === 'keydown') {
              const ws = wsInstances.current[tab.id]
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send('\x03')
              }
            }
            return false // Evitar que el navegador intente un copy vacío
          }

          // Las demás teclas se delegan normalmente a xterm
          return true
        })

        termInstances.current[tab.id] = term
        fitAddons.current[tab.id] = fit
      }
    })

    // Redimensionar y enfocar terminal activa
    const activeTerm = termInstances.current[activeTabId]
    const activeFit = fitAddons.current[activeTabId]
    if (activeFit && activeTerm) {
      setTimeout(() => {
        try {
          activeFit.fit()
          activeTerm.focus()
        } catch {}
      }, 50)
      setTimeout(() => {
        try {
          activeFit.fit()
          activeTerm.focus()
        } catch {}
      }, 180)
    }
  }, [tabs, activeTabId, handlePasteClipboard])

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

  // Enfocar input de autenticación in-app cuando aparece
  useEffect(() => {
    if (authPrompt) {
      setTimeout(() => authInputRef.current?.focus(), 60)
    }
  }, [authPrompt])

  // Iniciar conexión SSH real
  const executeConnection = useCallback((tab: TabSession, passwordOverride?: string) => {
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

    const effectivePassword = passwordOverride !== undefined ? passwordOverride : tab.password

    setTabs(prev =>
      prev.map(t =>
        t.id === tab.id
          ? {
              ...t,
              status: 'connecting',
              statusMsg: `Conectando a ${tab.host}:${tab.port}...`,
              password: effectivePassword,
            }
          : t
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
      try {
        fitAddons.current[tab.id]?.fit()
      } catch {}
      let cols = term.cols
      let rows = term.rows
      if (!cols || cols < 20) cols = 120
      if (!rows || rows < 5) rows = 32

      // Enviar solicitud de conexión SSH
      ws.send(
        JSON.stringify({
          type: 'connect',
          host: tab.host.trim(),
          port: tab.port || 22,
          user: tab.user.trim(),
          password: effectivePassword,
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

    ws.onmessage = async (event: MessageEvent) => {
      // 1. Recepción de datos binarios de la shell (soporta tanto Blob como ArrayBuffer nativo)
      if (event.data instanceof Blob) {
        try {
          const buf = await event.data.arrayBuffer()
          term.write(new Uint8Array(buf))
        } catch (err) {
          console.error('[WebSSH] error procesando blob:', err)
        }
        return
      }

      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data))
        return
      }

      // 2. Recepción de eventos JSON del servidor
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'connected') {
            setAuthPrompt(null)
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
            setTimeout(() => {
              try {
                fitAddons.current[tab.id]?.fit()
                term.focus()
              } catch {}
            }, 50)
            return
          } else if (msg.type === 'status') {
            setTabs(prev =>
              prev.map(t => (t.id === tab.id ? { ...t, statusMsg: msg.message } : t))
            )
            term.writeln(`\x1b[90m${msg.message}\x1b[0m`)
            return
          } else if (msg.type === 'prompt') {
            // SOLICITUD INTERACTIVA 100% IN-APP (SIN window.prompt)
            const promptTitle = msg.name || `Autenticación: ${tab.user}@${tab.host}`
            const question = msg.prompts && msg.prompts[0] ? msg.prompts[0] : 'Contraseña:'
            const isSecret = !(msg.echo && msg.echo[0] === true)

            setAuthPrompt({
              tabId: tab.id,
              title: promptTitle,
              promptText: question,
              answer: '',
              isSecret,
            })
            return
          } else if (msg.type === 'error') {
            setAuthPrompt(null)
            setTabs(prev =>
              prev.map(t => (t.id === tab.id ? { ...t, status: 'error', statusMsg: msg.message } : t))
            )
            term.writeln(`\r\n\x1b[1;31m✖ Error SSH: ${msg.message}\x1b[0m\r\n`)
            return
          } else if (msg.type === 'closed') {
            setAuthPrompt(null)
            setTabs(prev =>
              prev.map(t => (t.id === tab.id ? { ...t, status: 'disconnected', statusMsg: msg.message } : t))
            )
            term.writeln(`\r\n\x1b[33m● ${msg.message}\x1b[0m\r\n`)
            return
          }
        } catch {
          term.write(event.data)
        }
      }
    }

    ws.onerror = () => {
      setAuthPrompt(null)
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

  // Acción cuando el usuario pulsa "Conectar"
  const handleConnectClick = (tab: TabSession) => {
    // Si la contraseña está vacía en la barra, solicitársela de inmediato en modal in-app
    if (!tab.password.trim()) {
      setAuthPrompt({
        tabId: tab.id,
        title: `Autenticación SSH: ${tab.user}@${tab.host}`,
        promptText: `Ingresa la contraseña para ${tab.user}@${tab.host}:`,
        answer: '',
        isSecret: true,
      })
      return
    }
    executeConnection(tab)
  }

  // Responder a la solicitud in-app de contraseña / MFA
  const handleAuthPromptSubmit = () => {
    if (!authPrompt) return
    const answer = authPrompt.answer
    const tabId = authPrompt.tabId
    const tab = tabs.find(t => t.id === tabId)
    const ws = wsInstances.current[tabId]

    // Si ya hay un WebSocket en espera del prompt_response:
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'prompt_response', answers: [answer] }))
      setAuthPrompt(null)
      return
    }

    // Si se activó preventivamente porque la clave estaba vacía:
    setAuthPrompt(null)
    if (tab) {
      executeConnection(tab, answer)
    }
  }

  // Cancelar prompt de autenticación
  const handleAuthPromptCancel = () => {
    if (!authPrompt) return
    const ws = wsInstances.current[authPrompt.tabId]
    if (ws) {
      try {
        ws.close()
      } catch {}
    }
    setAuthPrompt(null)
  }

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

  // Agregar pestaña nueva (o sensor del grupo)
  const handleAddTab = (preset?: Monitor) => {
    const newId = `tab-${Date.now()}`
    const host = preset ? cleanHost(preset.target) : defaultHost
    const port = getSshPort(preset)
    const title = preset ? preset.name : `Sesión ${tabs.length + 1}`

    // Si ya existe una pestaña con ese monitor/host, cambiar a ella
    if (preset) {
      const found = tabs.find(t => t.monitorId === preset.id || t.host === host)
      if (found) {
        setActiveTabId(found.id)
        return
      }
    }

    setTabs(prev => [
      ...prev,
      {
        id: newId,
        title,
        monitorId: preset?.id,
        host,
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
        triggerToast('Copiado al portapapeles')
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  // Acción: Pegar en la terminal
  const handleMenuPaste = async () => {
    setContextMenu(prev => ({ ...prev, visible: false }))
    handlePasteClipboard(activeTabId)
  }

  // Enviar texto pegado desde el modal fallback
  const handleConfirmPasteModal = () => {
    if (pasteInputText) {
      const ws = wsInstances.current[activeTabId]
      const activeTerm = termInstances.current[activeTabId]
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(pasteInputText)
      } else if (activeTerm) {
        activeTerm.write(pasteInputText)
      }
      triggerToast('Texto enviado a la shell')
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
      ws.send('\x03')
      triggerToast('Enviado SIGINT (Ctrl+C)')
    }
    setContextMenu(prev => ({ ...prev, visible: false }))
  }

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const isShowPassword = !!showPasswordMap[activeTab.id]

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
      {/* ── BARRA SUPERIOR DE PESTAÑAS (MULTI-TAB ERGONÓMICO) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#060a12',
          borderBottom: '1px solid rgba(148,163,184,0.15)',
          padding: '6px 12px 0',
          gap: 6,
          overflowX: 'auto',
          flexWrap: 'nowrap',
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
                padding: '7px 14px',
                borderRadius: '8px 8px 0 0',
                fontSize: 12,
                fontWeight: isActive ? 800 : 500,
                color: isActive ? '#38bdf8' : '#94a3b8',
                background: isActive ? '#0f172a' : 'rgba(15,23,42,0.35)',
                borderTop: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                borderLeft: isActive ? '1px solid rgba(56,189,248,0.25)' : '1px solid transparent',
                borderRight: isActive ? '1px solid rgba(56,189,248,0.25)' : '1px solid transparent',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {/* Indicador de estado */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusColor,
                  boxShadow: tab.status === 'connected' ? '0 0 8px #22c55e' : 'none',
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
                  marginLeft: 2,
                }}
                title="Cerrar pestaña"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        {/* Botón + para agregar nueva pestaña en blanco */}
        <button
          onClick={() => handleAddTab()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 11px',
            borderRadius: '6px 6px 0 0',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderBottom: 'none',
            color: '#38bdf8',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Abrir nueva sesión SSH personalizada"
        >
          <Plus size={13} />
          <span>Nueva Pestaña</span>
        </button>

        {/* CHIPS RÁPIDOS DE SENSORES DEL GRUPO (1-clic para abrir o cambiar a ese equipo) */}
        {groupMonitors && groupMonitors.length > 0 && (
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              paddingBottom: 4,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Sensores:
            </span>
            {groupMonitors.map(gm => {
              const hostClean = cleanHost(gm.target)
              const isOpen = tabs.some(t => t.monitorId === gm.id || t.host === hostClean)
              return (
                <button
                  key={gm.id}
                  onClick={() => handleAddTab(gm)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 10.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: isOpen ? 'rgba(34, 197, 94, 0.12)' : 'rgba(30,41,59,0.7)',
                    border: isOpen ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(148,163,184,0.2)',
                    color: isOpen ? '#4ade80' : '#cbd5e1',
                    whiteSpace: 'nowrap',
                  }}
                  title={`Abrir sesión SSH para ${gm.name} (${hostClean}:22)`}
                >
                  <Server size={10} color={isOpen ? '#4ade80' : '#94a3b8'} />
                  <span>{isOpen ? `● ${gm.name}` : `+ ${gm.name}`}</span>
                </button>
              )
            })}
          </div>
        )}
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
              padding: '6px 10px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.25)',
              color: '#f8fafc',
              fontSize: 12.5,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>

        {/* Puerto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 115 }}>
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
              padding: '6px 8px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(56,189,248,0.3)',
              color: '#38bdf8',
              fontSize: 12.5,
              fontFamily: 'monospace',
              fontWeight: 800,
              outline: 'none',
            }}
          />
        </div>

        {/* Usuario */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 145 }}>
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
              padding: '6px 8px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.25)',
              color: '#f8fafc',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>

        {/* Contraseña con toggle de visibilidad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 180, position: 'relative' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Clave:</span>
          <input
            type={isShowPassword ? 'text' : 'password'}
            value={activeTab.password}
            disabled={activeTab.status === 'connected' || activeTab.status === 'connecting'}
            onChange={e => {
              const val = e.target.value
              setTabs(prev => prev.map(t => (t.id === activeTab.id ? { ...t, password: val } : t)))
            }}
            placeholder="Opcional (pedir en shell)"
            style={{
              width: '100%',
              padding: '6px 28px 6px 8px',
              borderRadius: 6,
              background: '#070a12',
              border: '1px solid rgba(148,163,184,0.25)',
              color: '#f8fafc',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() =>
              setShowPasswordMap(prev => ({ ...prev, [activeTab.id]: !prev[activeTab.id] }))
            }
            style={{
              position: 'absolute',
              right: 6,
              background: 'transparent',
              border: 'none',
              color: isShowPassword ? '#38bdf8' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 0,
            }}
            title={isShowPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
          >
            {isShowPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>

        {/* Botón Conectar / Desconectar */}
        {activeTab.status === 'connected' ? (
          <button
            onClick={() => handleDisconnect(activeTab.id)}
            style={{
              padding: '6px 15px',
              borderRadius: 7,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: 11.5,
              fontWeight: 800,
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
            onClick={() => handleConnectClick(activeTab)}
            disabled={activeTab.status === 'connecting' || !activeTab.host || !activeTab.user}
            style={{
              padding: '6px 18px',
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
              boxShadow: '0 2px 8px rgba(14,165,233,0.35)',
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
              fontWeight: 700,
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
          minHeight: 380,
          position: 'relative',
          background: '#090d16',
          overflow: 'hidden',
        }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            ref={el => {
              containerRefs.current[tab.id] = el
            }}
            onClick={() => {
              termInstances.current[tab.id]?.focus()
            }}
            onMouseDown={() => {
              termInstances.current[tab.id]?.focus()
            }}
            style={{
              position: 'absolute',
              inset: 0,
              padding: '8px 12px',
              display: tab.id === activeTabId ? 'block' : 'none',
              overflow: 'hidden',
              cursor: 'text',
            }}
          />
        ))}

        {/* ── NOTIFICACIÓN FLOTANTE TEMPORAL (Ej. "Copiado al portapapeles") ── */}
        {copyNotification && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 18,
              background: '#0f172a',
              border: '1px solid #38bdf8',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 11.5,
              fontWeight: 700,
              color: '#38bdf8',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            {copyNotification}
          </div>
        )}

        {/* ── MODAL IN-APP DE AUTENTICACIÓN (REEMPLAZO 100% ELEGANTE DE window.prompt) ── */}
        {authPrompt && (
          <div
            onClick={handleAuthPromptCancel}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(2, 6, 23, 0.8)',
              backdropFilter: 'blur(6px)',
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
                maxWidth: 440,
                background: '#0f172a',
                border: '1px solid rgba(56, 189, 248, 0.45)',
                borderRadius: 14,
                padding: 22,
                boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                  }}
                >
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                    Autenticación SSH Requerida
                  </h3>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{authPrompt.title}</span>
                </div>
              </div>

              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#cbd5e1' }}>
                {authPrompt.promptText}
              </p>

              <div style={{ position: 'relative', marginBottom: 16 }}>
                <input
                  ref={authInputRef}
                  type={authPrompt.isSecret && !showPromptSecret ? 'password' : 'text'}
                  value={authPrompt.answer}
                  onChange={e =>
                    setAuthPrompt(prev => (prev ? { ...prev, answer: e.target.value } : null))
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAuthPromptSubmit()
                    if (e.key === 'Escape') handleAuthPromptCancel()
                  }}
                  placeholder="Escribe la clave aquí y pulsa Enter..."
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: 8,
                    background: '#070a12',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    color: '#f8fafc',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                {authPrompt.isSecret && (
                  <button
                    type="button"
                    onClick={() => setShowPromptSecret(prev => !prev)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: showPromptSecret ? '#38bdf8' : '#64748b',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title={showPromptSecret ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPromptSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleAuthPromptCancel}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 7,
                    background: 'rgba(148,163,184,0.1)',
                    border: '1px solid rgba(148,163,184,0.25)',
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar (Esc)
                </button>
                <button
                  type="button"
                  onClick={handleAuthPromptSubmit}
                  style={{
                    padding: '7px 20px',
                    borderRadius: 7,
                    background: 'linear-gradient(180deg, #0284c7, #0369a1)',
                    border: '1px solid #38bdf8',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(14,165,233,0.4)',
                  }}
                >
                  Autenticar (Enter)
                </button>
              </div>
            </div>
          </div>
        )}
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
            <strong style={{ color: '#38bdf8' }}>Ctrl+Shift+C:</strong> Copiar
          </span>
          <span>
            <strong style={{ color: '#4ade80' }}>Ctrl+Shift+V:</strong> Pegar
          </span>
          <span>
            <strong style={{ color: '#fbbf24' }}>Ctrl+C:</strong> Interrumpir (SIGINT nativo)
          </span>
          <span>
            <strong style={{ color: '#a855f7' }}>Clic Derecho:</strong> Menú desplegable
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
                handleConnectClick(activeTab)
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
