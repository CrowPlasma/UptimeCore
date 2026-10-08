/**
 * useTheme.ts
 * Hook para manejar el estado de Modo Claro / Oscuro.
 * Persiste la preferencia del usuario en localStorage.
 */
import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Leer preferencia guardada o usar preferencia del sistema
    const saved = localStorage.getItem('ping-eye-theme') as Theme | null
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    // Aplicar el atributo al <html> para que las variables CSS funcionen
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ping-eye-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))

  return { theme, toggle }
}
