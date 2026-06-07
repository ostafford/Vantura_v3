export interface ChartColorPickerProps {
  /** Current hex or null for default. */
  value: string | null
  /** Called when user selects a color or resets to default. */
  onChange: (hex: string | null) => void
  /** Whether to show "Use default" reset when a custom color is set. */
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
    <div className="d-flex align-items-center gap-3">
      <input
        type="color"
        value={value ?? '#b66dff'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? 'Pick a color'}
        className="rounded border"
        style={{
          width: 40,
          height: 40,
          padding: 2,
          cursor: 'pointer',
        }}
      />
      {allowReset && value != null ? (
        <button
          type="button"
          className="btn btn-link btn-sm p-0 text-muted"
          onClick={() => onChange(null)}
          aria-label="Use default color"
        >
          Use default
        </button>
      ) : (
        <span className="small text-muted">No custom colour set</span>
      )}
    </div>
  )
}
