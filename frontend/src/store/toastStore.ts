import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  autoClose?: boolean
  durationMs?: number
  createdAt: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void
  removeToast: (id: string) => void
  clearAll: () => void
  pauseAutoClose: (id: string) => void
  resumeAutoClose: (id: string) => void
}

const STORAGE_KEY = 'uptimecore_active_toasts'

interface TimerEntry {
  timer: ReturnType<typeof setTimeout>
  expiryTime: number
  remainingMs: number
  isPaused: boolean
}

// Background auto-close timers managed independently of React component lifecycle
const autoCloseTimers = new Map<string, TimerEntry>()

function stopAutoCloseTimer(id: string) {
  const entry = autoCloseTimers.get(id)
  if (entry) {
    clearTimeout(entry.timer)
    autoCloseTimers.delete(id)
  }
}

function startAutoCloseTimer(id: string, durationMs: number, onExpire: (id: string) => void) {
  stopAutoCloseTimer(id)
  const expiryTime = Date.now() + durationMs
  const timer = setTimeout(() => {
    autoCloseTimers.delete(id)
    onExpire(id)
  }, durationMs)
  autoCloseTimers.set(id, {
    timer,
    expiryTime,
    remainingMs: durationMs,
    isPaused: false,
  })
}

function pauseTimer(id: string) {
  const entry = autoCloseTimers.get(id)
  if (entry && !entry.isPaused) {
    clearTimeout(entry.timer)
    // Minimum 3500ms after unpausing so mouse leaving never dismisses abruptly
    entry.remainingMs = Math.max(3500, entry.expiryTime - Date.now())
    entry.isPaused = true
  }
}

function resumeTimer(id: string, onExpire: (id: string) => void) {
  const entry = autoCloseTimers.get(id)
  if (entry && entry.isPaused) {
    const durationMs = entry.remainingMs
    entry.expiryTime = Date.now() + durationMs
    entry.isPaused = false
    entry.timer = setTimeout(() => {
      autoCloseTimers.delete(id)
      onExpire(id)
    }, durationMs)
  }
}

function loadSavedToasts(): Toast[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: Toast[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    // Discard expired autoClose toasts (e.g. success/info older than durationMs)
    return parsed.filter(t => {
      if (t.autoClose) {
        const dur = t.durationMs ?? 8000
        return now - t.createdAt < dur
      }
      return true
    })
  } catch {
    return []
  }
}

function saveToasts(toasts: Toast[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toasts))
  } catch {}
}

export const useToastStore = create<ToastStore>((set, get) => {
  const initialToasts = loadSavedToasts()

  // Schedule auto-close in background for any restored autoClose toasts
  initialToasts.forEach(t => {
    if (t.autoClose) {
      const remaining = Math.max(500, (t.durationMs ?? 8000) - (Date.now() - t.createdAt))
      startAutoCloseTimer(t.id, remaining, (id) => get().removeToast(id))
    }
  })

  return {
    toasts: initialToasts,
    addToast: (toast) => {
      const id = toast.id || Math.random().toString(36).substring(2, 9)
      const autoClose = toast.autoClose ?? (toast.type === 'success' || toast.type === 'info' || toast.type === 'warning')
      const durationMs = toast.durationMs ?? 8000
      const createdAt = toast.createdAt ?? Date.now()

      if (autoClose) {
        startAutoCloseTimer(id, durationMs, (idToExpire) => get().removeToast(idToExpire))
      } else {
        stopAutoCloseTimer(id)
      }

      set((state) => {
        const filtered = state.toasts.filter(t => t.id !== id)
        const next = [...filtered, { ...toast, id, autoClose, durationMs, createdAt }].slice(-25)
        saveToasts(next)
        return { toasts: next }
      })
    },
    removeToast: (id) => {
      stopAutoCloseTimer(id)
      set((state) => {
        const next = state.toasts.filter(t => t.id !== id)
        saveToasts(next)
        return { toasts: next }
      })
    },
    clearAll: () => {
      autoCloseTimers.forEach(entry => clearTimeout(entry.timer))
      autoCloseTimers.clear()
      saveToasts([])
      set({ toasts: [] })
    },
    pauseAutoClose: (id) => {
      pauseTimer(id)
    },
    resumeAutoClose: (id) => {
      resumeTimer(id, (idToExpire) => get().removeToast(idToExpire))
    },
  }
})

if (typeof window !== 'undefined') {
  ;(window as any).useToastStore = useToastStore
}
