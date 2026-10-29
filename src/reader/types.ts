import type { ReaderSettings } from '../lib/db'

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
}

/** Commands the reader page can send to whichever renderer is showing the book. */
export interface ReaderHandle {
  next: () => void
  prev: () => void
  goTo: (target: string) => void
  goToFraction: (fraction: number) => void
}

export interface RendererProps {
  file: Blob
  initialLocation: string | null
  settings: ReaderSettings
  onReady: (toc: TocEntry[]) => void
  onError: (message: string) => void
  onRelocate: (location: ReaderLocation) => void
  /** A single word the user selected, for the dictionary */
  onSelectWord: (word: string) => void
  /** Tap zones: left/right turn pages, middle toggles the toolbars */
  onTap: (zone: 'left' | 'middle' | 'right') => void
  /** Key presses inside the book's own frame, forwarded to the page's shortcuts */
  onKey: (e: KeyboardEvent) => void
}
