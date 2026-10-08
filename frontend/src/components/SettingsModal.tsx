import { useState, useEffect } from 'react'
import { Save, Download, Upload, X, Bell, Shield, Server, CheckCircle2, Trash2, Mail, MessageSquare, Settings, AlertTriangle, Tag as TagIcon } from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import { TagsSettings } from './TagsSettings'
import { ConfirmDialog } from './ConfirmDialog'
import { useMonitorStore } from '../store/monitorStore'


export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'notifications' | 'general' | 'tags' | 'security'>('notifications')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showWipeConfirm, setShowWipeConfirm] = useState(false)
  const [isWiping, setIsWiping] = useState(false)
  const { fetchGroups } = useMonitorStore()

  // Local state to track which forms are currently expanded/editing
  const [editing, setEditing] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data || {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  
  const handleWipeData = async () => {
    setIsWiping(true)
    try {
      const res = await fetch('/api/system/wipe', { method: 'DELETE' })
      if (!res.ok) {
         const data = await res.json().catch(() => ({}))
         throw new Error(data.error || 'Error interno del servidor')
      }
      useToastStore.getState().addToast({ type: 'success', title: 'Sistema Formateado', message: 'Todos los datos han sido borrados.' })
      setShowWipeConfirm(false)
      await fetchGroups()
      onClose()
    } catch (err: any) {
      useToastStore.getState().addToast({ type: 'error', title: 'Error al formatear', message: err.message || 'No se pudo formatear el sistema.' })
    } finally {
      setIsWiping(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      useToastStore.getState().addToast({ type: 'success', title: 'Guardado', message: 'Los ajustes se guardaron correctamente.' })
      setEditing({}) // close all edit forms
    } catch {
      useToastStore.getState().addToast({ type: 'error', title: 'Error', message: 'No se pudieron guardar los ajustes.' })
    }
    setSaving(false)
  }

  const handleDelete = (keys: string[]) => {
    const newSettings = { ...settings }
    keys.forEach(k => { newSettings[k] = '' })
    setSettings(newSettings)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
    }}>
      <div style={{
        background: 'var(--color-bg-primary)', width: 800, height: 600,
        borderRadius: 16, border: '1px solid var(--color-border)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex',
        flexDirection: 'column', overflow: 'hidden'
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={20} /> Ajustes del Sistema
          </h2>
          <button onClick={onClose} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 220, borderRight: '1px solid var(--color-border)', background: 'var(--color-bg-card)', padding: '20px 10px' }}>
            <TabBtn active={tab==='notifications'} icon={<Bell size={18}/>} label="Notificaciones" onClick={()=>setTab('notifications')} />
            <TabBtn active={tab==='general'} icon={<Server size={18}/>} label="General" onClick={()=>setTab('general')} />
                          <TabBtn active={tab==='tags'} icon={<TagIcon size={18}/>} label="Etiquetas" onClick={()=>setTab('tags')} />
              <TabBtn active={tab==='security'} icon={<Shield size={18}/>} label="Seguridad (Próx.)" onClick={()=>{}} disabled />
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
            {loading ? <div style={{textAlign:'center', marginTop: 100, opacity: 0.5}}>Cargando...</div> : (
              <>
                {tab === 'notifications' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 -8px 0' }}>
                      Configura los canales donde recibirás alertas de caídas o mantenimientos.
                    </p>

                    {/* Telegram */}
                    <IntegrationCard 
                      title="Telegram Bot" 
                      icon={<MessageSquare size={18} color="#0088cc" />}
                      isConnected={!!settings.telegram_bot_token && !!settings.telegram_chat_id}
                      isEditing={editing['telegram']}
                      onEdit={() => setEditing({...editing, telegram: true})}
                      onDelete={() => handleDelete(['telegram_bot_token', 'telegram_chat_id'])}
                    >
                      <Field label="Bot Token">
                        <input type="password" value={settings.telegram_bot_token || ''} onChange={e => setSettings({...settings, telegram_bot_token: e.target.value})} placeholder="Ej: 123456789:ABCDEF..." style={inputStyle} />
                      </Field>
                      <Field label="Chat IDs (Canal, Grupo o Usuarios - Separados por coma)">
                        <input type="text" value={settings.telegram_chat_id || ''} onChange={e => setSettings({...settings, telegram_chat_id: e.target.value})} placeholder="Ej: -1001234567, 89765432" style={inputStyle} />
                      </Field>
                    </IntegrationCard>

                    {/* Email / Gmail */}
                    <IntegrationCard 
                      title="Correo Electrónico (Gmail)" 
                      icon={<Mail size={18} color="#ea4335" />}
                      isConnected={!!settings.smtp_user && !!settings.smtp_pass && !!settings.smtp_to}
                      isEditing={editing['email']}
                      onEdit={() => setEditing({...editing, email: true})}
                      onDelete={() => handleDelete(['smtp_user', 'smtp_pass', 'smtp_to'])}
                    >
                      <Field label="Tu cuenta de Gmail (Remitente)">
                        <input type="text" value={settings.smtp_user || ''} onChange={e => setSettings({...settings, smtp_user: e.target.value})} placeholder="ejemplo@gmail.com" style={inputStyle} />
                      </Field>
                      <Field label="Contraseña de Aplicación">
                        <input type="password" value={settings.smtp_pass || ''} onChange={e => setSettings({...settings, smtp_pass: e.target.value})} placeholder="Contraseña de 16 letras generada en Google" style={inputStyle} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>*Debes generar una Contraseña de Aplicación en los ajustes de seguridad de tu cuenta de Google.</span>
                      </Field>
                      <Field label="Correos Destino (Separados por coma)">
                        <input type="text" value={settings.smtp_to || ''} onChange={e => setSettings({...settings, smtp_to: e.target.value})} placeholder="alertas-it@miempresa.com, jefe@miempresa.com" style={inputStyle} />
                      </Field>
                    </IntegrationCard>

                    <div style={{ marginTop: 24 }}>
                      <h4 style={{ color: 'var(--color-text-primary)', marginBottom: 12 }}>Nivel 2: Alertas Escalonadas</h4>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>Si un monitor permanece caído por mucho tiempo, envía notificaciones de emergencia. Puedes agregar múltiples contactos separados por comas.</p>
                      
                      <IntegrationCard 
                        title="Configuración de Escalación" 
                        icon={<AlertTriangle size={18} color="#f59e0b" />}
                        isConnected={!!settings.escalation_telegram_chat_id || !!settings.escalation_smtp_to}
                        isEditing={editing['escalation']}
                        onEdit={() => setEditing({...editing, escalation: true})}
                        onDelete={() => handleDelete(['escalation_timeout_minutes', 'escalation_telegram_bot_token', 'escalation_telegram_chat_id', 'escalation_smtp_to'])}
                      >
                        <Field label="Tiempo de Tolerancia (Minutos)">
                          <input type="number" min="1" value={settings.escalation_timeout_minutes || '30'} onChange={e => setSettings({...settings, escalation_timeout_minutes: e.target.value})} placeholder="30" style={inputStyle} />
                        </Field>
                        <Field label="Bot Token Secundario (Opcional)">
                          <input type="password" value={settings.escalation_telegram_bot_token || ''} onChange={e => setSettings({...settings, escalation_telegram_bot_token: e.target.value})} placeholder="Dejar en blanco para usar el Bot Principal" style={inputStyle} />
                        </Field>
                        <Field label="Chat IDs Secundarios (Telegram - Separados por coma)">
                          <input type="text" value={settings.escalation_telegram_chat_id || ''} onChange={e => setSettings({...settings, escalation_telegram_chat_id: e.target.value})} placeholder="-1001234567, -1009876543" style={inputStyle} />
                        </Field>
                        <Field label="Correos Secundarios (Gmail - Separados por coma)">
                          <input type="text" value={settings.escalation_smtp_to || ''} onChange={e => setSettings({...settings, escalation_smtp_to: e.target.value})} placeholder="jefe1@empresa.com, alertas@empresa.com" style={inputStyle} />
                        </Field>
                      </IntegrationCard>
                    </div>


                    
                    

                    

                  </div>
                )}
                                {tab === 'tags' && (
                  <TagsSettings />
                )}
                {tab === 'general' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <h3 style={{ margin: 0, fontSize: 18, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>Comportamiento Global</h3>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Estas opciones anularán temporalmente configuraciones por defecto.</p>
                    <Field label="Modo Global de Mantenimiento">
                      <select value={settings.global_maintenance || 'false'} onChange={e => setSettings({...settings, global_maintenance: e.target.value})} style={inputStyle}>
                        <option value="false">Desactivado (Normal)</option>
                        <option value="true">Activado (Pausar todo y no enviar alertas)</option>
                      </select>
                    </Field>

                      {/* Respaldos y Migración */}
                      <div style={{ marginTop: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-primary)' }}>
                          <Download size={18} /> Respaldos y Migración (CSV)
                        </h4>
                        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                          Exporta todos tus grupos, etiquetas y monitores a un archivo CSV. Puedes usar este archivo para migrar tu configuración a otro servidor de UptimeCore importándolo de nuevo.
                        </p>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <a href="/api/export" target="_blank" style={{ textDecoration: 'none' }}>
                            <button style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Download size={16} /> Exportar CSV
                            </button>
                          </a>
                          
                          <label style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Upload size={16} /> Importar CSV
                            <input 
                              type="file" 
                              accept=".csv" 
                              style={{ display: 'none' }} 
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const formData = new FormData()
                                formData.append('file', file)
                                try {
                                  setSaving(true)
                                  const res = await fetch('/api/import', { method: 'POST', body: formData })
                                  if (res.ok) {
                                    if (res.status === 206) {
                                      const data = await res.json()
                                      const warns = data.warnings || []
                                      alert("Hubo problemas con algunas filas del CSV:\n\n" + warns.slice(0, 10).join("\n") + (warns.length > 10 ? "\n...y más." : ""))
                                    }
                                    useToastStore.getState().addToast({ type: 'success', title: 'Importación Finalizada', message: 'Revisa tus grupos y monitores.' })
                                    setTimeout(() => window.location.reload(), 2500)
                                  } else {
                                    useToastStore.getState().addToast({ type: 'error', title: 'Error', message: 'No se pudo procesar el CSV.' })
                                  }
                                } catch(err) {
                                  useToastStore.getState().addToast({ type: 'error', title: 'Error', message: 'Fallo al subir el archivo.' })
                                } finally {
                                  setSaving(false)
                                }
                              }} 
                            />
                          </label>
                        </div>
                      </div>

                      {/* Zona de Peligro */}
                      <div style={{ marginTop: 24, borderTop: '1px solid rgba(239, 68, 68, 0.2)', paddingTop: 24 }}>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
                          <AlertTriangle size={18} /> Zona de Peligro
                        </h4>
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                          <div>
                            <h5 style={{ margin: '0 0 4px 0', color: '#fca5a5', fontSize: 14 }}>Borrar todos los datos</h5>
                            <p style={{ margin: 0, fontSize: 13, color: 'rgba(248, 113, 113, 0.8)' }}>
                              Esta acción eliminará permanentemente todos los grupos, monitores, etiquetas y el historial completo.
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.preventDefault(); setShowWipeConfirm(true); }}
                            style={{ alignSelf: 'flex-start', background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            <Trash2 size={16} /> Borrar Todo
                          </button>
                        </div>
                      </div>
                      
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Ajustes'}
          </button>
        </div>
      </div>
      {showWipeConfirm && (
        <ConfirmDialog
          title="⚠️ Peligro: Borrar todo el sistema"
          message="¿Estás ABSOLUTAMENTE SEGURO de que deseas formatear el sistema? Se perderán todos tus grupos, monitores, configuraciones y el historial de latencias de forma IRREVERSIBLE."
          confirmLabel={isWiping ? "Borrando..." : "Sí, borrar todo"}
          onConfirm={handleWipeData}
          onCancel={() => setShowWipeConfirm(false)}
        />
      )}
    </div>
  )
}

function IntegrationCard({ title, icon, isConnected, isEditing, onEdit, onDelete, children }: any) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg-card)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-primary)', borderBottom: isEditing ? '1px solid var(--color-border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon}
          <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isConnected && !isEditing ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} /> Conectado
              </span>
              <button onClick={onEdit} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                Editar
              </button>
              <button onClick={onDelete} style={{ background: 'transparent', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Trash2 size={12} /> Eliminar
              </button>
            </>
          ) : (
            !isEditing && (
              <button onClick={onEdit} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                Configurar
              </button>
            )
          )}
        </div>
      </div>

      {/* Form Content */}
      {isEditing && (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, icon, label, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', padding: '12px 16px', borderRadius: 8, border: 'none',
      background: active ? 'var(--color-accent)20' : 'transparent',
      color: active ? 'var(--color-accent)' : (disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)'),
      opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: active ? 700 : 500,
      textAlign: 'left', marginBottom: 4
    }}>
      {icon} {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
  color: 'var(--color-text-primary)', fontSize: 14, outline: 'none'
}
