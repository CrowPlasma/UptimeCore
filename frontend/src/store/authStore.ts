import { create } from 'zustand'
import type { User } from '../types'

// Global fetch interceptor to automatically attach Authorization header
if (typeof window !== 'undefined' && !(window as any).__uptimecore_fetch_intercepted__) {
  (window as any).__uptimecore_fetch_intercepted__ = true
  const originalFetch = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawToken = localStorage.getItem('uptimecore_auth_token')
    const token = rawToken && rawToken.length <= 256 ? rawToken.trim() : null
    if (rawToken && !token) {
      localStorage.removeItem('uptimecore_auth_token')
    }
    let newInit: RequestInit = { ...(init || {}) }
    const urlStr = String(input)
    if (urlStr.startsWith('/api')) {
      // Prevent browser from attaching large domain/corporate SSO cookies to API requests
      newInit.credentials = 'omit'
    }
    if (token) {
      const headers = new Headers(newInit.headers || {})
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      newInit = { ...newInit, headers }
    }
    const res = await originalFetch(input, newInit)
    if (
      res.status === 401 &&
      !urlStr.includes('/api/auth/login') &&
      !urlStr.includes('/api/auth/forgot-password') &&
      !urlStr.includes('/api/auth/password')
    ) {
      // If unauthorized, clear token and notify
      localStorage.removeItem('uptimecore_auth_token')
      localStorage.removeItem('uptimecore_auth_user')
      useAuthStore.getState().handleUnauthorized()
    }
    return res
  }
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  handleUnauthorized: () => void
  isAdmin: () => boolean
  canOperate: () => boolean // admin or helpdesk
  isViewer: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: (() => {
    try {
      const u = localStorage.getItem('uptimecore_auth_user')
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })(),
  token: localStorage.getItem('uptimecore_auth_token'),
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        set({ loading: false, error: data.error || 'Credenciales incorrectas' })
        return false
      }
      localStorage.setItem('uptimecore_auth_token', data.token)
      localStorage.setItem('uptimecore_auth_user', JSON.stringify(data.user))
      set({ user: data.user, token: data.token, loading: false, error: null })
      return true
    } catch (err) {
      set({ loading: false, error: String(err) })
      return false
    }
  },

  logout: async () => {
    const token = get().token
    try {
      if (token) {
        await fetch('/api/auth/logout', { method: 'POST' })
      }
    } catch {}
    localStorage.removeItem('uptimecore_auth_token')
    localStorage.removeItem('uptimecore_auth_user')
    set({ user: null, token: null, error: null })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('uptimecore_auth_token')
    if (!token) {
      set({ user: null, token: null, loading: false })
      return
    }
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('uptimecore_auth_user', JSON.stringify(data.user))
        set({ user: data.user, token, loading: false })
      } else if (res.status === 401) {
        localStorage.removeItem('uptimecore_auth_token')
        localStorage.removeItem('uptimecore_auth_user')
        set({ user: null, token: null, loading: false })
      } else {
        // Non-401 error (e.g. 502/503/431): preserve active session from localStorage
        set({ loading: false })
      }
    } catch {
      // In case of transient network hiccup, retain cached user from localStorage so session never breaks
      set({ loading: false })
    }
  },

  handleUnauthorized: () => {
    set({ user: null, token: null })
  },

  isAdmin: () => get().user?.role === 'admin',
  canOperate: () => get().user?.role === 'admin' || get().user?.role === 'helpdesk',
  isViewer: () => get().user?.role === 'viewer',
}))
