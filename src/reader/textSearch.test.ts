import { describe, expect, it } from 'vitest'
import { containsQuery, findMatches } from './textSearch'

describe('findMatches', () => {
  it('finds every match, ignoring case and accents', () => {
    const matches = findMatches('Café and CAFE and cafe', 'cafe')
    expect(matches.map(m => m.match)).toEqual(['Café', 'CAFE', 'cafe'])
  })

  it('keeps nearby words as context, cut at word boundaries', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve TARGET thirteen fourteen fifteen sixteen seventeen eighteen nineteen'
    const [m] = findMatches(text, 'target')
    expect(m.match).toBe('TARGET')
    expect(m.pre.startsWith('…')).toBe(true)
    expect(m.pre.endsWith('twelve ')).toBe(true)
    expect(m.post.startsWith(' thirteen')).toBe(true)
    expect(m.post.endsWith('…')).toBe(true)
  })

  it('collapses line breaks in excerpts', () => {
    expect(findMatches('end of line\nnext word', 'next')[0].pre).toBe('end of line ')
  })

  it('returns nothing for an empty query', () => {
    expect(findMatches('anything', '  ')).toEqual([])
  })
})

describe('containsQuery', () => {
  it('matches ignoring case and accents', () => {
    expect(containsQuery('Résumé writing', 'resume')).toBe(true)
    expect(containsQuery('nothing here', 'resume')).toBe(false)
    expect(containsQuery('anything', '')).toBe(false)
  })
})
