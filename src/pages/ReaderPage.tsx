import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Highlight, type HighlightColor, type ReaderSettings } from '../lib/db'
import {
  addBookmark, addHighlight, DEFAULT_SETTINGS, getBookFile, getSettings, markOpened, removeBookmark,
  removeHighlight, saveProgress, saveSettings, sortHighlights, updateHighlight,
} from '../lib/library'
import { downloadNotes } from '../lib/exportNotes'
import type { ReaderHandle, ReaderLocation, TextSelection, TocEntry } from '../reader/types'
import NavigationPanel, { type NavigationTab } from '../reader/NavigationPanel'
import SettingsPanel from '../reader/SettingsPanel'
import DictionarySheet from '../reader/DictionarySheet'
import SelectionBar from '../reader/SelectionBar'
import HighlightSheet from '../reader/HighlightSheet'
import { singleWord } from '../reader/selection'
import { BackIcon, BookmarkIcon, TextIcon, TocIcon, ZoomInIcon, ZoomOutIcon } from '../components/icons'

const EpubView = lazy(() => import('../reader/EpubView'))
const PdfView = lazy(() => import('../reader/PdfView'))

type Panel = NavigationTab | 'settings' | null
type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; file: Blob; initialLocation: string | null; settings: ReaderSettings }

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]

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
  const readerRef = useRef<ReaderHandle>(null)

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
      setLoad({ status: 'ready', file, initialLocation: progress?.location ?? null, settings: saved })
      markOpened(bookId)
    })()
    return () => { cancelled = true }
  }, [bookId])

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
  const rendererProps = load.status === 'ready' ? {
    file: load.file,
    initialLocation: load.initialLocation,
    settings,
    highlights,
    onReady: setToc,
    onError: setError,
    onRelocate: setLocation,
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
          <span className="shrink-0 tabular-nums">
            {location ? `${location.label}${location.label ? ' · ' : ''}${Math.round(location.percent * 100)}%` : ''}
          </span>
        </div>
      </footer>

      {panel && panel !== 'settings' && (
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
