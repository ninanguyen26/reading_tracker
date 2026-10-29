import type { HighlightColor } from '../lib/db'

export const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; fill: string }> = {
  yellow: { label: 'Yellow', fill: '#facc15' },
  green: { label: 'Green', fill: '#4ade80' },
  blue: { label: 'Blue', fill: '#60a5fa' },
  pink: { label: 'Pink', fill: '#f472b6' },
}

export const HIGHLIGHT_COLOR_KEYS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]
