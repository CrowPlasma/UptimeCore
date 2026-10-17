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
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'> & { id?: string }) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = toast.id || Math.random().toString(36).substring(2, 9)
    // Red cards (error) stay fixed until manually closed or monitor recovers.
    // Green (success), Yellow (warning), and Blue (info) cards auto-close after 8s,
    // and pause their countdown while the user hovers the mouse over them.
    const autoClose = toast.autoClose ?? (toast.type === 'success' || toast.type === 'info' || toast.type === 'warning')
    const durationMs = toast.durationMs ?? 8000
    const createdAt = Date.now()

    set((state) => {
      const filtered = state.toasts.filter(t => t.id !== id)
      return {
        toasts: [...filtered, { ...toast, id, autoClose, durationMs, createdAt }].slice(-10),
      }
    })
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))
