import type { Highlight, PageRect, ReaderSettings } from '../lib/db'

export interface TocEntry {
  label: string
  /** EPUB href, or a 1-based page number (as a string) for PDFs */
  target: string
  subitems: TocEntry[]
}

export interface ReaderLocation {
  /** EPUB CFI, or a 1-based page number (as a string) for PDFs */
  location: string
  percent: number
  chapter: string | null
  /** Short human-readable position, e.g. "Page 3 of 10" */
  label: string
  /** How much is left to read, for time estimates. Absent until known. */
  remaining?: Remaining
}

/**
 * Reading amounts in the renderer's own unit: bytes of text for EPUBs, pages
 * for PDFs. `position` only needs to be consistent within one book, so that
 * the distance between two positions can be measured.
 */
export interface Remaining {
  unit: ReadingUnit
  chapter: number
  book: number
  position: number
}

export type ReadingUnit = 'epub-bytes' | 'pdf-pages'

export interface SearchMatch {
  /** Where to go: EPUB CFI, or a page number for PDFs */
  location: string
  excerpt: { pre: string; match: string; post: string }
}

export interface SearchGroup {
  /** Chapter (or page) the matches are in */
  label: string
  matches: SearchMatch[]
}

export interface SearchCallbacks {
  onProgress: (fraction: number) => void
  onGroup: (group: SearchGroup) => void
}

/** Text the reader has selected, with everything needed to save it as a highlight. */
export interface TextSelection {
  text: string
  /** EPUB CFI range, or a 1-based page number (as a string) for PDFs */
  location: string
  /** PDF only */
  rects?: PageRect[]
  percent: number
  chapter: string | null
}

/** Commands the reader page can send to whichever renderer is showing the book. */
export interface ReaderHandle {
  next: () => void
  prev: () => void
  goTo: (target: string) => void
  goToFraction: (fraction: number) => void
  clearSelection: () => void
  /** Searches the whole book, reporting results as they're found. Resolves when done or aborted. */
  search: (query: string, callbacks: SearchCallbacks, signal: AbortSignal) => Promise<void>
  clearSearch: () => void
}

export interface RendererProps {
  file: Blob
  initialLocation: string | null
  settings: ReaderSettings
  highlights: Highlight[]
  /** Current search, so matches can be marked on the page */
  searchQuery: string
  onReady: (toc: TocEntry[]) => void
  onError: (message: string) => void
  onRelocate: (location: ReaderLocation) => void
  /** Called when the user selects text, and with null when the selection is cleared */
  onSelection: (selection: TextSelection | null) => void
  /** The user tapped an existing highlight */
  onHighlightTap: (id: string) => void
  /** Tap zones: left/right turn pages, middle toggles the toolbars */
  onTap: (zone: 'left' | 'middle' | 'right') => void
  /** Key presses inside the book's own frame, forwarded to the page's shortcuts */
  onKey: (e: KeyboardEvent) => void
}

export interface SearchState {
  /** The search that was run (not what is being typed) */
  query: string
  groups: SearchGroup[]
  progress: number
  status: 'idle' | 'searching' | 'done'
}

export const EMPTY_SEARCH: SearchState = { query: '', groups: [], progress: 0, status: 'idle' }
