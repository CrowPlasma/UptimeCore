/**
 * api/client.ts
 * Cliente HTTP centralizado para todas las llamadas al backend.
 * Utiliza axios con interceptores para manejo de errores global.
 */
import axios from 'axios'
import type { MonitorGroup, Monitor, HistoryPoint, TimeRange } from '../types'

/** Instancia base de axios. En Docker, el proxy de Vite redirige /api → backend:8080 */
const http = axios.create({
  baseURL: '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// --- Interceptor de errores global ---
http.interceptors.response.use(
  res => res,
  err => {
    console.error('[API Error]', err.response?.data ?? err.message)
    return Promise.reject(err)
  }
)

// ============================================================
// MONITOR GROUPS
// ============================================================

/** Obtiene todos los grupos de monitores con sus hijos */
export const fetchGroups = async (): Promise<MonitorGroup[]> => {
  const { data } = await http.get<MonitorGroup[]>('/groups')
  return data
}

/** Crea un nuevo grupo de monitores */
export const createGroup = async (payload: Pick<MonitorGroup, 'name' | 'description'>): Promise<MonitorGroup> => {
  const { data } = await http.post<MonitorGroup>('/groups', payload)
  return data
}

/** Elimina un grupo de monitores */
export const deleteGroup = async (id: number): Promise<void> => {
  await http.delete(`/groups/${id}`)
}

// ============================================================
// MONITORS (ENDPOINTS)
// ============================================================

/** Crea un nuevo monitor bajo un grupo */
export const createMonitor = async (payload: Partial<Monitor>): Promise<Monitor> => {
  const { data } = await http.post<Monitor>('/monitors', payload)
  return data
}

/** Elimina un monitor */
export const deleteMonitor = async (id: number): Promise<void> => {
  await http.delete(`/monitors/${id}`)
}

// ============================================================
// HISTORY / SERIES TEMPORALES
// ============================================================

/** Obtiene el historial de latencia de un monitor según el rango de tiempo */
export const fetchHistory = async (monitorId: number, range: TimeRange): Promise<HistoryPoint[]> => {
  const { data } = await http.get<HistoryPoint[]>(`/monitors/${monitorId}/history`, {
    params: { range },
  })
  return data
}
