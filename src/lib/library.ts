import { db, type Book, type Bookmark, type Highlight, type Progress, type ReaderSettings } from './db'
import { detectFormat, extractMetadata, type BookMetadata } from './metadata'
import type { BookFormat } from './db'

export class UnsupportedFileError extends Error {
  constructor(fileName: string) {
    super(`"${fileName}" isn't an EPUB or PDF file.`)
    this.name = 'UnsupportedFileError'
  }
}

type Extractor = (file: File, format: BookFormat) => Promise<BookMetadata>

const newId = () => crypto.randomUUID()

/** Saves an uploaded file into the library. `extract` is injectable for tests. */
export async function addBook(file: File, extract: Extractor = extractMetadata): Promise<Book> {
  const format = await detectFormat(file)
  if (!format) throw new UnsupportedFileError(file.name)

  const meta = await extract(file, format)
  const book: Book = {
    id: newId(),
    title: meta.title,
    author: meta.author,
    format,
    fileName: file.name,
    size: file.size,
    cover: meta.cover,
    addedAt: Date.now(),
    lastOpenedAt: null,
  }
  await db.transaction('rw', db.books, db.files, async () => {
    await db.books.add(book)
    await db.files.add({ bookId: book.id, blob: file })
  })
  // Ask the browser not to evict the library when storage runs low.
  navigator.storage?.persist?.().catch(() => {})
  return book
}

export async function deleteBook(id: string): Promise<void> {
  await db.transaction('rw', [db.books, db.files, db.progress, db.bookmarks, db.highlights], async () => {
    await db.books.delete(id)
    await db.files.delete(id)
    await db.progress.delete(id)
    await db.bookmarks.where('bookId').equals(id).delete()
    await db.highlights.where('bookId').equals(id).delete()
  })
}

export async function getBookFile(id: string): Promise<Blob | undefined> {
  return (await db.files.get(id))?.blob
}

export async function markOpened(id: string): Promise<void> {
  await db.books.update(id, { lastOpenedAt: Date.now() })
}

export async function saveProgress(progress: Omit<Progress, 'updatedAt'>): Promise<void> {
  await db.progress.put({ ...progress, updatedAt: Date.now() })
}

export async function addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>): Promise<Bookmark> {
  const existing = await db.bookmarks
    .where('bookId').equals(bookmark.bookId)
    .filter(b => b.location === bookmark.location)
    .first()
  if (existing) return existing
  const row: Bookmark = { ...bookmark, id: newId(), createdAt: Date.now() }
  await db.bookmarks.add(row)
  return row
}

export async function removeBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id)
}

// ---------- Highlights ----------

export async function addHighlight(
  highlight: Omit<Highlight, 'id' | 'createdAt' | 'updatedAt' | 'note'> & { note?: string },
): Promise<Highlight> {
  const now = Date.now()
  const row: Highlight = { note: '', ...highlight, id: newId(), createdAt: now, updatedAt: now }
  await db.highlights.add(row)
  return row
}

export async function updateHighlight(id: string, changes: Partial<Pick<Highlight, 'color' | 'note'>>): Promise<void> {
  await db.highlights.update(id, { ...changes, updatedAt: Date.now() })
}

export async function removeHighlight(id: string): Promise<void> {
  await db.highlights.delete(id)
}

/** Reading order: by position in the book, then by when they were made. */
export function sortHighlights(highlights: Highlight[]): Highlight[] {
  return [...highlights].sort((a, b) => a.percent - b.percent || a.createdAt - b.createdAt)
}

// ---------- Settings ----------

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 100,
  fontFamily: 'original',
  lineHeight: 1.5,
  margin: 6,
  theme: 'light',
}

export async function getSettings(): Promise<ReaderSettings> {
  const row = await db.settings.get('reader')
  return { ...DEFAULT_SETTINGS, ...row?.value }
}

export async function saveSettings(value: ReaderSettings): Promise<void> {
  await db.settings.put({ key: 'reader', value })
}

// ---------- Sorting and search ----------

export type SortKey = 'recent' | 'title' | 'author' | 'added'

export function sortBooks(books: Book[], key: SortKey): Book[] {
  const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  const sorted = [...books]
  switch (key) {
    case 'title':
      return sorted.sort((a, b) => byText(a.title, b.title))
    case 'author':
      return sorted.sort((a, b) => byText(a.author, b.author) || byText(a.title, b.title))
    case 'added':
      return sorted.sort((a, b) => b.addedAt - a.addedAt)
    case 'recent':
      // Books never opened fall back to when they were added.
      return sorted.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
  }
}

export function filterBooks(books: Book[], query: string): Book[] {
  const q = query.trim().toLowerCase()
  if (!q) return books
  return books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
}
