import { useEffect, useState } from 'react'
import { DictionaryUnavailableError, lookUp, type DictionaryEntry } from '../lib/dictionary'
import { CloseIcon, SpeakerIcon } from '../components/icons'

type State =
  | { status: 'loading' }
  | { status: 'found'; entry: DictionaryEntry }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

export default function DictionarySheet({ word, onClose }: { word: string; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    lookUp(word)
      .then(entry => !cancelled && setState(entry ? { status: 'found', entry } : { status: 'not-found' }))
      .catch(err => !cancelled && setState({
        status: 'error',
        message: err instanceof DictionaryUnavailableError ? err.message : 'Something went wrong looking that up.',
      }))
    return () => { cancelled = true }
  }, [word])

  const entry = state.status === 'found' ? state.entry : null

  return (
    <section
      role="dialog"
      aria-label={`Definition of ${word}`}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[45dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-[var(--reader-border)] bg-[var(--reader-panel)] px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
    >
      <div className="mb-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-semibold">{entry?.word ?? word}</h2>
          {entry?.phonetic && <p className="text-sm text-[var(--reader-muted)]">{entry.phonetic}</p>}
        </div>
        {entry?.audioUrl && (
          <button type="button" onClick={() => new Audio(entry.audioUrl).play().catch(() => {})}
            className="rounded-lg p-2 hover:bg-[var(--reader-border)]" aria-label="Play pronunciation">
            <SpeakerIcon size={18} />
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--reader-border)]" aria-label="Close dictionary">
          <CloseIcon size={18} />
        </button>
      </div>

      {state.status === 'loading' && <p className="text-sm text-[var(--reader-muted)]">Looking up…</p>}
      {state.status === 'not-found' && <p className="text-sm text-[var(--reader-muted)]">No definition found for “{word}”.</p>}
      {state.status === 'error' && <p className="text-sm text-[var(--reader-muted)]">{state.message}</p>}

      {entry && (
        <>
          <div className="space-y-3">
            {entry.meanings.map((m, i) => (
              <div key={i}>
                <p className="text-xs font-semibold tracking-wide text-[var(--reader-accent)] uppercase">{m.partOfSpeech}</p>
                <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
                  {m.definitions.map((d, j) => (
                    <li key={j}>
                      {d.text}
                      {d.example && <span className="block text-[var(--reader-muted)] italic">“{d.example}”</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--reader-muted)]">
            Source: {entry.source} ·{' '}
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="underline">More on Wiktionary</a>
          </p>
        </>
      )}
    </section>
  )
}
