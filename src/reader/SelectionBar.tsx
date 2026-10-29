import type { HighlightColor } from '../lib/db'
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_KEYS } from './highlightColors'
import { CopyIcon, NoteIcon, SearchIcon } from '../components/icons'

interface Props {
  canDefine: boolean
  onHighlight: (color: HighlightColor) => void
  onNote: () => void
  onDefine: () => void
  onCopy: () => void
}

/** Actions for selected text, shown above the footer like Kindle's selection menu. */
export default function SelectionBar({ canDefine, onHighlight, onNote, onDefine, onCopy }: Props) {
  // Keep the text selected while pressing a button (matters for PDFs, which share this document).
  const keepSelection = (e: React.MouseEvent) => e.preventDefault()
  const action = 'flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] hover:bg-[var(--reader-border)]'

  return (
    <div
      role="toolbar"
      aria-label="Selected text"
      onMouseDown={keepSelection}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-panel)] p-1.5 shadow-xl"
    >
      <div className="flex items-center gap-1.5 px-1.5">
        {HIGHLIGHT_COLOR_KEYS.map(color => (
          <button
            key={color}
            type="button"
            onClick={() => onHighlight(color)}
            aria-label={`Highlight ${HIGHLIGHT_COLORS[color].label.toLowerCase()}`}
            className="size-7 rounded-full ring-1 ring-black/10 transition hover:scale-110"
            style={{ background: HIGHLIGHT_COLORS[color].fill }}
          />
        ))}
      </div>
      <span className="mx-0.5 h-8 w-px bg-[var(--reader-border)]" />
      <button type="button" className={action} onClick={onNote}><NoteIcon size={18} />Note</button>
      {canDefine && <button type="button" className={action} onClick={onDefine}><SearchIcon size={18} />Define</button>}
      <button type="button" className={action} onClick={onCopy}><CopyIcon size={18} />Copy</button>
    </div>
  )
}
