import { X, CheckCircle, AlertOctagon, Info, AlertTriangle } from 'lucide-react'
import { useToastStore } from '../store/toastStore'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 12
    }}>
      
      
      {toasts.length > 1 && (
        <button
          onClick={() => useToastStore.setState({ toasts: [] })}
          style={{
            alignSelf: 'flex-end', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer'
          }}
        >
          Limpiar todas
        </button>
      )}
      {toasts.map(t => (
        <div key={t.id} style={{
          width: 340, padding: 16, borderRadius: 12,
          background: 'var(--color-bg-card)',
          border: `1px solid ${t.type === 'error' ? '#ef444450' : (t.type === 'success' ? '#22c55e50' : (t.type === 'warning' ? '#f59e0b50' : '#3b82f650'))}`,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            {t.type === 'error' && <AlertOctagon size={22} color="#dc2626" />}
            {t.type === 'success' && <CheckCircle size={22} color="#16a34a" />}
            {t.type === 'info' && <Info size={22} color="#2563eb" />}
            {t.type === 'warning' && <AlertTriangle size={22} color="#d97706" />}
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.type === 'error' ? '#ef4444' : (t.type === 'success' ? '#22c55e' : (t.type === 'warning' ? '#f59e0b' : '#3b82f6')) }}>
              {t.title}
            </h4>
            {t.message && (
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {t.message}
              </p>
            )}
          </div>
          <button 
            onClick={() => removeToast(t.id)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: t.type === 'error' ? '#ef4444' : (t.type === 'success' ? '#22c55e' : (t.type === 'warning' ? '#f59e0b' : '#3b82f6')),
              padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6
            }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
