// PROTOTYPE — throwaway floating variant switcher. Never shipped (DEV-only).
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

interface Toggle {
  param: string
  options: { value: string; label: string }[]
}

interface Props {
  variants: { key: string; name: string }[]
  toggles?: Toggle[]
}

export function PrototypeSwitcher({ variants, toggles = [] }: Props) {
  const [params, setParams] = useSearchParams()
  const current = params.get('variant') ?? variants[0].key
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  )

  function set(param: string, value: string) {
    setParams(
      (prev) => {
        prev.set(param, value)
        return prev
      },
      { replace: true }
    )
  }
  function step(d: number) {
    set('variant', variants[(idx + d + variants.length) % variants.length].key)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!import.meta.env.DEV) return null

  const pill: React.CSSProperties = {
    background: 'none',
    border: 0,
    color: '#fff',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 14,
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        background: '#111',
        color: '#fff',
        borderRadius: 999,
        boxShadow: '0 6px 24px rgba(0,0,0,.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13,
        maxWidth: 'calc(100vw - 24px)',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      <button style={pill} onClick={() => step(-1)} aria-label="Previous">
        ←
      </button>
      <span style={{ padding: '0 6px', whiteSpace: 'nowrap' }}>
        {variants[idx].key} ({variants[idx].name})
      </span>
      <button style={pill} onClick={() => step(1)} aria-label="Next">
        →
      </button>
      {toggles.map((t) => (
        <span
          key={t.param}
          style={{
            display: 'flex',
            gap: 2,
            marginLeft: 6,
            paddingLeft: 8,
            borderLeft: '1px solid #444',
          }}
        >
          {t.options.map((o) => {
            const active =
              (params.get(t.param) ?? t.options[0].value) === o.value
            return (
              <button
                key={o.value}
                style={{
                  ...pill,
                  fontSize: 12,
                  borderRadius: 999,
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#111' : '#bbb',
                }}
                onClick={() => set(t.param, o.value)}
              >
                {o.label}
              </button>
            )
          })}
        </span>
      ))}
    </div>
  )
}
