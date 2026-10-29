import { useEffect, useRef, useState } from 'react'
import type { Collection } from '../lib/db'
import InlineNameForm from './InlineNameForm'
import { MoreIcon, PlusIcon } from './icons'

interface Props {
  shelves: Collection[]
  counts: Map<string, number>
  total: number
  selected: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

/** Shelf filter chips under the library header, with ways to add, rename and delete shelves. */
export default function ShelfBar({ shelves, counts, total, selected, onSelect, onCreate, onRename, onDelete }: Props) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed')
  const menuRef = useRef<HTMLDivElement>(null)
  const current = shelves.find(s => s.id === selected)

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

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition ${active
      ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
      : 'border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'}`

  return (
    <div className="mx-auto flex max-w-6xl items-center gap-2 pb-3">
      {/* Negative margin + padding keeps focus rings visible inside the scroll area. */}
      <div className="-my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1" role="tablist" aria-label="Shelves">
        <button type="button" role="tab" aria-selected={!selected} className={chip(!selected)} onClick={() => onSelect(null)}>
          All books <span className="opacity-60">{total}</span>
        </button>
        {shelves.map(shelf =>
          renaming && shelf.id === selected ? (
            <InlineNameForm
              key={shelf.id}
              initial={shelf.name}
              placeholder="Shelf name"
              label="Rename shelf"
              onSubmit={name => { onRename(shelf.id, name); setRenaming(false) }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <button key={shelf.id} type="button" role="tab" aria-selected={selected === shelf.id}
              className={chip(selected === shelf.id)} onClick={() => onSelect(shelf.id)}>
              {shelf.name} <span className="opacity-60">{counts.get(shelf.id) ?? 0}</span>
            </button>
          ),
        )}
        {creating ? (
          <InlineNameForm
            placeholder="Shelf name"
            label="New shelf name"
            onSubmit={name => { onCreate(name); setCreating(false) }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button type="button" onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-stone-300 px-3 py-1 text-xs font-medium whitespace-nowrap text-stone-500 hover:border-stone-400 hover:text-stone-800 dark:border-stone-700 dark:hover:text-stone-200">
            <PlusIcon size={12} /> New shelf
          </button>
        )}
      </div>

      {current && !renaming && (
        <div className="relative shrink-0" ref={menuRef}>
          <button type="button" onClick={() => setMenu(m => (m === 'closed' ? 'open' : 'closed'))}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
            aria-label={`Options for shelf ${current.name}`} aria-expanded={menu !== 'closed'}>
            <MoreIcon size={18} />
          </button>
          {menu !== 'closed' && (
            <div role="menu" className="absolute top-full right-0 z-20 mt-1 w-60 rounded-lg border border-stone-200 bg-white p-1.5 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
              {menu === 'open' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenu('closed'); setRenaming(true) }}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                    Rename shelf
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu('confirm')}
                    className="w-full rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                    Delete shelf
                  </button>
                </>
              ) : (
                <div className="p-1">
                  <p className="mb-2 text-stone-700 dark:text-stone-300">
                    Delete the “{current.name}” shelf? Its books stay in your library.
                  </p>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setMenu('closed')} className="rounded px-2 py-1 hover:bg-stone-100 dark:hover:bg-stone-800">Cancel</button>
                    <button type="button" onClick={() => { setMenu('closed'); onDelete(current.id) }}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
