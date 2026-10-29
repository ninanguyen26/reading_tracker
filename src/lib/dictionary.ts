export interface Definition {
  text: string
  example?: string
}

export interface Meaning {
  partOfSpeech: string
  definitions: Definition[]
}

export interface DictionaryEntry {
  word: string
  phonetic?: string
  audioUrl?: string
  meanings: Meaning[]
  source: 'Free Dictionary' | 'Wiktionary'
  sourceUrl: string
}

export class DictionaryUnavailableError extends Error {
  constructor() {
    super('The dictionary needs an internet connection.')
    this.name = 'DictionaryUnavailableError'
  }
}

type Fetch = typeof fetch
const MAX_DEFINITIONS = 3

/**
 * Looks a word up in the Free Dictionary API, falling back to Wiktionary.
 * Returns null when neither knows the word; throws DictionaryUnavailableError
 * when neither can be reached.
 */
export async function lookUp(word: string, fetchImpl: Fetch = fetch): Promise<DictionaryEntry | null> {
  let primaryFailed = false
  try {
    const entry = await fromFreeDictionary(word, fetchImpl)
    if (entry) return entry
  } catch {
    primaryFailed = true
  }
  try {
    return await fromWiktionary(word, fetchImpl)
  } catch {
    if (primaryFailed) throw new DictionaryUnavailableError()
    return null
  }
}

interface FreeDictionaryResponse {
  word: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  meanings?: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[]
}

async function fromFreeDictionary(word: string, fetchImpl: Fetch): Promise<DictionaryEntry | null> {
  const res = await fetchImpl(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Free Dictionary returned ${res.status}`)
  const data = (await res.json()) as FreeDictionaryResponse[]
  const entries = Array.isArray(data) ? data : []
  if (!entries.length) return null

  const phonetics = entries.flatMap(e => e.phonetics ?? [])
  const meanings: Meaning[] = entries
    .flatMap(e => e.meanings ?? [])
    .map(m => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.slice(0, MAX_DEFINITIONS).map(d => ({ text: d.definition, example: d.example })),
    }))
  if (!meanings.length) return null
  return {
    word: entries[0].word,
    phonetic: entries.find(e => e.phonetic)?.phonetic ?? phonetics.find(p => p.text)?.text,
    audioUrl: phonetics.find(p => p.audio)?.audio || undefined,
    meanings,
    source: 'Free Dictionary',
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(entries[0].word)}`,
  }
}

type WiktionaryResponse = Record<string, {
  partOfSpeech: string
  language: string
  definitions: { definition: string; examples?: string[] }[]
}[]>

async function fromWiktionary(word: string, fetchImpl: Fetch): Promise<DictionaryEntry | null> {
  // Wiktionary pages are case-sensitive; try the word as written, then lowercase.
  const candidates = [...new Set([word, word.toLowerCase()])]
  for (const candidate of candidates) {
    const res = await fetchImpl(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(candidate)}`)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`Wiktionary returned ${res.status}`)
    const data = (await res.json()) as WiktionaryResponse
    const meanings: Meaning[] = (data.en ?? [])
      .map(m => ({
        partOfSpeech: m.partOfSpeech.toLowerCase(),
        definitions: m.definitions
          .map(d => ({ text: stripHtml(d.definition), example: d.examples?.[0] ? stripHtml(d.examples[0]) : undefined }))
          .filter(d => d.text)
          .slice(0, MAX_DEFINITIONS),
      }))
      .filter(m => m.definitions.length)
    if (meanings.length) {
      return {
        word: candidate,
        meanings,
        source: 'Wiktionary',
        sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(candidate)}`,
      }
    }
  }
  return null
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
