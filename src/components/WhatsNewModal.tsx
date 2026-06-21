import { Modal, Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { MILESTONES } from '@/data/changelog'
import {
  APP_VERSION,
  markVersionSeen,
  getLastSeenVersion,
  versionGt,
} from '@/lib/appVersion'

interface WhatsNewModalProps {
  show: boolean
  onClose: () => void
}

export function WhatsNewModal({ show, onClose }: WhatsNewModalProps) {
  const navigate = useNavigate()

  // Only show milestones that shipped after the user's last seen version.
  // getLastSeenVersion() is read here (not at module level) so it reflects
  // the value at the time the modal mounts, before markVersionSeen() is called.
  const lastSeen = getLastSeenVersion()
  const newMilestones = lastSeen
    ? MILESTONES.filter((m) => versionGt(m.version, lastSeen))
    : []

  const handleClose = () => {
    markVersionSeen()
    onClose()
  }

  const handleSeeAll = () => {
    markVersionSeen()
    onClose()
    navigate('/changelog')
  }

  return (
    <Modal show={show} onHide={handleClose} centered scrollable size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2">
          <i
            className="mdi mdi-rocket-launch-outline"
            style={{ color: 'var(--vantura-primary)', fontSize: '1.2rem' }}
            aria-hidden
          />
          <span>What&apos;s new in v{APP_VERSION}</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="whats-new-modal-body">
        {newMilestones.map((milestone) => (
          <div key={milestone.heading} className="whats-new-group">
            <h6
              className="whats-new-group__heading"
              style={{ color: milestone.color }}
            >
              <i
                className="mdi mdi-circle-small"
                style={{ fontSize: '1.2rem', verticalAlign: 'middle' }}
                aria-hidden
              />
              {milestone.heading}
            </h6>
            <ul className="whats-new-list">
              {milestone.items.map((item, i) => (
                <li key={i} className="whats-new-item">
                  <i
                    className={`mdi ${item.icon} whats-new-item__icon`}
                    style={{ color: milestone.color }}
                    aria-hidden
                  />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Modal.Body>

      <Modal.Footer className="justify-content-between">
        <button
          type="button"
          className="btn btn-link btn-sm px-0"
          style={{ color: 'var(--vantura-text-secondary)' }}
          onClick={handleSeeAll}
        >
          Full changelog →
        </button>
        <Button variant="primary" size="sm" onClick={handleClose}>
          Got it
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
