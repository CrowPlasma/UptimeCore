/**
 * types/index.ts
 * Definición centralizada de todos los tipos de datos de la aplicación.
 * Estos tipos deben mantenerse sincronizados con los modelos del backend en Go.
 */

/** Estado operacional de un monitor o endpoint */
export type MonitorStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'MAINTENANCE'

/** Tipo de protocolo de monitoreo */
export type MonitorType = 'HTTP' | 'HTTPS' | 'PING' | 'TCP' | 'TCP_PING' | 'POSTGRESQL' | 'MYSQL' | 'REDIS' | 'SNMP' | 'SSL'

/** Representa una etiqueta para clasificar monitores */
export interface Tag {
  id: number
  name: string
  color: string
}

/** Un endpoint individual (la IP o URL real que se monitorea) */
export interface Monitor {
  id: number
  group_id: number | null
  name: string
  type: MonitorType
  target: string
  port: number | null
  interval_seconds: number
  timeout_seconds: number
  retries: number
  snmp_community?: string
  snmp_oid?: string
  ssl_expiration_days?: number
  is_active: boolean
  is_maintenance: boolean
  created_at: string
  updated_at: string
  // Datos en tiempo real (provenientes de Redis/WebSocket)
  current_status?: MonitorStatus
  current_latency_ms?: number
  current_msg?: string
  live_history?: HistoryPoint[]
}

/** Un Monitor Lógico que agrupa uno o más endpoints */
export interface MonitorGroup {
  id: number
  name: string
  description: string | null
  tags: Tag[]
  monitors: Monitor[]
  // Estado calculado: UP si ≥ 1 monitor hijo está UP
  overall_status?: MonitorStatus
  created_at: string
}

/** Un punto de dato en la serie temporal de historial */
export interface HistoryPoint {
  time: string
  status: MonitorStatus
  latency_ms: number
}

/** Rangos de tiempo disponibles para la gráfica (igual que Uptime Kuma) */
export type TimeRange = 'recent' | '3h' | '6h' | '24h' | '1w'
