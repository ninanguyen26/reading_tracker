import { memo, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { pdfjs } from '../lib/pdfjs'
import type { Highlight, Theme } from '../lib/db'
import { HIGHLIGHT_COLORS } from './highlightColors'
import { containsQuery } from './textSearch'

export interface PageSize {
  width: number
  height: number
}

interface Props {
  doc: PDFDocumentProxy
  pageNumber: number
  /** The page's size in PDF units; an estimate until the page reports its own */
  baseSize: PageSize
  /** CSS pixels per PDF unit */
  scale: number
  /** Draw the page; off-screen pages in scroll mode stay as empty placeholders */
  active: boolean
  theme: Theme
  highlights: Highlight[]
  searchQuery: string
  /** Called if the page's real size differs from `baseSize` */
  onMeasure: (pageNumber: number, size: PageSize) => void
}

// PDFs can't be restyled, so themes are approximated with a filter over the page image.
const PAGE_FILTERS: Record<Theme, string> = {
  light: 'none',
  sepia: 'sepia(0.35) brightness(0.97)',
  dark: 'invert(0.88) hue-rotate(180deg)',
}
// Roughly what a blank page looks like under each filter, shown until the page is drawn.
const PAGE_BACKGROUNDS: Record<Theme, string> = {
  light: '#ffffff',
  sepia: '#f4ecd8',
  dark: '#262626',
}

/** One PDF page: the rendered image, highlight marks, and a selectable text layer. */
function PdfPage({ doc, pageNumber, baseSize, scale, active, theme, highlights, searchQuery, onMeasure }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)
  const [textLayerVersion, setTextLayerVersion] = useState(0)
  const width = Math.floor(baseSize.width * scale)
  const height = Math.floor(baseSize.height * scale)

  useEffect(() => {
    const canvas = canvasRef.current!
    const container = textLayerRef.current!
    if (!active) {
      // Free the memory held by pages scrolled far out of view.
      canvas.width = 0
      canvas.height = 0
      container.replaceChildren()
      setRendered(false)
      return
    }
    let cancelled = false
    let task: RenderTask | null = null
    let textLayer: InstanceType<typeof pdfjs.TextLayer> | null = null
    ;(async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      if (Math.abs(base.width - baseSize.width) > 0.5 || Math.abs(base.height - baseSize.height) > 0.5) {
        onMeasure(pageNumber, { width: base.width, height: base.height })
      }
      const viewport = page.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      task = page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined })
      await task.promise.catch(() => {})
      if (cancelled) return
      setRendered(true)

      container.replaceChildren()
      container.style.setProperty('--total-scale-factor', String(viewport.scale))
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport })
      await textLayer.render().catch(() => {})
      if (!cancelled) setTextLayerVersion(v => v + 1)
    })()
    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
    // baseSize only matters through `scale` and the size check above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, scale, active])

  // Mark text-layer pieces that contain the search query.
  useEffect(() => {
    const spans = textLayerRef.current?.querySelectorAll<HTMLElement>('span:not(.markedContent)') ?? []
    for (const span of spans) {
      span.classList.toggle('search-hit', containsQuery(span.textContent ?? '', searchQuery))
    }
  }, [searchQuery, textLayerVersion])

  return (
    <div
      data-page={pageNumber}
      className="relative shrink-0 shadow-md"
      style={{ width, height, background: PAGE_BACKGROUNDS[theme] }}
    >
      {/* The theme tint applies to the page image only, so highlight colors stay true. */}
      <canvas ref={canvasRef} className="block bg-white" style={{ width, height, filter: PAGE_FILTERS[theme] }} />
      {rendered && highlights.flatMap(h => (h.rects ?? []).map((r, i) => (
        <div
          key={`${h.id}-${i}`}
          data-highlight-id={h.id}
          className="pointer-events-none absolute rounded-[2px]"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
            background: HIGHLIGHT_COLORS[h.color].fill,
            opacity: 0.38,
          }}
        />
      )))}
      <div ref={textLayerRef} className="textLayer" />
    </div>
  )
}

export default memo(PdfPage)
