import { describe, expect, it } from 'vitest'
import type { Book, Highlight } from './db'
import { filterHighlights, groupByBook } from './notesFilter'

const book = (id: string, title: string, author = 'Someone'): Book => ({
  id, title, author, format: 'epub', fileName: '', size: 0, cover: null, addedAt: 0, lastOpenedAt: null,
})
const h = (over: Partial<Highlight>): Highlight => ({
  id: Math.random().toString(), bookId: 'a', location: '', text: '', color: 'yellow', note: '',
  percent: 0, chapter: null, createdAt: 0, updatedAt: 0, ...over,
})
const books = new Map([['a', book('a', 'Alpha', 'Ann Lee')], ['b', book('b', 'Beta')]])

describe('filterHighlights', () => {
  const list = [
    h({ id: '1', bookId: 'a', text: 'The lamp turned', color: 'yellow' }),
    h({ id: '2', bookId: 'a', text: 'Fog rolled in', note: 'about weather', color: 'blue' }),
    h({ id: '3', bookId: 'b', text: 'A letter', color: 'blue' }),
    h({ id: '4', bookId: 'gone', text: 'From a deleted book' }),
  ]
  const ids = (q: string, color: 'all' | 'blue' = 'all') => filterHighlights(list, books, { query: q, color }).map(x => x.id)

  it('drops highlights whose book was deleted', () => {
    expect(ids('')).toEqual(['1', '2', '3'])
  })
  it('matches quote, note, title and author, ignoring case', () => {
    expect(ids('LAMP')).toEqual(['1'])
    expect(ids('weather')).toEqual(['2'])
    expect(ids('beta')).toEqual(['3'])
    expect(ids('ann lee')).toEqual(['1', '2'])
  })
  it('filters by color', () => {
    expect(ids('', 'blue')).toEqual(['2', '3'])
    expect(ids('fog', 'blue')).toEqual(['2'])
  })
})

describe('groupByBook', () => {
  it('orders books by latest highlight and highlights by position', () => {
    const groups = groupByBook([
      h({ id: 'a-late', bookId: 'a', percent: 0.9, createdAt: 1 }),
      h({ id: 'b1', bookId: 'b', percent: 0.5, createdAt: 5 }),
      h({ id: 'a-early', bookId: 'a', percent: 0.1, createdAt: 2 }),
    ], books)
    expect(groups.map(g => g.book.id)).toEqual(['b', 'a'])
    expect(groups[1].highlights.map(x => x.id)).toEqual(['a-early', 'a-late'])
  })
})
