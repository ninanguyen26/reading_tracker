import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Book, type Highlight, type HighlightColor } from '../lib/db'
import { buildAllNotesMarkdown, downloadMarkdown } from '../lib/exportNotes'
import { filterHighlights, groupByBook } from '../lib/notesFilter'
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_KEYS } from '../reader/highlightColors'
import BookCover from '../components/BookCover'
import { BackIcon, DownloadIcon, SearchIcon } from '../components/icons'

/** Every highlight and note from every book, in one place. */
export default function NotesPage() {
  const books = useLiveQuery(() => db.books.toArray())
  const highlights = useLiveQuery(() => db.highlights.toArray())
  const [query, setQuery] = useState('')
  const [color, setColor] = useState<HighlightColor | 'all'>('all')

  const bookMap = useMemo(() => new Map((books ?? []).map(b => [b.id, b])), [books])
  const groups = useMemo(
    () => groupByBook(filterHighlights(highlights ?? [], bookMap, { query, color }), bookMap),
    [highlights, bookMap, query, color],
  )
  const total = useMemo(() => filterHighlights(highlights ?? [], bookMap, { query: '', color: 'all' }).length, [highlights, bookMap])
  const shown = groups.reduce((n, g) => n + g.highlights.length, 0)
  const loading = books === undefined || highlights === undefined

  const exportAll = () => {
    const all = groupByBook(filterHighlights(highlights ?? [], bookMap, { query: '', color: 'all' }), bookMap)
    downloadMarkdown('Reading notes.md', buildAllNotesMarkdown(all.map(g => g.book), all.flatMap(g => g.highlights)))
  }

  const chip = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${active ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900' : 'border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800'}`

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 py-3">
          <Link to="/" className="-ml-2 rounded-lg p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800" aria-label="Back to library">
            <BackIcon />
          </Link>
          <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight">Notes</h1>
          <button type="button" onClick={exportAll} disabled={!total}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800">
            <DownloadIcon size={16} /> <span>Export all</span>
          </button>
        </div>
        {total > 0 && (
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 pb-3">
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search notes</span>
              <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search highlights, notes, books"
                className="w-full rounded-lg border border-stone-300 bg-white py-1.5 pr-3 pl-8 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-stone-700 dark:bg-stone-900"
              />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by color">
              <button type="button" className={chip(color === 'all')} aria-pressed={color === 'all'} onClick={() => setColor('all')}>All</button>
              {HIGHLIGHT_COLOR_KEYS.map(c => (
                <button key={c} type="button" className={chip(color === c)} aria-pressed={color === c} onClick={() => setColor(c)}>
                  <span className="size-2.5 rounded-full" style={{ background: HIGHLIGHT_COLORS[c].fill }} />
                  {HIGHLIGHT_COLORS[c].label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6">
        {!loading && total === 0 && (
          <p className="mt-12 text-center text-stone-500 dark:text-stone-400">
            No highlights yet. Select text while reading to highlight it or add a note.
          </p>
        )}
        {total > 0 && (
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400" aria-live="polite">
            {shown === total ? `${total} highlight${total === 1 ? '' : 's'} in ${groups.length} book${groups.length === 1 ? '' : 's'}` : `${shown} of ${total} highlights`}
          </p>
        )}
        {total > 0 && shown === 0 && <p className="mt-8 text-center text-stone-500">No highlights match.</p>}

        <div className="space-y-8">
          {groups.map(({ book, highlights }) => (
            <BookNotesSection key={book.id} book={book} highlights={highlights} />
          ))}
        </div>
      </main>
    </div>
  )
}

function BookNotesSection({ book, highlights }: { book: Book; highlights: Highlight[] }) {
  return (
    <section aria-label={book.title}>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-sm shadow-sm ring-1 ring-black/5">
          <BookCover book={book} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-serif text-lg font-semibold">{book.title}</h2>
          <p className="truncate text-xs text-stone-500 dark:text-stone-400">
            {book.author} · {highlights.length} highlight{highlights.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {highlights.map(h => (
          <li key={h.id}>
            <Link
              to={`/read/${book.id}?at=${encodeURIComponent(h.location)}&highlight=${h.id}`}
              className="block rounded-lg border border-stone-200 bg-white px-4 py-3 hover:border-stone-300 hover:shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
            >
              <span className="mb-1 block text-xs text-stone-500 dark:text-stone-400">
                {h.chapter ? `${h.chapter} · ` : ''}{Math.round(h.percent * 100)}%
              </span>
              <span className="line-clamp-4 border-l-[3px] pl-3 font-serif leading-snug" style={{ borderColor: HIGHLIGHT_COLORS[h.color].fill }}>
                {h.text}
              </span>
              {h.note && <span className="mt-1.5 block pl-3.5 text-sm text-stone-600 italic dark:text-stone-300">{h.note}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
