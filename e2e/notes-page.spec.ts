import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addBooks, EPUB, EPUB_TITLE, footer, openBook, PDF, PDF_TITLE, selectInEpub } from './helpers'

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selected text' })

async function highlightPdfLine(page: Page, text: string, color: string) {
  await page.locator('.textLayer span', { hasText: text }).first().evaluate(el => {
    const range = document.createRange()
    range.selectNodeContents(el)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
  })
  await toolbar(page).getByRole('button', { name: `Highlight ${color}` }).click()
  await expect(toolbar(page)).toHaveCount(0)
}

test('lists highlights from every book, filters them, and opens one in its book', async ({ page }) => {
  await addBooks(page, EPUB, PDF)

  await openBook(page, EPUB_TITLE)
  await selectInEpub(page, 'counted the seconds')
  await toolbar(page).getByRole('button', { name: 'Highlight blue' }).click()
  await selectInEpub(page, 'the logbook')
  await toolbar(page).getByRole('button', { name: 'Note' }).click()
  await page.getByPlaceholder('Add a note…').fill('Keep a record')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: 'Back to library' }).click()

  await openBook(page, PDF_TITLE)
  await highlightPdfLine(page, 'The lamp at the top', 'green')
  await page.getByRole('link', { name: 'Back to library' }).click()

  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible()
  await expect(page.getByText('3 highlights in 2 books')).toBeVisible()
  // Most recently highlighted book first.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([PDF_TITLE, EPUB_TITLE])
  const epubSection = page.getByRole('region', { name: EPUB_TITLE })
  await expect(epubSection.getByRole('listitem')).toHaveCount(2)
  await expect(epubSection).toContainText('Keep a record')

  // Filters
  await page.getByRole('button', { name: 'Blue' }).click()
  await expect(page.getByText('1 of 3 highlights')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveText([/counted the seconds/])
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByPlaceholder('Search highlights, notes, books').fill('record')
  await expect(page.getByRole('listitem')).toHaveText([/the logbook/])
  await page.getByPlaceholder('Search highlights, notes, books').fill('jordan')
  await expect(page.getByRole('listitem')).toHaveText([/The lamp at the top/])

  // Opening a note goes to the book, at the highlight, with it open.
  await page.getByRole('listitem').first().getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`#/read/[^?]+$`))
  await expect(page.getByRole('dialog', { name: 'Highlight' })).toContainText('The lamp at the top')
  await expect(footer(page)).toContainText('Page 1 of 6')
})

test('exports every book\'s notes as one Markdown file', async ({ page }) => {
  await addBooks(page, EPUB)
  await openBook(page, EPUB_TITLE)
  await selectInEpub(page, 'patient, steady sound')
  await toolbar(page).getByRole('button', { name: 'Highlight pink' }).click()
  await page.getByRole('link', { name: 'Back to library' }).click()
  await page.getByRole('link', { name: 'Notes', exact: true }).click()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export all' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Reading notes.md')
  const text = await readFile((await download.path())!, 'utf8')
  expect(text).toContain('# Reading notes')
  expect(text).toContain(`## ${EPUB_TITLE}`)
  expect(text).toContain('> patient, steady sound')
})

test('shows an empty state with no highlights', async ({ page }) => {
  await page.goto('/#/notes')
  await expect(page.getByText('No highlights yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export all' })).toBeDisabled()
})
