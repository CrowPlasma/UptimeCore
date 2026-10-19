/**
 * store/monitorStore.ts  (v3 — API-connected)
 * Zustand store that syncs with the real backend API.
 * Mutations call the REST API and then refresh the local state.
 */
import { create } from 'zustand'
import { useToastStore } from './toastStore'
import { playDownAlert, playRecoveredAlert } from '../utils/soundAlert'
import type { MonitorGroup, Monitor, MonitorType, Tag, HistoryPoint } from '../types'

const isActive = (m: Monitor) => m.is_active !== false && m.current_status !== 'PAUSED'

// Track recent manual Pause/Maintenance actions per monitor to ignore in-flight SSE events from before the click
const manualActionAt = new Map<number, number>()

/** Group status: paused/inactive endpoints are ignored so they don't force UNKNOWN. */
export function computeGroupStatus(monitors: Monitor[]): string {
  if (monitors.length === 0) return 'UNKNOWN'
  const active = monitors.filter(isActive)
  if (active.length === 0) return 'PAUSED'
  const s = active.map(m => m.current_status)
  const hasUp = s.includes('UP')
  const hasDown = s.includes('DOWN')
  const hasDeg = s.includes('DEGRADED')
  const hasMaint = s.includes('MAINTENANCE')
  if (hasUp) {
    if (hasDeg || hasDown) return 'DEGRADED'
    return 'UP'
  }
  if (hasDeg) return 'DEGRADED'
  if (hasDown) return 'DOWN'
  if (hasMaint) return 'MAINTENANCE'
  return 'UNKNOWN'
}

/** Aggregated history for the group bar: per slot (aligned to newest), mixes all active endpoints. */
export function aggregateGroupHistory(monitors: Monitor[], max = 60): HistoryPoint[] {
  const active = monitors.filter(isActive)
  const nonMaint = active.filter(m => !m.is_maintenance && m.current_status !== 'MAINTENANCE')
  const pool = nonMaint.length > 0 ? nonMaint : active
  const hs = pool.map(m => (m.live_history || []).slice(-max)).filter(h => h.length)
  if (!hs.length) return []
  const len = Math.max(...hs.map(h => h.length))
  const out: HistoryPoint[] = []
  for (let i = 0; i < len; i++) {
    const pts = hs.map(h => h[h.length - len + i]).filter(Boolean) as HistoryPoint[]
    const st = pts.map(p => p.status as string)
    const up = st.includes('UP'), down = st.includes('DOWN'), deg = st.includes('DEGRADED')
    const status = deg || (up && down) ? 'DEGRADED' : down ? 'DOWN' : up ? 'UP' : (st[0] ?? 'UNKNOWN')
    const lat = pts.map(p => p.latency_ms || 0)
    out.push({ ...pts[pts.length - 1], status: status as any, latency_ms: Math.max(...lat) })
  }
  return out
}

export interface MonitorFormData {
  name: string
  type: MonitorType
  target: string
  port: string
  interval_seconds: number
  retries: number
  snmp_community?: string
  snmp_oid?: string
  value_threshold?: number
  current_value?: number
  ssl_expiration_days?: number
  tags: string
  description: string
  group_id?: number | null
}

export interface CheckResultEvent {
  monitor_id?: number
  MonitorID?: number
  id?: number
  status?: string
  Status?: string
  latency_ms?: number
  LatencyMs?: number
  error_msg?: string
  ErrorMsg?: string
  checked_at?: string
  CheckedAt?: string
  is_active?: boolean
  is_maintenance?: boolean
  metric_cpu?: number | null
  metric_ram?: number | null
  metric_disk?: number | null
  metric_value?: number | null
}

interface MonitorStore {
  groups: MonitorGroup[]
  allTags: Tag[]
  loading: boolean
  error: string | null
  lastEventAt: number | null
  sseConnected: boolean
  setSseConnected: (connected: boolean) => void

