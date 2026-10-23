/**
 * components/MonitorModal.tsx
 * Modal unificado para Crear y Editar tanto Grupos como Monitores individuales.
 * Maneja la validación inline y el submit al store de Zustand.
 */
import { useState, useEffect } from 'react'
import { X, Zap, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { MonitorGroup, Monitor, MonitorType } from '../types'
import type { MonitorFormData } from '../store/monitorStore'
import { useMonitorStore } from '../store/monitorStore'
import { useTranslation } from '../i18n'

// PROTOCOL_OPTIONS moved inside component for dynamic i18n

export type ModalMode =
  | { type: 'new_group' }
  | { type: 'edit_group'; group: MonitorGroup }
  | { type: 'new_monitor'; group: MonitorGroup }
  | { type: 'edit_monitor'; group: MonitorGroup; monitor: Monitor }

interface Props {
  mode: ModalMode
  onClose: () => void
}

interface TestConnectionResult {
  status: string
  latency_ms: number
  error_msg?: string
  metric_value?: string
  checked_at?: string
}

const EMPTY_FORM: MonitorFormData = {
  name: '', type: 'PING', target: '', port: '',
  interval_seconds: 60, retries: 3, snmp_community: 'public', snmp_oid: '.1.3.6.1.2.1.1.3.0', ssl_expiration_days: 7, value_threshold: 0, tags: '', description: '', group_id: null,
}

function needsPort(type: MonitorType) { return type === 'TCP' || type === 'TCP_PING' }

export function MonitorModal({ mode, onClose }: Props) {
  const { t, isEn } = useTranslation()
  const { addGroup, updateGroup, addMonitor, updateMonitor, allTags } = useMonitorStore()
  const [form, setForm] = useState<MonitorFormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof MonitorFormData, string>>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  const protocolOptions: { value: MonitorType; label: string; description: string }[] = [
    { value: 'PING',       label: 'ICMP Ping',       description: isEn ? 'Check reachability via ICMP ping' : 'Verificar disponibilidad por ping' },
    { value: 'HTTP',       label: 'HTTP',            description: isEn ? 'Verify HTTP response status code' : 'Verificar código de respuesta HTTP' },
    { value: 'HTTPS',      label: 'HTTPS',           description: isEn ? 'Verify HTTPS response status code' : 'Verificar código de respuesta HTTPS' },
    { value: 'SSL',        label: isEn ? 'SSL Certificate' : 'Certificado SSL', description: isEn ? 'Alert if expires within X days' : 'Alerta si vence en X días' },
    { value: 'TCP',        label: 'TCP Port',        description: isEn ? 'Check if a TCP port is open' : 'Verificar si un puerto TCP está abierto' },
    { value: 'TCP_PING',   label: 'TCP Ping',        description: isEn ? 'TCP latency to host:port' : 'Latencia TCP a un host:puerto' },
    { value: 'POSTGRESQL', label: 'PostgreSQL',      description: 'postgres://user:pass@host:5432/db' },
    { value: 'MYSQL',      label: 'MySQL',           description: 'user:pass@tcp(host:3306)/db' },
    { value: 'REDIS',      label: 'Redis',           description: 'redis://user:pass@host:6379' },
    { value: 'SNMP',       label: 'SNMP',            description: isEn ? 'OID query via SNMP UDP' : 'Monitoreo de OID por SNMP UDP' }
  ]

  // Pre-llenar el formulario en modo edición
  useEffect(() => {
    setTestResult(null)
    if (mode.type === 'edit_group') {
      const g = mode.group
      setForm({
        ...EMPTY_FORM,
        name: g.name,
        description: g.description ?? '',
        tags: g.tags.map(t => t.name).join(', '),
      })
    } else if (mode.type === 'edit_monitor') {
      const m = mode.monitor
      setForm({
        ...EMPTY_FORM,
        name: m.name,
        type: m.type,
        target: m.target,
        port: m.port?.toString() ?? '',
        interval_seconds: m.interval_seconds,
        retries: m.retries,
        snmp_community: m.snmp_community ?? 'public',
        snmp_oid: m.snmp_oid ?? '.1.3.6.1.2.1.1.3.0',
          value_threshold: m.value_threshold ?? 0,
        ssl_expiration_days: m.ssl_expiration_days ?? 7,
      })
    } else if (mode.type === 'new_monitor') {
      setForm(EMPTY_FORM)
    } else {
      setForm(EMPTY_FORM)
    }
  }, [mode])

  const isGroup = mode.type === 'new_group' || mode.type === 'edit_group'
  const isEdit = mode.type === 'edit_group' || mode.type === 'edit_monitor'
  const title = isEdit
    ? (isGroup ? (isEn ? 'Edit Monitor Group' : 'Editar Grupo de Monitor') : (isEn ? 'Edit Endpoint' : 'Editar Endpoint'))
    : (isGroup ? (isEn ? 'New Monitor Group' : 'Nuevo Grupo de Monitor') : (isEn ? 'New Endpoint' : 'Nuevo Endpoint'))

  const set = (key: keyof MonitorFormData, val: string | number) => {
    setForm(f => ({ ...f, [key]: val }))
    setTestResult(null)
  }

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.name.trim()) e.name = isEn ? 'Name is required' : 'El nombre es requerido'
    if (!isGroup && !form.target.trim()) e.target = isEn ? 'Target is required' : 'El destino es requerido'
    if (!isGroup && needsPort(form.type) && !form.port) e.port = isEn ? 'Port is required for this protocol' : 'El puerto es requerido para este protocolo'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleTestConnection() {
    const e: typeof errors = {}
    if (!form.target.trim()) e.target = isEn ? 'Target is required to test connection' : 'El destino es requerido para probar la conexión'
    if (needsPort(form.type) && !form.port) e.port = isEn ? 'Port is required for this protocol' : 'El puerto es requerido para este protocolo'
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/monitors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          target: form.target.trim(),
          port: form.port ? parseInt(String(form.port)) : null,
          snmp_community: form.snmp_community || 'public',
          snmp_oid: form.snmp_oid || '.1.3.6.1.2.1.1.3.0',
          ssl_expiration_days: form.ssl_expiration_days || 7,
          value_threshold: form.value_threshold || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTestResult({ status: 'DOWN', latency_ms: 0, error_msg: data.error || `HTTP ${res.status}` })
      } else {
        setTestResult(data)
      }
    } catch (err: any) {
      setTestResult({ status: 'DOWN', latency_ms: 0, error_msg: err?.message || (isEn ? 'Network error' : 'Error de red') })
    } finally {
      setTesting(false)
    }
  }

  function handleSubmit() {
    if (!validate()) return
    if (mode.type === 'new_group') addGroup(form)
    else if (mode.type === 'edit_group') updateGroup(mode.group.id, form)
    else if (mode.type === 'new_monitor') addMonitor(mode.group.id, form)
    else if (mode.type === 'edit_monitor') updateMonitor(mode.group.id, mode.monitor.id, form)
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', zIndex: 200,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 201,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: '28px 32px',
        width: 'min(560px, 95vw)',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</h2>
            {mode.type === 'new_monitor' || mode.type === 'edit_monitor' ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {isEn ? 'Group' : 'Grupo'}: <strong>{(mode as { group: MonitorGroup }).group.name}</strong>
              </p>
            ) : null}
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Formulario */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Nombre */}
          <Field label={t.common.name} error={errors.name}>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder={isGroup ? (isEn ? 'e.g. Core Firewall / Datacenter' : 'ej. Firewall Principal / Datacenter') : (isEn ? 'e.g. Primary ISP Link' : 'ej. Enlace ISP Primario')}
              style={inputStyle(!!errors.name)}
            />
          </Field>

          {/* Descripción (solo grupos) */}
          {isGroup && (
            <Field label={isEn ? 'Description' : 'Descripción'} optional>
              <input
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder={isEn ? 'Brief description of the group' : 'Descripción breve del grupo'}
                style={inputStyle(false)}
              />
            </Field>
          )}

          {/* Tags (solo grupos) */}
            {isGroup && (
              <Field label={isEn ? 'Tags' : 'Etiquetas'} optional hint={isEn ? 'Select tags (Created in Settings)' : 'Selecciona las etiquetas (Dadas de alta en Ajustes)'}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}>
                  {!allTags || allTags.length === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{isEn ? 'No tags created in Settings.' : 'No hay etiquetas creadas en los Ajustes.'}</span>
                  ) : (
                    allTags.map(t => {
                      const selected = form.tags.split(', ').includes(t.name)
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            let curr = form.tags ? form.tags.split(', ').filter(x => x.trim() !== '') : []
                            if (selected) {
                              curr = curr.filter(x => x !== t.name)
                            } else {
                              curr.push(t.name)
                            }
                            set('tags', curr.join(', '))
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: `1px solid ${t.color}`,
                            background: selected ? t.color : 'transparent',
                            color: selected ? '#fff' : t.color,
                            transition: 'all 0.2s',
                          }}
                        >
                          {t.name}
                        </div>
                      )
                    })
                  )}
                </div>
              </Field>
            )}

          {/* Protocolo (solo endpoints) */}
          {!isGroup && (
            <Field label={isEn ? 'Monitoring Protocol' : 'Protocolo de Monitoreo'} error={errors.type}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {protocolOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('type', opt.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `2px solid ${form.type === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: form.type === opt.value ? 'var(--color-accent)10' : 'var(--color-bg-primary)',
                      color: form.type === opt.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{opt.description}</div>
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Destino (solo endpoints) */}
          {!isGroup && (
            <Field label={['POSTGRESQL', 'MYSQL', 'REDIS'].includes(form.type) ? 'Connection URI' : (form.type === 'HTTP' || form.type === 'HTTPS' ? (isEn ? 'Target URL' : 'URL de destino') : 'IP / Hostname')} error={errors.target}>
              <input
                value={form.target}
                onChange={e => set('target', e.target.value)}
                placeholder={
                  form.type === 'HTTP' ? 'http://192.168.1.1/health'
                  : form.type === 'HTTPS' ? 'https://portal.example.com'
                  : (isEn ? '192.168.1.1 or router.example.local' : '192.168.1.1 o router.ejemplo.local')
                }
                style={inputStyle(!!errors.target)}
              />
            </Field>
          )}

          {/* Puerto (TCP/TCP_PING) */}
          {!isGroup && needsPort(form.type) && (
            <Field label={isEn ? 'TCP Port' : 'Puerto TCP'} error={errors.port}>
              <input
                type="number"
                value={form.port}
                onChange={e => set('port', e.target.value)}
                placeholder={isEn ? 'e.g. 443, 80, 22, 3389' : 'ej. 443, 80, 22, 3389'}
                min={1} max={65535}
                style={inputStyle(!!errors.port)}
              />
            </Field>
          )}



          {/* Campos de SSL */}
          {!isGroup && form.type === 'SSL' && (
            <Field label={isEn ? 'Alert Advance Notice (Days)' : 'Días de anticipación para alertar'}>
              <select
                value={form.ssl_expiration_days}
                onChange={e => set('ssl_expiration_days', parseInt(e.target.value))}
                style={inputStyle(false)}
              >
                <option value={3}>{isEn ? '3 days before' : '3 días antes'}</option>
                <option value={7}>{isEn ? '7 days before' : '7 días antes'}</option>
                <option value={14}>{isEn ? '14 days before' : '14 días antes'}</option>
                <option value={30}>{isEn ? '30 days before' : '30 días antes'}</option>
              </select>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                {isEn ? 'UptimeCore will mark this endpoint DOWN if certificate expires in fewer days.' : 'UptimeCore marcará este endpoint como caído si el certificado expira en menos de esta cantidad de días.'}
              </p>
            </Field>
          )}

          {/* Campos de SNMP */}
          {!isGroup && form.type === 'SNMP' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={isEn ? 'SNMP Community' : 'Comunidad SNMP'}>
                <input
                  type="text"
                  value={form.snmp_community || ''}
                  onChange={e => set('snmp_community', e.target.value)}
                  placeholder="ej. public"
                  style={inputStyle(false)}
                />
              </Field>
              <Field label={isEn ? 'OID to query' : 'OID a consultar'}>
                <input
                  type="text"
                  value={form.snmp_oid || ''}
                  onChange={e => set('snmp_oid', e.target.value)}
                  placeholder="ej. .1.3.6.1.2.1.1.3.0"
                  style={inputStyle(false)}
                />
              </Field>
              <Field label={isEn ? 'Alert Threshold (Optional)' : 'Umbral de Alerta (Opcional)'}>
                <input
                  type="number"
                  value={form.value_threshold || ''}
                  onChange={e => set('value_threshold', parseInt(e.target.value) || 0)}
                  placeholder={isEn ? 'e.g. 90' : 'Ej. 90'}
                  style={inputStyle(false)}
                />
              </Field>
            </div>
          )}

          {/* Intervalo y reintentos */}
          {!isGroup && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={isEn ? 'Check Interval' : 'Intervalo de chequeo'}>
                <select
                  value={form.interval_seconds}
                  onChange={e => set('interval_seconds', parseInt(e.target.value))}
                  style={inputStyle(false)}
                >
                  {[10, 30, 60, 120, 300, 600, 900].map(v => (
                    <option key={v} value={v}>{v < 60 ? (isEn ? `${v} sec` : `${v} seg`) : `${v/60} min`}</option>
                  ))}
                </select>
              </Field>
              <Field label={isEn ? 'Retries before alerting' : 'Reintentos antes de alertar'}>
                <input
                  type="number"
                  min={1} max={99}
                  value={form.retries}
                  onChange={e => set('retries', parseInt(e.target.value) || 1)}
                  style={inputStyle(false)}
                />
              </Field>
            </div>
          )}
          {/* Banner de resultado de prueba en vivo */}
          {!isGroup && testResult && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: `1px solid ${
                testResult.status === 'UP' ? 'rgba(34, 197, 94, 0.45)'
                : testResult.status === 'DEGRADED' ? 'rgba(245, 158, 11, 0.45)'
                : 'rgba(239, 68, 68, 0.45)'
              }`,
              background: testResult.status === 'UP' ? 'rgba(34, 197, 94, 0.10)'
                : testResult.status === 'DEGRADED' ? 'rgba(245, 158, 11, 0.10)'
                : 'rgba(239, 68, 68, 0.10)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                  {testResult.status === 'UP' && <CheckCircle2 size={16} color="#22c55e" />}
                  {testResult.status === 'DEGRADED' && <AlertTriangle size={16} color="#f59e0b" />}
                  {testResult.status !== 'UP' && testResult.status !== 'DEGRADED' && <XCircle size={16} color="#ef4444" />}
                  <span style={{
                    color: testResult.status === 'UP' ? '#22c55e'
                      : testResult.status === 'DEGRADED' ? '#f59e0b'
                      : '#ef4444'
                  }}>
                    {testResult.status === 'UP' ? (isEn ? 'Connection Successful (UP)' : 'Conexión exitosa (UP)')
                      : testResult.status === 'DEGRADED' ? (isEn ? 'Connection with warning (DEGRADED)' : 'Conexión con advertencia (DEGRADED)')
                      : (isEn ? 'Connection Failure (DOWN)' : 'Fallo de conexión (DOWN)')}
                  </span>
                </div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-bg-primary)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                }}>
                  {testResult.latency_ms} ms
                </span>
              </div>
              {testResult.metric_value && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {isEn ? '📊 Value obtained: ' : '📊 Valor obtenido: '}<strong>{testResult.metric_value}</strong>
                </div>
              )}
              {testResult.error_msg && (
                <div style={{ fontSize: 12, color: testResult.status === 'DEGRADED' ? '#d97706' : '#ef4444', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
                  {isEn ? '⚠️ Detail: ' : '⚠️ Detalle: '}{testResult.error_msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <div>
            {!isGroup && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 16px', borderRadius: 8,
                  border: '1px solid rgba(59, 130, 246, 0.45)',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: '#60a5fa',
                  fontSize: 13, fontWeight: 700,
                  cursor: testing ? 'wait' : 'pointer',
                  opacity: testing ? 0.7 : 1,
                }}
              >
                <Zap size={14} />
                {testing ? (isEn ? 'Testing...' : 'Probando...') : (isEn ? 'Test Connection' : 'Probar Conexión')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              padding: '9px 20px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)',
              fontSize: 14, fontWeight: 600,
            }}>
              {t.common.cancel}
            </button>
            <button onClick={handleSubmit} style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'var(--color-accent)', color: '#fff',
              fontSize: 14, fontWeight: 700,
            }}>
              {isEdit ? (isEn ? 'Save Changes' : 'Guardar cambios') : (isEn ? 'Create' : 'Crear')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Helpers de estilo ─────────────────────────────────────────────────── */

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: `1px solid ${hasError ? '#ef4444' : 'var(--color-border)'}`,
    background: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
  }
}

function Field({
  label, children, error, optional, hint,
}: {
  label: string
  children: React.ReactNode
  error?: string
  optional?: boolean
  hint?: string
}) {
  const { isEn } = useTranslation()
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        marginBottom: 6,
      }}>
        {label}
        {optional && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>{isEn ? '(optional)' : '(opcional)'}</span>}
        {hint && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6, fontSize: 11 }}>— {hint}</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{error}</p>}
    </div>
  )
}
