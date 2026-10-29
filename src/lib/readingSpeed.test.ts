import { describe, expect, it } from 'vitest'
import { EMPTY_STATS, formatDuration, minutesLeft, readingRate, recordReading } from './readingSpeed'

const MINUTE = 60_000

describe('recordReading', () => {
  it('counts normal page turns', () => {
    const stats = recordReading(EMPTY_STATS, 'epub-bytes', 1200, MINUTE)
    expect(stats['epub-bytes']).toEqual({ units: 1200, ms: MINUTE })
    expect(stats['pdf-pages']).toEqual({ units: 0, ms: 0 })
  })

  it('ignores going back, jumps, quick flicks and long breaks', () => {
    const cases: [number, number][] = [
      [-1000, MINUTE], // went back
      [50_000, MINUTE], // jumped ahead via contents or slider
      [1200, 500], // flicked past
      [1200, 30 * MINUTE], // stepped away
      [1200 * 20, 2 * MINUTE], // skimming far faster than reading
    ]
    for (const [units, ms] of cases) {
      expect(recordReading(EMPTY_STATS, 'epub-bytes', units, ms)).toBe(EMPTY_STATS)
    }
    expect(recordReading(EMPTY_STATS, 'pdf-pages', 3, MINUTE)).toBe(EMPTY_STATS)
  })

  it('weights recent reading more', () => {
    let stats = EMPTY_STATS
    for (let i = 0; i < 200; i++) stats = recordReading(stats, 'pdf-pages', 1, 4 * MINUTE)
    for (let i = 0; i < 50; i++) stats = recordReading(stats, 'pdf-pages', 1, MINUTE)
    // Mostly slow reading overall, but the recent fast pages dominate.
    expect(readingRate(stats, 'pdf-pages')).toBeGreaterThan(0.6)
  })
})

describe('readingRate', () => {
  it('starts from the default', () => {
    expect(readingRate(EMPTY_STATS, 'epub-bytes')).toBe(1500)
    expect(readingRate(EMPTY_STATS, 'pdf-pages')).toBe(0.5)
  })

  it('blends toward your own speed as you read more', () => {
    const little = recordReading(EMPTY_STATS, 'pdf-pages', 1, 1.5 * MINUTE) // 0.67 pages/min, 1.5 min of data
    expect(readingRate(little, 'pdf-pages')).toBeCloseTo(0.5 * 0.9 + (1 / 1.5) * 0.1, 3)

    let lots = EMPTY_STATS
    for (let i = 0; i < 40; i++) lots = recordReading(lots, 'pdf-pages', 1, MINUTE)
    expect(readingRate(lots, 'pdf-pages')).toBeCloseTo(1, 3)
  })
})

describe('minutesLeft and formatDuration', () => {
  it('estimates and formats the time left', () => {
    expect(minutesLeft(EMPTY_STATS, 'epub-bytes', 15_000)).toBe(10)
    expect(minutesLeft(EMPTY_STATS, 'pdf-pages', -3)).toBe(0)
    expect(formatDuration(0.4)).toBe('Less than a minute')
    expect(formatDuration(12.4)).toBe('12 min')
    expect(formatDuration(65)).toBe('1 h 5 min')
    expect(formatDuration(180)).toBe('3 h')
  })
})
