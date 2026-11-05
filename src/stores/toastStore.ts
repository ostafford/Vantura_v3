/**
 * Global toast notifications. Use toast.success(), toast.error(), toast.info()
 * from anywhere. ToastProvider renders the toast and auto-dismisses unless
 * info(..., { persistent: true }) is used (e.g. long-running sync progress).
 *
 * `persistent` is an info()-only option — success and error toasts always
 * auto-dismiss, so they take no options rather than a silently-ignored one.
 *
 * success() can carry one `action` (e.g. Undo): a button in the toast that
 * runs it and dismisses the toast. A toast with an action stays up longer, so
 * there's time to reach it. Each toast gets a new `id`, so a second toast
 * shown while one is up restarts the dismiss timer.
 */

import { createStore } from 'zustand/vanilla'

export type ToastVariant = 'success' | 'error' | 'info'

export type ToastShowOptions = {
  persistent?: boolean
}

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastSuccessOptions = {
  action?: ToastAction
}

type ToastState = {
  show: boolean
  message: string
  variant: ToastVariant
  persistent: boolean
  action: ToastAction | null
  id: number
}

type ToastActions = {
  success: (message: string, options?: ToastSuccessOptions) => void
  error: (message: string) => void
  info: (message: string, options?: ToastShowOptions) => void
  hide: () => void
}

export type ToastStore = ToastState & ToastActions

export const toastStore = createStore<ToastStore>((set) => ({
  show: false,
  message: '',
  variant: 'success',
  persistent: false,
  action: null,
  id: 0,

  success(message: string, options?: ToastSuccessOptions) {
    set((s) => ({
      show: true,
      message,
      variant: 'success',
      persistent: false,
      action: options?.action ?? null,
      id: s.id + 1,
    }))
  },

  error(message: string) {
    set((s) => ({
      show: true,
      message,
      variant: 'error',
      persistent: false,
      action: null,
      id: s.id + 1,
    }))
  },

  info(message: string, options?: ToastShowOptions) {
    set((s) => ({
      show: true,
      message,
      variant: 'info',
      persistent: options?.persistent === true,
      action: null,
      id: s.id + 1,
    }))
  },

  hide() {
    set({ show: false, persistent: false, action: null })
  },
}))

/** Convenience API: toast.success('Done.') */
export const toast = {
  success: (message: string, options?: ToastSuccessOptions) =>
    toastStore.getState().success(message, options),
  error: (message: string) => toastStore.getState().error(message),
  info: (message: string, options?: ToastShowOptions) =>
    toastStore.getState().info(message, options),
  hide: () => toastStore.getState().hide(),
}
