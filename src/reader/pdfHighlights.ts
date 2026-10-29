import type { PageRect } from '../lib/db'

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Converts a selection's client rectangles into fractions of the page box,
 * dropping empty rectangles and joining pieces that sit next to each other on
 * the same line (pdf.js splits lines into many spans).
 */
export function toPageRects(clientRects: Iterable<Box>, page: Box): PageRect[] {
  const rects = Array.from(clientRects)
    .filter(r => r.width > 0.5 && r.height > 0.5)
    .map(r => {
      const left = Math.max(r.left, page.left)
      const top = Math.max(r.top, page.top)
      const right = Math.min(r.left + r.width, page.left + page.width)
      const bottom = Math.min(r.top + r.height, page.top + page.height)
      return { x: (left - page.left) / page.width, y: (top - page.top) / page.height, w: (right - left) / page.width, h: (bottom - top) / page.height }
    })
    .filter(r => r.w > 0 && r.h > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const merged: PageRect[] = []
  for (const r of rects) {
    const last = merged.at(-1)
    const sameLine = last && Math.abs(last.y - r.y) < Math.min(last.h, r.h) / 2
    const touching = last && r.x <= last.x + last.w + 0.01
    if (last && sameLine && touching) {
      const right = Math.max(last.x + last.w, r.x + r.w)
      const top = Math.min(last.y, r.y)
      const bottom = Math.max(last.y + last.h, r.y + r.h)
      last.w = right - last.x
      last.y = top
      last.h = bottom - top
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

/** Whether a point, given as fractions of the page size, falls inside any of the rectangles. */
export function hitsRects(rects: PageRect[], x: number, y: number): boolean {
  return rects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}
