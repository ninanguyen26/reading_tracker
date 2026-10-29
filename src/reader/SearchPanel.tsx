import { useEffect, useRef } from 'react'
import type { SearchMatch, SearchState } from './types'
import { CloseIcon, SearchIcon } from '../components/icons'

interface Props {
  draft: string
  onDraft: (text: string) => void
  search: SearchState
  onSearch: (query: string) => void
  onClear: () => void
  onSelect: (match: SearchMatch) => void
  onClose: () => void
}

export default function SearchPanel({ draft, onDraft, search, onSearch, onClear, onSelect, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const count = search.groups.reduce((n, g) => n + g.matches.length, 0)

  return (
    <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal="true" aria-label="Search this book">
      <aside className="flex h-full w-full flex-col border-r border-[var(--reader-border)] bg-[var(--reader-panel)] pt-[env(safe-area-inset-top)] shadow-xl sm:w-[26rem]">
        <form
          role="search"
          className="flex items-center gap-2 border-b border-[var(--reader-border)] p-2"
          onSubmit={e => {
            e.preventDefault()
            if (draft.trim()) onSearch(draft.trim())
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Search this book</span>
            <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--reader-muted)]" />
            <input
              ref={inputRef}
              type="search"
              value={draft}
              onChange={e => onDraft(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && (e.stopPropagation(), onClose())}
              placeholder="Search this book"
              enterKeyHint="search"
              className="w-full rounded-lg border border-[var(--reader-border)] bg-[var(--reader-bg)] py-2 pr-3 pl-8 text-sm outline-none focus:border-[var(--reader-accent)]"
            />
          </label>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--reader-border)]" aria-label="Close search">
            <CloseIcon size={18} />
          </button>
        </form>

        {search.status !== 'idle' && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-[var(--reader-muted)]" aria-live="polite">
            <span>
              {search.status === 'searching'
                ? `Searching… ${count ? `${count} found so far` : ''}`
                : count === 1 ? '1 result' : `${count} results`}
              {' for “'}{search.query}{'”'}
            </span>
            <button type="button" onClick={onClear} className="underline">Clear</button>
          </div>
        )}
        {search.status === 'searching' && (
          <div className="mx-4 h-0.5 overflow-hidden rounded bg-[var(--reader-border)]">
            <div className="h-full bg-[var(--reader-accent)] transition-[width]" style={{ width: `${Math.round(search.progress * 100)}%` }} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-[env(safe-area-inset-bottom)]">
          {search.status === 'done' && count === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--reader-muted)]">No matches for “{search.query}”.</p>
          )}
          {search.groups.map((group, i) => (
            <section key={`${group.label}-${i}`} className="mb-2">
              <h3 className="sticky top-0 bg-[var(--reader-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--reader-muted)]">{group.label}</h3>
              <ul>
                {group.matches.map((m, j) => (
                  <li key={j}>
                    <button
                      type="button"
                      onClick={() => onSelect(m)}
                      className="w-full rounded-lg px-3 py-2 text-left font-serif text-sm leading-snug hover:bg-[var(--reader-border)]"
                    >
                      {m.excerpt.pre}
                      <mark className="rounded-sm bg-[rgb(250_204_21/0.45)] px-0.5 text-inherit">{m.excerpt.match}</mark>
                      {m.excerpt.post}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
      <button type="button" className="hidden flex-1 bg-black/30 sm:block" aria-label="Close search panel" onClick={onClose} />
    </div>
  )
}
