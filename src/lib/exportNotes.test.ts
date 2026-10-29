import { describe, expect, it } from 'vitest'
import type { Highlight } from './db'
import { buildNotesMarkdown, notesFileName } from './exportNotes'

const h = (over: Partial<Highlight>): Highlight => ({
  id: Math.random().toString(), bookId: 'b', location: '', text: '', color: 'yellow', note: '',
  percent: 0, chapter: null, createdAt: 0, updatedAt: 0, ...over,
})

describe('buildNotesMarkdown', () => {
  it('groups highlights by chapter in reading order, with notes', () => {
    const md = buildNotesMarkdown({ title: 'The Book', author: 'Ann' }, [
      h({ text: 'Third', percent: 0.8, chapter: 'Two' }),
      h({ text: 'First', percent: 0.1, chapter: 'One', note: 'Nice line' }),
      h({ text: 'Second\nline two', percent: 0.2, chapter: 'One' }),
    ])
    expect(md).toBe([
      '# The Book', '', '*Ann*', '',
      '## One', '',
      '> First', '', '**Note:** Nice line', '',
      '> Second', '> line two', '',
      '## Two', '',
      '> Third', '',
    ].join('\n'))
  })

  it('says when there are no highlights', () => {
    expect(buildNotesMarkdown({ title: 'T', author: 'A' }, [])).toContain('No highlights yet.')
  })
})

describe('notesFileName', () => {
  it('removes characters that are not allowed in file names', () => {
    expect(notesFileName('What? A/B: "Story"')).toBe('What AB Story - notes.md')
    expect(notesFileName('???')).toBe('Book - notes.md')
  })
})
