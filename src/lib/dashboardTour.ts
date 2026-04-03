/**
 * Dashboard product tour. Run once after first visit; can be re-run from Settings.
 */

import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getAppSetting, setAppSetting } from '@/db'

const TOUR_COMPLETED_KEY = 'dashboard_tour_completed'

export function getDashboardTourCompleted(): boolean {
  return getAppSetting(TOUR_COMPLETED_KEY) === '1'
}

export function setDashboardTourCompleted(value: boolean): void {
  setAppSetting(TOUR_COMPLETED_KEY, value ? '1' : '')
}

export function shouldShowDashboardTour(): boolean {
  return !getDashboardTourCompleted()
}

export function startDashboardTour(onCompleted?: () => void): void {
  const steps = [
    {
      element: '[data-tour="balance-cards"]',
      popover: {
        title: 'Balance cards',
        description:
          'Available is your Up Bank balance. Spendable is safe-to-spend (Available minus reserved for upcoming charges before next payday). Click Spendable to set a low-balance alert.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
    },
    {
      element: '[data-tour="trackers"]',
      popover: {
        title: 'Trackers',
        description:
          'Set budgets by category and reset period (e.g. weekly or payday). Track spending and see days left.',
        side: 'left' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="insights"]',
      popover: {
        title: 'Weekly insights',
        description:
          'Money in, money out, and spending by category for the current week.',
        side: 'top' as const,
        align: 'center' as const,
      },
    },
    {
      element: '[data-tour="upcoming"]',
      popover: {
        title: 'Upcoming charges',
        description:
          'Add bills and subscriptions. They reduce Spendable until the due date. Grouped by next pay vs later.',
        side: 'top' as const,
        align: 'center' as const,
      },
    },
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Navigation',
        description:
          'Dashboard, Analytics (trends and reports), Transactions (filter and search), Settings (sync, payday, theme), and Help (user guide).',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="sidebar-lock"]',
      popover: {
        title: 'Your security',
        description:
          'Lock secures the app and clears the session so your data is protected when you step away. Use Lock before leaving your device, then unlock with your passphrase when you return. We take your security seriously.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
  ]

  const driverObj = driver({
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    showButtons: ['next', 'previous', 'close'],
    nextBtnText: 'Next',
    prevBtnText: 'Previous',
    doneBtnText: 'Done',
    progressText: '{{current}} of {{total}}',
    steps,
    onDestroyed: () => {
      setAppSetting(TOUR_COMPLETED_KEY, '1')
      onCompleted?.()
    },
  })

  driverObj.drive()
}
