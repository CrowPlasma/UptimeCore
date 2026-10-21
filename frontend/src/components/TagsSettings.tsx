import { useState, useEffect } from 'react'
import { Tag as TagIcon, Plus, Trash2, Pipette } from 'lucide-react'
import { useMonitorStore } from '../store/monitorStore'
import { ConfirmDialog } from './ConfirmDialog'

const PRESET_COLORS = [
  // Azules, Índigos y Violetas
  "#6366f1", "#3b82f6", "#2563eb", "#1d4ed8", "#8b5cf6", "#a855f7", "#7c3aed",
  // Cyanes y Teals
  "#06b6d4", "#0ea5e9", "#14b8a6", "#0d9488", "#2dd4bf", "#0891b2",
  // Verdes y Limas
  "#10b981", "#22c55e", "#16a34a", "#84cc16", "#65a30d", "#4ade80",
  // Ámbar, Naranjas y Rojos
  "#f59e0b", "#f97316", "#ea580c", "#ef4444", "#dc2626", "#e11d48",
  // Rosas y Fucsias
  "#ec4899", "#f43f5e", "#d946ef",
  // Pizarras y Neutros
  "#64748b", "#475569", "#94a3b8",
]

export function TagsSettings() {
  const { allTags, fetchTags, fetchGroups } = useMonitorStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<number | null>(null)

  useEffect(() => {
    fetchTags()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color })
      })
      setName('')
      setColor(PRESET_COLORS[0])
      await fetchTags()
      await fetchGroups()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function performDelete() {
    if (tagToDelete === null) return
    try {
      await fetch(`/api/tags/${tagToDelete}`, { method: 'DELETE' })
      await fetchTags()
      await fetchGroups()
    } catch (err) {
      console.error(err)
    } finally {
      setTagToDelete(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h3 style={{ margin: 0, fontSize: 18, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>Gestión de Etiquetas</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Crea y administra las etiquetas que podrás asignar a tus grupos de monitoreo.</p>
      
      <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', background: 'var(--color-bg-card)', padding: 16, borderRadius: 8, border: '1px solid var(--color-border)' }}>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Nombre de Etiqueta</label>
          <input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Ej. Producción, API, MX..." 
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '2 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Color de Etiqueta</label>
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              color, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
              {color.toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '4px 0' }}>
            {PRESET_COLORS.map(c => (
              <div 
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color.toLowerCase() === c.toLowerCase() ? '2px solid white' : '2px solid transparent',
                  boxShadow: color.toLowerCase() === c.toLowerCase() ? `0 0 0 2px ${c}` : 'none',
                  transform: color.toLowerCase() === c.toLowerCase() ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              />
            ))}

            {/* Selector de color personalizado nativo (Rueda de color con Pipeta) */}
            <label
              title="Elegir color personalizado..."
              style={{
                width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer', position: 'relative', overflow: 'hidden',
                marginLeft: 4,
              }}
            >
              <Pipette size={13} color="var(--color-text-primary)" />
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  opacity: 0, cursor: 'pointer',
                }}
              />
            </label>
          </div>
        </div>
        <button disabled={loading || !name.trim()} style={{ background: 'var(--color-accent)', color: '#fff', padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, height: 36 }}>
          <Plus size={16} /> Agregar
        </button>
      </form>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {allTags.length === 0 ? (
          <div style={{ width: '100%', textAlign: 'center', padding: 30, color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 8 }}>
            No hay etiquetas creadas.
          </div>
        ) : (
          allTags.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 12px', borderRadius: 16, background: `${t.color}20`, border: `1px solid ${t.color}`, color: t.color, fontWeight: 600, fontSize: 13 }}>
              <TagIcon size={14} />
              {t.name}
              <button onClick={() => setTagToDelete(t.id)} style={{ background: 'none', border: 'none', color: t.color, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2, marginLeft: 4, opacity: 0.6 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {tagToDelete !== null && (
        <ConfirmDialog
          title="Eliminar Etiqueta"
          message="¿Seguro que deseas eliminar esta etiqueta? Se quitará de todos los grupos que la usen."
          confirmLabel="Eliminar"
          onConfirm={performDelete}
          onCancel={() => setTagToDelete(null)}
        />
      )}
    </div>
  )
}

