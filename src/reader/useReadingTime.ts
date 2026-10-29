import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getReadingStats, saveReadingStats } from '../lib/library'
import { EMPTY_STATS, minutesLeft, recordReading, type ReadingStats } from '../lib/readingSpeed'
import type { ReaderLocation, ReadingUnit } from './types'

/**
 * Learns how fast you read from your page turns, and estimates the minutes
 * left in the current chapter and book.
 */
export function useReadingTime(location: ReaderLocation | null) {
  const [stats, setStats] = useState<ReadingStats>(EMPTY_STATS)
  const last = useRef<{ unit: ReadingUnit; position: number; time: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    getReadingStats().then(s => !cancelled && setStats(s))
    return () => { cancelled = true }
  }, [])

  // Time spent with the page hidden isn't reading: start measuring afresh.
  useEffect(() => {
    const onVisibility = () => { last.current = null }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const remaining = location?.remaining
  // A layout effect timestamps the page turn before the new page is painted.
  useLayoutEffect(() => {
    if (!remaining) return
    const now = Date.now()
    const prev = last.current
    last.current = { unit: remaining.unit, position: remaining.position, time: now }
    if (!prev || prev.unit !== remaining.unit) return
    setStats(current => {
      const next = recordReading(current, remaining.unit, remaining.position - prev.position, now - prev.time)
      if (next !== current) saveReadingStats(next)
      return next
    })
  }, [remaining])

  if (!remaining) return null
  return {
    chapter: minutesLeft(stats, remaining.unit, remaining.chapter),
    book: minutesLeft(stats, remaining.unit, remaining.book),
  }
}
