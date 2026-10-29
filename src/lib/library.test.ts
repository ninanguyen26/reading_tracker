import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Book } from './db'
import {
  addBook, addBookmark, addHighlight, deleteBook, DEFAULT_SETTINGS, filterBooks, getBookFile, getSettings,
  markOpened, removeBookmark, removeHighlight, saveProgress, saveSettings, sortBooks, sortHighlights,
  UnsupportedFileError, updateHighlight,
} from './library'

const fakeExtract = async (file: File) => ({ title: `Title of ${file.name}`, author: 'Someone', cover: null })
const pdfFile = (name = 'book.pdf') => new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' })
const epubFile = (name = 'book.epub') => new File(['PK\u0003\u0004 fake'], name)

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

describe('addBook', () => {
  it('stores the book and its file separately', async () => {
    const book = await addBook(pdfFile(), fakeExtract)
    expect(book.format).toBe('pdf')
    expect(book.title).toBe('Title of book.pdf')
    expect(await db.books.count()).toBe(1)
    expect(await getBookFile(book.id)).toBeDefined()
  })

  it('detects EPUBs by their zip signature', async () => {
    const book = await addBook(epubFile('no-extension'), fakeExtract)
    expect(book.format).toBe('epub')
  })

  it('rejects files that are not EPUB or PDF', async () => {
    const txt = new File(['hello'], 'notes.txt')
    await expect(addBook(txt, fakeExtract)).rejects.toBeInstanceOf(UnsupportedFileError)
    expect(await db.books.count()).toBe(0)
  })
})

describe('deleteBook', () => {
  it('removes the book with its file, progress and bookmarks', async () => {
    const book = await addBook(pdfFile(), fakeExtract)
    const other = await addBook(pdfFile('other.pdf'), fakeExtract)
    await saveProgress({ bookId: book.id, location: '3', percent: 0.5, chapter: null })
    await addBookmark({ bookId: book.id, location: '3', label: 'Page 3', percent: 0.5 })
    await addBookmark({ bookId: other.id, location: '1', label: 'Page 1', percent: 0 })

    await deleteBook(book.id)

    expect(await db.books.get(book.id)).toBeUndefined()
    expect(await db.files.get(book.id)).toBeUndefined()
    expect(await db.progress.get(book.id)).toBeUndefined()
    expect(await db.bookmarks.where('bookId').equals(book.id).count()).toBe(0)
    expect(await db.bookmarks.count()).toBe(1)
  })
})

describe('progress and bookmarks', () => {
  it('overwrites progress for the same book', async () => {
    await saveProgress({ bookId: 'b', location: '1', percent: 0.1, chapter: 'One' })
    await saveProgress({ bookId: 'b', location: '9', percent: 0.9, chapter: 'Nine' })
    const p = await db.progress.get('b')
    expect(p).toMatchObject({ location: '9', percent: 0.9, chapter: 'Nine' })
  })

  it('does not duplicate a bookmark at the same location', async () => {
    const a = await addBookmark({ bookId: 'b', location: 'x', label: 'X', percent: 0.2 })
    const b = await addBookmark({ bookId: 'b', location: 'x', label: 'X', percent: 0.2 })
    expect(b.id).toBe(a.id)
    await removeBookmark(a.id)
    expect(await db.bookmarks.count()).toBe(0)
  })

  it('records when a book was opened', async () => {
    const book = await addBook(pdfFile(), fakeExtract)
    await markOpened(book.id)
    expect((await db.books.get(book.id))?.lastOpenedAt).toBeTypeOf('number')
  })
})

describe('highlights', () => {
  const base = { bookId: 'b', location: 'cfi', text: 'some text', color: 'yellow' as const, percent: 0.5, chapter: 'One' }

  it('adds, updates and removes highlights', async () => {
    const h = await addHighlight(base)
    expect(h.note).toBe('')
    await updateHighlight(h.id, { color: 'blue', note: 'remember this' })
    const saved = await db.highlights.get(h.id)
    expect(saved).toMatchObject({ color: 'blue', note: 'remember this' })
    expect(saved!.updatedAt).toBeGreaterThanOrEqual(h.updatedAt)
    await removeHighlight(h.id)
    expect(await db.highlights.count()).toBe(0)
  })

  it('are deleted along with their book', async () => {
    const book = await addBook(pdfFile(), fakeExtract)
    await addHighlight({ ...base, bookId: book.id })
    await addHighlight({ ...base, bookId: 'other' })
    await deleteBook(book.id)
    expect(await db.highlights.count()).toBe(1)
  })

  it('sort in reading order', () => {
    const make = (percent: number, createdAt: number, text: string) =>
      ({ ...base, id: text, note: '', percent, createdAt, updatedAt: createdAt, text })
    const later = make(0.9, 1, 'later')
    const early = make(0.1, 2, 'early')
    const sameSpot = make(0.1, 3, 'same spot, made later')
    expect(sortHighlights([later, sameSpot, early]).map(h => h.text)).toEqual(['early', 'same spot, made later', 'later'])
  })
})

describe('settings', () => {
  it('returns defaults until settings are saved', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', fontSize: 120 })
    expect(await getSettings()).toMatchObject({ theme: 'dark', fontSize: 120 })
  })
})

describe('sortBooks and filterBooks', () => {
  const book = (over: Partial<Book>): Book => ({
    id: Math.random().toString(), title: '', author: '', format: 'epub', fileName: '',
    size: 0, cover: null, addedAt: 0, lastOpenedAt: null, ...over,
  })
  const books = [
    book({ title: 'beta', author: 'Zed', addedAt: 1, lastOpenedAt: 50 }),
    book({ title: 'Alpha', author: 'Amy', addedAt: 3 }),
    book({ title: 'gamma', author: 'Amy', addedAt: 2, lastOpenedAt: 10 }),
  ]

  it('sorts by title ignoring case', () => {
    expect(sortBooks(books, 'title').map(b => b.title)).toEqual(['Alpha', 'beta', 'gamma'])
  })

  it('sorts by author, then title', () => {
    expect(sortBooks(books, 'author').map(b => b.title)).toEqual(['Alpha', 'gamma', 'beta'])
  })

  it('sorts by most recently opened, using added date for unopened books', () => {
    expect(sortBooks(books, 'recent').map(b => b.title)).toEqual(['beta', 'gamma', 'Alpha'])
  })

  it('sorts by newest added', () => {
    expect(sortBooks(books, 'added').map(b => b.title)).toEqual(['Alpha', 'gamma', 'beta'])
  })

  it('filters by title or author', () => {
    expect(filterBooks(books, 'amy').map(b => b.title)).toEqual(['Alpha', 'gamma'])
    expect(filterBooks(books, '  BET ').map(b => b.title)).toEqual(['beta'])
    expect(filterBooks(books, '')).toHaveLength(3)
  })
})
