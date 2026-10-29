import type { ReadingUnit } from '../reader/types'

/** Reading time and amount, with older reading counting less over time. */
export interface SpeedSample {
  units: number
  ms: number
}

export type ReadingStats = Record<ReadingUnit, SpeedSample>

export const EMPTY_STATS: ReadingStats = {
  'epub-bytes': { units: 0, ms: 0 },
  'pdf-pages': { units: 0, ms: 0 },
}

const MINUTE = 60_000

// Starting estimates until there's enough of your own reading to go on:
// about 250 words a minute for books, and two minutes per PDF page.
const DEFAULT_PER_MINUTE: Record<ReadingUnit, number> = {
  'epub-bytes': 1500,
  'pdf-pages': 0.5,
}

// A page turn only counts as reading if it took a plausible amount of time
// and moved forward by about a page, not a jump via the contents or slider.
const MIN_MS = 1500
const MAX_MS = 10 * MINUTE
const MAX_STEP: Record<ReadingUnit, number> = {
  'epub-bytes': 8000,
  'pdf-pages': 1,
}
// Ignore skimming much faster than anyone reads.
const MAX_SPEEDUP = 8
// Each new page turn makes earlier reading count a little less.
const DECAY = 0.97
// How much of your own reading it takes before trusting it fully.
const FULL_CONFIDENCE_MS = 15 * MINUTE

/** Adds one page turn to the stats, or returns them unchanged if it doesn't look like reading. */
export function recordReading(stats: ReadingStats, unit: ReadingUnit, units: number, ms: number): ReadingStats {
  if (units <= 0 || units > MAX_STEP[unit] || ms < MIN_MS || ms > MAX_MS) return stats
  const perMinute = (units / ms) * MINUTE
  if (perMinute > DEFAULT_PER_MINUTE[unit] * MAX_SPEEDUP) return stats
  const prev = stats[unit]
  return { ...stats, [unit]: { units: prev.units * DECAY + units, ms: prev.ms * DECAY + ms } }
}

/** Units read per minute: your measured speed, blended with the default until there's enough data. */
export function readingRate(stats: ReadingStats, unit: ReadingUnit): number {
  const { units, ms } = stats[unit]
  const fallback = DEFAULT_PER_MINUTE[unit]
  if (!ms || !units) return fallback
  const measured = (units / ms) * MINUTE
  const confidence = Math.min(1, ms / FULL_CONFIDENCE_MS)
  return measured * confidence + fallback * (1 - confidence)
}

export function minutesLeft(stats: ReadingStats, unit: ReadingUnit, units: number): number {
  return Math.max(0, units) / readingRate(stats, unit)
}

/** "Less than a minute", "12 min", "1 h 5 min", "3 h" */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'Less than a minute'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}
