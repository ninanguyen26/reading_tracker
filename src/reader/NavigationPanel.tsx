import { useEffect } from 'react'
import type { Bookmark } from '../lib/db'
import type { TocEntry } from './types'
import { CloseIcon, TrashIcon } from '../components/icons'

interface Props {
  tab: 'contents' | 'bookmarks'
  onTab: (tab: 'contents' | 'bookmarks') => void
  toc: TocEntry[]
  bookmarks: Bookmark[]
  currentChapter: string | null
  onNavigate: (target: string) => void
  onRemoveBookmark: (id: string) => void
  onClose: () => void
}

export default function NavigationPanel(props: Props) {
  const { tab, onTab, toc, bookmarks, onClose } = props

  useEffect(() => {
    document.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'center' })
  }, [tab])

  const tabClass = (active: boolean) =>
    `flex-1 border-b-2 py-2.5 text-sm font-medium ${active ? 'border-[var(--reader-accent)]' : 'border-transparent text-[var(--reader-muted)]'}`

  return (
    <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal="true" aria-label="Contents and bookmarks">
      <aside className="flex h-full w-[min(22rem,88vw)] flex-col border-r border-[var(--reader-border)] bg-[var(--reader-panel)] pt-[env(safe-area-inset-top)] shadow-xl">
        <div className="flex items-center border-b border-[var(--reader-border)] pr-2">
          <button type="button" className={tabClass(tab === 'contents')} onClick={() => onTab('contents')}>Contents</button>
          <button type="button" className={tabClass(tab === 'bookmarks')} onClick={() => onTab('bookmarks')}>
            Bookmarks{bookmarks.length > 0 && ` (${bookmarks.length})`}
          </button>
          <button type="button" onClick={onClose} className="ml-1 rounded-lg p-2 hover:bg-[var(--reader-border)]" aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-2 pb-[env(safe-area-inset-bottom)]">
          {tab === 'contents' ? (
            toc.length
              ? <TocList items={toc} depth={0} currentChapter={props.currentChapter} onNavigate={props.onNavigate} />
              :<Empty>This book has no table of contents.</Empty>
          ) : bookmarks.length ? (
            <ul>
              {bookmarks.map(b => (
                <li key={b.id} className="group flex items-center rounded-lg hover:bg-[var(--reader-border)]">
                  <button type="button" onClick={() => props.onNavigate(b.location)} className="min-w-0 flex-1 px-3 py-2 text-left">
                    <span className="block truncate text-sm">{b.label}</span>
                    <span className="text-xs text-[var(--reader-muted)]">
                      {Math.round(b.percent * 100)}% · {new Date(b.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button type="button" onClick={() => props.onRemoveBookmark(b.id)}
                    className="mr-1 rounded p-2 text-[var(--reader-muted)] hover:text-red-600" aria-label={`Remove bookmark ${b.label}`}>
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No bookmarks yet. Tap the bookmark icon at the top to save your place.</Empty>
          )}
        </div>
      </aside>
      <button type="button" className="flex-1 bg-black/30" aria-label="Close panel" onClick={onClose} />
    </div>
  )
}

interface TocListProps {
  items: TocEntry[]
  depth: number
  currentChapter: string | null
  onNavigate: (target: string) => void
}

function TocList({ items, depth, currentChapter, onNavigate }: TocListProps) {
  return (
    <ul>
      {items.map((item, i) => {
        const current = item.label === currentChapter
        return (
          <li key={`${item.target}-${i}`}>
            <button
              type="button"
              onClick={() => onNavigate(item.target)}
              aria-current={current ? 'true' : undefined}
              className={`w-full rounded-lg py-2 pr-3 text-left text-sm hover:bg-[var(--reader-border)] ${current ? 'font-semibold text-[var(--reader-accent)]' : ''}`}
              style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            >
              {item.label}
            </button>
            {item.subitems.length > 0 && (
              <TocList items={item.subitems} depth={depth + 1} currentChapter={currentChapter} onNavigate={onNavigate} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-[var(--reader-muted)]">{children}</p>
}
