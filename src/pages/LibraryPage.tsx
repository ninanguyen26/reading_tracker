import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Book } from '../lib/db'
import { addBook, deleteBook, filterBooks, sortBooks, type SortKey } from '../lib/library'
import BookCard from '../components/BookCard'
import { CloseIcon, MoreIcon, PlusIcon, SearchIcon, UploadIcon } from '../components/icons'
import type { RestoreSummary } from '../lib/backup'

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
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  // The zip library is loaded only when backing up or restoring.
  const backUp = async () => {
    setMenuOpen(false)
    setBusy('Preparing backup…')
    try {
      const { createBackup, backupFileName } = await import('../lib/backup')
      const blob = await createBackup()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = backupFileName()
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Backup saved. Keep it somewhere safe, like cloud storage, to restore on another device.')
    } catch (err) {
      setErrors(e => [...e, `Backup failed: ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(null)
    }
  }

  const restore = async (file: File) => {
    setBusy(`Restoring from ${file.name}…`)
    try {
      const { restoreBackup } = await import('../lib/backup')
      setNotice(describeRestore(await restoreBackup(file)))
    } catch (err) {
      setErrors(e => [...e, err instanceof Error && err.name === 'InvalidBackupError' ? err.message : `Restore failed: ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(null)
    }
  }

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
          <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-stone-700 sm:px-3 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            <PlusIcon size={16} /> <span className="max-sm:sr-only">Add books</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
              aria-label="Library options"
              aria-expanded={menuOpen}
            >
              <MoreIcon size={20} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
                <button type="button" role="menuitem" onClick={backUp} disabled={!books?.length}
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800">
                  Back up library
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); restoreRef.current?.click() }}
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                  Restore from backup…
                </button>
              </div>
            )}
          </div>
          </div>
          <input
            ref={restoreRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            data-testid="restore-input"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) restore(file)
              e.target.value = ''
            }}
          />
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
        {(uploading.length > 0 || errors.length > 0 || notice || busy) && (
          <div className="mb-5 space-y-2" aria-live="polite">
            {busy && (
              <p className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                <span className="size-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                {busy}
              </p>
            )}
            {notice && (
              <p role="status" className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {notice}
                <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
                  <CloseIcon size={16} />
                </button>
              </p>
            )}
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
        {empty && (
          <p className="mt-4 text-center text-sm text-stone-500 dark:text-stone-400">
            Moving from another device?{' '}
            <button type="button" onClick={() => restoreRef.current?.click()} className="font-medium text-amber-700 underline dark:text-amber-500">
              Restore from a backup
            </button>
          </p>
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

function describeRestore({ booksAdded, booksSkipped, highlightsAdded, bookmarksAdded }: RestoreSummary): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = [plural(booksAdded, 'book')]
  if (highlightsAdded) parts.push(plural(highlightsAdded, 'highlight'))
  if (bookmarksAdded) parts.push(plural(bookmarksAdded, 'bookmark'))
  const added = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  const skipped = booksSkipped ? ` ${plural(booksSkipped, 'book')} ${booksSkipped === 1 ? 'was' : 'were'} already in your library.` : ''
  return `Restored ${added}.${skipped}`
}
