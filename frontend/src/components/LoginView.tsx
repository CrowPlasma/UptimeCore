import React, { useState } from 'react'
import { Lock, User as UserIcon, LogIn, Eye, EyeOff, AlertCircle, Mail, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useTranslation } from '../i18n'
import { UptimeCoreLogo } from './UptimeCoreLogo'
import { AsciiOceanCanvas } from './AsciiOceanCanvas'

export function LoginView() {
  const { login, loading, error } = useAuthStore()
  const { t, language, toggleLanguage, isEn } = useTranslation()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Estados de recuperación de contraseña
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotSuccess, setForgotSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!username.trim()) {
      setValidationError(isEn ? 'Please enter your username.' : 'Por favor ingresa tu usuario.')
      return
    }

    if (password.length < 6) {
      setValidationError(
        isEn
          ? 'Password must be at least 6 characters long.'
          : 'La contraseña debe tener un mínimo de 6 caracteres.'
      )
      return
    }

    await login(username.trim(), password)
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)

    if (!forgotUsername.trim()) {
      setForgotError(isEn ? 'Please enter your username.' : 'Por favor ingresa tu nombre de usuario.')
      return
    }
    if (!forgotEmail.trim() || !forgotEmail.includes('@') || !forgotEmail.includes('.')) {
      setForgotError(
        isEn
          ? 'Please enter a valid registered email address.'
          : 'Por favor ingresa un correo electrónico válido.'
      )
      return
    }

    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: forgotUsername.trim(),
          email: forgotEmail.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'SMTP_NOT_CONFIGURED') {
          setForgotError(
            isEn
              ? 'SMTP email service is not configured on the platform. Please contact your system administrator.'
              : 'El servicio de correo SMTP no está configurado en el sistema. Contacta al administrador.'
          )
        } else {
          setForgotError(data.error || (isEn ? 'Could not process password recovery.' : 'No se pudo procesar la solicitud.'))
        }
        setForgotLoading(false)
        return
      }

      setForgotSuccess(true)
      setUsername(forgotUsername.trim())
    } catch (err: any) {
      setForgotError(err.message || (isEn ? 'Connection error.' : 'Error de conexión con el servidor.'))
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#070a14',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Fondo interactivo de Olas Oceánicas ASCII */}
      <AsciiOceanCanvas />

      {/* Selector de idioma arriba a la derecha */}
      <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 20 }}>
        <button
          onClick={toggleLanguage}
          title={t.navbar.switchLanguage}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(13, 17, 32, 0.75)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            userSelect: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ color: language === 'es' ? '#38bdf8' : '#64748b' }}>ES</span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span style={{ color: language === 'en' ? '#38bdf8' : '#64748b' }}>EN</span>
        </button>
      </div>

      {/* Tarjeta de Login flotante con Glassmorphism */}
      <div style={{
        width: '100%',
        maxWidth: 410,
        background: 'rgba(11, 15, 28, 0.82)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: 20,
        padding: '38px 32px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(14, 165, 233, 0.08)',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Cabecera */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', marginBottom: 14 }}>
            <UptimeCoreLogo size={48} />
          </div>
          <h1 style={{
            fontSize: 23,
            fontWeight: 800,
            margin: '0 0 6px 0',
            color: '#f8fafc',
            letterSpacing: '-0.02em',
          }}>
            Uptime<span style={{ color: '#38bdf8' }}>Core</span>
          </h1>
          <p style={{
            fontSize: 13,
            color: '#94a3b8',
            margin: 0,
          }}>
            {mode === 'forgot'
              ? (isEn ? 'Self-Service Password Recovery via Email' : 'Recuperación de Contraseña por Correo')
              : (isEn ? 'Network Telemetry & Operations Console' : 'Telemetría de Red y Consola de Operaciones')}
          </p>
        </div>

        {mode === 'login' ? (
          <>
            {/* Mensaje de error */}
            {(error || validationError) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                borderRadius: 9,
                padding: '10px 14px',
                fontSize: 12.5,
                marginBottom: 20,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{validationError || error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Campo Usuario */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                }}>
                  {isEn ? 'Username' : 'Usuario'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <UserIcon
                    size={16}
                    color="#64748b"
                    style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
                  />
                  <input
                    type="text"
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={isEn ? "e.g. admin" : "Ej: admin"}
                    style={{
                      width: '100%',
                      height: 42,
                      padding: '0 12px 0 38px',
                      borderRadius: 9,
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: 'rgba(7, 10, 20, 0.65)',
                      color: '#f8fafc',
                      fontSize: 13.5,
                      outline: 'none',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#38bdf8'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(56, 189, 248, 0.15)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {isEn ? 'Password' : 'Contraseña'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotUsername(username)
                      setForgotEmail('')
                      setForgotError(null)
                      setForgotSuccess(false)
                      setValidationError(null)
                      setMode('forgot')
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'none',
                    }}
                    onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}
                  >
                    {isEn ? 'Forgot password?' : '¿Olvidaste tu contraseña?'}
                  </button>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock
                    size={16}
                    color="#64748b"
                    style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={isEn ? "Minimum 6 characters" : "Mínimo 6 caracteres"}
                    style={{
                      width: '100%',
                      height: 42,
                      padding: '0 38px 0 38px',
                      borderRadius: 9,
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: 'rgba(7, 10, 20, 0.65)',
                      color: '#f8fafc',
                      fontSize: 13.5,
                      outline: 'none',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#38bdf8'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(56, 189, 248, 0.15)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Botón Iniciar Sesión */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 44,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 6,
                  boxShadow: '0 4px 18px rgba(37, 99, 235, 0.35)',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <LogIn size={16} />
                {loading
                  ? (isEn ? 'Signing in...' : 'Iniciando sesión...')
                  : (isEn ? 'Sign in' : 'Iniciar Sesión')}
              </button>
            </form>

            {/* Nota informativa de inicio */}
            <div style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
              fontSize: 11.5,
              color: 'rgba(148, 163, 184, 0.7)',
            }}>
              {isEn
                ? 'Default administrator credentials: admin / admin123'
                : 'Credenciales de administrador por defecto: admin / admin123'}
            </div>
          </>
        ) : (
          /* ── MODO: OLVIDÉ MI CONTRASEÑA ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {forgotSuccess ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 14,
                padding: '12px 4px',
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4ade80',
                }}>
                  <CheckCircle2 size={24} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                  {isEn ? 'Recovery Request Processed' : 'Solicitud Procesada'}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8', lineHeight: 1.5 }}>
                  {isEn
                    ? 'If the username and email match a registered account, a temporary password has been sent to your inbox. Use it to sign in and then change it from your profile menu.'
                    : 'Si el usuario y el correo coinciden con una cuenta registrada, hemos enviado una contraseña temporal a tu bandeja de entrada. Úsala para iniciar sesión y cámbiala desde el menú de tu perfil.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSuccess(false)
                    setPassword('')
                    setMode('login')
                  }}
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                    color: '#fff',
                    fontSize: 13.5,
                    fontWeight: 700,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 6,
                    boxShadow: '0 4px 18px rgba(37, 99, 235, 0.35)',
                  }}
                >
                  <ArrowLeft size={15} />
                  {isEn ? 'Back to Sign In' : 'Volver e Iniciar Sesión'}
                </button>
              </div>
            ) : (
              <>
                <div style={{
                  padding: '10px 13px',
                  borderRadius: 9,
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  fontSize: 12,
                  color: '#bae6fd',
                  lineHeight: 1.45,
                }}>
                  {isEn
                    ? 'Enter your username and the recovery email associated with your account. The system will generate a temporary password and send it to your email.'
                    : 'Ingresa tu usuario y el correo electrónico registrado en tu cuenta. El sistema generará una contraseña aleatoria temporal y la enviará a tu correo.'}
                </div>

                {forgotError && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    borderRadius: 9,
                    padding: '10px 14px',
                    fontSize: 12.5,
                  }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{forgotError}</span>
                  </div>
                )}

                <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Usuario */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                    }}>
                      {isEn ? 'Username' : 'Usuario del Sistema'}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <UserIcon
                        size={16}
                        color="#64748b"
                        style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
                      />
                      <input
                        type="text"
                        autoFocus
                        value={forgotUsername}
                        onChange={e => setForgotUsername(e.target.value)}
                        placeholder={isEn ? "e.g. admin" : "Ej: admin"}
                        style={{
                          width: '100%',
                          height: 42,
                          padding: '0 12px 0 38px',
                          borderRadius: 9,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          background: 'rgba(7, 10, 20, 0.65)',
                          color: '#f8fafc',
                          fontSize: 13.5,
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  </div>

                  {/* Correo */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                    }}>
                      {isEn ? 'Registered Email' : 'Correo Registrado'}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Mail
                        size={16}
                        color="#64748b"
                        style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
                      />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder={isEn ? "user@company.com" : "usuario@empresa.com"}
                        style={{
                          width: '100%',
                          height: 42,
                          padding: '0 12px 0 38px',
                          borderRadius: 9,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          background: 'rgba(7, 10, 20, 0.65)',
                          color: '#f8fafc',
                          fontSize: 13.5,
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{
                      height: 44,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                      color: '#fff',
                      fontSize: 13.5,
                      fontWeight: 700,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      cursor: forgotLoading ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 4,
                      boxShadow: '0 4px 18px rgba(37, 99, 235, 0.35)',
                      opacity: forgotLoading ? 0.7 : 1,
                    }}
                  >
                    <KeyRound size={16} />
                    {forgotLoading
                      ? (isEn ? 'Sending temporary password...' : 'Enviando contraseña temporal...')
                      : (isEn ? 'Send Temporary Password' : 'Enviar Contraseña Temporal')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotError(null)
                      setMode('login')
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '6px 0',
                    }}
                  >
                    <ArrowLeft size={14} />
                    {isEn ? 'Back to sign in' : 'Volver al inicio de sesión'}
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
