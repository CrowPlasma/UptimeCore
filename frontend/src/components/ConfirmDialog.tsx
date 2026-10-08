/**
 * components/ConfirmDialog.tsx
 * Diálogo de confirmación reutilizable para acciones destructivas (borrar).
 */
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = 'Eliminar', onConfirm, onCancel }: Props) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)', zIndex: 300,
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 301,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: '28px 28px 22px',
        width: 'min(420px, 92vw)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, background: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertTriangle size={20} color="#ef4444" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              {title}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {message}
            </p>
          </div>
          <button onClick={onCancel} style={{
            marginLeft: 'auto', flexShrink: 0,
            color: 'var(--color-text-muted)', display: 'flex',
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-primary)',
            color: 'var(--color-text-secondary)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={onConfirm} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: '#ef4444', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
