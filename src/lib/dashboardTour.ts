/**
 * Dashboard product tour. Run once after first visit; can be re-run from Settings.
 * Section steps are ordered to match the user's current Dashboard section order.
 */

import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getAppSetting, setAppSetting } from '@/db'
import type { DashboardSectionId } from '@/lib/dashboardSections'

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

// Maps each section ID to its data-tour attribute value in the DOM
const SECTION_TOUR_ATTRS: Record<DashboardSectionId, string> = {
  month_summary: 'month-summary',
  insights: 'insights',
  trackers: 'trackers',
  upcoming: 'upcoming',
}

type SideType = 'top' | 'bottom' | 'left' | 'right'
type AlignType = 'start' | 'center' | 'end'

interface SectionPopover {
  title: string
  description: string
  side: SideType
  align: AlignType
}

const SECTION_POPOVERS: Record<DashboardSectionId, SectionPopover> = {
  month_summary: {
    title: 'Month at a glance',
    description:
      'Day-by-day spending for the <strong>current month</strong>, compared to the previous month.<br><br>' +
      'Key metrics and a narrative summary sit below the chart.<br><br>' +
      'Use the <strong>arrows</strong> to browse other months.',
    side: 'top',
    align: 'center',
  },
  insights: {
    title: 'Weekly insights',
    description:
      '<strong>Money in</strong>, <strong>money out</strong>, saver movement, and transaction count for the selected week.<br><br>' +
      'Use the <strong>arrows</strong> to browse previous weeks.<br><br>' +
      'The bar chart breaks spending down by <strong>category</strong>.',
    side: 'top',
    align: 'center',
  },
  trackers: {
    title: 'Trackers',
    description:
      'Set a <strong>budget</strong> and <strong>reset period</strong> per tracker, then assign spending categories.<br><br>' +
      'Reset options: <strong>weekly</strong>, <strong>fortnightly</strong>, <strong>monthly</strong>, or <strong>payday</strong> cycle.<br><br>' +
      'Use the <strong>+</strong> button to create your first tracker.',
    side: 'left',
    align: 'start',
  },
  upcoming: {
    title: 'Upcoming charges',
    description:
      'Add <strong>bills and subscriptions</strong> you know are coming — rent, Netflix, insurance, etc.<br><br>' +
      'Each charge reduces <strong>Spendable</strong> until its due date. Toggle <strong>Include in Spendable</strong> per charge to control this.<br><br>' +
      'Grouped into <strong>Next pay</strong> and <strong>Later</strong>.',
    side: 'top',
    align: 'center',
  },
}

export function startDashboardTour(
  sectionOrder: DashboardSectionId[],
  onCompleted?: () => void
): void {
  const steps = [
    // Step 1 — Intro: centred overlay, no element targeted
    {
      popover: {
        title: 'Welcome to Vantura',
        description:
          "Here's a quick tour of the <strong>Dashboard</strong> — the main hub for your finances.<br><br>" +
          'Press <strong>Next</strong> to begin, or close this at any time.',
      },
    },

    // Step 2 — Balance cards (always fixed at the top of the Dashboard)
    {
      element: '[data-tour="balance-cards"]',
      popover: {
        title: 'Balance cards',
        description:
          '<strong>Available</strong> — sum of your transactional account balances (excludes savers).<br><br>' +
          '<strong>Spendable</strong> — safe-to-spend: Available minus charges due before your next payday.<br><br>' +
          'Click <strong>Spendable</strong> to set a low-balance alert.',
        side: 'bottom' as SideType,
        align: 'center' as AlignType,
      },
    },

    // Steps 3–6 — Dashboard sections in the user's current order
    ...sectionOrder.map((id) => ({
      element: `[data-tour="${SECTION_TOUR_ATTRS[id]}"]`,
      popover: SECTION_POPOVERS[id],
    })),

    // Step 7 — Navigation (sidebar)
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Navigation',
        description:
          'Use the sidebar to explore <strong>Analytics</strong> (deeper trends and reports), <strong>Transactions</strong>, <strong>Settings</strong>, and the <strong>Help</strong> user guide.<br><br>' +
          'Each section has an <strong>ⓘ</strong> icon for quick in-context help.',
        side: 'right' as SideType,
        align: 'start' as AlignType,
      },
    },

    // Step 8 — Lock + completion
    {
      element: '[data-tour="sidebar-lock"]',
      popover: {
        title: "You're all set!",
        description:
          '<strong>Lock</strong> secures the app and clears the session — it also locks automatically after inactivity.<br><br>' +
          'Enable <strong>Touch ID / Face ID</strong> in Settings → Security if your device supports it.<br><br>' +
          "Start by creating a <strong>tracker</strong>, adding <strong>upcoming charges</strong>, and explore <strong>Analytics</strong> when you're ready.",
        side: 'right' as SideType,
        align: 'start' as AlignType,
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
