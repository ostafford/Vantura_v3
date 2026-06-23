export interface MilestoneItem {
  icon: string
  text: string
}

export interface Milestone {
  date: string
  heading: string
  primaryMonth: string
  color: string
  version: string // app version this milestone shipped in
  items: MilestoneItem[]
}

export interface UpcomingItem extends MilestoneItem {
  color: string
}

export const MILESTONES: Milestone[] = [
  {
    date: '23 Jun 2026',
    heading: 'Now Live at myvantura.xyz',
    primaryMonth: '2026-06',
    version: '0.5.5',
    color: '#a5d6a7',
    items: [
      {
        icon: 'mdi-earth',
        text: 'Vantura is permanently live at myvantura.xyz — this URL will not change. The domain is owned independently of any hosting provider.',
      },
      {
        icon: 'mdi-cloud-check-outline',
        text: 'Hosting consolidated to Cloudflare Pages — domain, CDN, and server all in one place for maximum reliability and speed',
      },
      {
        icon: 'mdi-shield-check-outline',
        text: 'Security headers verified live: HSTS, Content Security Policy, and frame protection all confirmed active',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Stability Fix',
    primaryMonth: '2026-06',
    version: '0.5.4',
    color: '#80cbc4',
    items: [
      {
        icon: 'mdi-shield-bug-outline',
        text: 'Update banner no longer crashes the app when it appears on the lock screen — the "What\'s new" link now works safely before you unlock',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Export & Import v2',
    primaryMonth: '2026-06',
    version: '0.5.3',
    color: '#90caf9',
    items: [
      {
        icon: 'mdi-export-variant',
        text: 'Budget Plan now included in export — buckets, hypotheticals, and tracker/charge bucket assignments all survive the transfer',
      },
      {
        icon: 'mdi-bell-outline',
        text: 'Notification preferences exported — master toggle, per-type toggles, and large-transaction threshold all carry over to new devices',
      },
      {
        icon: 'mdi-shield-lock-outline',
        text: 'Lock timeout setting exported — your inactivity timeout preference no longer needs to be reconfigured after import',
      },
      {
        icon: 'mdi-cash-clock',
        text: 'Payday source transaction exported — payday detection state fully preserved so the app knows which credit is your salary on arrival',
      },
      {
        icon: 'mdi-piggy-bank-outline',
        text: 'Saver preferences exported — account ordering and individual goal dates transfer across devices',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Reliability & Hosting',
    primaryMonth: '2026-06',
    version: '0.5.2',
    color: '#80deea',
    items: [
      {
        icon: 'mdi-server-network',
        text: 'Vantura has moved to Netlify hosting — all pages now load correctly on every device and browser, including direct links and PWA re-opens',
      },
      {
        icon: 'mdi-shield-check-outline',
        text: 'Your data is still 100% local — the hosting provider serves only the app files and has no access to your transactions, token, or any stored data',
      },
      {
        icon: 'mdi-bell-ring-outline',
        text: 'Toast notifications now slide in from the top and slide back out on dismiss',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Smarter App Updates',
    primaryMonth: '2026-06',
    version: '0.5.1',
    color: '#80cbc4',
    items: [
      {
        icon: 'mdi-cellphone-arrow-down-variant',
        text: 'Vantura now checks for updates automatically when you return to the app — no force-quit needed to get the latest version',
      },
      {
        icon: 'mdi-refresh',
        text: 'New "Check for updates" button in Settings → Help lets you manually check at any time',
      },
      {
        icon: 'mdi-clock-outline',
        text: 'Update banner now has a "Later" option — dismiss it and install at your own pace from Settings',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Update & Release UX',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#ffe082',
    items: [
      {
        icon: 'mdi-information-outline',
        text: "App version now visible in Settings → Help and on the What's new page — always know what you're running",
      },
      {
        icon: 'mdi-filter-outline',
        text: "What's new modal now shows only features new since your last update — not the entire month's history",
      },
      {
        icon: 'mdi-cellphone-check',
        text: 'PWA reopen crash on iPhone and Mac fixed — closing and reopening the app no longer shows "Something went wrong"',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Notification Centre',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#ce93d8',
    items: [
      {
        icon: 'mdi-bell-badge-outline',
        text: 'Bell icon in the navbar opens a notification inbox — review alerts any time, even after dismissing them',
      },
      {
        icon: 'mdi-cash-clock',
        text: 'Bill reminders — notified when upcoming charges are due within your reminder window',
      },
      {
        icon: 'mdi-chart-line-variant',
        text: 'Tracker alerts — get warned when a tracker exceeds its budget or is running more than 10% ahead of pace',
      },
      {
        icon: 'mdi-wallet-outline',
        text: 'Spendable balance warning — alerted when your spendable drops below a threshold you set',
      },
      {
        icon: 'mdi-cash-multiple',
        text: 'Payday landed — detects when a salary-sized credit appears and links it to your pay source',
      },
      {
        icon: 'mdi-bank-alert',
        text: 'Large transaction alert — flags unexpected debits above a dollar threshold you configure',
      },
      {
        icon: 'mdi-piggy-bank',
        text: 'Saver milestones — celebrates when a saver reaches 50%, 75%, or 100% of its goal',
      },
      {
        icon: 'mdi-toggle-switch-outline',
        text: 'Per-type controls — enable or disable each alert type individually from Settings → Notifications',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Lock Screen UX',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#90caf9',
    items: [
      {
        icon: 'mdi-lock-outline',
        text: 'Vantura logo now appears on all lock screen states — passphrase, biometric, demo, and reset',
      },
      {
        icon: 'mdi-fingerprint',
        text: 'Biometric prompt auto-triggers on mount — no extra tap required when Face ID or Touch ID is available',
      },
      {
        icon: 'mdi-refresh',
        text: 'Forgot your passphrase? A new inline reset flow lets you clear all data and start over directly from the lock screen',
      },
      {
        icon: 'mdi-palette-outline',
        text: 'Lock screen background and card border now respond to your chosen accent colour; modal borders updated to match',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Documentation & UX Polish',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#ce93d8',
    items: [
      {
        icon: 'mdi-book-open-page-variant',
        text: 'Help page fully redesigned — structured sub-headings, bullet lists, and Tip callouts for every section',
      },
      {
        icon: 'mdi-help-circle-outline',
        text: 'Help popovers (ⓘ) added to Weekly Insights, Budget Plan, and Savers; existing copy updated for Trackers and Upcoming charges',
      },
      {
        icon: 'mdi-map-marker-path',
        text: 'Dashboard tour overhauled — steps now follow your section order, all descriptions use bold key terms and line breaks',
      },
      {
        icon: 'mdi-file-document-outline',
        text: 'README, CHANGELOG, SECURITY, and Arch_Docs fully audited and updated to reflect current state',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'PWA & App Icons',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#80cbc4',
    items: [
      {
        icon: 'mdi-cellphone-arrow-down',
        text: 'Add Vantura to your iPhone or Mac home screen as a PWA — works offline and feels native',
      },
      {
        icon: 'mdi-image-outline',
        text: 'App icon redesigned for home screen — cipher monogram on dark background, sharp at all sizes',
      },
      {
        icon: 'mdi-refresh',
        text: 'In-app update notifications — a banner appears when a new version is ready; tap Reload to apply it without leaving the app',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Security & Theming',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#80cbc4',
    items: [
      {
        icon: 'mdi-fingerprint',
        text: 'Biometric unlock — Touch ID / Face ID via WebAuthn (Settings → Security); falls back to passphrase if unavailable',
      },
      {
        icon: 'mdi-timer-lock-outline',
        text: 'Configurable inactivity lock — auto-locks after 1–30 minutes of no interaction (default 3 minutes)',
      },
      {
        icon: 'mdi-palette',
        text: 'Pastel accent colour system — six swatches: Sky, Mint, Lavender, Peach, Blush, Lemon; dark text on all pastel surfaces',
      },
      {
        icon: 'mdi-weather-night',
        text: 'Light theme removed — dark-only UI for a consistent, polished look',
      },
    ],
  },
  {
    date: '21 Jun 2026',
    heading: 'Budget Plan',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#ffab91',
    items: [
      {
        icon: 'mdi-wallet-outline',
        text: 'Organise expenses into named buckets — Subscriptions, Household, Lifestyle, or anything you like',
      },
      {
        icon: 'mdi-flask-outline',
        text: 'Hypothetical lines — add "what if?" expenses to any bucket without affecting real data; remove them any time',
      },
      {
        icon: 'mdi-calendar-month',
        text: 'Period toggle — view all amounts scaled to weekly, fortnightly, or monthly',
      },
      {
        icon: 'mdi-cash-multiple',
        text: 'Summary footer — Income (from your pay amount), total Committed spend, and Free Spending at a glance',
      },
    ],
  },
  {
    date: 'May–Jun 2026',
    heading: 'Analytics Overhaul',
    primaryMonth: '2026-05',
    version: '0.0.2',
    color: '#90caf9',
    items: [
      {
        icon: 'mdi-piggy-bank',
        text: 'Savers rebuilt — collapsible balance and contribution charts, drag-to-reorder cards, On track / Behind pace status',
      },
      {
        icon: 'mdi-file-chart',
        text: 'Reports page rebuilt — category breakdown, date filters, improved chart layout',
      },
      {
        icon: 'mdi-chart-bar',
        text: 'Saver forecasting — hover "Behind pace" badge to see your recommended monthly contribution',
      },
      {
        icon: 'mdi-information-outline',
        text: 'KPI tooltips added to Savers analytics tiles',
      },
      {
        icon: 'mdi-database-refresh',
        text: 'Demo data updated — PAYDAY tracker, tags, saver goals, and badge colours',
      },
    ],
  },
  {
    date: 'Apr–May 2026',
    heading: 'Dashboard & Tracker Refinements',
    primaryMonth: '2026-05',
    version: '0.0.2',
    color: '#ffe082',
    items: [
      {
        icon: 'mdi-view-dashboard',
        text: 'Dashboard moved to 2-column grid layout — cards grow to fill content, cleaner use of space',
      },
      {
        icon: 'mdi-chart-line',
        text: 'Tracker and upcoming charges UI polished — grouping, spacing, and layout improvements',
      },
      {
        icon: 'mdi-calculator-variant',
        text: 'Spendable calculation refined — improved proration accuracy for monthly, quarterly, and yearly charges',
      },
    ],
  },
  {
    date: 'Apr 2026',
    heading: 'Maybuys',
    primaryMonth: '2026-04',
    version: '0.0.2',
    color: '#f48fb1',
    items: [
      {
        icon: 'mdi-cart-heart',
        text: "Add items you're considering buying — name, price, optional URL and notes",
      },
      {
        icon: 'mdi-timer-outline',
        text: '"Days thinking" timer — nudges you toward an intentional buy or skip decision',
      },
      {
        icon: 'mdi-history',
        text: 'History tab — all decided items with a days-held count',
      },
      {
        icon: 'mdi-piggy-bank-outline',
        text: "Optional Saver link — see how much you've already set aside for an item",
      },
    ],
  },
  {
    date: 'Mar–Apr 2026',
    heading: 'Analytics & Navigation',
    primaryMonth: '2026-04',
    version: '0.0.2',
    color: '#80deea',
    items: [
      {
        icon: 'mdi-calendar-today',
        text: 'Month at a glance — day-by-day spending chart vs. the previous month, key metrics, and narrative summary',
      },
      {
        icon: 'mdi-calendar-blank-multiple',
        text: 'Year at a glance — full-year spending summary added to Analytics',
      },
      {
        icon: 'mdi-drag',
        text: 'Dashboard section drag-and-drop reorder — arrange sections to match how you work',
      },
      {
        icon: 'mdi-navigation-variant',
        text: 'Breadcrumb navigation and analytics sub-page routing',
      },
    ],
  },
  {
    date: 'Feb 2026',
    heading: 'Polish & Tooling',
    primaryMonth: '2026-02',
    version: '0.0.2',
    color: '#a5d6a7',
    items: [
      {
        icon: 'mdi-cellphone',
        text: 'Mobile / portrait layout — overlay sidebar drawer, vertical charts, card-based lists below 768px',
      },
      {
        icon: 'mdi-database',
        text: 'Demo mode — "Try with sample data" at onboarding; no Up Bank token required',
      },
      {
        icon: 'mdi-chart-bar',
        text: 'D3 bar charts — Weekly Insights rebuilt with D3.js for compact, precise axis labels',
      },
      {
        icon: 'mdi-palette',
        text: 'Category bar colours — click any bar in Weekly Insights to set a persistent colour for that category',
      },
      {
        icon: 'mdi-book-open-page-variant',
        text: 'Help page — first-time user guide at /help covering all core features',
      },
      {
        icon: 'mdi-map-marker-path',
        text: 'Dashboard tour — guided walkthrough of every section; re-runnable from Settings',
      },
      {
        icon: 'mdi-shield-check-outline',
        text: 'Quality gates — typecheck, lint, format-check, and npm audit run on every CI build',
      },
    ],
  },
  {
    date: 'Feb 2026',
    heading: 'Foundation',
    primaryMonth: '2026-02',
    version: '0.0.1',
    color: '#ffcc80',
    items: [
      {
        icon: 'mdi-wizard-hat',
        text: 'Onboarding wizard — 6-step flow: passphrase, API token, payday schedule, and initial sync',
      },
      {
        icon: 'mdi-lock',
        text: 'Encryption — API token encrypted with your passphrase (PBKDF2 + AES-GCM); passphrase never stored',
      },
      {
        icon: 'mdi-sync',
        text: 'Up Bank sync — initial and incremental sync with cursor-based pagination',
      },
      {
        icon: 'mdi-view-dashboard',
        text: 'Dashboard — Available, Spendable, Trackers, Weekly Insights, Upcoming charges, and Savers',
      },
      {
        icon: 'mdi-calculator',
        text: 'Spendable balance — Available minus prorated upcoming charges due before your next payday',
      },
      {
        icon: 'mdi-credit-card-multiple',
        text: 'Transactions — full history with date, category, amount, and search filters',
      },
      {
        icon: 'mdi-cog',
        text: 'Settings — theme, re-sync, API token update, and clear all data',
      },
      {
        icon: 'mdi-github',
        text: 'GitHub Pages deployment — CI/CD via GitHub Actions on every push to main',
      },
    ],
  },
]

export const UPCOMING: UpcomingItem[] = [
  {
    icon: 'mdi-auto-fix',
    color: '#80cbc4',
    text: 'Recurring transaction detection — auto-suggest upcoming charges from your transaction history',
  },
  {
    icon: 'mdi-currency-usd',
    color: '#ffe082',
    text: 'Multi-currency display — show foreign amounts alongside AUD equivalents',
  },
  {
    icon: 'mdi-tag-outline',
    color: '#f48fb1',
    text: 'Tags — user-defined transaction labels for finer categorisation',
  },
]
