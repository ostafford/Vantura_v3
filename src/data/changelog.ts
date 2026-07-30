export interface MilestoneItem {
  icon: string
  text: string
}

export interface Milestone {
  date: string
  heading: string
  icon: string
  primaryMonth: string
  color: string
  version: string // app version this milestone shipped in
  items: MilestoneItem[]
}

export interface UpcomingItem {
  icon: string
  color: string
  name: string
  tagline: string
  verdict: 'New' | 'Extension' | 'Revival' | 'Partial'
  detail: string
}

export const MILESTONES: Milestone[] = [
  {
    date: '30 Jul 2026',
    heading: 'Stability & Accuracy Audit',
    icon: 'mdi-shield-check-outline',
    primaryMonth: '2026-07',
    version: '0.8.1',
    color: '#80cbc4',
    items: [
      {
        icon: 'mdi-sync-alert',
        text: 'Sync reliability — fixed a bug where syncing could hang the app for certain PAYDAY tracker setups.',
      },
      {
        icon: 'mdi-calendar-alert-outline',
        text: "Payday date accuracy — corrected a calculation bug for 'last weekday of the month' payday schedules landing on the 29th–31st.",
      },
      {
        icon: 'mdi-bell-alert-outline',
        text: "Notification accuracy — large-transaction alerts, saver milestone alerts, and bill reminders now fire correctly and don't mix up similarly-named bills.",
      },
      {
        icon: 'mdi-chart-timeline-variant',
        text: 'Net Worth corrected — home loan accounts now display as a liability instead of an asset, and negative amounts render correctly everywhere.',
      },
      {
        icon: 'mdi-calendar-range-outline',
        text: 'Date filters fixed — Transactions and Analytics date ranges now use your local timezone instead of shifting by UTC offset.',
      },
      {
        icon: 'mdi-fingerprint',
        text: 'Biometric unlock hardened — fixed cases where enabling Touch ID / Face ID silently failed to activate, and all cached biometric credentials now clear properly when you delete your data.',
      },
      {
        icon: 'mdi-wallet-outline',
        text: "Removed the unfinished 'pin transaction to bucket' option in Budget Plan — it wasn't actually connected to anything.",
      },
    ],
  },
  {
    date: '27 Jun 2026',
    heading: 'Light Mode & Colour System',
    icon: 'mdi-palette-outline',
    primaryMonth: '2026-06',
    version: '0.8.0',
    color: '#f48fb1',
    items: [
      {
        icon: 'mdi-white-balance-sunny',
        text: 'Light / Dark / System theme — choose between light mode, dark mode, or let your device switch automatically. System mode follows your OS in real time — dark at night to reduce eye strain, light during the day.',
      },
      {
        icon: 'mdi-palette-swatch-outline',
        text: 'Vibrant colour palette — all 6 accent swatches updated to richer Material Design 300-level values. Every colour now pops consistently across charts, badges, and trackers.',
      },
      {
        icon: 'mdi-water-outline',
        text: 'Sky locked as the single app accent — one consistent #90caf9 Sky blue across every button, icon, and highlight. Nothing looks out of place depending on which colour you had selected.',
      },
      {
        icon: 'mdi-view-grid-outline',
        text: 'Page icons unified — all 19 section header icons now share one solid Sky style. Previously 17 were overriding individually with a dark navy gradient, causing visible inconsistency between pages.',
      },
      {
        icon: 'mdi-text-recognition',
        text: 'Logo simplified — the Vantura cipher monogram and wordmark now use a single solid Sky colour in both light and dark mode, with no gradient and no store dependency.',
      },
    ],
  },
  {
    date: '27 Jun 2026',
    heading: 'Spendable Fix',
    icon: 'mdi-calculator-variant-outline',
    primaryMonth: '2026-06',
    version: '0.7.1',
    color: '#80cbc4',
    items: [
      {
        icon: 'mdi-check-circle-outline',
        text: "Spendable formula corrected — Up Bank's balance already nets out held/pending transactions, so Vantura no longer double-deducts them. Spendable now matches Up Bank exactly.",
      },
      {
        icon: 'mdi-information-outline',
        text: 'Tooltip redesign — Available and Spendable cards now show structured, tap-friendly tooltips with bullet-point breakdowns and a post-payday projection.',
      },
      {
        icon: 'mdi-test-tube',
        text: 'Calculation coverage expanded — 8 new unit tests for the reserved breakdown function; shared core logic extracted to eliminate duplicate calculation paths.',
      },
    ],
  },
  {
    date: '27 Jun 2026',
    heading: 'Net Worth',
    icon: 'mdi-chart-timeline-variant',
    primaryMonth: '2026-06',
    version: '0.7.0',
    color: '#a5d6a7',
    items: [
      {
        icon: 'mdi-card-account-details-outline',
        text: 'Net Worth dashboard card — total assets minus liabilities at a glance, with a delta arrow versus the previous snapshot and a stale-account warning',
      },
      {
        icon: 'mdi-scale-balance',
        text: 'Analytics → Net Worth page — full breakdown of Up Bank balances alongside manually entered external accounts, with live and manual sections clearly separated',
      },
      {
        icon: 'mdi-bank-plus',
        text: '10 external account types — Credit Card, Mortgage, Personal/Car Loan, HECS/HELP, Superannuation, Investment Portfolio, Property, Savings (other bank), and more — each with optional interest rate and notes fields',
      },
      {
        icon: 'mdi-clock-alert-outline',
        text: 'Stale balance warnings — per-type freshness thresholds (Credit Card: 7 days, Loans/Super/Investments: 30–90 days, Property: 1 year) flag accounts that may need a balance update',
      },
      {
        icon: 'mdi-swap-horizontal',
        text: 'Liability repayment charge type — credit card payments in Upcoming charges can be marked as repayments so they are excluded from projected net worth (transferring money between asset and liability is not an expense)',
      },
      {
        icon: 'mdi-chart-line',
        text: '12-month trend chart — a daily snapshot is written on every sync, building a historical net worth curve over time',
      },
    ],
  },
  {
    date: '25 Jun 2026',
    heading: 'Settings Redesign',
    icon: 'mdi-cog-outline',
    primaryMonth: '2026-06',
    version: '0.6.1',
    color: '#90caf9',
    items: [
      {
        icon: 'mdi-dock-bottom',
        text: "Help and What's New consolidated into Settings → About — the sidebar footer is now just Settings and Lock, keeping navigation focused",
      },
      {
        icon: 'mdi-view-list-outline',
        text: 'Settings section nav now has icons — each section is instantly recognisable at a glance without reading the label',
      },
      {
        icon: 'mdi-bell-ring-outline',
        text: 'Notification types now grouped into Spending alerts and Reminders & system — easier to find and configure the alerts you care about',
      },
      {
        icon: 'mdi-bell-cancel-outline',
        text: 'Browser permission status shown in Notifications — a clear warning appears when notification permission is blocked at the OS level',
      },
      {
        icon: 'mdi-alert-outline',
        text: 'Danger zone card in Data settings separates the destructive Clear all data action from safe data operations like export and import',
      },
      {
        icon: 'mdi-calendar-check-outline',
        text: 'Next payday field now validates that the date is not in the past — prevents a misconfigured payday from silently breaking Spendable',
      },
    ],
  },
  {
    date: '24 Jun 2026',
    heading: 'Changelog & Roadmap Redesign',
    icon: 'mdi-telescope',
    primaryMonth: '2026-06',
    version: '0.6.0',
    color: '#ce93d8',
    items: [
      {
        icon: 'mdi-lightbulb-on-outline',
        text: 'Exploring Next expanded to 11 upcoming features — each with a verdict badge (Extension, Revival, Partial, New) and an expandable explanation so you know exactly what is being considered and why',
      },
      {
        icon: 'mdi-layers-outline',
        text: 'Features grouped by type — Extensions, Revivals, Partially there, and Brand new — so you can see what is close to done vs. net new at a glance',
      },
      {
        icon: 'mdi-chevron-down-circle-outline',
        text: 'Groups and release history cards now collapse — the page starts compact on every visit and you expand only what you want to read',
      },
      {
        icon: 'mdi-tag-outline',
        text: 'Every milestone in the release history now has a themed icon — making the timeline scannable without opening a single card',
      },
    ],
  },
  {
    date: '24 Jun 2026',
    heading: 'Navigation Refinements',
    icon: 'mdi-compass-outline',
    primaryMonth: '2026-06',
    version: '0.5.6',
    color: '#ffcc80',
    items: [
      {
        icon: 'mdi-view-list-outline',
        text: 'Sidebar icons now sit on the left alongside their labels — consistent with every other navigation pattern and much easier to scan at a glance',
      },
      {
        icon: 'mdi-dock-bottom',
        text: "Settings, Help, and What's new moved to the bottom of the sidebar — primary destinations up top, utility links at the foot where they belong",
      },
      {
        icon: 'mdi-chevron-left-box-outline',
        text: 'The Vantura logo is now a pure brand mark — a dedicated ‹ › button handles sidebar collapse so the two roles are no longer conflated',
      },
      {
        icon: 'mdi-filter-remove-outline',
        text: 'Page headers cleaned up — breadcrumbs removed from top-level pages where they implied a hierarchy that does not exist',
      },
    ],
  },
  {
    date: '23 Jun 2026',
    heading: 'Now Live at myvantura.xyz',
    icon: 'mdi-earth',
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
    icon: 'mdi-shield-bug-outline',
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
    icon: 'mdi-swap-horizontal',
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
    icon: 'mdi-server-network',
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
    icon: 'mdi-update',
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
        text: 'New "Check for updates" button in Settings → About lets you manually check at any time',
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
    icon: 'mdi-flag-outline',
    primaryMonth: '2026-06',
    version: '0.5.0',
    color: '#ffe082',
    items: [
      {
        icon: 'mdi-information-outline',
        text: "App version now visible in Settings → About and on the What's new page — always know what you're running",
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
    icon: 'mdi-bell-ring-outline',
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
    icon: 'mdi-lock-outline',
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
    icon: 'mdi-book-open-outline',
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
    icon: 'mdi-cellphone-arrow-down',
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
    icon: 'mdi-shield-lock-outline',
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
    icon: 'mdi-wallet-outline',
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
    icon: 'mdi-chart-box-outline',
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
    icon: 'mdi-view-dashboard-outline',
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
    icon: 'mdi-cart-heart',
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
    icon: 'mdi-chart-timeline-variant',
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
    icon: 'mdi-wrench-outline',
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
    icon: 'mdi-cube-outline',
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
    icon: 'mdi-tag-multiple-outline',
    color: '#80cbc4',
    name: 'Smart Categorisation',
    tagline:
      'Auto-apply your past category corrections to future matching transactions',
    verdict: 'Extension',
    detail:
      'When you manually re-categorise a transaction, Vantura will remember that merchant and apply the same correction automatically to future matching transactions. Built on top of the existing override infrastructure — fully local, no cloud needed.',
  },
  {
    icon: 'mdi-pencil-outline',
    color: '#ffe082',
    name: 'Merchant Nicknames',
    tagline:
      "Give readable names to raw processor strings like 'AMZN MKTP AU*AB1234'",
    verdict: 'New',
    detail:
      'Up Bank returns raw payment processor names that can be cryptic. Set a display name once per merchant and Vantura will show the clean name everywhere — in your transaction feed, trackers, analytics charts, and budget view.',
  },
  {
    icon: 'mdi-call-split',
    color: '#f48fb1',
    name: 'Split Transactions',
    tagline: 'Divide a single charge across multiple trackers or categories',
    verdict: 'New',
    detail:
      "Sometimes one purchase serves multiple purposes — a Kmart run that's half groceries, half a gift. Split lets you allocate portions of a transaction to different trackers or categories while keeping the original transaction intact.",
  },
  {
    icon: 'mdi-file-export-outline',
    color: '#a5d6a7',
    name: 'Tax Report Export',
    tagline:
      'Tag transactions as tax deductible and export a clean summary at tax time',
    verdict: 'New',
    detail:
      'Mark work-related transactions as deductible — tools, subscriptions, travel, home office — then export a clean CSV with merchant, date, amount, and category. Especially useful for freelancers and anyone with work expenses.',
  },
  {
    icon: 'mdi-bank-outline',
    color: '#ffab91',
    name: 'Debt Tracker',
    tagline:
      'Track loan or credit card payoff with a progress bar and projected payoff date',
    verdict: 'Extension',
    detail:
      'Up Bank HOME_LOAN accounts already appear in the Net Worth page as a liability line item. A dedicated Debt Tracker section (similar to Savers) would go further — payoff progress bar, minimum repayment tracking, projected payoff date, and a tool to model how extra repayments change the timeline.',
  },
  {
    icon: 'mdi-piggy-bank-outline',
    color: '#90caf9',
    name: 'Custom Savings Goals',
    tagline:
      'Virtual goals with a target amount and date, independent of your Up Savers',
    verdict: 'Partial',
    detail:
      "Up Bank Savers already support target amounts and goal dates in Vantura. This extends the idea to virtual goals not tied to a real account — 'save $3,000 for a holiday by December'. Vantura calculates how much to set aside each pay cycle and tracks your progress.",
  },
  {
    icon: 'mdi-calendar-outline',
    color: '#80cbc4',
    name: 'Bill Calendar',
    tagline:
      'A timeline view of your upcoming charges — week by week, not just a flat list',
    verdict: 'Extension',
    detail:
      "All the data already exists — upcoming charges have a date and frequency. The Dashboard groups them as before next payday and later, but a proper calendar or timeline view would show exactly what's hitting your account this week, next week, and beyond at a glance.",
  },
  {
    icon: 'mdi-download-outline',
    color: '#ffe082',
    name: 'Data Export',
    tagline: 'Download your transaction history as a readable CSV or JSON file',
    verdict: 'Extension',
    detail:
      "A profile backup already exists but it's an encrypted blob — not something you'd open in a spreadsheet. This adds a plain CSV export of your transaction history with categories, notes, and tags. Useful for your own records or importing into another tool.",
  },
  {
    icon: 'mdi-view-grid-outline',
    color: '#ce93d8',
    name: 'Home Screen Widgets',
    tagline:
      'A glanceable spend summary on your home screen without opening the app',
    verdict: 'New',
    detail:
      'Since Vantura is a PWA, a home screen widget could show your current pay cycle spend vs budget at a glance. Functionality is platform-constrained — Android PWAs support richer widget surfaces than iOS — but worth exploring as capabilities improve.',
  },
  {
    icon: 'mdi-account-multiple-outline',
    color: '#90caf9',
    name: 'Joint Account Support',
    tagline:
      'See your 2Up joint account transactions alongside your personal accounts',
    verdict: 'Partial',
    detail:
      'Up Bank supports joint accounts (2Up) and the ownership type field already distinguishes personal from joint. If your API token has access to a 2Up account, those transactions may already be syncing — the main addition is clearer labelling and filtering by account ownership throughout the UI.',
  },
]