  // Data fetching
  fetchGroups: () => Promise<void>
  fetchTags: () => Promise<void>
  updateMonitorsLiveBatch: (events: CheckResultEvent[]) => void

  // CRUD Groups
  addGroup: (data: MonitorFormData) => Promise<void>
  updateGroup: (groupId: number, data: MonitorFormData) => Promise<void>
  deleteGroup: (groupId: number) => Promise<void>
  toggleGroup: (groupId: number) => Promise<void>
  toggleGroupMaintenance: (groupId: number) => Promise<void>

  // CRUD Monitors
  addMonitor: (groupId: number, data: MonitorFormData) => Promise<void>
  updateMonitor: (groupId: number, monitorId: number, data: MonitorFormData) => Promise<void>
  deleteMonitor: (groupId: number, monitorId: number) => Promise<void>
  toggleMonitor: (groupId: number, monitorId: number) => Promise<void>
  toggleMaintenance: (groupId: number, monitorId: number) => Promise<void>
}

const BASE = '/api'

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

function parseTags(tagsStr: string): string[] {
  return tagsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/** Collect all unique tags from a group list */
export function extractTags(groups: MonitorGroup[]): Tag[] {
  const map = new Map<string, Tag>()
  groups.forEach(g => g.tags?.forEach(t => map.set(t.name, t)))
  return Array.from(map.values())
}

/**
 * Lanza la tarjeta de notificación (y el sonido) para una transición de estado de un monitor.
 * Se usa tanto desde los eventos SSE como desde el polling HTTP de respaldo, para que las
 * notificaciones sigan apareciendo aunque el stream en tiempo real se haya caído temporalmente.
 * Los IDs de toast son por monitor, por lo que nunca se duplican tarjetas.
 */
function notifyStatusTransition(
  m: Monitor,
  groupName: string,
  oldStatus: string | undefined,
  newStatus: string,
  latencyMs: number,
  errorMsg: string,
) {
  const toastId = `monitor-alert-${m.id}`

  // Limpia alertas activas si el monitor pasa a pausa o mantenimiento
  if (newStatus === 'PAUSED' || newStatus === 'MAINTENANCE') {
    useToastStore.getState().removeToast(toastId)
    return
  }

  // Solo notificar transiciones reales desde un estado operativo conocido
  if (!oldStatus || oldStatus === newStatus) return
  if (oldStatus === 'UNKNOWN' || oldStatus === 'PAUSED' || oldStatus === 'MAINTENANCE') return
  if (newStatus === 'UNKNOWN') return

  if (newStatus === 'DOWN') {
    playDownAlert()
    useToastStore.getState().addToast({
      id: toastId,
      type: 'error',
      title: '¡Monitor Caído!',
      message: `El endpoint "${m.name}" (${m.target}) del grupo "${groupName}" dejó de responder.`,
    })
  } else if (newStatus === 'UP' && (oldStatus === 'DOWN' || oldStatus === 'DEGRADED')) {
    playRecoveredAlert()
    useToastStore.getState().removeToast(toastId)
    useToastStore.getState().addToast({
      id: `monitor-recovered-${m.id}`,
      type: 'success',
      title: 'Monitor Recuperado',
      message: `El endpoint "${m.name}" del grupo "${groupName}" vuelve a estar operativo (${latencyMs} ms).`,
    })
  } else if (newStatus === 'DEGRADED') {
    useToastStore.getState().addToast({
      id: toastId,
      type: 'warning',
      title: 'Rendimiento Degradado',
      message: `El endpoint "${m.name}" del grupo "${groupName}" reporta: ${errorMsg || 'alta latencia'}.`,
    })
  }
}

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  groups: [],
  allTags: [],
  loading: true,
  error: null,
  lastEventAt: null,
  sseConnected: false,
  setSseConnected: (connected: boolean) => set({ sseConnected: connected }),

  
  fetchTags: async () => {
    try {
      const tags: Tag[] = await apiFetch('/tags')
      set({ allTags: tags })
    } catch (err) {
      console.error(err)
    }
  },

  fetchGroups: async () => {
    try {
      // Only show the full-page loader on the very first load; background refreshes must be silent.
      if (get().groups.length === 0) set({ loading: true, error: null })
      else set({ error: null })

      const incoming: MonitorGroup[] = await apiFetch('/groups')

      // Keep SSE points that are newer than what the server already returned,
      // and preserve local state for monitors toggled within the last 3 seconds.
      const local = new Map<number, Monitor>()
      get().groups.forEach(g => g.monitors?.forEach(m => {
        local.set(m.id, m)
      }))

      const groups: MonitorGroup[] = incoming.map(g => {
        const monitors = (g.monitors || []).map(m => {
          const prev = local.get(m.id)
          const server = m.live_history || []
          const lastServer = server.length ? new Date(server[server.length - 1].time).getTime() : 0
          const extra = (prev?.live_history || []).filter(p => new Date(p.time).getTime() > lastServer)
          const mergedHistory = [...server, ...extra].slice(-60)

          if (prev && Date.now() - (manualActionAt.get(m.id) || 0) < 3000) {
            return {
              ...m,
              is_active: prev.is_active,
              is_maintenance: prev.is_maintenance,
              current_status: prev.current_status,
              current_latency_ms: prev.current_latency_ms,
              current_msg: prev.current_msg,
              live_history: mergedHistory,
            }
          }

          // Respaldo de notificaciones: si el SSE se perdió el cambio, el polling lo detecta y avisa
          if (prev && prev.current_status !== m.current_status) {
            notifyStatusTransition(
              m, g.name, prev.current_status, m.current_status ?? 'UNKNOWN',
              m.current_latency_ms ?? 0, m.current_msg ?? '',
            )
          }

          return { ...m, live_history: mergedHistory }
        });

        return { ...g, monitors, overall_status: computeGroupStatus(monitors) as any }
      })

      set({ groups, loading: false })
        get().fetchTags()
    } catch (err) {
      set({ loading: false, error: String(err) })
    }
  },

  updateMonitorsLiveBatch: (events: CheckResultEvent[]) => {
    set((state) => {
      // Agrupar los eventos más recientes por monitorID para no procesar duplicados innecesarios
      const latestEvents = new Map<number, CheckResultEvent>()
      events.forEach(ev => {
        const id = ev.monitor_id ?? ev.MonitorID ?? ev.id
        if (id !== undefined && id !== null) {
          latestEvents.set(id, ev)
        }
      })

      if (latestEvents.size === 0) return state

      let anyGroupChanged = false
      const groups = state.groups.map(g => {
        let changed = false
        const newMonitors = g.monitors?.map(m => {
          const ev = latestEvents.get(m.id)
          if (ev) {
            const oldStatus = m.current_status
            const newStatus = (ev.status ?? ev.Status ?? m.current_status) as string
            const sinceManual = Date.now() - (manualActionAt.get(m.id) || 0)

            // Guard 1: If monitor is currently PAUSED locally, ignore stale periodic check results (UP/DOWN/DEGRADED)
            // that were already buffered before the user clicked Pause.
            if ((!m.is_active || m.current_status === 'PAUSED') && (newStatus === 'UP' || newStatus === 'DOWN' || newStatus === 'DEGRADED')) {
              if (sinceManual < 2500 || ev.is_active !== true) {
                return m
              }
            }

            // Guard 2: If monitor is currently in MAINTENANCE locally, ignore stale periodic check results (UP/DOWN/DEGRADED)
            // that were buffered before the user clicked Maintenance.
            if ((m.is_maintenance || m.current_status === 'MAINTENANCE') && (newStatus === 'UP' || newStatus === 'DOWN' || newStatus === 'DEGRADED')) {
              if (sinceManual < 2500 || ev.is_maintenance !== false) {
                return m
              }
            }

            changed = true
            anyGroupChanged = true

            const newLatency = (newStatus === 'PAUSED' || newStatus === 'MAINTENANCE' || newStatus === 'UNKNOWN')
              ? 0
              : ((ev.latency_ms ?? ev.LatencyMs ?? m.current_latency_ms ?? 0) as number)
            const newTime = ev.checked_at ?? ev.CheckedAt ?? new Date().toISOString()
            const newError = newStatus === 'PAUSED'
              ? ''
              : (ev.error_msg ?? ev.ErrorMsg ?? (newStatus === 'UP' ? '' : (m.current_msg ?? '')))
            const newCpu = ev.metric_cpu !== undefined ? ev.metric_cpu : m.current_cpu
            const newRam = ev.metric_ram !== undefined ? ev.metric_ram : m.current_ram
            const newDisk = ev.metric_disk !== undefined ? ev.metric_disk : m.current_disk
            const newValue = ev.metric_value !== undefined ? ev.metric_value : m.current_value

            // Tarjetas de notificación + sonido (o limpieza si pasa a pausa/mantenimiento)
            notifyStatusTransition(m, g.name, oldStatus, newStatus, newLatency, newError)

            // Do not append transient UNKNOWN/PAUSED state changes to the uptime bar history
            let newHistory: HistoryPoint[] = m.live_history || []
            if (newStatus !== 'UNKNOWN' && newStatus !== 'PAUSED') {
              newHistory = [...newHistory, {
                time: newTime,
                status: newStatus as any,
                latency_ms: newLatency,
                error_msg: newError,
                metric_cpu: newCpu ?? undefined,
                metric_ram: newRam ?? undefined,
                metric_disk: newDisk ?? undefined,
                metric_value: newValue ?? undefined,
              }]
              if (newHistory.length > 60) newHistory.shift()
            }

            const nextIsActive = ev.is_active !== undefined
              ? ev.is_active
              : (newStatus === 'PAUSED' ? false : true)
            const nextIsMaint = ev.is_maintenance !== undefined
              ? ev.is_maintenance
              : (newStatus === 'MAINTENANCE' ? true : false)

            return { 
              ...m, 
              is_active: nextIsActive,
              is_maintenance: nextIsMaint,
              current_status: (nextIsActive === false ? 'PAUSED' : (nextIsMaint ? 'MAINTENANCE' : newStatus)) as any, 
              current_latency_ms: newLatency,
              current_msg: newError,
              current_cpu: newCpu,
              current_ram: newRam,
              current_disk: newDisk,
              current_value: newValue,
              live_history: newHistory
            }
          }
          return m
        }) || []

        if (changed) {
          return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
        }
        return g
      })

      if (!anyGroupChanged) return { lastEventAt: Date.now() }
      return { groups, lastEventAt: Date.now() }
    })
  },

  addGroup: async (data) => {
    await apiFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        tags: parseTags(data.tags),
      }),
    })
    useToastStore.getState().addToast({ type: 'success', title: 'Grupo Creado', message: 'El grupo de monitoreo se ha creado exitosamente.' })
    await get().fetchGroups()
  },

  updateGroup: async (groupId, data) => {
    await apiFetch(`/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        tags: data.tags.split(',').map(t => t.trim()).filter(Boolean)
      }),
    })
    await get().fetchGroups()
  },

  deleteGroup: async (groupId) => {
    await apiFetch(`/groups/${groupId}`, { method: 'DELETE' })
    await get().fetchGroups()
  },

  toggleGroup: async (groupId) => {
    const now = Date.now()
    set((state) => {
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g
        const anyActive = (g.monitors || []).some(m => m.is_active !== false && m.current_status !== 'PAUSED')
        const targetActive = !anyActive
        const newMonitors = (g.monitors || []).map(m => {
          manualActionAt.set(m.id, now)
          return {
            ...m,
            is_active: targetActive,
            is_maintenance: false,
            current_status: (targetActive ? 'UNKNOWN' : 'PAUSED') as any,
            current_latency_ms: 0,
            current_msg: '',
          }
        })
        return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
      })
      return { groups }
    })

    try {
      const res = await apiFetch(`/groups/${groupId}/toggle`, { method: 'PUT' })
      const doneAt = Date.now()
      set((state) => {
        const groups = state.groups.map(g => {
          if (g.id !== groupId) return g
          const isAct = res.is_active ?? false
          const newMonitors = (g.monitors || []).map(m => {
            manualActionAt.set(m.id, doneAt)
            return {
              ...m,
              is_active: isAct,
              is_maintenance: false,
              current_status: (isAct ? (m.current_status === 'PAUSED' ? 'UNKNOWN' : m.current_status) : 'PAUSED') as any,
              current_latency_ms: isAct ? m.current_latency_ms : 0,
              current_msg: isAct ? m.current_msg : '',
            }
          })
          return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
        })
        return { groups }
      })
    } catch {
      await get().fetchGroups()
    }
  },

  toggleGroupMaintenance: async (groupId) => {
    const now = Date.now()
    set((state) => {
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g
        const mons = g.monitors || []
        const allMaint = mons.length > 0 && mons.every(m => m.is_active !== false && (m.is_maintenance || m.current_status === 'MAINTENANCE'))
        const targetMaint = !allMaint
        const newMonitors = mons.map(m => {
          manualActionAt.set(m.id, now)
          return {
            ...m,
            is_active: true,
            is_maintenance: targetMaint,
            current_status: (targetMaint ? 'MAINTENANCE' : 'UNKNOWN') as any,
            current_latency_ms: 0,
            current_msg: targetMaint ? 'En Mantenimiento' : '',
          }
        })
        return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
      })
      return { groups }
    })

    try {
      const res = await apiFetch(`/groups/${groupId}/maintenance`, { method: 'PUT' })
      const doneAt = Date.now()
      set((state) => {
        const groups = state.groups.map(g => {
          if (g.id !== groupId) return g
          const isMaint = res.is_maintenance ?? false
          const newMonitors = (g.monitors || []).map(m => {
            manualActionAt.set(m.id, doneAt)
            return {
              ...m,
              is_active: true,
              is_maintenance: isMaint,
              current_status: (isMaint ? 'MAINTENANCE' : (m.current_status === 'MAINTENANCE' || m.current_status === 'PAUSED' ? 'UNKNOWN' : m.current_status)) as any,
              current_latency_ms: isMaint ? 0 : m.current_latency_ms,
              current_msg: isMaint ? 'En Mantenimiento' : m.current_msg,
            }
          })
          return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
        })
        return { groups }
      })
    } catch {
      await get().fetchGroups()
    }
  },

  addMonitor: async (groupId, data) => {
    const port = data.port ? parseInt(data.port) : null
    await apiFetch('/monitors', {
      method: 'POST',
      body: JSON.stringify({
          group_id: groupId,
          name: data.name,
          type: data.type,
          target: data.target,
          port,
          interval_seconds: data.interval_seconds,
          retries: data.retries,
          snmp_community: data.snmp_community,
          snmp_oid: data.snmp_oid,
          value_threshold: data.value_threshold,
          ssl_expiration_days: data.ssl_expiration_days,
        }),
    })
    useToastStore.getState().addToast({ type: 'success', title: 'Monitor Agregado', message: `El endpoint "${data.name}" se agregó correctamente.` })
    await get().fetchGroups()
  },

  updateMonitor: async (_groupId, monitorId, data) => {
    const port = data.port ? parseInt(data.port) : null
    await apiFetch(`/monitors/${monitorId}`, {
      method: 'PUT',
      body: JSON.stringify({
          name: data.name,
          type: data.type,
          target: data.target,
          port,
          interval_seconds: data.interval_seconds,
          retries: data.retries,
          snmp_community: data.snmp_community,
          snmp_oid: data.snmp_oid,
          value_threshold: data.value_threshold,
          ssl_expiration_days: data.ssl_expiration_days,
        }),
    })
    await get().fetchGroups()
  },

  deleteMonitor: async (_groupId, monitorId) => {
    await apiFetch(`/monitors/${monitorId}`, { method: 'DELETE' })
    await get().fetchGroups()
  },

  toggleMonitor: async (groupId, monitorId) => {
    manualActionAt.set(monitorId, Date.now())

    // Optimistic UI update: Pause or Resume (always clears maintenance)
    set((state) => {
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g
        const newMonitors = g.monitors.map(m => {
          if (m.id === monitorId) {
            const nextActive = !m.is_active
            return {
              ...m,
              is_active: nextActive,
              is_maintenance: false,
              current_status: (nextActive ? 'UNKNOWN' : 'PAUSED') as any,
              current_latency_ms: 0,
              current_msg: '',
            }
          }
          return m
        })
        return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
      })
      return { groups }
    })
    
    try {
      const res = await apiFetch(`/monitors/${monitorId}/toggle`, { method: 'PUT' })
      manualActionAt.set(monitorId, Date.now())
      set((state) => {
        const groups = state.groups.map(g => {
          if (g.id !== groupId) return g
          const newMonitors = g.monitors.map(m => {
            if (m.id === monitorId) {
              const isAct = res.is_active ?? m.is_active
              return {
                ...m,
                is_active: isAct,
                is_maintenance: false,
                current_status: (isAct ? (m.current_status === 'PAUSED' ? 'UNKNOWN' : m.current_status) : 'PAUSED') as any,
                current_latency_ms: isAct ? m.current_latency_ms : 0,
                current_msg: isAct ? m.current_msg : '',
              }
            }
            return m
          })
          return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
        })
        return { groups }
      })
    } catch {
      await get().fetchGroups()
    }
  },

  toggleMaintenance: async (groupId, monitorId) => {
    manualActionAt.set(monitorId, Date.now())

    // Optimistic UI update: Toggle Maintenance (if monitor was paused, enters Maintenance cleanly)
    set((state) => {
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g
        const newMonitors = g.monitors.map(m => {
          if (m.id === monitorId) {
            const nextMaint = !m.is_active ? true : !m.is_maintenance
            return {
              ...m,
              is_active: true,
              is_maintenance: nextMaint,
              current_status: (nextMaint ? 'MAINTENANCE' : 'UNKNOWN') as any,
              current_latency_ms: 0,
              current_msg: nextMaint ? 'En Mantenimiento' : '',
            }
          }
          return m
        })
        return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
      })
      return { groups }
    })
    
    try {
      const res = await apiFetch(`/monitors/${monitorId}/maintenance`, { method: 'PUT' })
      manualActionAt.set(monitorId, Date.now())
      set((state) => {
        const groups = state.groups.map(g => {
          if (g.id !== groupId) return g
          const newMonitors = g.monitors.map(m => {
            if (m.id === monitorId) {
              const isMaint = res.is_maintenance ?? m.is_maintenance
              return {
                ...m,
                is_active: true,
                is_maintenance: isMaint,
                current_status: (isMaint ? 'MAINTENANCE' : (m.current_status === 'MAINTENANCE' || m.current_status === 'PAUSED' ? 'UNKNOWN' : m.current_status)) as any,
                current_latency_ms: isMaint ? 0 : m.current_latency_ms,
                current_msg: isMaint ? 'En Mantenimiento' : m.current_msg,
              }
            }
            return m
          })
          return { ...g, monitors: newMonitors, overall_status: computeGroupStatus(newMonitors) as any }
        })
        return { groups }
      })
    } catch {
      await get().fetchGroups()
    }
  },
}))
