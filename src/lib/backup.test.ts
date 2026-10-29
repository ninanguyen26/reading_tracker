// @vitest-environment node
// Node has native Blob and File, which survive IndexedDB storage intact (jsdom's do not).
import { beforeEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { db } from './db'
import { addBook, addBookmark, addHighlight, saveProgress, saveSettings, DEFAULT_SETTINGS, updateHighlight } from './library'
import { backupFileName, createBackup, InvalidBackupError, restoreBackup } from './backup'

const fakeExtract = async (file: File) => ({ title: file.name, author: 'A', cover: new Blob(['img'], { type: 'image/jpeg' }) })
const clear = () => Promise.all(db.tables.map(t => t.clear()))
const blobText = (b: Blob) => b.text()

beforeEach(clear)

async function seed() {
  const book = await addBook(new File(['%PDF-1.4 one'], 'one.pdf', { type: 'application/pdf' }), fakeExtract)
  const other = await addBook(new File(['PK\u0003\u0004 two'], 'two.epub'), fakeExtract)
  await saveProgress({ bookId: book.id, location: '4', percent: 0.6, chapter: 'Four' })
  await addBookmark({ bookId: book.id, location: '2', label: 'Two', percent: 0.2 })
  const h = await addHighlight({ bookId: other.id, location: 'cfi', text: 'quote', color: 'pink', percent: 0.1, chapter: null })
  await updateHighlight(h.id, { note: 'my note' })
  await saveSettings({ ...DEFAULT_SETTINGS, theme: 'sepia' })
  return { book, other, highlight: h }
}

describe('backup and restore', () => {
  it('restores everything into an empty library', async () => {
    const { book, other, highlight } = await seed()
    const backup = await createBackup()
    await clear()

    const summary = await restoreBackup(backup)
    expect(summary).toEqual({ booksAdded: 2, booksSkipped: 0, highlightsAdded: 1, bookmarksAdded: 1 })

    const restored = await db.books.get(book.id)
    expect(restored).toMatchObject({ title: 'one.pdf', format: 'pdf' })
    expect(await blobText(restored!.cover!)).toBe('img')
    expect(restored!.cover!.type).toBe('image/jpeg')
    const file = (await db.files.get(book.id))!.blob
    expect(await blobText(file)).toBe('%PDF-1.4 one')
    expect(file.type).toBe('application/pdf')
    expect(await db.files.get(other.id)).toBeDefined()
    expect(await db.progress.get(book.id)).toMatchObject({ location: '4', percent: 0.6 })
    expect(await db.highlights.get(highlight.id)).toMatchObject({ note: 'my note', color: 'pink' })
    expect((await db.settings.get('reader'))?.value).toMatchObject({ theme: 'sepia' })
  })

  it('merges into an existing library without duplicating or losing newer data', async () => {
    const { book, highlight } = await seed()
    const backup = await createBackup()

    // After the backup, keep reading and editing on this device.
    await saveProgress({ bookId: book.id, location: '9', percent: 0.9, chapter: 'Nine' })
    await updateHighlight(highlight.id, { note: 'newer note' })
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })

    const summary = await restoreBackup(backup)
    expect(summary).toEqual({ booksAdded: 0, booksSkipped: 2, highlightsAdded: 0, bookmarksAdded: 0 })
    expect(await db.books.count()).toBe(2)
    expect(await db.progress.get(book.id)).toMatchObject({ location: '9' })
    expect(await db.highlights.get(highlight.id)).toMatchObject({ note: 'newer note' })
    expect((await db.settings.get('reader'))?.value).toMatchObject({ theme: 'dark' })
  })

  it('restores books that were deleted since the backup', async () => {
    const { book } = await seed()
    const backup = await createBackup()
    await db.books.delete(book.id)
    await db.files.delete(book.id)
    const summary = await restoreBackup(backup)
    expect(summary.booksAdded).toBe(1)
    expect(summary.booksSkipped).toBe(1)
    expect(await db.books.get(book.id)).toBeDefined()
  })

  it('rejects files that are not backups', async () => {
    await expect(restoreBackup(new Blob(['hello']))).rejects.toBeInstanceOf(InvalidBackupError)
    const otherZip = new Blob([zipSync({ 'readme.txt': strToU8('hi') })])
    await expect(restoreBackup(otherZip)).rejects.toThrow(/no backup.json/)
    const wrongFormat = new Blob([zipSync({ 'backup.json': strToU8('{"format":"something-else"}') })])
    await expect(restoreBackup(wrongFormat)).rejects.toThrow(/unknown format/)
    const newer = new Blob([zipSync({ 'backup.json': strToU8('{"format":"reading-tracker-backup","version":99}') })])
    await expect(restoreBackup(newer)).rejects.toThrow(/newer version/)
  })

  it('names backups by date', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('reading-tracker-backup-2026-01-05.zip')
  })
})
