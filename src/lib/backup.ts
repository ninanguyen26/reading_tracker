import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db, type Book, type Bookmark, type Collection, type Highlight, type Progress, type ReaderSettings } from './db'
import type { ReadingStats } from './readingSpeed'

/**
 * A backup is a zip file holding:
 *   backup.json      library data (books without their files, progress, bookmarks, highlights, settings)
 *   files/<bookId>   each book file
 *   covers/<bookId>  each cover image
 */
const MANIFEST = 'backup.json'
const FORMAT = 'reading-tracker-backup'
const VERSION = 1

interface BackupBook extends Omit<Book, 'cover'> {
  fileType: string
  coverType: string | null
}

interface Manifest {
  format: typeof FORMAT
  version: number
  exportedAt: number
  books: BackupBook[]
  progress: Progress[]
  bookmarks: Bookmark[]
  highlights: Highlight[]
  /** Added after the first backup format; older backups have none. */
  collections?: Collection[]
  settings?: ReaderSettings
  readingStats?: ReadingStats
}

export interface RestoreSummary {
  booksAdded: number
  booksSkipped: number
  highlightsAdded: number
  bookmarksAdded: number
}

export class InvalidBackupError extends Error {
  constructor(reason: string) {
    super(`This isn't a Reading Tracker backup (${reason}).`)
    this.name = 'InvalidBackupError'
  }
}

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

export async function createBackup(): Promise<Blob> {
  const [books, files, progress, bookmarks, highlights, collections, settings, stats] = await Promise.all([
    db.books.toArray(), db.files.toArray(), db.progress.toArray(), db.bookmarks.toArray(),
    db.highlights.toArray(), db.collections.toArray(), db.settings.get('reader'), db.settings.get('reading-stats'),
  ])
  const fileById = new Map(files.map(f => [f.bookId, f.blob]))
  // Books and covers are already compressed, so store them as-is: much faster, barely bigger.
  const zip: Zippable = {}
  const manifestBooks: BackupBook[] = []
  for (const { cover, ...book } of books) {
    const file = fileById.get(book.id)
    if (!file) continue
    zip[`files/${book.id}`] = [await bytes(file), { level: 0 }]
    if (cover) zip[`covers/${book.id}`] = [await bytes(cover), { level: 0 }]
    manifestBooks.push({ ...book, fileType: file.type, coverType: cover?.type ?? null })
  }
  const manifest: Manifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    books: manifestBooks,
    progress,
    bookmarks,
    highlights,
    collections,
    settings: settings?.key === 'reader' ? settings.value : undefined,
    readingStats: stats?.key === 'reading-stats' ? stats.value : undefined,
  }
  zip[MANIFEST] = strToU8(JSON.stringify(manifest))
  return new Blob([zipSync(zip)], { type: 'application/zip' })
}

function readManifest(entries: Record<string, Uint8Array>): Manifest {
  const raw = entries[MANIFEST]
  if (!raw) throw new InvalidBackupError(`no ${MANIFEST}`)
  let manifest: Manifest
  try {
    manifest = JSON.parse(strFromU8(raw))
  } catch {
    throw new InvalidBackupError(`${MANIFEST} is damaged`)
  }
  if (manifest?.format !== FORMAT) throw new InvalidBackupError('unknown format')
  if (manifest.version > VERSION) throw new InvalidBackupError('made by a newer version of the app')
  return manifest
}

/**
 * Adds everything in a backup to the library. Nothing is deleted or
 * overwritten except older copies: books already in the library are kept,
 * and reading positions and highlights are only replaced by newer versions.
 */
export async function restoreBackup(file: Blob): Promise<RestoreSummary> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(await bytes(file))
  } catch {
    throw new InvalidBackupError('not a zip file')
  }
  const manifest = readManifest(entries)
  const summary: RestoreSummary = { booksAdded: 0, booksSkipped: 0, highlightsAdded: 0, bookmarksAdded: 0 }

  await db.transaction('rw', [db.books, db.files, db.progress, db.bookmarks, db.highlights, db.collections, db.settings], async () => {
    for (const c of manifest.collections ?? []) {
      if (!(await db.collections.get(c.id))) await db.collections.add(c)
    }
    for (const { fileType, coverType, ...book } of manifest.books) {
      const data = entries[`files/${book.id}`]
      if (!data) continue
      const existing = await db.books.get(book.id)
      if (existing) {
        // Keep the book, but add it to any shelves it was on in the backup.
        const shelves = new Set([...(existing.collectionIds ?? []), ...(book.collectionIds ?? [])])
        if (shelves.size !== (existing.collectionIds ?? []).length) await db.books.update(book.id, { collectionIds: [...shelves] })
        summary.booksSkipped++
        continue
      }
      const cover = entries[`covers/${book.id}`]
      await db.books.add({ ...book, cover: cover ? new Blob([cover], { type: coverType ?? '' }) : null })
      await db.files.add({ bookId: book.id, blob: new Blob([data], { type: fileType }) })
      summary.booksAdded++
    }

    for (const p of manifest.progress) {
      const existing = await db.progress.get(p.bookId)
      if (!existing || existing.updatedAt < p.updatedAt) await db.progress.put(p)
    }
    for (const b of manifest.bookmarks) {
      if (await db.bookmarks.get(b.id)) continue
      await db.bookmarks.add(b)
      summary.bookmarksAdded++
    }
    for (const h of manifest.highlights) {
      const existing = await db.highlights.get(h.id)
      if (!existing) summary.highlightsAdded++
      if (!existing || existing.updatedAt < h.updatedAt) await db.highlights.put(h)
    }
    // Keep this device's own settings and reading speed if it already has them.
    if (manifest.settings && !(await db.settings.get('reader'))) {
      await db.settings.put({ key: 'reader', value: manifest.settings })
    }
    if (manifest.readingStats && !(await db.settings.get('reading-stats'))) {
      await db.settings.put({ key: 'reading-stats', value: manifest.readingStats })
    }
  })
  return summary
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `reading-tracker-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`
}
