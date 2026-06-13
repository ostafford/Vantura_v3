/**
 * Phase 5: Top-level Error Boundary for unhandled render/effect errors.
 * Shows a friendly message and recovery options; logs error for debugging.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  return new Error('Unknown error')
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error: toError(error) }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error', error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const { message, stack } = this.state.error
      const isDev = import.meta.env.DEV
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 24,
            backgroundColor: 'var(--vantura-background, #13131c)',
            color: 'var(--vantura-text, #e4e4f0)',
          }}
        >
          <h2 className="mb-3">Something went wrong</h2>
          <p className="text-muted mb-3 text-center">
            An unexpected error occurred. You can try reloading the app or going
            back to the dashboard.
          </p>
          <p
            className="small mb-3 text-center text-break px-2"
            style={{ maxWidth: 560 }}
            role="status"
          >
            <strong>Error:</strong> {message}
          </p>
          {isDev && stack ? (
            <pre
              className="small text-muted mb-4 p-3 rounded border text-start overflow-auto"
              style={{
                maxWidth: 'min(720px, 100%)',
                maxHeight: 240,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {stack}
            </pre>
          ) : null}
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.handleReload}
            >
              Reload app
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={this.handleReset}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
