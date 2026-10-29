import type { Book, Highlight, HighlightColor } from './db'
import { sortHighlights } from './library'

export interface NotesFilter {
  query: string
  color: HighlightColor | 'all'
}

export interface BookNotes {
  book: Book
  highlights: Highlight[]
}

/** Highlights matching the filter: the query can be in the quote, the note, or the book's title or author. */
export function filterHighlights(highlights: Highlight[], books: Map<string, Book>, { query, color }: NotesFilter): Highlight[] {
  const q = query.trim().toLowerCase()
  return highlights.filter(h => {
    const book = books.get(h.bookId)
    if (!book) return false
    if (color !== 'all' && h.color !== color) return false
    if (!q) return true
    return [h.text, h.note, book.title, book.author].some(s => s.toLowerCase().includes(q))
  })
}

/** Groups highlights by book, books ordered by their most recent highlight, highlights in reading order. */
export function groupByBook(highlights: Highlight[], books: Map<string, Book>): BookNotes[] {
  const groups = new Map<string, Highlight[]>()
  for (const h of highlights) {
    const list = groups.get(h.bookId)
    if (list) list.push(h)
    else groups.set(h.bookId, [h])
  }
  const latest = (list: Highlight[]) => Math.max(...list.map(h => h.createdAt))
  return [...groups.entries()]
    .filter(([id]) => books.has(id))
    .sort(([, a], [, b]) => latest(b) - latest(a))
    .map(([id, list]) => ({ book: books.get(id)!, highlights: sortHighlights(list) }))
}
