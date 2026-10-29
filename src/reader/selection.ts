/**
 * Returns the selected text as a single dictionary-ready word, or null if the
 * selection is empty or spans more than one word.
 */
export function singleWord(text: string | null | undefined): string | null {
  if (!text) return null
  const word = text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!word || /\s/.test(word) || word.length > 40) return null
  return word
}

/** Splits a tap's horizontal position into left (30%), middle and right (30%) zones. */
export function tapZone(x: number, width: number): 'left' | 'middle' | 'right' {
  const ratio = x / width
  if (ratio < 0.3) return 'left'
  if (ratio > 0.7) return 'right'
  return 'middle'
}
