import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { pdfjs } from '../lib/pdfjs'
import type { Theme } from '../lib/db'
import { pageToPercent } from './pdfProgress'
import { singleWord, tapZone } from './selection'
import type { ReaderHandle, RendererProps, TocEntry } from './types'

interface Props extends RendererProps {
  zoom: number
}

interface OutlineNode {
  title: string
  dest: string | unknown[] | null
  items: OutlineNode[]
}

// PDFs can't be restyled, so themes are approximated with a filter over the page image.
const PAGE_FILTERS: Record<Theme, string> = {
  light: 'none',
  sepia: 'sepia(0.35) brightness(0.97)',
  dark: 'invert(0.88) hue-rotate(180deg)',
}
const TAP_DELAY = 250
const SWIPE_DISTANCE = 50

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

const PdfView = forwardRef<ReaderHandle, Props>(function PdfView(props, ref) {
  const { file, initialLocation, settings, zoom } = props
  const latest = useRef(props)
  latest.current = props

  const scrollerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })

  const total = doc?.numPages ?? 1
  const goToPage = (n: number) => setPage(Math.min(Math.max(1, Math.round(n)), total))

  useImperativeHandle(ref, () => ({
    next: () => setPage(p => Math.min(p + 1, total)),
    prev: () => setPage(p => Math.max(p - 1, 1)),
    goTo: target => goToPage(Number(target)),
    goToFraction: fraction => goToPage(1 + fraction * (total - 1)),
  }))

  // Open the document.
  useEffect(() => {
    let cancelled = false
    let opened: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        opened = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        if (cancelled) return opened.destroy()
        const outline = await resolveOutline(opened, ((await opened.getOutline()) ?? []) as OutlineNode[])
        if (cancelled) return
        const start = Number(initialLocation)
        setPage(Number.isInteger(start) && start >= 1 && start <= opened.numPages ? start : 1)
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

  // Report the new position whenever the page changes.
  useEffect(() => {
    if (!doc) return
    latest.current.onRelocate({
      location: String(page),
      percent: pageToPercent(page, doc.numPages),
      chapter: chapterFor(toc, page),
      label: `Page ${page} of ${doc.numPages}`,
    })
    scrollerRef.current?.scrollTo({ top: 0, left: 0 })
  }, [doc, page, toc])

  // Draw the page and its selectable text layer.
  useEffect(() => {
    if (!doc || !size.width || !size.height) return
    let cancelled = false
    let task: RenderTask | null = null
    let textLayer: InstanceType<typeof pdfjs.TextLayer> | null = null
    ;(async () => {
      const pdfPage = await doc.getPage(page)
      if (cancelled) return
      const base = pdfPage.getViewport({ scale: 1 })
      const pad = 16
      const fit = Math.min((size.width - pad * 2) / base.width, (size.height - pad * 2) / base.height)
      const viewport = pdfPage.getViewport({ scale: fit * zoom })
      const ratio = window.devicePixelRatio || 1

      const canvas = canvasRef.current!
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      setPageSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) })

      task = pdfPage.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined })
      await task.promise.catch(() => {})
      if (cancelled) return

      const container = textLayerRef.current!
      container.replaceChildren()
      container.style.setProperty('--total-scale-factor', String(viewport.scale))
      textLayer = new pdfjs.TextLayer({ textContentSource: pdfPage.streamTextContent(), container, viewport })
      await textLayer.render().catch(() => {})
    })()
    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
  }, [doc, page, size, zoom])

  // Single-word selections in the text layer open the dictionary.
  useEffect(() => {
    let timer: number | undefined
    const onSelection = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const selection = document.getSelection()
        if (!selection?.anchorNode || !textLayerRef.current?.contains(selection.anchorNode)) return
        const word = singleWord(selection.toString())
        if (word) latest.current.onSelectWord(word)
      }, 400)
    }
    document.addEventListener('selectionchange', onSelection)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', onSelection)
    }
  }, [])

  // Taps and swipes.
  const tapTimer = useRef<number | undefined>(undefined)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onClick = (e: React.MouseEvent) => {
    const { clientX } = e
    window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => {
      if (!document.getSelection()?.isCollapsed) return
      const rect = scrollerRef.current!.getBoundingClientRect()
      latest.current.onTap(tapZone(clientX - rect.left, rect.width))
    }, TAP_DELAY)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    swipeStart.current = e.pointerType === 'touch' && zoom === 1 ? { x: e.clientX, y: e.clientY } : null
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dy) > Math.abs(dx)) return
    window.clearTimeout(tapTimer.current)
    setPage(p => (dx < 0 ? Math.min(p + 1, total) : Math.max(p - 1, 1)))
  }

  return (
    <div
      ref={scrollerRef}
      className="h-full w-full overflow-auto"
      onClick={onClick}
      onDoubleClick={() => window.clearTimeout(tapTimer.current)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      data-testid="pdf-view"
    >
      <div className="flex min-h-full min-w-fit items-center justify-center p-4">
        <div
          className="relative bg-white shadow-md"
          style={{ width: pageSize.width || undefined, height: pageSize.height || undefined, filter: PAGE_FILTERS[settings.theme] }}
        >
          <canvas ref={canvasRef} className="block" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
      </div>
    </div>
  )
})

export default PdfView
