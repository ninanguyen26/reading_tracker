import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Book } from '../lib/db'
import BookCover from './BookCover'
import { MoreIcon, TrashIcon } from './icons'

interface Props {
  book: Book
  percent: number | undefined
  onDelete: (book: Book) => void
}

export default function BookCard({ book, percent, onDelete }: Props) {
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menu === 'closed') return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu('closed')
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  const started = percent !== undefined && percent > 0
  const finished = percent !== undefined && percent >= 0.995

  return (
    <article className="group relative flex flex-col" data-testid="book-card">
      <Link
        to={`/read/${book.id}`}
        className="block overflow-hidden rounded-md bg-stone-200 shadow-sm ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-800 dark:ring-white/10"
        aria-label={`Read ${book.title}`}
      >
        <div className="relative aspect-[2/3]">
          <BookCover book={book} />
          <span className="absolute top-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
            {book.format}
          </span>
        </div>
      </Link>

      <div className="mt-2 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium" title={book.title}>{book.title}</h3>
          <p className="truncate text-xs text-stone-500 dark:text-stone-400">{book.author}</p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu(m => (m === 'closed' ? 'open' : 'closed'))}
            className="-mr-1.5 rounded p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            aria-label={`Options for ${book.title}`}
            aria-expanded={menu !== 'closed'}
          >
            <MoreIcon size={18} />
          </button>
          {menu !== 'closed' && (
            <div className="absolute right-0 bottom-full z-20 mb-1 w-52 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
              {menu === 'open' ? (
                <button
                  type="button"
                  onClick={() => setMenu('confirm')}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  <TrashIcon size={16} /> Delete book
                </button>
              ) : (
                <div className="p-1">
                  <p className="mb-2 text-stone-700 dark:text-stone-300">
                    Delete this book, its progress and bookmarks?
                  </p>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setMenu('closed')} className="rounded px-2 py-1 hover:bg-stone-100 dark:hover:bg-stone-800">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenu('closed'); onDelete(book) }}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2" aria-label="Reading progress">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.round((percent ?? 0) * 100)}%` }} />
        </div>
        <span className="w-9 text-right text-[11px] text-stone-500 tabular-nums dark:text-stone-400">
          {finished ? 'Done' : started ? `${Math.round(percent * 100)}%` : 'New'}
        </span>
      </div>
    </article>
  )
}
