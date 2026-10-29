import Dexie, { type EntityTable } from 'dexie'
import type { ReadingStats } from './readingSpeed'

export type BookFormat = 'epub' | 'pdf'

export interface Book {
  id: string
  title: string
  author: string
  format: BookFormat
  fileName: string
  size: number
  cover: Blob | null
  addedAt: number
  lastOpenedAt: number | null
  /** Shelves this book is on. Missing on books added before shelves existed. */
  collectionIds?: string[]
}

/** A shelf: a user-named group of books. A book can be on several. */
export interface Collection {
  id: string
  name: string
  createdAt: number
}

/** The book file itself, kept apart so listing the library never loads it. */
export interface BookFile {
  bookId: string
  blob: Blob
}

/**
 * Where the reader is in a book. `location` is an EPUB CFI for EPUBs and a
 * 1-based page number (as a string) for PDFs.
 */
export interface Progress {
  bookId: string
  location: string
  percent: number
  chapter: string | null
  updatedAt: number
}

export interface Bookmark {
  id: string
  bookId: string
  location: string
  label: string
  percent: number
  createdAt: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

/** A rectangle as fractions (0–1) of the PDF page's width and height, so it survives zooming. */
export interface PageRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Highlight {
  id: string
  bookId: string
  /** EPUB CFI range, or a 1-based page number (as a string) for PDFs */
  location: string
  /** PDF only: where the highlight sits on its page */
  rects?: PageRect[]
  text: string
  color: HighlightColor
  note: string
  percent: number
  chapter: string | null
  createdAt: number
  updatedAt: number
}

export type Theme = 'light' | 'sepia' | 'dark'
export type FontFamily = 'original' | 'serif' | 'sans'
/** Turn pages, or scroll continuously */
export type Flow = 'paginated' | 'scrolled'

export interface ReaderSettings {
  fontSize: number
  fontFamily: FontFamily
  lineHeight: number
  margin: number
  theme: Theme
  flow: Flow
}

type SettingsRow =
  | { key: 'reader'; value: ReaderSettings }
  | { key: 'reading-stats'; value: ReadingStats }

export const db = new Dexie('reading-tracker') as Dexie & {
  books: EntityTable<Book, 'id'>
  files: EntityTable<BookFile, 'bookId'>
  progress: EntityTable<Progress, 'bookId'>
  bookmarks: EntityTable<Bookmark, 'id'>
  highlights: EntityTable<Highlight, 'id'>
  collections: EntityTable<Collection, 'id'>
  settings: EntityTable<SettingsRow, 'key'>
}

db.version(1).stores({
  books: 'id, title, author, addedAt, lastOpenedAt',
  files: 'bookId',
  progress: 'bookId',
  bookmarks: 'id, bookId, createdAt',
  settings: 'key',
})

db.version(2).stores({
  highlights: 'id, bookId, createdAt',
})

db.version(3).stores({
  books: 'id, title, author, addedAt, lastOpenedAt, *collectionIds',
  collections: 'id, name, createdAt',
})
