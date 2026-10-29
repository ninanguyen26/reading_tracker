import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from '../lib/pdfjs'
import type { Highlight } from '../lib/db'
import PdfPage, { type PageSize } from './PdfPage'
import { hitsRects, toPageRects } from './pdfHighlights'
import { pageToPercent } from './pdfProgress'
import { findMatches } from './textSearch'
import { tapZone } from './selection'
import type { ReaderHandle, RendererProps, TocEntry } from './types'

interface Props extends RendererProps {
  zoom: number
}

interface OutlineNode {
  title: string
  dest: string | unknown[] | null
  items: OutlineNode[]
}

const TAP_DELAY = 250
const SELECTION_DELAY = 300
const SWIPE_DISTANCE = 50
const PADDING = 16
// In scroll mode pages fill the width, up to a comfortable reading size.
const MAX_SCROLL_PAGE_WIDTH = 900
// Pages within this distance of the screen are drawn in scroll mode.
const RENDER_MARGIN = '100% 0px'
const NO_HIGHLIGHTS: Highlight[] = []

async function resolveOutline(doc: PDFDocumentProxy, nodes: OutlineNode[]): Promise<TocEntry[]> {
  const entries: TocEntry[] = []
  for (const node of nodes) {
    let page: number | null = null
    try {
      const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest
      const ref = dest?.[0]
      if (typeof ref === 'number') page = ref + 1
      else if (ref) page = (await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0])) + 1
    } catch { /* outline entry without a usable destination */ }
    const subitems = await resolveOutline(doc, node.items ?? [])
    if (page !== null || subitems.length) {
      entries.push({ label: node.title.trim() || 'Untitled', target: String(page ?? subitems[0].target), subitems })
    }
  }
  return entries
}

/** First page of the chapter after the one `page` is in, or one past the last page. */
function nextChapterPage(toc: TocEntry[], page: number, total: number): number {
  let next = total + 1
  const walk = (items: TocEntry[]) => {
    for (const item of items) {
      const start = Number(item.target)
      if (start > page && start < next) next = start
      walk(item.subitems)
    }
  }
  walk(toc)
  return next
}

/** The outline entry that the given page falls under, if any. */
function chapterFor(toc: TocEntry[], page: number): string | null {
  let found: string | null = null
  const walk = (items: TocEntry[]) => {
    for (const item of items) {
      if (Number(item.target) <= page) found = item.label
      walk(item.subitems)
    }
  }
  walk(toc)
  return found
}

