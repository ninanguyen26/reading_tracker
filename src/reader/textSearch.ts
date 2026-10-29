const CONTEXT = 40

// Lowercase and strip accents one character at a time, so positions in the
// folded text line up with the original.
const fold = (text: string) =>
  Array.from(text, ch => ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().charAt(0) || ch).join('')

/**
 * Finds every case- and accent-insensitive occurrence of `query` in `text`,
 * with some surrounding words for context.
 */
export function findMatches(text: string, query: string): { pre: string; match: string; post: string }[] {
  const needle = fold(query.trim())
  if (!needle) return []
  const chars = Array.from(text)
  const haystack = fold(text)
  const results = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    const end = at + needle.length
    const start = Math.max(0, at - CONTEXT)
    const stop = Math.min(chars.length, end + CONTEXT)
    results.push({
      pre: trimStart(chars.slice(start, at).join(''), start > 0),
      match: chars.slice(at, end).join(''),
      post: trimEnd(chars.slice(end, stop).join(''), stop < chars.length),
    })
    from = end
  }
  return results
}

/** Whether `text` contains `query`, ignoring case and accents. */
export function containsQuery(text: string, query: string): boolean {
  const needle = fold(query.trim())
  return !!needle && fold(text).includes(needle)
}

// Collapse whitespace and, where the text was cut, drop the partial word and add an ellipsis.
const tidy = (s: string) => s.replace(/\s+/g, ' ')
const trimStart = (s: string, cut: boolean) => {
  const t = tidy(s)
  if (!cut) return t
  const space = t.indexOf(' ')
  return '…' + (space >= 0 ? t.slice(space) : t)
}
const trimEnd = (s: string, cut: boolean) => {
  const t = tidy(s)
  if (!cut) return t
  const space = t.lastIndexOf(' ')
  return (space >= 0 ? t.slice(0, space) : t) + '…'
}
