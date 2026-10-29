import type { BookFormat, Flow, FontFamily, ReaderSettings, Theme } from '../lib/db'
import { THEME_COLORS } from './epubStyles'

interface Props {
  settings: ReaderSettings
  format: BookFormat
  onChange: (settings: ReaderSettings) => void
  onClose: () => void
}

const FONT_SIZE = { min: 70, max: 200, step: 10 }
const FONTS: { value: FontFamily; label: string; style: string }[] = [
  { value: 'original', label: 'Original', style: 'inherit' },
  { value: 'serif', label: 'Serif', style: 'var(--font-serif)' },
  { value: 'sans', label: 'Sans', style: 'system-ui, sans-serif' },
]
const LINE_HEIGHTS = [
  { value: 1.3, label: 'Tight' },
  { value: 1.5, label: 'Normal' },
  { value: 1.8, label: 'Loose' },
]
const MARGINS = [
  { value: 3, label: 'Narrow' },
  { value: 6, label: 'Normal' },
  { value: 10, label: 'Wide' },
]
const FLOWS: { value: Flow; label: string }[] = [
  { value: 'paginated', label: 'Pages' },
  { value: 'scrolled', label: 'Scroll' },
]
const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'White' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'dark', label: 'Dark' },
]

export default function SettingsPanel({ settings, format, onChange, onClose }: Props) {
  const set = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => onChange({ ...settings, [key]: value })
  const isPdf = format === 'pdf'

  return (
    <>
      <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close settings" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Reading settings"
        className="fixed top-[calc(3.5rem+env(safe-area-inset-top))] right-2 z-40 w-[min(20rem,calc(100vw-1rem))] space-y-4 rounded-xl border border-[var(--reader-border)] bg-[var(--reader-panel)] p-4 shadow-xl"
      >
        <Row label="Theme">
          {THEMES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => set('theme', t.value)}
              aria-pressed={settings.theme === t.value}
              className={`flex-1 rounded-lg border-2 py-2 text-sm ${settings.theme === t.value ? 'border-[var(--reader-accent)]' : 'border-[var(--reader-border)]'}`}
              style={{ background: THEME_COLORS[t.value].bg, color: THEME_COLORS[t.value].fg }}
            >
              {t.label}
            </button>
          ))}
        </Row>

        <Row label="Layout">
          {FLOWS.map(f => (
            <Choice key={f.value} active={settings.flow === f.value} onClick={() => set('flow', f.value)}>{f.label}</Choice>
          ))}
        </Row>

        {isPdf ? (
          <p className="text-xs text-[var(--reader-muted)]">
            PDFs keep their original layout, so text size and fonts can’t be changed. Use the zoom buttons in the toolbar instead.
          </p>
        ) : (
          <>
            <Row label="Text size">
              <button type="button" className={stepButton} aria-label="Smaller text" disabled={settings.fontSize <= FONT_SIZE.min}
                onClick={() => set('fontSize', settings.fontSize - FONT_SIZE.step)}>
                <span className="text-sm">A</span>
              </button>
              <span className="w-14 text-center text-sm tabular-nums" aria-live="polite">{settings.fontSize}%</span>
              <button type="button" className={stepButton} aria-label="Larger text" disabled={settings.fontSize >= FONT_SIZE.max}
                onClick={() => set('fontSize', settings.fontSize + FONT_SIZE.step)}>
                <span className="text-xl">A</span>
              </button>
            </Row>
            <Row label="Font">
              {FONTS.map(f => (
                <Choice key={f.value} active={settings.fontFamily === f.value} onClick={() => set('fontFamily', f.value)} style={{ fontFamily: f.style }}>
                  {f.label}
                </Choice>
              ))}
            </Row>
            <Row label="Line spacing">
              {LINE_HEIGHTS.map(l => (
                <Choice key={l.value} active={settings.lineHeight === l.value} onClick={() => set('lineHeight', l.value)}>{l.label}</Choice>
              ))}
            </Row>
            <Row label="Margins">
              {MARGINS.map(m => (
                <Choice key={m.value} active={settings.margin === m.value} onClick={() => set('margin', m.value)}>{m.label}</Choice>
              ))}
            </Row>
          </>
        )}
      </div>
    </>
  )
}

const stepButton = 'flex h-9 flex-1 items-center justify-center rounded-lg border border-[var(--reader-border)] hover:bg-[var(--reader-border)] disabled:opacity-40'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-[var(--reader-muted)] uppercase">{label}</p>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  )
}

function Choice({ active, onClick, children, style }: { active: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={style}
      className={`flex-1 rounded-lg border py-1.5 text-sm ${active ? 'border-[var(--reader-accent)] bg-[var(--reader-bg)] font-medium text-[var(--reader-accent)]' : 'border-[var(--reader-border)] hover:bg-[var(--reader-border)]'}`}
    >
      {children}
    </button>
  )
}
