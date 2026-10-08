import { useState, useEffect } from 'react'
import { Tag as TagIcon, Plus, Trash2 } from 'lucide-react'
import { useMonitorStore } from '../store/monitorStore'
import { ConfirmDialog } from './ConfirmDialog'

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ef4444", "#ec4899", "#64748b"]

export function TagsSettings() {
  const { allTags, fetchTags, fetchGroups } = useMonitorStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
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
      setColor(COLORS[0])
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Color</label>
          <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
            {COLORS.map(c => (
              <div 
                key={c}
                onClick={() => setColor(c)}
                style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid white' : '2px solid transparent', outline: color === c ? `2px solid ${c}` : 'none' }}
              />
            ))}
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

