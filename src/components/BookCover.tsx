import type { Book } from '../lib/db'
import { useObjectUrl } from '../hooks/useObjectUrl'

// Muted colors for books without a cover image, picked from the title so each book keeps its color.
const PALETTE = ['#4b5d67', '#7a5c58', '#5b6e4f', '#6a5a7b', '#8a6d3b', '#3f5f7f', '#7b4f5e', '#55707a']

function colorFor(text: string) {
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export default function BookCover({ book }: { book: Book }) {
  const url = useObjectUrl(book.cover)
  if (url) {
    return <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
  }
  return (
    <div
      className="flex h-full w-full flex-col justify-between p-3 text-white"
      style={{ background: colorFor(book.title) }}
    >
      <p className="line-clamp-5 font-serif text-base leading-snug font-semibold">{book.title}</p>
      <p className="line-clamp-2 text-xs opacity-80">{book.author}</p>
    </div>
  )
}
