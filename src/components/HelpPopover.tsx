import { useState } from 'react'
import type React from 'react'
import { OverlayTrigger, Popover, Button } from 'react-bootstrap'

export interface HelpPopoverProps {
  id: string
  title: string
  content: React.ReactNode
  ariaLabel?: string
  /** Overrides Bootstrap's default ~276px popover width — use for content
   * that needs more room, e.g. a numbered step list. */
  maxWidth?: number
}

export function HelpPopover({
  id,
  title,
  content,
  ariaLabel = 'Help',
  maxWidth,
}: HelpPopoverProps) {
  const [show, setShow] = useState(false)

  const popover = (
    <Popover id={id} style={maxWidth ? { maxWidth } : undefined}>
      <Popover.Header as="h3">{title}</Popover.Header>
      <Popover.Body>{content}</Popover.Body>
    </Popover>
  )

  return (
    <OverlayTrigger
      trigger="click"
      placement="bottom"
      overlay={popover}
      show={show}
      onToggle={(next) => setShow(next ?? false)}
      rootClose
    >
      <Button
        variant="link"
        size="sm"
        className="p-0 ms-1 text-muted"
        aria-label={ariaLabel}
        onClick={() => setShow(!show)}
      >
        <i
          className="mdi mdi-information-outline"
          style={{ fontSize: '1.1rem' }}
          aria-hidden
        />
      </Button>
    </OverlayTrigger>
  )
}
