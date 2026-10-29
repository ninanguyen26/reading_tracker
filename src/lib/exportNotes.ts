import type { Book, Highlight } from './db'
import { sortHighlights } from './library'

type BookInfo = Pick<Book, 'title' | 'author'>

/** One book's highlights, grouped by chapter in reading order. `depth` is the book heading level. */
function bookSection(book: BookInfo, highlights: Highlight[], depth: number): string[] {
  const lines = [`${'#'.repeat(depth)} ${book.title}`, '', `*${book.author}*`, '']
  let chapter: string | null | undefined
  for (const h of sortHighlights(highlights)) {
    if (h.chapter !== chapter) {
      chapter = h.chapter
      if (chapter) lines.push(`${'#'.repeat(depth + 1)} ${chapter}`, '')
    }
    lines.push(...h.text.trim().split(/\n+/).map(line => `> ${line}`))
    if (h.note.trim()) lines.push('', `**Note:** ${h.note.trim()}`)
    lines.push('')
  }
  if (!highlights.length) lines.push('No highlights yet.', '')
  return lines
}

/** Highlights and notes as Markdown, grouped by chapter in reading order. */
export function buildNotesMarkdown(book: BookInfo, highlights: Highlight[]): string {
  return bookSection(book, highlights, 1).join('\n')
}

/** Every book's highlights in one document, books in the given order. */
export function buildAllNotesMarkdown(books: (BookInfo & { id: string })[], highlights: Highlight[]): string {
  const lines = ['# Reading notes', '']
  for (const book of books) {
    const own = highlights.filter(h => h.bookId === book.id)
    if (own.length) lines.push(...bookSection(book, own, 2))
  }
  if (lines.length === 2) lines.push('No highlights yet.', '')
  return lines.join('\n')
}

export function notesFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Book'
  return `${safe} - notes.md`
}

export function downloadMarkdown(fileName: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadNotes(book: BookInfo, highlights: Highlight[]) {
  downloadMarkdown(notesFileName(book.title), buildNotesMarkdown(book, highlights))
}
