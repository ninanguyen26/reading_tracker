import { expect, test, type Page } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, footer, openBook, PDF, PDF_TITLE } from './helpers'

const panel = (page: Page) => page.getByRole('dialog', { name: 'Search this book' })

async function searchFor(page: Page, query: string) {
  await page.getByRole('button', { name: 'Search this book' }).click()
  const input = panel(page).getByRole('searchbox')
  await expect(input).toBeFocused()
  await input.fill(query)
  await input.press('Enter')
}

test.describe('EPUB', () => {
  test.beforeEach(async ({ page }) => {
    await addBooks(page, EPUB)
    await openBook(page, EPUB_TITLE)
  })

  test('finds matches across chapters and jumps to one', async ({ page }) => {
    await searchFor(page, 'Logbook')
    await expect(panel(page)).toContainText(/\d+ results for “Logbook”/)
    const headings = panel(page).getByRole('heading')
    await expect(headings).toHaveText(['Chapter 1: The Tower', 'Chapter 2: The Fog', 'Chapter 3: The Letter'])
    // Excerpts show the match in context, matched case-insensitively.
    const firstMatch = panel(page).locator('mark').first()
    await expect(firstMatch).toHaveText('logbook')

    const chapter3 = panel(page).locator('section', { hasText: 'Chapter 3: The Letter' })
    await chapter3.getByRole('button').first().click()
    await expect(panel(page)).toHaveCount(0)
    await expect(footer(page)).toContainText('Chapter 3: The Letter')

    // A chip leads back to the results; clearing it ends the search.
    await page.getByRole('button', { name: 'Results for “Logbook”' }).click()
    await expect(panel(page)).toContainText('results for “Logbook”')
    await panel(page).getByRole('button', { name: 'Close search', exact: true }).click()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(page.getByRole('button', { name: /Results for/ })).toHaveCount(0)
  })

  test('says when nothing matches', async ({ page }) => {
    await searchFor(page, 'zeppelin')
    await expect(panel(page)).toContainText('No matches for “zeppelin”.')
  })
})

test.describe('PDF', () => {
  test.beforeEach(async ({ page }) => {
    await addBooks(page, PDF)
    await openBook(page, PDF_TITLE)
  })

  test('finds text on other pages, jumps there and marks it', async ({ page }) => {
    await searchFor(page, 'afterword')
    await expect(panel(page)).toContainText('1 result for “afterword”')
    await expect(panel(page).getByRole('heading')).toHaveText(['Afterword · Page 6'])
    await panel(page).getByRole('button', { name: /Afterword/ }).click()
    await expect(footer(page)).toContainText('Page 6 of 6')
    await expect(page.locator('.textLayer .search-hit')).toHaveText(['Afterword'])
  })

  test('lists every page a phrase appears on', async ({ page }) => {
    await searchFor(page, 'stove to keep warm')
    await expect(panel(page)).toContainText(/\d+ results/)
    expect(await panel(page).getByRole('heading').count()).toBeGreaterThan(2)
  })
})
