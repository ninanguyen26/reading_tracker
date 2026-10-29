import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Book, Collection } from '../lib/db'
import BookCover from './BookCover'
import InlineNameForm from './InlineNameForm'
import { MoreIcon, PlusIcon, TrashIcon } from './icons'

interface Props {
  book: Book
  percent: number | undefined
  shelves: Collection[]
  onToggleShelf: (book: Book, shelfId: string, onShelf: boolean) => void
  /** Creates a shelf and puts this book on it */
  onCreateShelf: (book: Book, name: string) => void
  onDelete: (book: Book) => void
}

export default function BookCard({ book, percent, shelves, onToggleShelf, onCreateShelf, onDelete }: Props) {
  const [menu, setMenu] = useState<'closed' | 'open' | 'new-shelf' | 'confirm'>('closed')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menu === 'closed') return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu('closed')
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu('closed')
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
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
            <div role="menu" aria-label={`Options for ${book.title}`} className="absolute top-full right-0 z-20 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
              {menu === 'open' || menu === 'new-shelf' ? (
                <>
                  <p className="px-2 pt-0.5 pb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">Shelves</p>
                  {shelves.map(shelf => {
                    const on = !!book.collectionIds?.includes(shelf.id)
                    return (
                      <button
                        key={shelf.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        onClick={() => onToggleShelf(book, shelf.id, !on)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        <span className={`flex size-4 items-center justify-center rounded border text-[10px] ${on ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-400'}`}>
                          {on ? '✓' : ''}
                        </span>
                        <span className="truncate">{shelf.name}</span>
                      </button>
                    )
                  })}
                  {menu === 'new-shelf' ? (
                    <InlineNameForm
                      className="px-1 py-1"
                      placeholder="Shelf name"
                      label="New shelf name"
                      onSubmit={name => { onCreateShelf(book, name); setMenu('open') }}
                      onCancel={() => setMenu('open')}
                    />
                  ) : (
                    <button type="button" role="menuitem" onClick={() => setMenu('new-shelf')}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800">
                      <PlusIcon size={16} /> New shelf…
                    </button>
                  )}
                  <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setMenu('confirm')}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <TrashIcon size={16} /> Delete book
                  </button>
                </>
              ) : (
                <div className="p-1">
                  <p className="mb-2 text-stone-700 dark:text-stone-300">
                    Delete this book with its progress, bookmarks and highlights?
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
