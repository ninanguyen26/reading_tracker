import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'

describe('database upgrade', () => {
  it('keeps v1 books, progress and bookmarks when adding highlights', async () => {
    // Create the database exactly as v1 of the app did.
    const v1 = new Dexie('reading-tracker')
    v1.version(1).stores({
      books: 'id, title, author, addedAt, lastOpenedAt',
      files: 'bookId',
      progress: 'bookId',
      bookmarks: 'id, bookId, createdAt',
      settings: 'key',
    })
    await v1.table('books').add({ id: 'old', title: 'Old Book', author: 'A', addedAt: 1, lastOpenedAt: null })
    await v1.table('progress').add({ bookId: 'old', location: '3', percent: 0.4, chapter: null, updatedAt: 1 })
    await v1.table('bookmarks').add({ id: 'bm', bookId: 'old', location: '3', label: 'x', percent: 0.4, createdAt: 1 })
    v1.close()

    const { db } = await import('./db')
    await db.open()
    expect(db.verno).toBe(2)
    expect(await db.books.get('old')).toMatchObject({ title: 'Old Book' })
    expect(await db.progress.get('old')).toMatchObject({ percent: 0.4 })
    expect(await db.bookmarks.count()).toBe(1)
    expect(await db.highlights.count()).toBe(0)
  })
})
