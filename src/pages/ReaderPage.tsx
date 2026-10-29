import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Highlight, type HighlightColor, type ReaderSettings } from '../lib/db'
import {
  addBookmark, addHighlight, DEFAULT_SETTINGS, getBookFile, getSettings, markOpened, removeBookmark,
  removeHighlight, saveProgress, saveSettings, sortHighlights, updateHighlight,
} from '../lib/library'
import { downloadNotes } from '../lib/exportNotes'
import { EMPTY_SEARCH, type ReaderHandle, type ReaderLocation, type SearchMatch, type SearchState, type TextSelection, type TocEntry } from '../reader/types'
import NavigationPanel, { type NavigationTab } from '../reader/NavigationPanel'
import SettingsPanel from '../reader/SettingsPanel'
import DictionarySheet from '../reader/DictionarySheet'
import SelectionBar from '../reader/SelectionBar'
import HighlightSheet from '../reader/HighlightSheet'
import { singleWord } from '../reader/selection'
import SearchPanel from '../reader/SearchPanel'
import { useReadingTime } from '../reader/useReadingTime'
import { formatDuration } from '../lib/readingSpeed'
import { BackIcon, BookmarkIcon, CloseIcon, SearchIcon, TextIcon, TocIcon, ZoomInIcon, ZoomOutIcon } from '../components/icons'

const EpubView = lazy(() => import('../reader/EpubView'))
const PdfView = lazy(() => import('../reader/PdfView'))

type Panel = NavigationTab | 'settings' | 'search' | null
type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; file: Blob; initialLocation: string | null; settings: ReaderSettings }

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]

// Like a Kindle, tapping the footer cycles what it shows.
const FOOTER_MODES = ['location', 'chapter', 'book'] as const
type FooterMode = (typeof FOOTER_MODES)[number]
const FOOTER_MODE_KEY = 'footer-mode'

function loadFooterMode(): FooterMode {
  try {
    const saved = localStorage.getItem(FOOTER_MODE_KEY)
    if (FOOTER_MODES.includes(saved as FooterMode)) return saved as FooterMode
  } catch { /* storage unavailable */ }
  return 'location'
}

