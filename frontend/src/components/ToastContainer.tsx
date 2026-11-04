import { useState, useEffect, useRef } from 'react'
import { X, CheckCircle, AlertOctagon, Info, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import type { Toast } from '../store/toastStore'
import { useTranslation } from '../i18n'

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: string) => void }) {
  const { isEn } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const duration = t.durationMs ?? 8000
  const elapsed = Math.max(0, Date.now() - t.createdAt)
  const remainingTime = Math.max(500, duration - elapsed)

  const handleMouseEnter = () => {
    setHovered(true)
    if (t.autoClose) {
      useToastStore.getState().pauseAutoClose(t.id)
    }
  }

  const handleMouseLeave = () => {
    setHovered(false)
    if (t.autoClose) {
      useToastStore.getState().resumeAutoClose(t.id)
    }
  }

  const accentColor =
    t.type === 'error' ? '#ef4444'
    : t.type === 'success' ? '#22c55e'
    : t.type === 'warning' ? '#f59e0b'
    : '#3b82f6'

  const timeStr = new Date(t.createdAt).toLocaleTimeString(isEn ? 'en-US' : 'es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: 360,
        minHeight: 'fit-content',
        flexShrink: 0,
        boxSizing: 'border-box',
        padding: '14px 16px 16px 16px',
        borderRadius: 12,
        background: 'var(--color-bg-card)',
        border: `1.5px solid ${hovered ? accentColor : `${accentColor}66`}`,
        boxShadow: hovered
          ? `0 14px 28px -4px rgba(0, 0, 0, 0.35), 0 0 0 2px ${accentColor}30`
          : '0 10px 18px -3px rgba(0, 0, 0, 0.22)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        animation: 'slideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {t.type === 'error' && <AlertOctagon size={22} color="#ef4444" />}
        {t.type === 'success' && <CheckCircle size={22} color="#22c55e" />}
        {t.type === 'info' && <Info size={22} color="#3b82f6" />}
        {t.type === 'warning' && <AlertTriangle size={22} color="#f59e0b" />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: accentColor }}>
            {t.title}
          </h4>
          <span style={{
            fontSize: 10.5,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}>
            {hovered && t.autoClose ? (isEn ? '⏸ Paused' : '⏸ Pausado') : timeStr}
          </span>
        </div>

        {t.message && (
          <p style={{ margin: '5px 0 0 0', fontSize: 12.5, lineHeight: 1.4, color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
            {t.message}
          </p>
        )}
      </div>

      <button
        onClick={() => onRemove(t.id)}
        title={isEn ? 'Dismiss notification' : 'Cerrar notificación'}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: accentColor,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          flexShrink: 0,
        }}
      >
        <X size={16} strokeWidth={2.5} />
      </button>

      {/* Barra de progreso inferior para tarjetas con autocierre */}
      {t.autoClose && (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: `${accentColor}22`,
        }}>
          <div
            key={t.createdAt}
            style={{
              height: '100%',
              background: accentColor,
              width: '100%',
              transformOrigin: 'left',
              animation: `toastCountdown ${remainingTime}ms linear forwards`,
              animationPlayState: hovered ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function ToastContainer() {
  const { isEn } = useTranslation()
  const { toasts, removeToast } = useToastStore()
  const [isMinimized, setIsMinimized] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(toasts.length)

  // Auto-scroll hacia la alerta más reciente y restaurar si se vació
  useEffect(() => {
    if (toasts.length === 0) {
      setIsMinimized(false)
      prevCountRef.current = 0
      return
    }

    if (toasts.length > prevCountRef.current && !isMinimized) {
      // Desplazar suavemente hacia el final donde entra la alerta nueva
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }
    }
    prevCountRef.current = toasts.length
  }, [toasts.length, isMinimized])

  if (toasts.length === 0) return null

  // Contadores por tipo de alerta para la píldora compacta
  const errorCount = toasts.filter(t => t.type === 'error').length
  const warningCount = toasts.filter(t => t.type === 'warning').length
  const successCount = toasts.filter(t => t.type === 'success').length
  const hasErrors = errorCount > 0
  const hasWarnings = warningCount > 0
  const primaryColor = hasErrors ? '#ef4444' : hasWarnings ? '#f59e0b' : '#22c55e'

  // Modo Minimizado: Píldora compacta flotante que no estorba
  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <button
          onClick={() => setIsMinimized(false)}
          title={isEn ? 'Expand notification alerts' : 'Expandir alertas de notificación'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '8px 14px',
            borderRadius: 99,
            background: 'var(--color-bg-card)',
            border: `1.5px solid ${primaryColor}`,
            color: 'var(--color-text-primary)',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: `0 8px 20px -2px rgba(0, 0, 0, 0.3), 0 0 0 2px ${primaryColor}22`,
            transition: 'all 0.15s ease',
            backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {hasErrors ? (
              <AlertOctagon size={16} color="#ef4444" className="pulse-alert" />
            ) : hasWarnings ? (
              <AlertTriangle size={16} color="#f59e0b" />
            ) : (
              <CheckCircle size={16} color="#22c55e" />
            )}
          </span>

          <span>
            {hasErrors
              ? `${errorCount} ${errorCount === 1 ? (isEn ? 'down' : 'caído') : (isEn ? 'down' : 'caídos')}`
              : hasWarnings
              ? `${warningCount} ${warningCount === 1 ? (isEn ? 'degraded' : 'degradado') : (isEn ? 'degraded' : 'degradados')}`
              : `${successCount} ${successCount === 1 ? (isEn ? 'recovered' : 'recuperado') : (isEn ? 'recovered' : 'recuperados')}`}
          </span>

          {hasErrors && successCount > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 7px',
              borderRadius: 99,
              background: '#22c55e22',
              color: '#22c55e',
              fontSize: 11,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              +{successCount} {isEn ? 'ok' : 'recup.'}
            </span>
          )}

          <ChevronUp size={15} color="var(--color-text-secondary)" />
        </button>

        <button
          onClick={() => useToastStore.getState().clearAll()}
          title={isEn ? 'Clear all notifications' : 'Limpiar todas las alertas'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 99,
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#ef4444'
            e.currentTarget.style.borderColor = '#ef444466'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-text-secondary)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          🧹
        </button>

        <style>{`
          @keyframes alertPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.18); opacity: 0.8; }
          }
          .pulse-alert {
            animation: alertPulse 1.8s ease-in-out infinite;
          }
        `}</style>
      </div>
    )
  }

  // Modo Desplegado: Lista con tope de altura, scroll transparente y barra inferior de control
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {/* Contenedor transparente con scroll y límite de altura vertical */}
      <div
        ref={scrollContainerRef}
        className="toast-scroll-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: 'min(520px, calc(100vh - 120px))',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '6px 10px 6px 6px',
          background: 'transparent',
          pointerEvents: 'auto',
          width: 384,
          boxSizing: 'border-box',
        }}
      >
        {toasts.map(t => (
          <ToastItem key={t.id} t={t} onRemove={removeToast} />
        ))}
      </div>

      {/* Barra de control inferior unificada */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto',
        }}
      >
        {/* Botón para Minimizar */}
        <button
          onClick={() => setIsMinimized(true)}
          title={isEn ? 'Minimize notifications' : 'Minimizar alertas'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            padding: '5px 11px',
            borderRadius: 8,
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 700,
            boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-text-primary)'
            e.currentTarget.style.borderColor = 'var(--color-accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-text-secondary)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          <ChevronDown size={14} />
          {isEn ? 'Minimize' : 'Minimizar'} ({hasErrors ? `${errorCount} ${isEn ? 'down' : 'caídos'}` : `${toasts.length}`})
        </button>

        {/* Botón Limpiar Todas */}
        {toasts.length > 1 && (
          <button
            onClick={() => useToastStore.getState().clearAll()}
            title={isEn ? 'Dismiss all notifications' : 'Eliminar todas las notificaciones'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 700,
              boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.borderColor = '#ef444466'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-primary)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            🧹 {isEn ? 'Clear all' : 'Limpiar todas'}
          </button>
        )}
      </div>

      <style>{`
        /* Scrollbar ultra delgado y discreto para el contenedor de alertas */
        .toast-scroll-container::-webkit-scrollbar {
          width: 5px;
        }
        .toast-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .toast-scroll-container::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.4);
          border-radius: 99px;
        }
        .toast-scroll-container::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.7);
        }
        .toast-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastCountdown {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @keyframes alertPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.18); opacity: 0.8; }
        }
        .pulse-alert {
          animation: alertPulse 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
