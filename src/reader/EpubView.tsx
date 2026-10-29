import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { FoliateView, TocItem } from 'foliate-js/view.js'
import type { Highlight, HighlightColor } from '../lib/db'
import { buildEpubCss } from './epubStyles'
import { HIGHLIGHT_COLORS } from './highlightColors'
import { tapZone } from './selection'
import type { ReaderHandle, Remaining, RendererProps, TocEntry } from './types'

const toEntries = (items: TocItem[] | null | undefined): TocEntry[] =>
  (items ?? []).map(item => ({ label: item.label?.trim() || 'Untitled', target: item.href, subitems: toEntries(item.subitems) }))

// A short delay lets a double-click (to select a word) cancel the single tap.
const TAP_DELAY = 250
// Wait for the selection to settle (e.g. while dragging) before showing the toolbar.
const SELECTION_DELAY = 300

const EpubView = forwardRef<ReaderHandle, RendererProps>(function EpubView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<FoliateView | null>(null)
  const readyRef = useRef(false)
  // Event handlers live in a ref so the book isn't reopened when a callback changes.
  const latest = useRef(props)
  latest.current = props
  // Highlights currently drawn, by CFI, with their color.
  const drawn = useRef(new Map<string, HighlightColor>())
  const selectionDoc = useRef<Document | null>(null)

  useImperativeHandle(ref, () => ({
    next: () => viewRef.current?.goRight(),
    prev: () => viewRef.current?.goLeft(),
    goTo: target => viewRef.current?.goTo(target),
    goToFraction: fraction => viewRef.current?.goToFraction(fraction),
    clearSelection: () => {
      selectionDoc.current?.getSelection()?.removeAllRanges()
      selectionDoc.current = null
    },
    search: async (query, { onProgress, onGroup }, signal) => {
      const view = viewRef.current
      if (!view) return
      // foliate-js outlines every match on the page while the search is active.
      for await (const result of view.search({ query })) {
        if (signal.aborted) break
        if (result === 'done') break
        if ('progress' in result && result.progress != null) onProgress(result.progress)
        if ('subitems' in result && result.subitems) {
          onGroup({
            label: result.label?.trim() || 'Untitled',
            matches: result.subitems.map(item => ({ location: item.cfi, excerpt: item.excerpt })),
          })
        }
      }
    },
    clearSearch: () => viewRef.current?.clearSearch(),
  }), [])

  useEffect(() => {
    let cancelled = false
    let view: FoliateView | null = null
    let suppressTap = false
    const drawnMap = drawn.current

    const attachToDocument = (doc: Document, index: number) => {
      doc.addEventListener('keydown', e => latest.current.onKey(e))

      let tapTimer: number | undefined
      doc.addEventListener('click', e => {
        if ((e.target as Element | null)?.closest?.('a')) return
        const { clientX } = e
        window.clearTimeout(tapTimer)
        tapTimer = window.setTimeout(() => {
          if (suppressTap) return void (suppressTap = false)
          if (!doc.getSelection()?.isCollapsed) return
          // The frame can be wider than the screen (one column per page), so
          // convert the tap to a position within the visible reader area.
          const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
          const host = containerRef.current?.getBoundingClientRect()
          if (!frame || !host) return
          latest.current.onTap(tapZone(frame.left + clientX - host.left, host.width))
        }, TAP_DELAY)
      })
      doc.addEventListener('dblclick', () => window.clearTimeout(tapTimer))

      let selectTimer: number | undefined
      doc.addEventListener('selectionchange', () => {
        window.clearTimeout(selectTimer)
        selectTimer = window.setTimeout(() => {
          const selection = doc.getSelection()
          const text = selection?.toString().trim()
          if (!selection || selection.isCollapsed || !text || !view) {
            if (selectionDoc.current === doc) {
              selectionDoc.current = null
              latest.current.onSelection(null)
            }
            return
          }
          selectionDoc.current = doc
          const where = view.lastLocation
          latest.current.onSelection({
            text,
            location: view.getCFI(index, selection.getRangeAt(0)),
            percent: Number.isFinite(where?.fraction) ? where!.fraction : 0,
            chapter: where?.tocItem?.label?.trim() || null,
          })
        }, SELECTION_DELAY)
      })
    }

    ;(async () => {
      try {
        await import('foliate-js/view.js')
        const { Overlayer } = await import('foliate-js/overlayer.js')
        if (cancelled) return
        view = document.createElement('foliate-view') as FoliateView
        view.style.display = 'block'
        view.style.height = '100%'
        view.addEventListener('load', e => {
          const { doc, index } = (e as CustomEvent).detail
          attachToDocument(doc, index)
        })
        view.addEventListener('relocate', e => {
          const d = (e as CustomEvent).detail
          const loc = d.location
          latest.current.onRelocate({
            location: d.cfi,
            percent: Number.isFinite(d.fraction) ? d.fraction : 0,
            chapter: d.tocItem?.label?.trim() || null,
            label: loc ? `Location ${loc.current + 1} of ${loc.total}` : '',
            remaining: loc && d.time ? toRemaining(loc.total, d.time) : undefined,
          })
        })
        // A chapter was (re)rendered: draw its highlights.
        view.addEventListener('create-overlay', () => {
          for (const h of latest.current.highlights) view?.addAnnotation({ value: h.location, color: h.color })
        })
        view.addEventListener('draw-annotation', e => {
          const { draw, annotation } = (e as CustomEvent).detail
          const color = HIGHLIGHT_COLORS[annotation.color as HighlightColor] ?? HIGHLIGHT_COLORS.yellow
          draw(Overlayer.highlight, { color: color.fill })
        })
        view.addEventListener('show-annotation', e => {
          const { value } = (e as CustomEvent).detail
          const highlight = latest.current.highlights.find(h => h.location === value)
          if (!highlight) return
          suppressTap = true
          latest.current.onHighlightTap(highlight.id)
        })
        containerRef.current?.append(view)
        viewRef.current = view

        // foliate-js looks at the file name to tell formats apart, so a bare Blob needs one.
        const file = new File([props.file], 'book.epub', { type: 'application/epub+zip' })
        await view.open(file)
        if (cancelled) return
        // The layout engine says why the position changed; 'scroll' means the reader scrolled.
        // (Listening for wheel events in the book's frame would stop it scrolling.)
        view.renderer.addEventListener('relocate', e => {
          if ((e as CustomEvent).detail?.reason === 'scroll') latest.current.onUserScroll()
        })
        view.renderer.setAttribute('animated', '')
        // Must be in px: foliate-js reads this number with parseFloat.
        view.renderer.setAttribute('max-inline-size', '720px')
        // Leave room above and below the text for the toolbar when it slides in.
        view.renderer.setAttribute('margin', '56px')
        applySettings(view, latest.current.settings)
        await view.init({ lastLocation: props.initialLocation ?? undefined, showTextStart: true })
        if (cancelled) return
        readyRef.current = true
        syncHighlights(view, latest.current.highlights, drawn.current)
        latest.current.onReady(toEntries(view.book.toc))
      } catch (err) {
        console.error(err)
        if (!cancelled) latest.current.onError('This EPUB could not be opened. The file may be damaged or DRM-protected.')
      }
    })()

    return () => {
      cancelled = true
      readyRef.current = false
      viewRef.current = null
      drawnMap.clear()
      view?.close()
      view?.remove()
    }
    // Reopen only when the file itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.file])

  useEffect(() => {
    if (viewRef.current?.renderer) applySettings(viewRef.current, props.settings)
  }, [props.settings])

  useEffect(() => {
    if (readyRef.current && viewRef.current) syncHighlights(viewRef.current, props.highlights, drawn.current)
  }, [props.highlights])

  return <div ref={containerRef} className="h-full w-full" data-testid="epub-view" />
})

// foliate-js measures progress in bytes of text: a "location" is 1500 bytes
// and its time unit is 1600 bytes. Converting back to bytes lets this app
// apply its own measured reading speed.
const BYTES_PER_LOCATION = 1500
const BYTES_PER_TIME_UNIT = 1600

function toRemaining(totalLocations: number, time: { section: number; total: number }): Remaining {
  const book = time.total * BYTES_PER_TIME_UNIT
  return {
    unit: 'epub-bytes',
    chapter: time.section * BYTES_PER_TIME_UNIT,
    book,
    position: totalLocations * BYTES_PER_LOCATION - book,
  }
}

function applySettings(view: FoliateView, settings: RendererProps['settings']) {
  view.renderer.setStyles?.(buildEpubCss(settings))
  view.renderer.setAttribute('gap', `${settings.margin}%`)
  // foliate-js keeps the reader's place when the layout changes.
  if (view.renderer.getAttribute('flow') !== settings.flow) view.renderer.setAttribute('flow', settings.flow)
}

/** Draws new or recolored highlights and erases deleted ones. */
function syncHighlights(view: FoliateView, highlights: Highlight[], drawn: Map<string, HighlightColor>) {
  const next = new Map(highlights.map(h => [h.location, h.color]))
  for (const location of drawn.keys()) {
    if (!next.has(location)) view.deleteAnnotation({ value: location })
  }
  for (const [location, color] of next) {
    if (drawn.get(location) !== color) view.addAnnotation({ value: location, color })
  }
  drawn.clear()
  for (const [location, color] of next) drawn.set(location, color)
}

export default EpubView
