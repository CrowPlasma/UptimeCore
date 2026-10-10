/**
 * store/monitorStore.ts  (v3 — API-connected)
 * Zustand store that syncs with the real backend API.
 * Mutations call the REST API and then refresh the local state.
 */
import { create } from 'zustand'
import { useToastStore } from './toastStore'
import type { MonitorGroup, Monitor, MonitorType, Tag, HistoryPoint } from '../types'

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
  MonitorID: number
  Status: string
  LatencyMs: number
  ErrorMsg: string
}

interface MonitorStore {
  groups: MonitorGroup[]
  allTags: Tag[]
  loading: boolean
  error: string | null

  // Data fetching
  fetchGroups: () => Promise<void>
  fetchTags: () => Promise<void>
  updateMonitorsLiveBatch: (events: CheckResultEvent[]) => void

  // CRUD Groups
  addGroup: (data: MonitorFormData) => Promise<void>
  updateGroup: (groupId: number, data: MonitorFormData) => Promise<void>
  deleteGroup: (groupId: number) => Promise<void>

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
function extractTags(groups: MonitorGroup[]): Tag[] {
  const map = new Map<string, Tag>()
  groups.forEach(g => g.tags?.forEach(t => map.set(t.name, t)))
  return Array.from(map.values())
}

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  groups: [],
  allTags: [],
  loading: true,
  error: null,

  
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
      // so a refresh never wipes the bars/charts that were built live.
      const local = new Map<number, HistoryPoint[]>()
      get().groups.forEach(g => g.monitors?.forEach(m => {
        if (m.live_history?.length) local.set(m.id, m.live_history)
      }))

      const groups: MonitorGroup[] = incoming.map(g => {
        const monitors = (g.monitors || []).map(m => {
          const server = m.live_history || []
          const lastServer = server.length ? new Date(server[server.length - 1].time).getTime() : 0
          const extra = (local.get(m.id) || []).filter(p => new Date(p.time).getTime() > lastServer)
          return { ...m, live_history: [...server, ...extra].slice(-60) }
        });

        const hasUp = monitors.some(m => m.current_status === 'UP')
        const hasDown = monitors.some(m => m.current_status === 'DOWN')
        const hasDeg = monitors.some(m => m.current_status === 'DEGRADED')
        const allDown = monitors.every(m => m.current_status === 'DOWN')

        let overall = 'UNKNOWN'
        if (hasUp && hasDown) overall = 'DEGRADED' // Partial outage
        else if (hasUp) overall = hasDeg ? 'DEGRADED' : 'UP'
        else if (hasDeg) overall = 'DEGRADED'
        else if (allDown && monitors.length > 0) overall = 'DOWN'

        return { ...g, monitors, overall_status: overall as any }
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
      events.forEach(ev => latestEvents.set(ev.MonitorID, ev))

      const groups = state.groups.map(g => {
        let changed = false
        const newMonitors = g.monitors?.map(m => {
          const ev = latestEvents.get(m.id)
          if (ev) {
            changed = true
            
            const oldStatus = m.current_status
            const newStatus = ev.Status as string

            // Only notify if we transition from a known state
            if (oldStatus !== 'UNKNOWN' && oldStatus !== newStatus && oldStatus !== 'PAUSED' && newStatus !== 'PAUSED') {
              const toastId = `monitor-alert-${m.id}`;
              if (newStatus === 'DOWN') {
                useToastStore.getState().addToast({
                  id: toastId,
                  type: 'error',
                  title: 'Monitor Caído!',
                  message: `El endpoint "${m.name}" del grupo "${g.name}" ha dejado de responder.`
                });
              } else if (newStatus === 'UP' && oldStatus !== 'MAINTENANCE') {
                useToastStore.getState().removeToast(`monitor-alert-${m.id}`);
                useToastStore.getState().addToast({
                  type: 'success',
                  title: 'Monitor Recuperado',
                  message: `El endpoint "${m.name}" del grupo "${g.name}" vuelve a estar operativo.`
                });
              } else if (newStatus === 'DEGRADED') {
                useToastStore.getState().addToast({
                  id: `monitor-alert-${m.id}`,
                  type: 'warning',
                  title: 'Rendimiento Degradado',
                  message: `El endpoint "${m.name}" del grupo "${g.name}" presenta alta latencia.`
                });
              }
            }

            const newHistory = [...(m.live_history || []), {
              time: (ev as any).CheckedAt || new Date().toISOString(),
              status: ev.Status as any,
              latency_ms: ev.LatencyMs
            }]
            if (newHistory.length > 60) newHistory.shift()

            return { 
              ...m, 
              current_status: ev.Status as any, 
              current_latency_ms: ev.LatencyMs,
              live_history: newHistory
            }
          }
          return m
        }) || []

        if (changed) {
          const hasUp = newMonitors.some(m => m.current_status === 'UP')
          const hasDown = newMonitors.some(m => m.current_status === 'DOWN')
          const hasDeg = newMonitors.some(m => m.current_status === 'DEGRADED')
          const allDown = newMonitors.every(m => m.current_status === 'DOWN')
          
          let overall = 'UNKNOWN'
          if (hasUp && hasDown) overall = 'DEGRADED' // Partial outage = Degraded
          else if (hasUp) overall = hasDeg ? 'DEGRADED' : 'UP'
          else if (hasDeg) overall = 'DEGRADED'
          else if (allDown && newMonitors.length > 0) overall = 'DOWN'

          return { ...g, monitors: newMonitors, overall_status: overall as any }
        }
        return g
      })
      return { groups }
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
    // Optimistic UI update
    set((state) => {
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g
        const newMonitors = g.monitors.map(m => {
          if (m.id === monitorId) {
            return {
              ...m,
              is_active: !m.is_active,
              current_status: !m.is_active ? ('UNKNOWN' as any) : ('PAUSED' as any)
            }
          }
          return m
        })
        return { ...g, monitors: newMonitors }
      })
      return { groups }
    })
    
    await apiFetch(`/monitors/${monitorId}/toggle`, { method: 'PUT' })
    await get().fetchGroups()
  },
  toggleMaintenance: async (groupId, monitorId) => {
    // Optimistic UI update
    set((state) => {
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g
        const newMonitors = g.monitors.map(m => {
          if (m.id === monitorId) {
            return {
              ...m,
              is_maintenance: !m.is_maintenance,
              current_status: !m.is_active ? ('PAUSED' as any) : (!m.is_maintenance ? ('MAINTENANCE' as any) : ('UNKNOWN' as any))
            }
          }
          return m
        })
        return { ...g, monitors: newMonitors }
      })
      return { groups }
    })
    
    await apiFetch(`/monitors/${monitorId}/maintenance`, { method: 'PUT' })
    await get().fetchGroups()
  },
}))