/** The page element (marked with data-page) containing a node, if any. */
const pageElementOf = (node: Node | null) =>
  (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('[data-page]') ?? null

const PdfView = forwardRef<ReaderHandle, Props>(function PdfView(props, ref) {
  const { file, initialLocation, settings, zoom, highlights } = props
  const scrolled = settings.flow === 'scrolled'
  const latest = useRef(props)
  latest.current = props

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // Page sizes in PDF units. Pages not yet seen are assumed to match page 1.
  const [baseSizes, setBaseSizes] = useState<Map<number, PageSize>>(new Map())
  // Scroll mode: pages near the screen, which get drawn.
  const [nearby, setNearby] = useState<Set<number>>(new Set())
  // Scroll mode: a page to bring into view once it's laid out.
  const scrollTarget = useRef<number | null>(null)

  const total = doc?.numPages ?? 1
  const clampPage = useCallback((n: number) => Math.min(Math.max(1, Math.round(n)), total), [total])
  const sizeOf = (n: number) => baseSizes.get(n) ?? baseSizes.get(1) ?? { width: 612, height: 792 }

  const goToPage = (n: number) => {
    const target = clampPage(n)
    if (scrolled) scrollTarget.current = target
    setPage(target)
  }
  const scrollByScreen = (direction: 1 | -1) => {
    const el = scrollerRef.current
    if (el) el.scrollBy({ top: direction * el.clientHeight * 0.9 })
  }

  useImperativeHandle(ref, () => ({
    next: () => (scrolled ? scrollByScreen(1) : setPage(p => clampPage(p + 1))),
    prev: () => (scrolled ? scrollByScreen(-1) : setPage(p => clampPage(p - 1))),
    goTo: target => goToPage(Number(target)),
    goToFraction: fraction => goToPage(1 + fraction * (total - 1)),
    clearSelection: () => {
      const selection = document.getSelection()
      if (selection?.anchorNode && scrollerRef.current?.contains(selection.anchorNode)) selection.removeAllRanges()
    },
    search: async (query, { onProgress, onGroup }, signal) => {
      if (!doc) return
      for (let n = 1; n <= doc.numPages; n++) {
        if (signal.aborted) return
        const matches = findMatches(await pageText(doc, n), query)
        if (signal.aborted) return
        if (matches.length) {
          const chapter = chapterFor(toc, n)
          onGroup({
            label: chapter ? `${chapter} · Page ${n}` : `Page ${n}`,
            matches: matches.map(excerpt => ({ location: String(n), excerpt })),
          })
        }
        onProgress(n / doc.numPages)
      }
    },
    // Matches are marked from the searchQuery prop, so there is nothing else to clear.
    clearSearch: () => {},
  }))

  // Page text is extracted once per page and reused by later searches.
  const pageTexts = useRef(new Map<number, string>())
  const pageText = async (pdf: PDFDocumentProxy, n: number) => {
    const cached = pageTexts.current.get(n)
    if (cached !== undefined) return cached
    const content = await (await pdf.getPage(n)).getTextContent()
    const text = content.items.map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('')
    pageTexts.current.set(n, text)
    return text
  }

  // Open the document.
  useEffect(() => {
    let cancelled = false
    let opened: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        opened = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        if (cancelled) return opened.destroy()
        const first = (await opened.getPage(1)).getViewport({ scale: 1 })
        const outline = await resolveOutline(opened, ((await opened.getOutline()) ?? []) as OutlineNode[])
        if (cancelled) return
        const start = Number(initialLocation)
        const startPage = Number.isInteger(start) && start >= 1 && start <= opened.numPages ? start : 1
        scrollTarget.current = startPage
        setBaseSizes(new Map([[1, { width: first.width, height: first.height }]]))
        setPage(startPage)
        setToc(outline)
        setDoc(opened)
        latest.current.onReady(outline)
      } catch (err) {
        console.error(err)
        if (!cancelled) latest.current.onError('This PDF could not be opened. The file may be damaged or password-protected.')
      }
    })()
    return () => {
      cancelled = true
      opened?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Track the available space so pages fit the screen.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onMeasure = useCallback((n: number, measured: PageSize) => {
    setBaseSizes(prev => new Map(prev).set(n, measured))
  }, [])

  // CSS pixels per PDF unit for a page of the given size.
  const scaleFor = (base: PageSize) => {
    const width = size.width - PADDING * 2
    const height = size.height - PADDING * 2
    if (scrolled) return (Math.min(width, MAX_SCROLL_PAGE_WIDTH) / base.width) * zoom
    return Math.min(width / base.width, height / base.height) * zoom
  }

  // Report the new position whenever the page changes.
  useEffect(() => {
    if (!doc) return
    latest.current.onRelocate({
      location: String(page),
      percent: pageToPercent(page, doc.numPages),
      chapter: chapterFor(toc, page),
      label: `Page ${page} of ${doc.numPages}`,
      // The current page counts as still to read.
      remaining: {
        unit: 'pdf-pages',
        chapter: nextChapterPage(toc, page, doc.numPages) - page,
        book: doc.numPages - page + 1,
        position: page,
      },
    })
    if (!scrolled) scrollerRef.current?.scrollTo({ top: 0, left: 0 })
  }, [doc, page, toc, scrolled])

  // Scroll mode: keep the current page in view when switching modes or zooming.
  useEffect(() => {
    if (scrolled) scrollTarget.current ??= page
    // Only when the layout changes, not on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrolled, zoom])

  // Scroll mode: bring a requested page into view once the layout is ready.
  useEffect(() => {
    const target = scrollTarget.current
    if (!scrolled || !doc || !size.width || target === null) return
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-page="${target}"]`)
    if (!el) return
    scrollTarget.current = null
    scrollerRef.current!.scrollTop = el.offsetTop - PADDING
  })

  const ready = !!doc && size.width > 0

  // Scroll mode: work out which pages are near the screen, and which one is current.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scrolled || !ready || !scroller) {
      setNearby(new Set())
      return
    }
    const observer = new IntersectionObserver(entries => {
      setNearby(prev => {
        const next = new Set(prev)
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page)
          if (entry.isIntersecting) next.add(n)
          else next.delete(n)
        }
        return next
      })
    }, { root: scroller, rootMargin: RENDER_MARGIN })
    for (const el of scroller.querySelectorAll('[data-page]')) observer.observe(el)

    // The current page is the one crossing a line a third of the way down the screen.
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (scrollTarget.current !== null) return
        // The last page may be too short to reach the line, so the very bottom counts as the end.
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
          setPage(total)
          return
        }
        const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3
        for (const el of scroller.querySelectorAll<HTMLElement>('[data-page]')) {
          const rect = el.getBoundingClientRect()
          if (rect.bottom >= line) {
            setPage(Number(el.dataset.page))
            break
          }
        }
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [scrolled, ready, total])

  // Highlights grouped by page, so each page only re-renders when its own change.
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>()
    for (const h of highlights) {
      if (!h.rects?.length) continue
      const n = Number(h.location)
      map.set(n, [...(map.get(n) ?? []), h])
    }
    return map
  }, [highlights])

  // Report text selected in a page's text layer, with its position on that page.
  const position = useRef({ toc, total })
  position.current = { toc, total }
  useEffect(() => {
    let timer: number | undefined
    let active = false
    const onSelectionChange = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const selection = document.getSelection()
        const pageEl = pageElementOf(selection?.anchorNode ?? null)
        const inReader = !!pageEl && !!scrollerRef.current?.contains(pageEl)
        const text = selection?.toString().trim()
        if (!selection || !inReader || selection.isCollapsed || !text) {
          if (active) {
            active = false
            latest.current.onSelection(null)
          }
          return
        }
        const rects = toPageRects(selection.getRangeAt(0).getClientRects(), pageEl!.getBoundingClientRect())
        if (!rects.length) return
        active = true
        const n = Number(pageEl!.dataset.page)
        const { toc, total } = position.current
        latest.current.onSelection({
          text,
          location: String(n),
          rects,
          percent: pageToPercent(n, total),
          chapter: chapterFor(toc, n),
        })
      }, SELECTION_DELAY)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [])

  // Taps and swipes. Tapping a highlight opens it instead of turning the page.
  const tapTimer = useRef<number | undefined>(undefined)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onClick = (e: React.MouseEvent) => {
    const { clientX, clientY } = e
    const pageEl = pageElementOf(e.target as Node)
    window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => {
      if (!document.getSelection()?.isCollapsed) return
      if (pageEl) {
        const box = pageEl.getBoundingClientRect()
        const x = (clientX - box.left) / box.width
        const y = (clientY - box.top) / box.height
        const hit = highlightsByPage.get(Number(pageEl.dataset.page))?.find(h => hitsRects(h.rects!, x, y))
        if (hit) return latest.current.onHighlightTap(hit.id)
      }
      const rect = scrollerRef.current!.getBoundingClientRect()
      latest.current.onTap(tapZone(clientX - rect.left, rect.width))
    }, TAP_DELAY)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    swipeStart.current = e.pointerType === 'touch' && zoom === 1 && !scrolled ? { x: e.clientX, y: e.clientY } : null
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dy) > Math.abs(dx)) return
    window.clearTimeout(tapTimer.current)
    setPage(p => clampPage(dx < 0 ? p + 1 : p - 1))
  }

  const renderPage = (n: number, active: boolean) => {
    const base = sizeOf(n)
    return (
      <PdfPage
        key={n}
        doc={doc!}
        pageNumber={n}
        baseSize={base}
        scale={scaleFor(base)}
        active={active}
        theme={settings.theme}
        highlights={highlightsByPage.get(n) ?? NO_HIGHLIGHTS}
        searchQuery={props.searchQuery}
        onMeasure={onMeasure}
      />
    )
  }

  return (
    <div
      ref={scrollerRef}
      className="h-full w-full overflow-auto"
      onClick={onClick}
      onDoubleClick={() => window.clearTimeout(tapTimer.current)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onWheel={() => latest.current.onUserScroll()}
      onTouchMove={() => latest.current.onUserScroll()}
      data-testid="pdf-view"
      data-flow={settings.flow}
    >
      {ready && (scrolled ? (
        <div className="flex min-w-fit flex-col items-center gap-3" style={{ padding: PADDING }}>
          {Array.from({ length: total }, (_, i) => renderPage(i + 1, nearby.has(i + 1)))}
        </div>
      ) : (
        <div className="flex min-h-full min-w-fit items-center justify-center" style={{ padding: PADDING }}>
          {renderPage(page, true)}
        </div>
      ))}
    </div>
  )
})

export default PdfView
