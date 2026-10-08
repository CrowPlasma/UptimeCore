import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  autoClose?: boolean
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = toast.id || Math.random().toString(36).substring(2, 9)
    // Red cards (error) don't auto-dismiss per user requirement
    const autoClose = toast.type === 'success' || toast.type === 'info' || toast.type === 'warning'
    
    set((state) => {
      // Remove existing toast with the same ID if it exists to prevent duplicates
      const filtered = state.toasts.filter(t => t.id !== id)
      return { toasts: [...filtered, { autoClose, ...toast, id }] }
    })

    if (autoClose) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
      }, 5000)
    }
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  }
}))
