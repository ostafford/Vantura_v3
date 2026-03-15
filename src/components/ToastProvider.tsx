import { useEffect } from 'react'
import { Toast, ToastContainer, ToastBody } from 'react-bootstrap'
import { useStore } from 'zustand'
import { toastStore, type ToastVariant } from '@/stores/toastStore'

const AUTO_HIDE_MS = 4000

function variantToBootstrap(v: ToastVariant): 'success' | 'danger' | 'info' {
  if (v === 'error') return 'danger'
  return v
}

export function ToastProvider() {
  const show = useStore(toastStore, (s) => s.show)
  const message = useStore(toastStore, (s) => s.message)
  const variant = useStore(toastStore, (s) => s.variant)
  const hide = useStore(toastStore, (s) => s.hide)

  useEffect(() => {
    if (!show) return
    const t = setTimeout(hide, AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [show, hide])

  return (
    <ToastContainer
      position="top-center"
      containerPosition="fixed"
      className="p-3"
      style={{ zIndex: 9999 }}
    >
      <Toast
        show={show}
        onClose={hide}
        autohide
        delay={AUTO_HIDE_MS}
        bg={variantToBootstrap(variant)}
        className="bg-opacity-90 toast-fit-content"
      >
        <ToastBody className="text-white text-center">{message}</ToastBody>
      </Toast>
    </ToastContainer>
  )
}
