import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { FoliateView, TocItem } from 'foliate-js/view.js'
import { buildEpubCss } from './epubStyles'
import { singleWord, tapZone } from './selection'
import type { ReaderHandle, RendererProps, TocEntry } from './types'

const toEntries = (items: TocItem[] | null | undefined): TocEntry[] =>
  (items ?? []).map(item => ({ label: item.label?.trim() || 'Untitled', target: item.href, subitems: toEntries(item.subitems) }))

// A short delay lets a double-click (to select a word) cancel the single tap.
const TAP_DELAY = 250

const EpubView = forwardRef<ReaderHandle, RendererProps>(function EpubView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<FoliateView | null>(null)
  // Event handlers live in a ref so the book isn't reopened when a callback changes.
  const latest = useRef(props)
  latest.current = props

  useImperativeHandle(ref, () => ({
    next: () => viewRef.current?.goRight(),
    prev: () => viewRef.current?.goLeft(),
    goTo: target => viewRef.current?.goTo(target),
    goToFraction: fraction => viewRef.current?.goToFraction(fraction),
  }), [])

  useEffect(() => {
    let cancelled = false
    let view: FoliateView | null = null

    const attachToDocument = (doc: Document) => {
      doc.addEventListener('keydown', e => latest.current.onKey(e))

      let tapTimer: number | undefined
      doc.addEventListener('click', e => {
        if ((e.target as Element | null)?.closest?.('a')) return
        const { clientX } = e
        window.clearTimeout(tapTimer)
        tapTimer = window.setTimeout(() => {
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
          const word = singleWord(doc.getSelection()?.toString())
          if (word) latest.current.onSelectWord(word)
        }, 400)
      })
    }

    ;(async () => {
      try {
        await import('foliate-js/view.js')
        if (cancelled) return
        view = document.createElement('foliate-view') as FoliateView
        view.style.display = 'block'
        view.style.height = '100%'
        view.addEventListener('load', e => attachToDocument((e as CustomEvent).detail.doc))
        view.addEventListener('relocate', e => {
          const d = (e as CustomEvent).detail
          const loc = d.location
          latest.current.onRelocate({
            location: d.cfi,
            percent: Number.isFinite(d.fraction) ? d.fraction : 0,
            chapter: d.tocItem?.label?.trim() || null,
            label: loc ? `Location ${loc.current + 1} of ${loc.total}` : '',
          })
        })
        containerRef.current?.append(view)
        viewRef.current = view

        // foliate-js looks at the file name to tell formats apart, so a bare Blob needs one.
        const file = new File([props.file], 'book.epub', { type: 'application/epub+zip' })
        await view.open(file)
        if (cancelled) return
        view.renderer.setAttribute('flow', 'paginated')
        view.renderer.setAttribute('animated', '')
        view.renderer.setAttribute('max-inline-size', '42em')
        // Leave room above and below the text for the toolbar when it slides in.
        view.renderer.setAttribute('margin', '56px')
        applySettings(view, latest.current.settings)
        await view.init({ lastLocation: props.initialLocation ?? undefined, showTextStart: true })
        if (cancelled) return
        latest.current.onReady(toEntries(view.book.toc))
      } catch (err) {
        console.error(err)
        if (!cancelled) latest.current.onError('This EPUB could not be opened. The file may be damaged or DRM-protected.')
      }
    })()

    return () => {
      cancelled = true
      viewRef.current = null
      view?.close()
      view?.remove()
    }
    // Reopen only when the file itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.file])

  useEffect(() => {
    if (viewRef.current?.renderer) applySettings(viewRef.current, props.settings)
  }, [props.settings])

  return <div ref={containerRef} className="h-full w-full" data-testid="epub-view" />
})

function applySettings(view: FoliateView, settings: RendererProps['settings']) {
  view.renderer.setStyles?.(buildEpubCss(settings))
  view.renderer.setAttribute('gap', `${settings.margin}%`)
}

export default EpubView
