import { describe, it, expect, beforeEach } from 'vitest'
import { toastStore, toast } from './toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    toastStore.getState().hide()
  })

  it('success() shows an auto-dismissing success toast', () => {
    toast.success('Saved.')
    expect(toastStore.getState()).toMatchObject({
      show: true,
      message: 'Saved.',
      variant: 'success',
      persistent: false,
    })
  })

  it('error() shows an auto-dismissing error toast', () => {
    toast.error('Nope.')
    expect(toastStore.getState()).toMatchObject({
      show: true,
      message: 'Nope.',
      variant: 'error',
      persistent: false,
    })
  })

  it('info() defaults to auto-dismiss', () => {
    toast.info('Working…')
    expect(toastStore.getState()).toMatchObject({
      variant: 'info',
      persistent: false,
    })
  })

  it('info() honours { persistent: true }', () => {
    toast.info('Syncing…', { persistent: true })
    expect(toastStore.getState().persistent).toBe(true)
  })

  it('success() after a persistent info() clears the persistent flag', () => {
    toast.info('Syncing…', { persistent: true })
    toast.success('Done.')
    expect(toastStore.getState().persistent).toBe(false)
  })

  it('hide() resets show and persistent', () => {
    toast.info('Syncing…', { persistent: true })
    toast.hide()
    expect(toastStore.getState()).toMatchObject({
      show: false,
      persistent: false,
    })
  })

  it('success() and error() take no options argument', () => {
    // @ts-expect-error success() has no options parameter
    toast.success('x', { persistent: true })
    // @ts-expect-error error() has no options parameter
    toast.error('x', { persistent: true })
  })
})