export default function ReaderPage() {
  const { bookId = '' } = useParams()
  const book = useLiveQuery(() => db.books.get(bookId), [bookId])
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(bookId).sortBy('percent'),
    [bookId],
  )
  const storedHighlights = useLiveQuery(() => db.highlights.where('bookId').equals(bookId).toArray(), [bookId])
  const highlights = useMemo(() => sortHighlights(storedHighlights ?? []), [storedHighlights])
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [location, setLocation] = useState<ReaderLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [word, setWord] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [editing, setEditing] = useState<{ id: string; focusNote: boolean } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH)
  const searchAbort = useRef<AbortController | null>(null)
  const readerRef = useRef<ReaderHandle>(null)

  // Links from the Notes page open the book at a highlight: ?at=<location>&highlight=<id>
  const [searchParams, setSearchParams] = useSearchParams()
  const openAt = useRef({ at: searchParams.get('at'), highlight: searchParams.get('highlight') })
  const setParams = useRef(setSearchParams)
  setParams.current = setSearchParams

  // Load the file, saved position and settings once per book.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [file, progress, saved] = await Promise.all([
        getBookFile(bookId), db.progress.get(bookId), getSettings(),
      ])
      if (cancelled) return
      if (!file) return setLoad({ status: 'missing' })
      setSettings(saved)
      const { at, highlight } = openAt.current
      setLoad({ status: 'ready', file, initialLocation: at ?? progress?.location ?? null, settings: saved })
      if (highlight) setEditing({ id: highlight, focusNote: false })
      // Consumed: don't jump back to the highlight on reload.
      if (at || highlight) setParams.current({}, { replace: true })
      markOpened(bookId)
    })()
    return () => { cancelled = true }
  }, [bookId])

  const timeLeft = useReadingTime(location)
  const [footerMode, setFooterMode] = useState<FooterMode>(loadFooterMode)
  const cycleFooter = () => {
    const next = FOOTER_MODES[(FOOTER_MODES.indexOf(footerMode) + 1) % FOOTER_MODES.length]
    setFooterMode(next)
    try { localStorage.setItem(FOOTER_MODE_KEY, next) } catch { /* ignore */ }
  }
  const footerText = (() => {
    if (!location) return ''
    const percent = `${Math.round(location.percent * 100)}%`
    if (timeLeft && footerMode === 'chapter') return `${formatDuration(timeLeft.chapter)} left in chapter · ${percent}`
    if (timeLeft && footerMode === 'book') return `${formatDuration(timeLeft.book)} left in book · ${percent}`
    return location.label ? `${location.label} · ${percent}` : percent
  })()

  // Save the reading position shortly after it settles, and on leaving the page.
  const pending = useRef<ReaderLocation | null>(null)
  const flush = useCallback(() => {
    const loc = pending.current
    if (!loc) return
    pending.current = null
    saveProgress({ bookId, location: loc.location, percent: loc.percent, chapter: loc.chapter })
  }, [bookId])
  useEffect(() => {
    if (!location) return
    pending.current = location
    const t = window.setTimeout(flush, 500)
    return () => window.clearTimeout(t)
  }, [location, flush])
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const updateSettings = (next: ReaderSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  const currentBookmark = useMemo(
    () => bookmarks?.find(b => b.location === location?.location),
    [bookmarks, location],
  )
  const toggleBookmark = () => {
    if (!location) return
    if (currentBookmark) removeBookmark(currentBookmark.id)
    else addBookmark({
      bookId,
      location: location.location,
      percent: location.percent,
      label: location.chapter ?? location.label ?? 'Bookmark',
    })
  }

  const closeOverlays = useCallback(() => {
    setPanel(null)
    setWord(null)
    setEditing(null)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  // ---------- Selection actions ----------
  const finishSelection = () => {
    readerRef.current?.clearSelection()
    setSelection(null)
  }
  // Clear the selection before saving, so a new selection made while the
  // save is in flight isn't wiped when it finishes.
  const saveSelection = (color: HighlightColor) => {
    if (!selection) return null
    const { text, location, rects, percent, chapter } = selection
    finishSelection()
    return addHighlight({ bookId, text, location, rects, percent, chapter, color })
  }
  const highlightSelection = (color: HighlightColor) => {
    saveSelection(color)
  }
  const noteOnSelection = async () => {
    const h = await saveSelection('yellow')
    if (h) setEditing({ id: h.id, focusNote: true })
  }
  const defineSelection = () => {
    const w = singleWord(selection?.text)
    finishSelection()
    if (w) setWord(w)
  }
  const copySelection = async () => {
    const text = selection?.text ?? ''
    finishSelection()
    try {
      await navigator.clipboard.writeText(text)
      setToast('Copied')
    } catch {
      setToast('Couldn’t copy')
    }
  }
  const openHighlight = (h: Highlight) => {
    readerRef.current?.goTo(h.location)
    setPanel(null)
    setEditing({ id: h.id, focusNote: false })
  }
  // ---------- Search ----------
  const runSearch = async (query: string) => {
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    readerRef.current?.clearSearch()
    setSearch({ query, groups: [], progress: 0, status: 'searching' })
    await readerRef.current?.search(query, {
      onProgress: progress => !controller.signal.aborted && setSearch(s => ({ ...s, progress })),
      onGroup: group => !controller.signal.aborted && setSearch(s => ({ ...s, groups: [...s.groups, group] })),
    }, controller.signal)
    if (!controller.signal.aborted) setSearch(s => ({ ...s, status: 'done', progress: 1 }))
  }
  const clearSearch = () => {
    searchAbort.current?.abort()
    readerRef.current?.clearSearch()
    setSearch(EMPTY_SEARCH)
    setSearchDraft('')
  }
  const goToMatch = (match: SearchMatch) => {
    readerRef.current?.goTo(match.location)
    setPanel(null)
  }
  useEffect(() => () => searchAbort.current?.abort(), [])

  const editingHighlight = editing ? highlights.find(h => h.id === editing.id) : undefined

  const handleKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest?.('input, select, textarea')) return
    // Space on a focused button should press it, not turn the page.
    if (e.key === ' ' && target?.closest?.('button, a')) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault()
        readerRef.current?.next()
        break
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault()
        readerRef.current?.prev()
        break
      case 'Escape':
        closeOverlays()
        break
    }
  }, [closeOverlays])
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // In scroll mode there are no page turns, so scrolling tucks the toolbars away.
  const flowRef = useRef(settings.flow)
  flowRef.current = settings.flow
  const handleUserScroll = useCallback(() => {
    if (flowRef.current === 'scrolled') setChrome(false)
  }, [])

  const handleTap = useCallback((zone: 'left' | 'middle' | 'right') => {
    if (panel || word || editing) return closeOverlays()
    if (zone === 'middle') return setChrome(c => !c)
    // Like a Kindle, turning the page tucks the toolbars away.
    setChrome(false)
    if (zone === 'left') readerRef.current?.prev()
    else readerRef.current?.next()
  }, [panel, word, editing, closeOverlays])

  if (load.status === 'missing') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-serif text-xl">This book isn’t in your library.</p>
        <Link to="/" className="text-amber-700 underline dark:text-amber-500">Back to library</Link>
      </div>
    )
  }

  const isPdf = book?.format === 'pdf'
  // Wait for the book record too: its format decides which viewer opens the file.
  const rendererProps = load.status === 'ready' && book ? {
    file: load.file,
    initialLocation: load.initialLocation,
    settings,
    highlights,
    searchQuery: search.query,
    onReady: setToc,
    onError: setError,
    onRelocate: setLocation,
    onUserScroll: handleUserScroll,
    onSelection: setSelection,
    onHighlightTap: (id: string) => setEditing({ id, focusNote: false }),
    onTap: handleTap,
    onKey: handleKey,
  } : null

  const iconButton = 'rounded-lg p-2 hover:bg-[var(--reader-border)] disabled:opacity-40'

  return (
    <div className="reader relative flex h-dvh flex-col overflow-hidden" data-theme={settings.theme}>
      {/* Top bar */}
      <header
        className={`absolute inset-x-0 top-0 z-20 border-b border-[var(--reader-border)] bg-[var(--reader-panel)] pt-[env(safe-area-inset-top)] shadow-sm transition-transform duration-200 ${chrome ? '' : '-translate-y-full'}`}
      >
        <div className="flex items-center gap-1 px-2 py-1.5 sm:px-3">
          <Link to="/" className={iconButton} aria-label="Back to library"><BackIcon /></Link>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">{book?.title ?? ''}</p>
            <p className="truncate text-xs text-[var(--reader-muted)]">{book?.author ?? ''}</p>
          </div>
          {isPdf && (
            <>
              <button type="button" className={iconButton} aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]}
                onClick={() => setZoom(z => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)])}>
                <ZoomOutIcon />
              </button>
              <button type="button" className={iconButton} aria-label="Zoom in" disabled={zoom >= ZOOM_STEPS.at(-1)!}
                onClick={() => setZoom(z => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)])}>
                <ZoomInIcon />
              </button>
            </>
          )}
          <button type="button" className={iconButton} aria-label="Search this book" onClick={() => setPanel('search')} disabled={!location}>
            <SearchIcon />
          </button>
          <button type="button" className={iconButton} aria-label="Contents, bookmarks and notes" onClick={() => setPanel('contents')}>
            <TocIcon />
          </button>
          <button type="button" className={iconButton} aria-label="Reading settings" aria-expanded={panel === 'settings'}
            onClick={() => setPanel(p => (p === 'settings' ? null : 'settings'))}>
            <TextIcon />
          </button>
          <button type="button" className={`${iconButton} ${currentBookmark ? 'text-[var(--reader-accent)]' : ''}`}
            aria-label={currentBookmark ? 'Remove bookmark' : 'Add bookmark'} aria-pressed={!!currentBookmark}
            onClick={toggleBookmark} disabled={!location}>
            <BookmarkIcon filled={!!currentBookmark} />
          </button>
        </div>
      </header>

      {/* Page */}
      <main className="relative min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p>{error}</p>
            <Link to="/" className="underline">Back to library</Link>
          </div>
        ) : rendererProps ? (
          <Suspense fallback={<Spinner />}>
            {isPdf
              ? <PdfView ref={readerRef} {...rendererProps} zoom={zoom} />
              : <EpubView ref={readerRef} {...rendererProps} />}
          </Suspense>
        ) : <Spinner />}
        {!location && !error && rendererProps && <Spinner overlay />}
      </main>

      {/* Footer: always shows position; the slider appears with the toolbars */}
      <footer className="relative z-10 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-[var(--reader-muted)]">
        {chrome && location && (
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(location.percent * 1000)}
            onChange={e => readerRef.current?.goToFraction(Number(e.target.value) / 1000)}
            className="mb-1 w-full accent-[var(--reader-accent)]"
            aria-label="Reading position"
          />
        )}
        <div className="flex items-center justify-between gap-4 pt-1">
          <span className="truncate">{location?.chapter ?? ''}</span>
          <button
            type="button"
            onClick={cycleFooter}
            className="-my-1 shrink-0 rounded px-1 py-1 tabular-nums hover:text-[var(--reader-fg)]"
            aria-label={`${footerText}. Tap to change`}
            data-testid="footer-progress"
          >
            {footerText}
          </button>
        </div>
      </footer>

      {panel === 'search' && (
        <SearchPanel
          draft={searchDraft}
          onDraft={setSearchDraft}
          search={search}
          onSearch={runSearch}
          onClear={clearSearch}
          onSelect={goToMatch}
          onClose={() => setPanel(null)}
        />
      )}
      {/* While a search is active, a chip leads back to the results. */}
      {search.status !== 'idle' && panel !== 'search' && (
        <div className={`fixed left-1/2 z-20 flex -translate-x-1/2 items-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-panel)] text-xs shadow transition-[top] ${chrome ? 'top-[calc(3.75rem+env(safe-area-inset-top))]' : 'top-[calc(0.5rem+env(safe-area-inset-top))]'}`}>
          <button type="button" onClick={() => setPanel('search')} className="flex items-center gap-1.5 py-1.5 pr-1 pl-3">
            <SearchIcon size={14} /> Results for “{search.query}”
          </button>
          <button type="button" onClick={clearSearch} className="rounded-full p-1.5 hover:bg-[var(--reader-border)]" aria-label="Clear search">
            <CloseIcon size={14} />
          </button>
        </div>
      )}
      {panel && panel !== 'settings' && panel !== 'search' && (
        <NavigationPanel
          tab={panel}
          onTab={setPanel}
          toc={toc}
          bookmarks={bookmarks ?? []}
          highlights={highlights}
          currentChapter={location?.chapter ?? null}
          onNavigate={target => { readerRef.current?.goTo(target); setPanel(null) }}
          onRemoveBookmark={removeBookmark}
          onOpenHighlight={openHighlight}
          onExportNotes={() => book && downloadNotes(book, highlights)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'settings' && (
        <SettingsPanel settings={settings} format={book?.format ?? 'epub'} onChange={updateSettings} onClose={() => setPanel(null)} />
      )}
      {selection && !editing && !word && (
        <SelectionBar
          canDefine={!!singleWord(selection.text)}
          onHighlight={highlightSelection}
          onNote={noteOnSelection}
          onDefine={defineSelection}
          onCopy={copySelection}
        />
      )}
      {editingHighlight && (
        <HighlightSheet
          highlight={editingHighlight}
          focusNote={editing!.focusNote}
          onColor={color => updateHighlight(editingHighlight.id, { color })}
          onSaveNote={note => updateHighlight(editingHighlight.id, { note })}
          onDelete={() => { removeHighlight(editingHighlight.id); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
      {word && <DictionarySheet word={word} onClose={() => setWord(null)} />}
      {toast && (
        <p role="status" className="fixed top-[calc(4rem+env(safe-area-inset-top))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--reader-fg)] px-3 py-1 text-xs text-[var(--reader-bg)] shadow">
          {toast}
        </p>
      )}
    </div>
  )
}

function Spinner({ overlay }: { overlay?: boolean }) {
  return (
    <div className={`${overlay ? 'pointer-events-none absolute inset-0 bg-[var(--reader-bg)]' : 'h-full'} flex items-center justify-center`}>
      <span className="size-6 animate-spin rounded-full border-2 border-[var(--reader-accent)] border-t-transparent" aria-label="Loading" />
    </div>
  )
}
