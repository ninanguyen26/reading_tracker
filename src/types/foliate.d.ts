// foliate-js ships plain JavaScript with no type definitions. These cover the
// parts of its API this app uses.
declare module 'foliate-js/view.js' {
  export interface TocItem {
    label: string
    href: string
    subitems?: TocItem[] | null
  }

  export interface FoliateBook {
    metadata?: {
      title?: string | Record<string, string>
      author?: unknown
      language?: string | string[]
    }
    toc?: TocItem[]
    getCover?: () => Promise<Blob | null>
    destroy?: () => void
  }

  export interface RelocateDetail {
    fraction: number
    cfi: string
    tocItem?: { label?: string; href?: string } | null
    location?: { current: number; next: number; total: number }
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles?: (css: string | [string, string]) => void
    next: () => Promise<void>
    prev: () => Promise<void>
  }

  export interface FoliateView extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    lastLocation: RelocateDetail | null
    open: (book: File | Blob | string) => Promise<void>
    init: (opts: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>
    close: () => void
    goTo: (target: string | number) => Promise<unknown>
    goToFraction: (frac: number) => Promise<void>
    next: () => Promise<void>
    prev: () => Promise<void>
    goLeft: () => Promise<void>
    goRight: () => Promise<void>
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}
