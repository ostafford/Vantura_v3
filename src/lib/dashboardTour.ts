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
      '<strong>Money in</strong> and <strong>money out</strong> for the month sit above the chart.<br><br>' +
      'Use the <strong>arrows</strong> to browse other months.',
    side: 'top',
    align: 'center',
  },
  trackers: {
    title: 'Trackers',
    description:
      'Set a <strong>budget</strong> and <strong>reset period</strong> per tracker, then assign spending categories.<br><br>' +
      'Reset options: <strong>weekly</strong>, <strong>fortnightly</strong>, or <strong>monthly</strong>.<br><br>' +
      'Use the <strong>+</strong> button to create your first tracker.',
    side: 'left',
    align: 'start',
  },
  upcoming: {
    title: 'Regulars',
    description:
      'Add <strong>bills and subscriptions</strong> you know are coming — rent, Netflix, insurance, etc.<br><br>' +
      'Grouped into <strong>Overdue</strong>, <strong>This month</strong> and <strong>Later</strong>.',
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

    // Step 2 — Headroom (always fixed at the top of the Dashboard)
    {
      element: '[data-tour="headroom"]',
      popover: {
        title: 'Headroom',
        description:
          '<strong>On hand</strong> — your Spending account plus any Savers you switch on.<br><br>' +
          '<strong>Still to go out</strong> — Regulars not paid yet this month, plus what’s left in your trackers.<br><br>' +
          '<strong>Headroom</strong> is On hand minus Still to go out. It can go below zero.',
        side: 'bottom' as SideType,
        align: 'center' as AlignType,
      },
    },

    // Steps 3–5 — Dashboard sections in the user's current order
    ...sectionOrder.map((id) => ({
      element: `[data-tour="${SECTION_TOUR_ATTRS[id]}"]`,
      popover: SECTION_POPOVERS[id],
    })),

    // Step 6 — Navigation (sidebar)
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Navigation',
        description:
          'Use the sidebar to explore <strong>Analytics</strong> (deeper trends), <strong>Transactions</strong>, and <strong>Settings</strong>.<br><br>' +
          'Each section has an <strong>ⓘ</strong> icon for quick in-context help. The user guide and changelog are in <strong>Settings → About</strong>.',
        side: 'right' as SideType,
        align: 'start' as AlignType,
      },
    },

    // Step 7 — Lock + completion
    {
      element: '[data-tour="sidebar-lock"]',
      popover: {
        title: "You're all set!",
        description:
          '<strong>Lock</strong> secures the app and clears the session — it also locks automatically after inactivity.<br><br>' +
          'Enable <strong>Touch ID / Face ID</strong> in Settings → Security if your device supports it.<br><br>' +
          "Start by creating a <strong>tracker</strong>, adding <strong>Regulars</strong>, and explore <strong>Analytics</strong> when you're ready.",
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
    // Any deliberate close (✕, Escape, overlay click, Done) counts as done.
    // onDestroyStarted runs for all of them; onDestroyed is skipped when the
    // close lands inside a step's 400ms entry transition (#139). Setting it
    // hands the close to us, and destroy() doesn't re-enter this hook.
    onDestroyStarted: () => {
      setAppSetting(TOUR_COMPLETED_KEY, '1')
      onCompleted?.()
      driverObj.destroy()
    },
  })

  driverObj.drive()
}
