import { expect, type Page } from '@playwright/test'

export const EPUB = 'tests/fixtures/sample.epub'
export const PDF = 'tests/fixtures/sample.pdf'
export const EPUB_TITLE = 'The Lighthouse Keeper'
export const PDF_TITLE = 'Field Notes'

/** Each test gets a fresh browser context, so the library starts empty. */
export async function addBooks(page: Page, ...files: string[]) {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(files)
  await expect(page.getByTestId('book-card')).toHaveCount(files.length)
}

export async function openBook(page: Page, title: string) {
  await page.getByRole('link', { name: `Read ${title}` }).click()
  await expect(page.locator('footer')).toContainText('%')
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
