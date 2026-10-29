import { expect, test } from '@playwright/test'
import { addBooks, footer, mockDictionary, openBook, PDF, PDF_TITLE } from './helpers'

test.beforeEach(async ({ page }) => {
  await addBooks(page, PDF)
  await openBook(page, PDF_TITLE)
})

test('opens on the first page with its outline chapter', async ({ page }) => {
  await expect(footer(page)).toContainText('Introduction')
  await expect(footer(page)).toContainText('Page 1 of 6 · 0%')
  await expect(page.locator('.textLayer')).toContainText('Introduction')
})

test('turns pages, follows the outline and remembers the page', async ({ page }) => {
  await page.keyboard.press('ArrowRight')
  await expect(footer(page)).toContainText('Page 2 of 6')
  await expect(footer(page)).toContainText('Part One')
  await page.keyboard.press('ArrowLeft')
  await expect(footer(page)).toContainText('Page 1 of 6')

  await page.getByRole('button', { name: 'Contents and bookmarks' }).click()
  const toc = page.getByRole('dialog')
  await expect(toc.getByRole('listitem')).toHaveText(
    ['Introduction', 'Part One', 'Part Two', 'Part Three', 'Notes', 'Afterword'],
  )
  await toc.getByRole('button', { name: 'Notes' }).click()
  await expect(footer(page)).toContainText('Page 5 of 6 · 80%')
  await expect(page.locator('.textLayer')).toContainText('Notes')

  await page.waitForTimeout(700)
  await page.reload()
  await expect(footer(page)).toContainText('Page 5 of 6')
})

test('stops at the first and last pages', async ({ page }) => {
  await page.keyboard.press('ArrowLeft')
  await expect(footer(page)).toContainText('Page 1 of 6')
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight')
  await expect(footer(page)).toContainText('Page 6 of 6 · 100%')
})

test('turns pages by tapping the sides', async ({ page }) => {
  const box = (await page.getByTestId('pdf-view').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.95, box.y + box.height / 2)
  await expect(footer(page)).toContainText('Page 2 of 6')
  await page.mouse.click(box.x + box.width * 0.05, box.y + box.height / 2)
  await expect(footer(page)).toContainText('Page 1 of 6')
})

test('zooms in and out', async ({ page }) => {
  const canvas = page.locator('[data-testid="pdf-view"] canvas')
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(0)
  const base = (await canvas.boundingBox())!.width
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(base * 1.25, -1)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(base, -1)
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
})

test('tints the page for sepia and dark themes', async ({ page }) => {
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Reading settings' })).toContainText('original layout')
  await page.getByRole('button', { name: 'Dark' }).click()
  const pageBox = page.locator('[data-testid="pdf-view"] canvas').locator('..')
  await expect(pageBox).toHaveCSS('filter', /invert/)
})

test('looks up a word selected in the PDF text', async ({ page }) => {
  await mockDictionary(page)
  await page.locator('.textLayer span', { hasText: 'Introduction' }).first().dblclick()
  await expect(page.getByRole('dialog', { name: 'Definition of Introduction' })).toContainText('A test definition')
  // The double-click selected a word; it must not also turn the page.
  await expect(footer(page)).toContainText('Page 1 of 6')
})
