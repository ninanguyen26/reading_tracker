import { describe, expect, it } from 'vitest'
import { detectFormat, formatContributors, titleFromFileName } from './metadata'

describe('detectFormat', () => {
  it('uses file signatures before extensions', async () => {
    expect(await detectFormat(new File(['%PDF-1.7'], 'mislabeled.epub'))).toBe('pdf')
    expect(await detectFormat(new File(['PK\u0003\u0004'], 'book.zip'))).toBe('epub')
  })

  it('falls back to the extension', async () => {
    expect(await detectFormat(new File(['??'], 'Book.EPUB'))).toBe('epub')
    expect(await detectFormat(new File(['??'], 'notes.txt'))).toBeNull()
  })
})

describe('titleFromFileName', () => {
  it('drops the extension and separators', () => {
    expect(titleFromFileName('my_great-book.epub')).toBe('my great book')
    expect(titleFromFileName('.pdf')).toBe('Untitled')
  })
})

describe('formatContributors', () => {
  it('handles strings, language maps and lists', () => {
    expect(formatContributors('Ann')).toBe('Ann')
    expect(formatContributors({ name: { en: 'Bo' } })).toBe('Bo')
    expect(formatContributors(['Ann', { name: 'Cy' }])).toBe('Ann, Cy')
    expect(formatContributors(undefined)).toBe('')
  })
})
