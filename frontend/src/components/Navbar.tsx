/**
 * components/Navbar.tsx (v2)
 * Navbar limpio: logo, branding de entidad corporativa (centro), telemetría en vivo, toggle de tema y ajustes.
 */
import React, { useState, useEffect } from 'react'
import { Sun, Moon, Settings, LogOut, Shield, KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useMonitorStore } from '../store/monitorStore'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import { useTranslation } from '../i18n'
import { UptimeCoreLogo } from './UptimeCoreLogo'

export function Navbar() {
  const { theme, toggle } = useTheme()
  const { lastEventAt, sseConnected } = useMonitorStore()
  const { user, logout, isAdmin } = useAuthStore()
  const { t, language, toggleLanguage, isEn } = useTranslation()
  const [entity, setEntity] = useState<{ name: string; logo: string }>({ name: '', logo: '' })
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Modal de cambiar propia contraseña
  const [showChangePassModal, setShowChangePassModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [passLoading, setPassLoading] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassError(null)
    if (!currentPassword) {
      setPassError(isEn ? 'Please enter your current password.' : 'Ingresa tu contraseña actual.')
      return
    }
    if (newPassword.length < 6) {
      setPassError(isEn ? 'New password must be at least 6 characters.' : 'La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    setPassLoading(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPassError(data.error || (isEn ? 'Could not update password.' : 'No se pudo actualizar la contraseña.'))
        setPassLoading(false)
        return
      }
      useToastStore.getState().addToast({
        type: 'success',
        title: isEn ? 'Password Updated' : 'Contraseña Actualizada',
        message: isEn ? 'Your account password was changed successfully.' : 'Tu contraseña ha sido actualizada exitosamente.',
      })
      setShowChangePassModal(false)
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      setPassError(err.message || 'Error')
    } finally {
      setPassLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setEntity({
            name: data.entity_name || '',
            logo: data.entity_logo || ''
          })
        }
      })
      .catch(() => {})

    const handleUpdate = (e: any) => {
      if (e.detail) {
        setEntity({
          name: e.detail.entity_name || '',
          logo: e.detail.entity_logo || ''
        })
      } else {
        fetch('/api/settings').then(r => r.json()).then(d => {
          if (d) setEntity({ name: d.entity_name || '', logo: d.entity_logo || '' })
        }).catch(() => {})
      }
    }
    window.addEventListener('entity-updated', handleUpdate)
    return () => window.removeEventListener('entity-updated', handleUpdate)
  }, [])

  return (
    <nav style={{
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 28px',
      height: 58,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo y Nombre de la Aplicación */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <UptimeCoreLogo size={34} />
        <span style={{
          fontWeight: 800, fontSize: 18,
          letterSpacing: '-0.04em',
          color: 'var(--color-text-primary)',
        }}>
          Uptime<span style={{ color: '#2563eb' }}>Core</span>
        </span>
      </div>

      {/* Identidad de la Entidad (Centro Absoluto) */}
      {(entity.name || entity.logo) && (
        <div
          title={entity.name ? (isEn ? `Entity: ${entity.name}` : `Entidad: ${entity.name}`) : undefined}
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: '38%',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {entity.logo && (
            <img
              src={entity.logo}
              alt={entity.name || 'Logo'}
              style={{
                maxHeight: 28,
                maxWidth: 120,
                objectFit: 'contain',
                borderRadius: 4,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))',
              }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none'
              }}
            />
          )}
          {entity.name && (
            <span style={{
              fontWeight: 700,
              fontSize: 14.5,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em',
            }}>
              {entity.name}
            </span>
          )}
        </div>
      )}

      {/* Acciones derecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Selector / Toggle de Idioma ES | EN */}
        <button
          onClick={toggleLanguage}
          title={t.navbar.switchLanguage}
          style={{
            height: 32,
            padding: '0 9px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            userSelect: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{ color: language === 'es' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>ES</span>
          <span style={{ opacity: 0.35, fontSize: 10 }}>|</span>
          <span style={{ color: language === 'en' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>EN</span>
        </button>

        {/* Indicador EN VIVO / Telemetría (a la izquierda de ajustes) */}
        <div
          title={lastEventAt ? `${t.navbar.lastEvent} ${new Date(lastEventAt).toLocaleTimeString()}` : t.navbar.connected}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 10px', borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-primary)',
            fontSize: 11, fontWeight: 600,
            color: 'var(--color-text-secondary)',
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'nowrap',
            marginRight: 2,
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: sseConnected ? '#22c55e' : '#f59e0b',
            boxShadow: sseConnected ? '0 0 6px #22c55e' : 'none',
          }} />
          <span style={{ color: sseConnected ? '#22c55e' : '#f59e0b' }}>
            {sseConnected ? (isEn ? 'LIVE' : 'VIVO') : 'SYNC'}
          </span>
          {lastEventAt && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 10.5 }}>
              · {new Date(lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {/* Botón de Ajustes (Solo visible para rol admin) */}
        {isAdmin() && (
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('open-settings'))}
            title={t.navbar.settings}
            style={{
              width: 36, height: 36, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <Settings size={20} />
          </button>
        )}

        {/* Toggle Dark / Light */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? t.navbar.themeDark : t.navbar.themeLight}
          style={{
            width: 36, height: 36, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Avatar y Menú Desplegable de Usuario */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            title={user ? `${user.username} (${user.role})` : 'Usuario'}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: user?.role === 'admin'
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : user?.role === 'helpdesk'
                ? 'linear-gradient(135deg, #0ea5e9, #2563eb)'
                : 'linear-gradient(135deg, #64748b, #475569)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
              cursor: 'pointer', border: 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              textTransform: 'uppercase',
            }}
          >
            {user?.username ? user.username.charAt(0) : 'U'}
          </button>

          {userMenuOpen && (
            <>
              <div
                onClick={() => setUserMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 110 }}
              />
              <div style={{
                position: 'absolute',
                top: '115%',
                right: 0,
                zIndex: 111,
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '12px',
                minWidth: 210,
                boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {/* Info de usuario y rol */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: user?.role === 'admin'
                      ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                      : user?.role === 'helpdesk'
                      ? 'linear-gradient(135deg, #0ea5e9, #2563eb)'
                      : 'linear-gradient(135deg, #64748b, #475569)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: 700, color: '#fff',
                    textTransform: 'uppercase',
                  }}>
                    {user?.username ? user.username.charAt(0) : 'U'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {user?.username || 'Usuario'}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: user?.role === 'admin'
                        ? '#818cf8'
                        : user?.role === 'helpdesk'
                        ? '#38bdf8'
                        : '#94a3b8',
                    }}>
                      {user?.role === 'admin' ? 'Administrator' : user?.role === 'helpdesk' ? 'Helpdesk' : 'Viewer'}
                    </span>
                  </div>
                </div>

                {/* Cambiar propia contraseña (Todos los roles) */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setPassError(null)
                    setShowChangePassModal(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--color-bg-primary)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <KeyRound size={14} color="var(--color-accent)" />
                  <span>{isEn ? 'Change Password' : 'Cambiar Contraseña'}</span>
                </button>

                {/* Acceso a Seguridad si es admin */}
                {isAdmin() && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      document.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'security' } }))
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--color-bg-primary)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Shield size={14} color="var(--color-accent)" />
                    <span>{isEn ? 'Security & Users' : 'Seguridad & Usuarios'}</span>
                  </button>
                )}

                {/* Cerrar Sesión */}
                <button
                  onClick={async () => {
                    setUserMenuOpen(false)
                    await logout()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                >
                  <LogOut size={14} />
                  <span>{isEn ? 'Log out' : 'Cerrar Sesión'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal de Cambio de Contraseña Personal */}
      {showChangePassModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 14, width: '100%', maxWidth: 400, padding: 24,
            boxShadow: '0 20px 48px rgba(0,0,0,0.35)'
          }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={17} color="var(--color-accent)" />
              {isEn ? 'Change My Password' : 'Cambiar Mi Contraseña'}
            </h4>
            <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              {isEn
                ? `Update credentials for account "${user?.username}"`
                : `Actualiza la clave de tu cuenta "${user?.username}"`}
            </p>

            {passError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#ef4444', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} /> <span>{passError}</span>
              </div>
            )}

            <form onSubmit={handleChangeOwnPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {isEn ? 'Current (or Temporary) Password' : 'Contraseña Actual (o Temporal)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    autoFocus
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder={isEn ? 'Current password' : 'Tu contraseña actual'}
                    style={{
                      width: '100%', height: 38, padding: '0 36px 0 12px', borderRadius: 8,
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                      color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(v => !v)}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
                  {isEn ? 'New Password (min 6 chars)' : 'Nueva Contraseña (mín. 6 caracteres)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={isEn ? 'Minimum 6 characters' : 'Mínimo 6 caracteres'}
                    style={{
                      width: '100%', height: 38, padding: '0 36px 0 12px', borderRadius: 8,
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
                      color: 'var(--color-text-primary)', fontSize: 13, outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(v => !v)}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  disabled={passLoading}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={passLoading}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, opacity: passLoading ? 0.7 : 1 }}
                >
                  {passLoading ? (isEn ? 'Saving...' : 'Guardando...') : t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </nav>
  )
}
