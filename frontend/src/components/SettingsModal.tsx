import { useState, useEffect } from 'react'
import { Save, Download, Upload, X, Bell, Shield, Server, CheckCircle2, Trash2, Mail, MessageSquare, Settings, AlertTriangle, Tag as TagIcon, Building2, Info, ExternalLink, Globe } from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import { TagsSettings } from './TagsSettings'
import { ConfirmDialog } from './ConfirmDialog'
import { useMonitorStore } from '../store/monitorStore'
import { useTranslation } from '../i18n'
import { UptimeCoreLogo } from './UptimeCoreLogo'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t, language, setLanguage, isEn } = useTranslation()
  const [tab, setTab] = useState<'notifications' | 'general' | 'tags' | 'entity' | 'info' | 'security'>('notifications')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showWipeConfirm, setShowWipeConfirm] = useState(false)
  const [isWiping, setIsWiping] = useState(false)
  const { fetchGroups, groups } = useMonitorStore()

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
         throw new Error(data.error || (isEn ? 'Internal server error' : 'Error interno del servidor'))
      }
      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'System Formatted' : 'Sistema Formateado',
        message: isEn ? 'All data has been deleted.' : 'Todos los datos han sido borrados.'
      })
      setShowWipeConfirm(false)
      await fetchGroups()
      onClose()
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'error',
        title: isEn ? 'Wipe Error' : 'Error al formatear',
        message: err.message || (isEn ? 'Could not wipe system.' : 'No se pudo formatear el sistema.')
      })
    } finally {
      setIsWiping(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (!res.ok) throw new Error('Error saving settings')
      await fetchGroups()
      window.dispatchEvent(new CustomEvent('entity-updated', {
        detail: {
          entity_name: settings.entity_name || '',
          entity_logo: settings.entity_logo || ''
        }
      }))
      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'Saved' : 'Guardado',
        message: isEn ? 'Settings were saved successfully.' : 'Los ajustes se guardaron correctamente.'
      })
      setEditing({}) // close all edit forms
    } catch {
      useToastStore.getState().addToast({
        type: 'error',
        title: isEn ? 'Error' : 'Error',
        message: isEn ? 'Could not save settings.' : 'No se pudieron guardar los ajustes.'
      })
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={20} /> {t.settings.title}
            </h2>
            <span style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(99, 102, 241, 0.14)',
              color: 'var(--color-accent)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              letterSpacing: '0.02em',
            }}>
              v1.0.7
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 220, borderRight: '1px solid var(--color-border)', background: 'var(--color-bg-card)', padding: '20px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <TabBtn active={tab==='notifications'} icon={<Bell size={18}/>} label={t.settings.tabNotifications} onClick={()=>setTab('notifications')} />
              <TabBtn active={tab==='general'} icon={<Server size={18}/>} label={t.settings.tabGeneral} onClick={()=>setTab('general')} />
              <TabBtn active={tab==='tags'} icon={<TagIcon size={18}/>} label={t.settings.tabTags} onClick={()=>setTab('tags')} />
              <TabBtn active={tab==='entity'} icon={<Building2 size={18}/>} label={t.settings.tabEntity} onClick={()=>setTab('entity')} />
              <TabBtn active={tab==='info'} icon={<Info size={18}/>} label={t.settings.tabInfo} onClick={()=>setTab('info')} />
              <TabBtn active={tab==='security'} icon={<Shield size={18}/>} label={t.settings.tabSecurity} onClick={()=>{}} disabled />
            </div>

            {/* Versión al pie del sidebar */}
            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
              <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                UptimeCore v1.0.7
              </span>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
            {loading ? <div style={{textAlign:'center', marginTop: 100, opacity: 0.5}}>{isEn ? 'Loading...' : 'Cargando...'}</div> : (
              <>
                {tab === 'notifications' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 -8px 0' }}>
                      {isEn ? 'Configure notification channels for downtime and maintenance alerts.' : 'Configura los canales donde recibirás alertas de caídas o mantenimientos.'}
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
                        <input type="password" value={settings.telegram_bot_token || ''} onChange={e => setSettings({...settings, telegram_bot_token: e.target.value})} placeholder={isEn ? "e.g. 123456789:ABCDEF..." : "Ej: 123456789:ABCDEF..."} style={inputStyle} />
                      </Field>
                      <Field label={isEn ? "Chat IDs (Channel, Group or Users - Comma separated)" : "Chat IDs (Canal, Grupo o Usuarios - Separados por coma)"}>
                        <input type="text" value={settings.telegram_chat_id || ''} onChange={e => setSettings({...settings, telegram_chat_id: e.target.value})} placeholder={isEn ? "e.g. -1001234567, 89765432" : "Ej: -1001234567, 89765432"} style={inputStyle} />
                      </Field>
                    </IntegrationCard>

                    {/* Email / Gmail */}
                    <IntegrationCard 
                      title={isEn ? "Email (Gmail)" : "Correo Electrónico (Gmail)"} 
                      icon={<Mail size={18} color="#ea4335" />}
                      isConnected={!!settings.smtp_user && !!settings.smtp_pass && !!settings.smtp_to}
                      isEditing={editing['email']}
                      onEdit={() => setEditing({...editing, email: true})}
                      onDelete={() => handleDelete(['smtp_user', 'smtp_pass', 'smtp_to', 'smtp_from_name', 'smtp_subject_down', 'smtp_subject_up'])}
                    >
                      <Field label={isEn ? "Your Gmail Account (Sender)" : "Tu cuenta de Gmail (Remitente)"}>
                        <input type="text" value={settings.smtp_user || ''} onChange={e => setSettings({...settings, smtp_user: e.target.value})} placeholder={isEn ? "example@gmail.com" : "ejemplo@gmail.com"} style={inputStyle} />
                      </Field>
                      <Field label={isEn ? "App Password" : "Contraseña de Aplicación"}>
                        <input type="password" value={settings.smtp_pass || ''} onChange={e => setSettings({...settings, smtp_pass: e.target.value})} placeholder={isEn ? "16-character App Password generated in Google" : "Contraseña de 16 letras generada en Google"} style={inputStyle} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{isEn ? "*You must generate an App Password in your Google Account security settings." : "*Debes generar una Contraseña de Aplicación en los ajustes de seguridad de tu cuenta de Google."}</span>
                      </Field>
                      <Field label={isEn ? "Sender Name ('From' Header / Optional)" : "Nombre del Remitente (Header 'De' / Opcional)"}>
                        <input type="text" value={settings.smtp_from_name || ''} onChange={e => setSettings({...settings, smtp_from_name: e.target.value})} placeholder={isEn ? "e.g. Telemetry Loss or UptimeCore Alerts" : "Ej: Perdida de Telemetría o UptimeCore Alertas"} style={inputStyle} />
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{isEn ? "Display name shown in the recipient inbox." : "Nombre con el que se mostrará el remitente en la bandeja de entrada."}</span>
                      </Field>
                      <Field label={isEn ? "Recipient Emails (Comma separated)" : "Correos Destino (Separados por coma)"}>
                        <input type="text" value={settings.smtp_to || ''} onChange={e => setSettings({...settings, smtp_to: e.target.value})} placeholder={isEn ? "it-alerts@example.com, admin@example.com" : "alertas-it@ejemplo.com, admin@ejemplo.com"} style={inputStyle} />
                      </Field>
                      <Field label={isEn ? "Subject Line for Outages or Telemetry Loss" : "Encabezado / Asunto para Caídas o Pérdida de Telemetría"}>
                        <input 
                          type="text" 
                          value={settings.smtp_subject_down || ''} 
                          onChange={e => setSettings({...settings, smtp_subject_down: e.target.value})} 
                          placeholder={isEn ? "e.g. Telemetry Loss: {group} - {monitor}" : "Ej: Perdida de Telemetría: {group} - {monitor}"} 
                          style={inputStyle} 
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{isEn ? "Available variables:" : "Variables disponibles:"}</span>
                          {[
                            { label: isEn ? '+ Group' : '+ Grupo', val: '{group}' },
                            { label: isEn ? '+ Endpoint' : '+ Endpoint', val: '{monitor}' },
                            { label: isEn ? '+ IP/Host' : '+ IP/Host', val: '{target}' },
                            { label: isEn ? '+ Status' : '+ Estado', val: '{status}' },
                          ].map(item => (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => {
                                const current = settings.smtp_subject_down || ''
                                setSettings({ ...settings, smtp_subject_down: current ? `${current} ${item.val}` : item.val })
                              }}
                              style={{
                                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                                color: 'var(--color-accent)', borderRadius: 4, padding: '2px 8px', fontSize: 11,
                                cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label={isEn ? "Subject Line for Recovery (Optional)" : "Encabezado / Asunto para Recuperación (Opcional)"}>
                        <input 
                          type="text" 
                          value={settings.smtp_subject_up || ''} 
                          onChange={e => setSettings({...settings, smtp_subject_up: e.target.value})} 
                          placeholder={isEn ? "e.g. Telemetry Restored: {group} - {monitor}" : "Ej: Telemetría Recuperada: {group} - {monitor}"} 
                          style={inputStyle} 
                        />
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {isEn ? "Leave blank to use default format." : "Dejar en blanco para usar el formato por defecto."}
                        </span>
                      </Field>
                    </IntegrationCard>

                    <div style={{ marginTop: 24 }}>
                      <h4 style={{ color: 'var(--color-text-primary)', marginBottom: 12 }}>{isEn ? "Level 2: Escalation Alerts" : "Nivel 2: Alertas Escalonadas"}</h4>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>{isEn ? "If a monitor remains down for an extended period, send emergency alerts. You can add multiple contacts separated by commas." : "Si un monitor permanece caído por mucho tiempo, envía notificaciones de emergencia. Puedes agregar múltiples contactos separados por comas."}</p>
                      
                      <IntegrationCard 
                        title={isEn ? "Escalation Configuration" : "Configuración de Escalación"} 
                        icon={<AlertTriangle size={18} color="#f59e0b" />}
                        isConnected={!!settings.escalation_telegram_chat_id || !!settings.escalation_smtp_to}
                        isEditing={editing['escalation']}
                        onEdit={() => setEditing({...editing, escalation: true})}
                        onDelete={() => handleDelete(['escalation_timeout_minutes', 'escalation_telegram_bot_token', 'escalation_telegram_chat_id', 'escalation_smtp_to'])}
                      >
                        <Field label={isEn ? "Tolerance Threshold (Minutes)" : "Tiempo de Tolerancia (Minutos)"}>
                          <input type="number" min="1" value={settings.escalation_timeout_minutes || '30'} onChange={e => setSettings({...settings, escalation_timeout_minutes: e.target.value})} placeholder="30" style={inputStyle} />
                        </Field>
                        <Field label={isEn ? "Secondary Bot Token (Optional)" : "Bot Token Secundario (Opcional)"}>
                          <input type="password" value={settings.escalation_telegram_bot_token || ''} onChange={e => setSettings({...settings, escalation_telegram_bot_token: e.target.value})} placeholder={isEn ? "Leave blank to use Primary Bot" : "Dejar en blanco para usar el Bot Principal"} style={inputStyle} />
                        </Field>
                        <Field label={isEn ? "Secondary Chat IDs (Telegram - Comma separated)" : "Chat IDs Secundarios (Telegram - Separados por coma)"}>
                          <input type="text" value={settings.escalation_telegram_chat_id || ''} onChange={e => setSettings({...settings, escalation_telegram_chat_id: e.target.value})} placeholder={isEn ? "e.g. -1001234567, -1009876543" : "-1001234567, -1009876543"} style={inputStyle} />
                        </Field>
                        <Field label={isEn ? "Secondary Emails (Gmail - Comma separated)" : "Correos Secundarios (Gmail - Separados por coma)"}>
                          <input type="text" value={settings.escalation_smtp_to || ''} onChange={e => setSettings({...settings, escalation_smtp_to: e.target.value})} placeholder={isEn ? "noc-oncall@example.com, alerts@example.com" : "noc-guardia@ejemplo.com, alertas@ejemplo.com"} style={inputStyle} />
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
                    <h3 style={{ margin: 0, fontSize: 18, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                      {isEn ? 'Global Behavior & Language' : 'Comportamiento Global e Idioma'}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {isEn ? 'Configure platform localization and system-wide overrides.' : 'Estas opciones anularán temporalmente configuraciones por defecto.'}
                    </p>

                    {/* Selector de Idioma de la Plataforma */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18 }}>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--color-text-primary)' }}>
                        <Globe size={18} color="var(--color-accent)" /> {t.settings.platformLanguage}
                      </h4>
                      <p style={{ margin: '0 0 14px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                        {isEn ? 'Switch between English and Spanish across the entire platform.' : 'Alterna entre Español e Inglés en toda la plataforma en tiempo real.'}
                      </p>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => setLanguage('es')}
                          style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            border: language === 'es' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                            background: language === 'es' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-bg-primary)',
                            color: language === 'es' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{ fontSize: 15 }}>🇲🇽</span> {t.settings.langEs}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLanguage('en')}
                          style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            border: language === 'en' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                            background: language === 'en' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-bg-primary)',
                            color: language === 'en' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{ fontSize: 15 }}>🇺🇸</span> {t.settings.langEn}
                        </button>
                      </div>
                    </div>

                    <Field label={isEn ? "Global Maintenance Mode" : "Modo Global de Mantenimiento"}>
                      <select value={settings.global_maintenance || 'false'} onChange={e => setSettings({...settings, global_maintenance: e.target.value})} style={inputStyle}>
                        <option value="false">{isEn ? "Disabled (Normal operation)" : "Desactivado (Normal)"}</option>
                        <option value="true">{isEn ? "Enabled (Pause checks and suppress alerts)" : "Activado (Pausar todo y no enviar alertas)"}</option>
                      </select>
                    </Field>

                      {/* Respaldos y Migración */}
                      <div style={{ marginTop: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-primary)' }}>
                          <Download size={18} /> {isEn ? "Backups & Migration (CSV)" : "Respaldos y Migración (CSV)"}
                        </h4>
                        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                          {isEn ? "Export all your groups, tags and monitors to a CSV file. You can use this file to migrate your configuration to another UptimeCore server by importing it back." : "Exporta todos tus grupos, etiquetas y monitores a un archivo CSV. Puedes usar este archivo para migrar tu configuración a otro servidor de UptimeCore importándolo de nuevo."}
                        </p>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <a href="/api/export" target="_blank" style={{ textDecoration: 'none' }}>
                            <button style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Download size={16} /> {isEn ? "Export CSV" : "Exportar CSV"}
                            </button>
                          </a>
                          
                          <label style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Upload size={16} /> {isEn ? "Import CSV" : "Importar CSV"}
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
                                      alert((isEn ? "There were issues with some CSV rows:\n\n" : "Hubo problemas con algunas filas del CSV:\n\n") + warns.slice(0, 10).join("\n") + (warns.length > 10 ? (isEn ? "\n...and more." : "\n...y más.") : ""))
                                    }
                                    useToastStore.getState().addToast({ type: 'success', title: isEn ? 'Import Complete' : 'Importación Finalizada', message: isEn ? 'Check your groups and monitors.' : 'Revisa tus grupos y monitores.' })
                                    setTimeout(() => window.location.reload(), 2500)
                                  } else {
                                    useToastStore.getState().addToast({ type: 'error', title: isEn ? 'Error' : 'Error', message: isEn ? 'Could not process CSV.' : 'No se pudo procesar el CSV.' })
                                  }
                                } catch(err) {
                                  useToastStore.getState().addToast({ type: 'error', title: isEn ? 'Error' : 'Error', message: isEn ? 'Failed to upload file.' : 'Fallo al subir el archivo.' })
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
                          <AlertTriangle size={18} /> {isEn ? "Danger Zone" : "Zona de Peligro"}
                        </h4>
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                          <div>
                            <h5 style={{ margin: '0 0 4px 0', color: '#fca5a5', fontSize: 14 }}>{isEn ? "Wipe All Data" : "Borrar todos los datos"}</h5>
                            <p style={{ margin: 0, fontSize: 13, color: 'rgba(248, 113, 113, 0.8)' }}>
                              {isEn ? "This action will permanently delete all groups, monitors, tags, and complete history." : "Esta acción eliminará permanentemente todos los grupos, monitores, etiquetas y el historial completo."}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.preventDefault(); setShowWipeConfirm(true); }}
                            style={{ alignSelf: 'flex-start', background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            <Trash2 size={16} /> {isEn ? "Wipe Everything" : "Borrar Todo"}
                          </button>
                        </div>
                      </div>
                      
                  </div>
                )}
                {tab === 'entity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: 18, color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                        {isEn ? "Corporate Entity Identity" : "Identidad de la Entidad"}
                      </h3>
                      <p style={{ margin: '10px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                        {isEn ? "Customize the name and logo of your company or organization. This visual identity will be prominently displayed in the center of the top navigation bar." : "Personaliza el nombre y logotipo de tu empresa u organización. Esta identidad visual se mostrará de forma destacada en el centro de la barra superior de navegación."}
                      </p>
                    </div>

                    {/* Nombre de la entidad */}
                    <Field label={isEn ? "Entity / Organization Name" : "Nombre de la Entidad / Organización"}>
                      <input
                        type="text"
                        value={settings.entity_name || ''}
                        onChange={e => setSettings({ ...settings, entity_name: e.target.value })}
                        placeholder={isEn ? "e.g. My Organization / Corporate / NOC Central" : "Ej: Mi Organización / Corporativo / NOC Central"}
                        style={inputStyle}
                      />
                    </Field>

                    {/* Logotipo de la entidad */}
                    <Field label={isEn ? "Entity Logo (URL or Local File)" : "Logotipo de la Entidad (URL o Archivo Local)"}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={settings.entity_logo || ''}
                          onChange={e => setSettings({ ...settings, entity_logo: e.target.value })}
                          placeholder={isEn ? "https://example.com/logo.png or upload a file" : "https://ejemplo.com/logo.png o sube un archivo"}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <label
                          style={{
                            background: 'var(--color-bg-card)',
                            color: 'var(--color-text-primary)',
                            border: '1px solid var(--color-border)',
                            padding: '10px 14px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                          title={isEn ? "Upload image file (PNG, JPG, SVG, WebP)" : "Cargar archivo de imagen (PNG, JPG, SVG, WebP)"}
                        >
                          <Upload size={15} /> {isEn ? "Upload Image" : "Subir Imagen"}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              if (file.size > 2 * 1024 * 1024) {
                                useToastStore.getState().addToast({
                                  type: 'error',
                                  title: isEn ? 'File too large' : 'Archivo muy pesado',
                                  message: isEn ? 'Please select an image smaller than 2 MB.' : 'Por favor selecciona una imagen menor a 2 MB.'
                                })
                                return
                              }
                              const reader = new FileReader()
                              reader.onload = evt => {
                                const result = evt.target?.result as string
                                if (result) {
                                  setSettings(prev => ({ ...prev, entity_logo: result }))
                                  useToastStore.getState().addToast({
                                    type: 'success',
                                    title: isEn ? 'Logo loaded' : 'Logo cargado',
                                    message: isEn ? 'Image loaded in preview. Remember to click "Save Changes".' : 'Imagen cargada en vista previa. Recuerda hacer clic en "Guardar Ajustes".'
                                  })
                                }
                              }
                              reader.readAsDataURL(file)
                            }}
                          />
                        </label>
                        {settings.entity_logo && (
                          <button
                            type="button"
                            onClick={() => setSettings(prev => ({ ...prev, entity_logo: '' }))}
                            title={isEn ? "Remove logo" : "Quitar logotipo"}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '10px 12px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                        {isEn ? "Recommended formats: Transparent PNG or SVG. Automatically scales to a height of up to 30px in the navbar." : "Formatos recomendados: PNG o SVG transparente. Se adaptará automáticamente con una altura de hasta 30px en el encabezado."}
                      </span>
                    </Field>

                    {/* Vista previa en vivo */}
                    <div style={{
                      marginTop: 8,
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12,
                      padding: '16px 20px',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {isEn ? "Live Preview in Top Bar (Navbar)" : "Vista previa en la barra superior (Navbar)"}
                      </div>
                      <div style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        height: 52,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        padding: '0 20px',
                      }}>
                        {settings.entity_logo || settings.entity_name ? (
                          <>
                            {settings.entity_logo && (
                              <img
                                src={settings.entity_logo}
                                alt={settings.entity_name || 'Logo'}
                                style={{
                                  maxHeight: 28,
                                  maxWidth: 130,
                                  objectFit: 'contain',
                                  borderRadius: 4,
                                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))',
                                }}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none'
                                }}
                              />
                            )}
                            {settings.entity_name && (
                              <span style={{
                                fontWeight: 700,
                                fontSize: 14.5,
                                color: 'var(--color-text-primary)',
                                letterSpacing: '-0.02em',
                              }}>
                                {settings.entity_name}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            {isEn ? "No entity configured (center of navbar will stay clear)" : "Sin identidad configurada (el centro de la barra permanecerá despejado)"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: 18, color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                        {isEn ? "System Information" : "Información del Sistema"}
                      </h3>
                      <p style={{ margin: '10px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                        {isEn ? "Technical specifications, build release, network architecture and UptimeCore platform status." : "Detalles técnicos, versión de compilación, arquitectura de red y estado de la plataforma UptimeCore."}
                      </p>
                    </div>

                    {/* Hero Card */}
                    <div style={{
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12,
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 18,
                    }}>
                      <UptimeCoreLogo size={52} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.03em' }}>
                            Uptime<span style={{ color: '#2563eb' }}>Core</span>
                          </span>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(34, 197, 94, 0.14)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            v1.0.7
                          </span>
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: 'var(--color-bg-primary)',
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border)',
                          }}>
                            {isEn ? "Production" : "Producción"}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                          {isEn ? "Enterprise Network Monitoring, Telemetry and Link Availability Platform." : "Plataforma de Monitoreo de Red, Telemetría y Disponibilidad de Enlaces."}
                        </p>
                      </div>
                    </div>

                    {/* Grid de Especificaciones Técnicas */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 12,
                    }}>
                      {[
                        { label: isEn ? 'System Version' : 'Versión del Sistema', value: 'v1.0.7 (Release)' },
                        { label: isEn ? 'License' : 'Licencia', value: 'GNU GPL v3.0 (Open Source)' },
                        { label: isEn ? 'Runtime Environment' : 'Entorno de Ejecución', value: 'Docker Containerized (Alpine Linux)' },
                        { label: isEn ? 'Backend Engine' : 'Motor de Backend', value: isEn ? 'Go 1.22+ / Fiber v2 (High Performance)' : 'Go 1.22+ / Fiber v2 (Alto Rendimiento)' },
                        { label: isEn ? 'Time-Series Database' : 'Base de Datos de Series de Tiempo', value: 'TimescaleDB (PostgreSQL 16)' },
                        { label: isEn ? 'Live Telemetry Cache' : 'Caché de Telemetría en Vivo', value: 'Redis 7 (In-Memory Key/Value)' },
                        { label: isEn ? 'Frontend Engine' : 'Motor de Frontend', value: 'React 19 + TypeScript + Vite + Zustand' },
                        { label: isEn ? 'Live Streaming' : 'Transmisión en Vivo', value: 'Server-Sent Events (SSE) Streaming' },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 10,
                            padding: '12px 16px',
                          }}
                        >
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: item.value.startsWith('v') || item.value.includes('Go') || item.value.includes('Redis') ? "'JetBrains Mono', monospace" : 'inherit' }}>
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Resumen Operativo */}
                    <div style={{
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 12,
                      padding: '16px 20px',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        {isEn ? "Active Capacity & Protocols" : "Capacidad Activa & Protocolos"}
                      </div>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{isEn ? "Configured Groups" : "Grupos Configurados"}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {groups.length}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{isEn ? "Total Endpoints" : "Total de Endpoints"}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-accent)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {groups.reduce((acc, g) => acc + (g.monitors?.length || 0), 0)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{isEn ? "Active Protocols" : "Protocolos Activos"}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>
                            {isEn ? "ICMP Ping, TCP Port, HTTP/HTTPS, Paping" : "ICMP Ping, Puerto TCP, HTTP/HTTPS, Paping"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Enlaces Oficiales */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {isEn ? "© 2026 UptimeCore Open Source Project. Distributed under GNU GPLv3 license." : "© 2026 UptimeCore Open Source Project. Distribuido bajo licencia GNU GPLv3."}
                      </span>
                      <a
                        href="https://github.com/CrowPlasma/UptimeCore"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--color-accent)',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        GitHub <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>
            {tab === 'info' ? t.common.close : t.common.cancel}
          </button>
          {tab !== 'info' && tab !== 'tags' && (
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Save size={16} /> {saving ? t.settings.saving : t.settings.saveChanges}
            </button>
          )}
        </div>
      </div>
      {showWipeConfirm && (
        <ConfirmDialog
          title={t.settings.wipeConfirmTitle}
          message={t.settings.wipeConfirmText}
          confirmLabel={isWiping ? (isEn ? "Wiping..." : "Borrando...") : (isEn ? "Yes, wipe everything" : "Sí, borrar todo")}
          onConfirm={handleWipeData}
          onCancel={() => setShowWipeConfirm(false)}
        />
      )}
    </div>
  )
}

function IntegrationCard({ title, icon, isConnected, isEditing, onEdit, onDelete, children }: any) {
  const { isEn } = useTranslation()
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
                <CheckCircle2 size={14} /> {isEn ? 'Connected' : 'Conectado'}
              </span>
              <button onClick={onEdit} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                {isEn ? 'Edit' : 'Editar'}
              </button>
              <button onClick={onDelete} style={{ background: 'transparent', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Trash2 size={12} /> {isEn ? 'Delete' : 'Eliminar'}
              </button>
            </>
          ) : (
            !isEditing && (
              <button onClick={onEdit} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                {isEn ? 'Configure' : 'Configurar'}
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
