import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ReaderSettings } from '../lib/db'
import {
  addBookmark, DEFAULT_SETTINGS, getBookFile, getSettings, markOpened, removeBookmark,
  saveProgress, saveSettings,
} from '../lib/library'
import type { ReaderHandle, ReaderLocation, TocEntry } from '../reader/types'
import NavigationPanel from '../reader/NavigationPanel'
import SettingsPanel from '../reader/SettingsPanel'
import DictionarySheet from '../reader/DictionarySheet'
import { BackIcon, BookmarkIcon, TextIcon, TocIcon, ZoomInIcon, ZoomOutIcon } from '../components/icons'

const EpubView = lazy(() => import('../reader/EpubView'))
const PdfView = lazy(() => import('../reader/PdfView'))

type Panel = 'contents' | 'bookmarks' | 'settings' | null
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
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [location, setLocation] = useState<ReaderLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [word, setWord] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
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
  }, [])

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
    if (panel || word) return closeOverlays()
    if (zone === 'middle') return setChrome(c => !c)
    // Like a Kindle, turning the page tucks the toolbars away.
    setChrome(false)
    if (zone === 'left') readerRef.current?.prev()
    else readerRef.current?.next()
  }, [panel, word, closeOverlays])

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
    onReady: setToc,
    onError: setError,
    onRelocate: setLocation,
    onSelectWord: setWord,
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
          <button type="button" className={iconButton} aria-label="Contents and bookmarks" onClick={() => setPanel('contents')}>
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

      {(panel === 'contents' || panel === 'bookmarks') && (
        <NavigationPanel
          tab={panel}
          onTab={setPanel}
          toc={toc}
          bookmarks={bookmarks ?? []}
          currentChapter={location?.chapter ?? null}
          onNavigate={target => { readerRef.current?.goTo(target); setPanel(null) }}
          onRemoveBookmark={removeBookmark}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'settings' && (
        <SettingsPanel settings={settings} format={book?.format ?? 'epub'} onChange={updateSettings} onClose={() => setPanel(null)} />
      )}
      {word && <DictionarySheet word={word} onClose={() => setWord(null)} />}
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
