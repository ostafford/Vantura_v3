import { useState } from 'react'
import { Form } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { toast } from '@/stores/toastStore'
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
  getNotificationPermission,
  requestNotificationPermission,
  getNotifTypeEnabled,
  setNotifTypeEnabled,
  getLargeTxThresholdCents,
  setLargeTxThresholdCents,
  type NotifType,
} from '@/lib/notifications'

/**
 * `setup` maps each toggle back to the feature that drives it (#22). When `to`
 * is set it renders as a "Set up in: <screen>" link; otherwise `label` is shown
 * verbatim as a plain note for toggles with nothing to configure elsewhere.
 */
const NOTIF_TYPES: {
  key: NotifType
  label: string
  desc: string
  setup: { label: string; to?: string }
}[] = [
  {
    key: 'tracker_overspent',
    label: 'Tracker over budget',
    desc: 'When a tracker exceeds 100% of its budget',
    setup: { label: 'Trackers', to: '/analytics/trackers' },
  },
  {
    key: 'tracker_pace',
    label: 'Tracker pace warning',
    desc: 'When spending is >10% ahead of pace with >20% of the period left',
    setup: { label: 'Trackers', to: '/analytics/trackers' },
  },
  {
    key: 'spendable_low',
    label: 'Spendable balance low',
    desc: 'When spendable drops below your alert threshold',
    setup: {
      label: 'the Spendable card on the Dashboard',
      to: '/?scroll=spendable',
    },
  },
  {
    key: 'payday',
    label: 'Payday landed',
    desc: 'When a salary-sized credit appears on your account',
    setup: { label: 'Payday settings', to: '/settings#payday' },
  },
  {
    key: 'possible_payday',
    label: 'Possible payday detected',
    desc: 'When a recurring credit looks like it might be your salary, before you link a source',
    setup: { label: 'Payday settings', to: '/settings#payday' },
  },
  {
    key: 'large_tx',
    label: 'Large transaction',
    desc: 'Unexpected debits above the threshold you set',
    setup: { label: 'Set the dollar amount below.' },
  },
  {
    key: 'bills',
    label: 'Bill reminders',
    desc: 'Upcoming charges within their reminder window',
    setup: {
      label: 'the Upcoming section on the Dashboard',
      to: '/?scroll=upcoming',
    },
  },
  {
    key: 'saver_milestone',
    label: 'Saver goal milestones',
    desc: 'When a saver reaches 50%, 75%, or 100% of its goal',
    setup: { label: 'Savers', to: '/analytics/savers' },
  },
  {
    key: 'sync_stale',
    label: 'Data out of date',
    desc: "When Vantura hasn't synced in over 24 hours",
    setup: { label: 'No setup needed — tracks your last sync automatically.' },
  },
]

const NOTIF_GROUPS: { label: string; icon: string; keys: NotifType[] }[] = [
  {
    label: 'Spending alerts',
    icon: 'mdi-alert-circle-outline',
    keys: [
      'tracker_overspent',
      'tracker_pace',
      'spendable_low',
      'payday',
      'possible_payday',
      'large_tx',
    ],
  },
  {
    label: 'Reminders & system',
    icon: 'mdi-bell-ring-outline',
    keys: ['bills', 'saver_milestone', 'sync_stale'],
  },
]

