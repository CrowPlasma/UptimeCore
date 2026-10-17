import { useState, useEffect, useRef } from 'react'
import { X, CheckCircle, AlertOctagon, Info, AlertTriangle } from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import type { Toast } from '../store/toastStore'

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const duration = t.durationMs ?? 8000
  const remainingRef = useRef<number>(duration)
  const lastStartRef = useRef<number>(Date.now())

  // Reset remaining time if the same toast ID is re-triggered with a newer createdAt
  useEffect(() => {
    remainingRef.current = duration
    lastStartRef.current = Date.now()
  }, [t.createdAt, duration])

  useEffect(() => {
    if (!t.autoClose) return

    if (hovered) {
      // Pause countdown and save remaining time (minimum 3.5s after mouse leaves so it never vanishes abruptly)
      const elapsed = Date.now() - lastStartRef.current
      remainingRef.current = Math.max(3500, remainingRef.current - elapsed)
      return
    }

    lastStartRef.current = Date.now()
    const timer = setTimeout(() => {
      onRemove(t.id)
    }, remainingRef.current)

    return () => clearTimeout(timer)
  }, [t.autoClose, t.id, t.createdAt, hovered, onRemove])

  const accentColor =
    t.type === 'error' ? '#ef4444'
    : t.type === 'success' ? '#22c55e'
    : t.type === 'warning' ? '#f59e0b'
    : '#3b82f6'

  const timeStr = new Date(t.createdAt).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: 360,
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
            {hovered && t.autoClose ? '⏸ Pausado' : timeStr}
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
        title="Cerrar notificación"
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
              animation: `toastCountdown ${duration}ms linear forwards`,
              animationPlayState: hovered ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} t={t} onRemove={removeToast} />
      ))}

      {toasts.length > 1 && (
        <button
          onClick={() => useToastStore.setState({ toasts: [] })}
          style={{
            alignSelf: 'flex-end',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12.5,
            cursor: 'pointer',
            fontWeight: 700,
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          }}
        >
          🧹 Limpiar todas ({toasts.length})
        </button>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastCountdown {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
