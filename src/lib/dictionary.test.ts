import { describe, expect, it, vi } from 'vitest'
import { DictionaryUnavailableError, lookUp, stripHtml } from './dictionary'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const notFound = () => new Response('', { status: 404 })

const freeDictionaryEntry = [{
  word: 'lamp',
  phonetic: '/læmp/',
  phonetics: [{ text: '/læmp/', audio: '' }, { audio: 'https://example.com/lamp.mp3' }],
  meanings: [
    { partOfSpeech: 'noun', definitions: [1, 2, 3, 4].map(n => ({ definition: `Meaning ${n}` })) },
    { partOfSpeech: 'verb', definitions: [{ definition: 'To light', example: 'lamp the way' }] },
  ],
}]

const wiktionaryEntry = {
  en: [{
    partOfSpeech: 'Noun',
    language: 'English',
    definitions: [
      { definition: 'A <a href="/wiki/device">device</a> that makes <b>light</b>.', examples: ['<i>a desk lamp</i>'] },
      { definition: '' },
    ],
  }],
}

describe('lookUp', () => {
  it('uses the Free Dictionary API first', async () => {
    const fetch = vi.fn(async () => json(freeDictionaryEntry))
    const entry = await lookUp('Lamp', fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]).toEqual(['https://api.dictionaryapi.dev/api/v2/entries/en/lamp'])
    expect(entry).toMatchObject({
      word: 'lamp',
      phonetic: '/læmp/',
      audioUrl: 'https://example.com/lamp.mp3',
      source: 'Free Dictionary',
    })
    expect(entry!.meanings[0].definitions).toHaveLength(3)
    expect(entry!.meanings[1].definitions[0]).toEqual({ text: 'To light', example: 'lamp the way' })
  })

  it('falls back to Wiktionary when the word is unknown', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('dictionaryapi') ? notFound() : json(wiktionaryEntry))
    const entry = await lookUp('lamp', fetch)
    expect(entry).toMatchObject({ source: 'Wiktionary', word: 'lamp' })
    expect(entry!.meanings).toEqual([{
      partOfSpeech: 'noun',
      definitions: [{ text: 'A device that makes light.', example: 'a desk lamp' }],
    }])
  })

  it('falls back to Wiktionary when the Free Dictionary API is down', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('dictionaryapi')) throw new TypeError('Failed to fetch')
      return json(wiktionaryEntry)
    })
    expect(await lookUp('lamp', fetch)).toMatchObject({ source: 'Wiktionary' })
  })

  it('tries the lowercase form on Wiktionary for capitalized words', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/lamp') && String(url).includes('wiktionary') ? json(wiktionaryEntry) : notFound())
    expect(await lookUp('Lamp', fetch)).toMatchObject({ word: 'lamp' })
  })

  it('returns null when neither source knows the word', async () => {
    expect(await lookUp('qwzx', vi.fn(async () => notFound()))).toBeNull()
  })

  it('reports being offline when neither source can be reached', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    await expect(lookUp('lamp', fetch)).rejects.toBeInstanceOf(DictionaryUnavailableError)
  })
})

describe('stripHtml', () => {
  it('keeps only the text', () => {
    expect(stripHtml('<b>bold</b>  and\n<i>italic</i>')).toBe('bold and italic')
  })
})
