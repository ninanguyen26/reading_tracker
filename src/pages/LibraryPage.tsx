import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Book } from '../lib/db'
import { addBook, deleteBook, filterBooks, sortBooks, type SortKey } from '../lib/library'
import BookCard from '../components/BookCard'
import { CloseIcon, PlusIcon, SearchIcon, UploadIcon } from '../components/icons'

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recently read',
  added: 'Recently added',
  title: 'Title',
  author: 'Author',
}
const SORT_STORAGE_KEY = 'library-sort'

function loadSort(): SortKey {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY)
    if (saved && saved in SORT_LABELS) return saved as SortKey
  } catch { /* storage unavailable */ }
  return 'recent'
}

export default function LibraryPage() {
  const books = useLiveQuery(() => db.books.toArray())
  const progress = useLiveQuery(() => db.progress.toArray())
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>(loadSort)
  const [uploading, setUploading] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const percentById = useMemo(
    () => new Map(progress?.map(p => [p.bookId, p.percent])),
    [progress],
  )
  const visible = useMemo(
    () => sortBooks(filterBooks(books ?? [], query), sort),
    [books, query, sort],
  )

  const changeSort = (key: SortKey) => {
    setSort(key)
    try { localStorage.setItem(SORT_STORAGE_KEY, key) } catch { /* ignore */ }
  }

  const handleFiles = async (files: Iterable<File>) => {
    for (const file of files) {
      setUploading(u => [...u, file.name])
      try {
        await addBook(file)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setErrors(e => [...e, message])
      } finally {
        setUploading(u => u.filter(name => name !== file.name))
      }
    }
  }

  // Accept files dropped anywhere on the page.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      handleFiles(Array.from(e.dataTransfer!.files))
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const openPicker = () => inputRef.current?.click()
  const loading = books === undefined
  const empty = !loading && books.length === 0

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 py-3">
          <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight">Library</h1>
          {!empty && (
            <>
              <label className="relative order-last w-full sm:order-none sm:w-64">
                <span className="sr-only">Search library</span>
                <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search title or author"
                  className="w-full rounded-lg border border-stone-300 bg-white py-1.5 pr-3 pl-8 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-stone-700 dark:bg-stone-900"
                />
              </label>
              <label className="text-sm">
                <span className="sr-only">Sort by</span>
                <select
                  value={sort}
                  onChange={e => changeSort(e.target.value as SortKey)}
                  className="rounded-lg border border-stone-300 bg-white py-1.5 pr-2 pl-2 text-sm outline-none focus:border-amber-600 dark:border-stone-700 dark:bg-stone-900"
                >
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            <PlusIcon size={16} /> Add books
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".epub,.pdf,application/epub+zip,application/pdf"
            multiple
            hidden
            data-testid="file-input"
            onChange={e => {
              if (e.target.files) handleFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6">
        {(uploading.length > 0 || errors.length > 0) && (
          <div className="mb-5 space-y-2" aria-live="polite">
            {uploading.map(name => (
              <p key={name} className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                <span className="size-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                Adding {name}…
              </p>
            ))}
            {errors.map((msg, i) => (
              <p key={i} role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
                {msg}
                <button type="button" aria-label="Dismiss" onClick={() => setErrors(e => e.filter((_, j) => j !== i))}>
                  <CloseIcon size={16} />
                </button>
              </p>
            ))}
          </div>
        )}

        {empty && (
          <button
            type="button"
            onClick={openPicker}
            className="mx-auto mt-10 flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 px-6 py-16 text-center hover:border-amber-600 hover:bg-amber-50/50 dark:border-stone-700 dark:hover:bg-amber-950/20"
          >
            <UploadIcon size={36} className="text-stone-400" />
            <span className="font-serif text-xl font-semibold">Your library is empty</span>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Drop EPUB or PDF files here, or click to choose them.<br />
              Books stay on this device and are never uploaded anywhere.
            </span>
          </button>
        )}

        {!loading && !empty && visible.length === 0 && (
          <p className="mt-10 text-center text-stone-500">No books match “{query}”.</p>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
          {visible.map((book: Book) => (
            <BookCard key={book.id} book={book} percent={percentById.get(book.id)} onDelete={b => deleteBook(b.id)} />
          ))}
        </div>
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-white/70 px-10 py-12 text-center text-white">
            <UploadIcon size={40} className="mx-auto mb-3" />
            <p className="text-lg font-semibold">Drop to add to your library</p>
            <p className="text-sm opacity-80">EPUB and PDF</p>
          </div>
        </div>
      )}
    </div>
  )
}
