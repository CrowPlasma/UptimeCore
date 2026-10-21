/**
 * useTheme.ts
 * Hook de alto rendimiento para alternar Modo Claro / Oscuro al instante (0ms).
 * Deshabilita temporalmente las transiciones globales para evitar que miles de nodos
 * del DOM (barras de uptime, badges, tarjetas) congelen la interfaz durante el cambio.
 */
import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('ping-eye-theme') as Theme | null
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'dark'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const toggle = useCallback(() => {
    setTheme(current => {
      const next: Theme = current === 'light' ? 'dark' : 'light'

      // Inyectar regla temporal para desactivar transiciones durante el repintado
      const style = document.createElement('style')
      style.textContent = `
        *, *::before, *::after {
          transition: none !important;
          animation-duration: 0.001ms !important;
        }
      `
      document.head.appendChild(style)

      // Actualizar el atributo data-theme y almacenamiento de forma síncrona
      document.documentElement.setAttribute('data-theme', next)
      try {
        localStorage.setItem('ping-eye-theme', next)
      } catch {}

      // Forzar lectura de reflow para que el navegador aplique los nuevos colores sin animar
      void document.documentElement.offsetHeight

      // Restaurar transiciones en el siguiente frame sin retraso
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (style.parentNode) {
            style.parentNode.removeChild(style)
          }
        })
      })

      return next
    })
  }, [])

  return { theme, toggle }
}
