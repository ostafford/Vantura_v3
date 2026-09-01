/**
 * Global toast notifications. Use toast.success(), toast.error(), toast.info()
 * from anywhere. ToastProvider renders the toast and auto-dismisses unless
 * info(..., { persistent: true }) is used (e.g. long-running sync progress).
 *
 * `persistent` is an info()-only option — success and error toasts always
 * auto-dismiss, so they take no options rather than a silently-ignored one.
 */

import { createStore } from 'zustand/vanilla'

export type ToastVariant = 'success' | 'error' | 'info'

export type ToastShowOptions = {
  persistent?: boolean
}

type ToastState = {
  show: boolean
  message: string
  variant: ToastVariant
  persistent: boolean
}

type ToastActions = {
  success: (message: string) => void
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

  success(message: string) {
    set({ show: true, message, variant: 'success', persistent: false })
  },

  error(message: string) {
    set({ show: true, message, variant: 'error', persistent: false })
  },

  info(message: string, options?: ToastShowOptions) {
    set({
      show: true,
      message,
      variant: 'info',
      persistent: options?.persistent === true,
    })
  },

  hide() {
    set({ show: false, persistent: false })
  },
}))

/** Convenience API: toast.success('Done.') */
export const toast = {
  success: (message: string) => toastStore.getState().success(message),
  error: (message: string) => toastStore.getState().error(message),
  info: (message: string, options?: ToastShowOptions) =>
    toastStore.getState().info(message, options),
  hide: () => toastStore.getState().hide(),
}
