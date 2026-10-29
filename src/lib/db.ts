import Dexie, { type EntityTable } from 'dexie'

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

export type Theme = 'light' | 'sepia' | 'dark'
export type FontFamily = 'original' | 'serif' | 'sans'

export interface ReaderSettings {
  fontSize: number
  fontFamily: FontFamily
  lineHeight: number
  margin: number
  theme: Theme
}

interface SettingsRow {
  key: 'reader'
  value: ReaderSettings
}

export const db = new Dexie('reading-tracker') as Dexie & {
  books: EntityTable<Book, 'id'>
  files: EntityTable<BookFile, 'bookId'>
  progress: EntityTable<Progress, 'bookId'>
  bookmarks: EntityTable<Bookmark, 'id'>
  settings: EntityTable<SettingsRow, 'key'>
}

db.version(1).stores({
  books: 'id, title, author, addedAt, lastOpenedAt',
  files: 'bookId',
  progress: 'bookId',
  bookmarks: 'id, bookId, createdAt',
  settings: 'key',
})
