/**
 * components/Navbar.tsx (v2)
 * Navbar limpio: logo, branding de entidad corporativa (centro), telemetría en vivo, toggle de tema y ajustes.
 */
import { useState, useEffect } from 'react'
import { Sun, Moon, Cpu, Settings } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useMonitorStore } from '../store/monitorStore'

export function Navbar() {
  const { theme, toggle } = useTheme()
  const { lastEventAt, sseConnected } = useMonitorStore()
  const [entity, setEntity] = useState<{ name: string; logo: string }>({ name: '', logo: '' })

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
            fontSize: 10.5,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 6,
            background: 'rgba(99, 102, 241, 0.14)',
            color: 'var(--color-accent)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
            letterSpacing: '0.02em',
            marginLeft: 8,
            verticalAlign: 'middle',
          }}>
            v1.0.6
          </span>
        </div>
      </div>

      {/* Identidad de la Entidad (Centro Absoluto) */}
      {(entity.name || entity.logo) && (
        <div
          title={entity.name ? `Entidad: ${entity.name}` : undefined}
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
        {/* Indicador EN VIVO / Telemetría (a la izquierda de ajustes) */}
        <div
          title={lastEventAt ? `Último evento recibido: ${new Date(lastEventAt).toLocaleTimeString()}` : 'Conexión en tiempo real activa'}
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
            {sseConnected ? 'VIVO' : 'SYNC'}
          </span>
          {lastEventAt && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 10.5 }}>
              · {new Date(lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

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
