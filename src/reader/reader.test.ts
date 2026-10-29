import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../lib/library'
import { buildEpubCss } from './epubStyles'
import { singleWord, tapZone } from './selection'
import { pageToPercent } from './pdfProgress'

describe('singleWord', () => {
  it('trims punctuation around a single word', () => {
    expect(singleWord('  “Lighthouse,” ')).toBe('Lighthouse')
    expect(singleWord("keeper's")).toBe("keeper's")
    expect(singleWord('café')).toBe('café')
  })

  it('ignores empty and multi-word selections', () => {
    expect(singleWord('')).toBeNull()
    expect(singleWord('...')).toBeNull()
    expect(singleWord('two words')).toBeNull()
    expect(singleWord(null)).toBeNull()
  })
})

describe('tapZone', () => {
  it('splits the width into left, middle and right', () => {
    expect(tapZone(10, 1000)).toBe('left')
    expect(tapZone(500, 1000)).toBe('middle')
    expect(tapZone(950, 1000)).toBe('right')
  })
})

describe('pageToPercent', () => {
  it('maps the first page to 0 and the last to 1', () => {
    expect(pageToPercent(1, 6)).toBe(0)
    expect(pageToPercent(6, 6)).toBe(1)
    expect(pageToPercent(3, 6)).toBeCloseTo(0.4)
    expect(pageToPercent(1, 1)).toBe(1)
  })
})

describe('buildEpubCss', () => {
  it('applies size, spacing and theme colors', () => {
    const css = buildEpubCss({ ...DEFAULT_SETTINGS, fontSize: 130, lineHeight: 1.8, theme: 'dark' })
    expect(css).toContain('font-size: 130% !important')
    expect(css).toContain('line-height: 1.8 !important')
    expect(css).toContain('color-scheme: dark')
    expect(css).toContain('color: inherit !important')
  })

  it("keeps the book's own fonts and colors by default", () => {
    const css = buildEpubCss(DEFAULT_SETTINGS)
    expect(css).not.toContain('font-family')
    expect(css).not.toContain('color: inherit')
  })

  it('overrides fonts when a family is chosen', () => {
    expect(buildEpubCss({ ...DEFAULT_SETTINGS, fontFamily: 'sans' })).toContain('system-ui')
  })
})
