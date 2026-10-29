import { expect, type Page } from '@playwright/test'

export const EPUB = 'tests/fixtures/sample.epub'
export const PDF = 'tests/fixtures/sample.pdf'
export const EPUB_TITLE = 'The Lighthouse Keeper'
export const PDF_TITLE = 'Field Notes'

/** Each test gets a fresh browser context, so the library starts empty. */
export async function addBooks(page: Page, ...files: string[]) {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(files)
  // Reading metadata and rendering covers can be slow when many tests run at once.
  await expect(page.getByTestId('book-card')).toHaveCount(files.length, { timeout: 15_000 })
}

export async function openBook(page: Page, title: string) {
  await page.getByRole('link', { name: `Read ${title}` }).click()
  await expect(page.locator('footer')).toContainText('%', { timeout: 15_000 })
}

export const footer = (page: Page) => page.locator('footer')

/** Reading percent shown in the footer. */
export async function percent(page: Page): Promise<number> {
  const text = await footer(page).innerText()
  return Number(text.match(/(\d+)%/)?.[1] ?? NaN)
}

/**
 * Runs code against the current EPUB chapter document inside foliate's closed
 * shadow DOM. Resolves to null while the book is still loading.
 */
export function evalInEpub<T>(page: Page, fn: string): Promise<T | null> {
  return page.evaluate(`(() => {
    const view = document.querySelector('foliate-view')
    const doc = view?.renderer?.getContents?.()[0]?.doc
    if (!doc?.defaultView) return null
    try { return (${fn})(doc) } catch { return null }
  })()`) as Promise<T | null>
}

/**
 * Selects `phrase` inside the first EPUB paragraph that contains it and
 * returns the page coordinates of the selection's center.
 */
export async function selectInEpub(page: Page, phrase: string): Promise<{ x: number; y: number }> {
  const point = await evalInEpub<{ x: number; y: number }>(page, `doc => {
    const p = [...doc.querySelectorAll('p')].find(p => p.textContent.includes(${JSON.stringify(phrase)}))
    const text = p.firstChild
    const start = text.textContent.indexOf(${JSON.stringify(phrase)})
    const range = doc.createRange()
    range.setStart(text, start)
    range.setEnd(text, start + ${phrase.length})
    doc.getSelection().removeAllRanges()
    doc.getSelection().addRange(range)
    const r = range.getClientRects()[0]
    const frame = doc.defaultView.frameElement.getBoundingClientRect()
    return { x: frame.left + r.left + r.width / 2, y: frame.top + r.top + r.height / 2 }
  }`)
  if (!point) throw new Error(`Could not select "${phrase}"`)
  return point
}

/** Mocks the dictionary APIs so tests don't depend on the network. */
export async function mockDictionary(page: Page) {
  await page.route('https://api.dictionaryapi.dev/**', route => {
    const word = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    return route.fulfill({
      json: [{
        word,
        phonetic: '/test/',
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: `A test definition of ${word}.`, example: `the ${word} example` }] }],
      }],
    })
  })
  await page.route('https://en.wiktionary.org/**', route => route.fulfill({ status: 404, body: '' }))
}
