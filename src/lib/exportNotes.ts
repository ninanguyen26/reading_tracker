import type { Book, Highlight } from './db'
import { sortHighlights } from './library'

/** Highlights and notes as Markdown, grouped by chapter in reading order. */
export function buildNotesMarkdown(book: Pick<Book, 'title' | 'author'>, highlights: Highlight[]): string {
  const lines = [`# ${book.title}`, '', `*${book.author}*`, '']
  let chapter: string | null | undefined
  for (const h of sortHighlights(highlights)) {
    if (h.chapter !== chapter) {
      chapter = h.chapter
      if (chapter) lines.push(`## ${chapter}`, '')
    }
    lines.push(...h.text.trim().split(/\n+/).map(line => `> ${line}`))
    if (h.note.trim()) lines.push('', `**Note:** ${h.note.trim()}`)
    lines.push('')
  }
  if (!highlights.length) lines.push('No highlights yet.', '')
  return lines.join('\n')
}

export function notesFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Book'
  return `${safe} - notes.md`
}

export function downloadNotes(book: Pick<Book, 'title' | 'author'>, highlights: Highlight[]) {
  const blob = new Blob([buildNotesMarkdown(book, highlights)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = notesFileName(book.title)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