export function NotificationsSection() {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() =>
    getNotificationsEnabled()
  )
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission | null>(() => getNotificationPermission())
  const [notifTypes, setNotifTypes] = useState<Record<NotifType, boolean>>(
    () =>
      Object.fromEntries(
        [
          'bills',
          'tracker_overspent',
          'tracker_pace',
          'spendable_low',
          'payday',
          'possible_payday',
          'large_tx',
          'saver_milestone',
          'sync_stale',
        ].map((k) => [k, getNotifTypeEnabled(k as NotifType)])
      ) as Record<NotifType, boolean>
  )
  const [largeTxThreshold, setLargeTxThresholdState] = useState(() =>
    String(Math.round(getLargeTxThresholdCents() / 100))
  )

  return (
    <>
      <p className="small text-muted mb-3">
        Get OS notifications when Vantura detects something that needs your
        attention. Notifications also appear in the bell icon at the top of the
        screen so you can review them any time. Requires browser permission.
      </p>

      {/* Browser permission denied warning */}
      {notificationsEnabled && notifPermission === 'denied' && (
        <div
          className="d-flex align-items-start gap-2 p-2 rounded mb-3 small"
          style={{
            background: 'rgba(220,53,69,0.10)',
            border: '1px solid rgba(220,53,69,0.28)',
          }}
          role="alert"
        >
          <i
            className="mdi mdi-alert-circle-outline flex-shrink-0 mt-1"
            style={{
              color: 'var(--bs-danger)',
              fontSize: '1rem',
            }}
            aria-hidden
          />
          <span>
            Browser permission is <strong>denied</strong>. Enable notifications
            in your browser settings, then reload the page.
          </span>
        </div>
      )}

      {/* Master toggle */}
      <Form.Check
        type="switch"
        id="settings-notifications-master"
        label="Enable notifications"
        className="mb-4"
        checked={notificationsEnabled}
        onChange={async (e) => {
          const next = e.target.checked
          if (next) {
            const perm = getNotificationPermission()
            if (perm !== 'granted') {
              const granted = await requestNotificationPermission()
              setNotifPermission(getNotificationPermission())
              if (!granted) {
                toast.error(
                  'Notification permission denied. Enable in browser settings.'
                )
                return
              }
            }
          }
          setNotificationsEnabled(next)
          setNotificationsEnabledState(next)
          toast.success(
            next ? 'Notifications enabled.' : 'Notifications disabled.'
          )
        }}
      />

      {/* Per-type toggles — only shown when master is on */}
      {notificationsEnabled && (
        <div
          style={{
            borderLeft: '2px solid var(--vantura-border)',
            paddingLeft: '1rem',
          }}
        >
          {NOTIF_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p
                className="text-muted mb-3"
                style={{
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <i className={`mdi ${group.icon} me-1`} aria-hidden />
                {group.label}
              </p>
              {group.keys.map((k) => {
                const notifType = NOTIF_TYPES.find((t) => t.key === k)!
                return (
                  <div key={k} className="mb-3">
                    <Form.Check
                      type="switch"
                      id={`settings-notif-${k}`}
                      label={notifType.label}
                      checked={notifTypes[k]}
                      onChange={(e) => {
                        const next = e.target.checked
                        setNotifTypeEnabled(k, next)
                        setNotifTypes((prev) => ({
                          ...prev,
                          [k]: next,
                        }))
                      }}
                    />
                    <div
                      className="small text-muted"
                      style={{ marginTop: 2, marginLeft: 48 }}
                    >
                      {notifType.desc}
                    </div>
                    <div
                      className="small text-muted"
                      style={{ marginTop: 2, marginLeft: 48 }}
                    >
                      {notifType.setup.to ? (
                        <>
                          Set up in:{' '}
                          <Link
                            to={notifType.setup.to}
                            className="text-decoration-none"
                          >
                            {notifType.setup.label}
                            <i
                              className="mdi mdi-chevron-right"
                              style={{ fontSize: '0.9rem', verticalAlign: -2 }}
                              aria-hidden
                            />
                          </Link>
                        </>
                      ) : (
                        notifType.setup.label
                      )}
                    </div>
                    {k === 'large_tx' && notifTypes['large_tx'] && (
                      <Form.Group
                        className="mt-2"
                        style={{
                          marginLeft: 48,
                          maxWidth: 200,
                        }}
                      >
                        <Form.Label
                          htmlFor="settings-large-tx-threshold"
                          className="small text-muted mb-1"
                        >
                          Notify me when a single debit exceeds ($)
                        </Form.Label>
                        <Form.Control
                          id="settings-large-tx-threshold"
                          type="number"
                          min={1}
                          size="sm"
                          value={largeTxThreshold}
                          onChange={(e) =>
                            setLargeTxThresholdState(e.target.value)
                          }
                          onBlur={() => {
                            const dollars = parseInt(largeTxThreshold, 10)
                            if (!Number.isNaN(dollars) && dollars > 0) {
                              setLargeTxThresholdCents(dollars * 100)
                              toast.success(
                                `Large transaction threshold set to $${dollars}.`
                              )
                            } else {
                              setLargeTxThresholdState(
                                String(
                                  Math.round(getLargeTxThresholdCents() / 100)
                                )
                              )
                            }
                          }}
                        />
                      </Form.Group>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
