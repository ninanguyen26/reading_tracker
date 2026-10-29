import { useEffect, useRef, useState } from 'react'
import type { Highlight, HighlightColor } from '../lib/db'
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_KEYS } from './highlightColors'
import { CloseIcon, TrashIcon } from '../components/icons'

interface Props {
  highlight: Highlight
  focusNote: boolean
  onColor: (color: HighlightColor) => void
  onSaveNote: (note: string) => void
  onDelete: () => void
  onClose: () => void
}

/** Edit one highlight: change its color, write a note, or delete it. */
export default function HighlightSheet({ highlight, focusNote, onColor, onSaveNote, onDelete, onClose }: Props) {
  const [note, setNote] = useState(highlight.note)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNote(highlight.note)
    setConfirmDelete(false)
  }, [highlight.id, highlight.note])

  useEffect(() => {
    if (focusNote) textareaRef.current?.focus()
  }, [focusNote, highlight.id])

  const dirty = note.trim() !== highlight.note.trim()
  const close = () => {
    if (dirty) onSaveNote(note.trim())
    onClose()
  }

  return (
    <section
      role="dialog"
      aria-label="Highlight"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-[var(--reader-border)] bg-[var(--reader-panel)] px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
      onKeyDown={e => e.key === 'Escape' && (e.stopPropagation(), close())}
    >
      <div className="mb-3 flex items-start gap-3">
        <blockquote
          className="line-clamp-4 flex-1 border-l-4 pl-3 font-serif text-[15px] leading-snug"
          style={{ borderColor: HIGHLIGHT_COLORS[highlight.color].fill }}
        >
          {highlight.text}
        </blockquote>
        <button type="button" onClick={close} className="rounded-lg p-2 hover:bg-[var(--reader-border)]" aria-label="Close highlight">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2" role="radiogroup" aria-label="Highlight color">
        {HIGHLIGHT_COLOR_KEYS.map(color => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={highlight.color === color}
            aria-label={HIGHLIGHT_COLORS[color].label}
            onClick={() => onColor(color)}
            className={`size-8 rounded-full ring-offset-2 ring-offset-[var(--reader-panel)] ${highlight.color === color ? 'ring-2 ring-[var(--reader-fg)]' : 'ring-1 ring-black/10'}`}
            style={{ background: HIGHLIGHT_COLORS[color].fill }}
          />
        ))}
      </div>

      <label className="block">
        <span className="sr-only">Note</span>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => dirty && onSaveNote(note.trim())}
          rows={3}
          placeholder="Add a note…"
          className="w-full resize-y rounded-lg border border-[var(--reader-border)] bg-[var(--reader-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--reader-accent)]"
        />
      </label>

      <div className="mt-3 flex items-center justify-between gap-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-sm">
            <span>Delete this highlight{highlight.note ? ' and its note' : ''}?</span>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded px-2 py-1 hover:bg-[var(--reader-border)]">Cancel</button>
            <button type="button" onClick={onDelete} className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700">Delete</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-[var(--reader-border)] dark:text-red-400">
            <TrashIcon size={16} /> Delete
          </button>
        )}
        <button type="button" onClick={close}
          className="rounded-lg bg-[var(--reader-fg)] px-4 py-1.5 text-sm font-medium text-[var(--reader-bg)]">
          {dirty ? 'Save' : 'Done'}
        </button>
      </div>
    </section>
  )
}
