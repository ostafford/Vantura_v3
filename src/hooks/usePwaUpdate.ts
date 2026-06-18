import { useRegisterSW } from 'virtual:pwa-register/react'

export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const applyUpdate = () => {
    updateServiceWorker(true)
  }

  return { updateReady: needRefresh, applyUpdate }
}
