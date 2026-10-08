/**
 * components/Navbar.tsx (v2)
 * Navbar limpio: logo, búsqueda global, toggle de tema.
 * El botón "Nuevo Grupo" ahora vive en el Dashboard para mayor coherencia UX.
 */
import { Sun, Moon, Cpu, Settings } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export function Navbar() {
  const { theme, toggle } = useTheme()

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
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: 'linear-gradient(135deg, #2563eb, #1e40af)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
        }}>
          <Cpu size={18} color="#fff" />
        </div>
        <div>
          <span style={{
            fontWeight: 800, fontSize: 18,
            letterSpacing: '-0.04em',
            color: 'var(--color-text-primary)',
          }}>
            Uptime<span style={{ color: '#2563eb' }}>Core</span>
          </span>
          <span style={{
            marginLeft: 8, fontSize: 9, fontWeight: 700,
            background: 'linear-gradient(90deg, #2563eb, #1e40af)',
            color: '#fff',
            padding: '2px 7px', borderRadius: 4,
            letterSpacing: '0.08em',
            verticalAlign: 'middle',
          }}>
            ENTERPRISE
          </span>
        </div>
      </div>

      {/* Acciones derecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        

        {/* Botón de Ajustes */}
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('open-settings'))}
          title="Ajustes de Sistema"
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

        {/* Toggle Dark / Light */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
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

        {/* Avatar placeholder */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#fff',
          cursor: 'pointer',
        }}>
          A
        </div>
      </div>
    </nav>
  )
}
