import { PASTEL_SWATCHES } from '@/lib/accentPalettes'

export interface ChartColorPickerProps {
  value: string | null
  onChange: (hex: string | null) => void
  allowReset?: boolean
  'aria-label'?: string
}

export function ChartColorPicker({
  value,
  onChange,
  allowReset = true,
  'aria-label': ariaLabel,
}: ChartColorPickerProps) {
  return (
    <div>
      <div
        className="d-flex flex-wrap gap-2 align-items-center"
        role="group"
        aria-label={ariaLabel ?? 'Pick a colour'}
      >
        {PASTEL_SWATCHES.map(({ hex, label }) => {
          const isSelected = value === hex
          return (
            <button
              key={hex}
              type="button"
              className="border rounded-circle p-0 d-flex align-items-center justify-content-center"
              style={{
                width: 28,
                height: 28,
                background: hex,
                borderWidth: isSelected ? 3 : 1,
                borderColor: isSelected
                  ? 'var(--vantura-text)'
                  : 'var(--vantura-border)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onClick={() => onChange(hex)}
              aria-label={label}
              aria-pressed={isSelected}
              title={label}
            >
              {isSelected && (
                <i
                  className="mdi mdi-check"
                  style={{ fontSize: '0.75rem', color: '#1a1a2e' }}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
        {allowReset && value != null && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-muted"
            onClick={() => onChange(null)}
            aria-label="Use default colour"
          >
            Use default
          </button>
        )}
      </div>
    </div>
  )
}
