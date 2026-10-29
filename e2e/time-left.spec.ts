import { expect, test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, openBook, PDF, PDF_TITLE } from './helpers'

test('tapping the footer cycles location, time left in chapter, and time left in book', async ({ page }) => {
  await addBooks(page, EPUB)
  await openBook(page, EPUB_TITLE)
  const progress = page.getByTestId('footer-progress')
  await expect(progress).toHaveText(/^Location \d+ of \d+ · \d+%$/)
  await progress.click()
  await expect(progress).toHaveText(/^(\d+ min|Less than a minute) left in chapter · \d+%$/)
  await progress.click()
  await expect(progress).toHaveText(/^(\d+ h )?\d+ min left in book · \d+%$/)

  // The choice is remembered.
  await page.reload()
  await expect(progress).toHaveText(/left in book/)
  await progress.click()
  await expect(progress).toHaveText(/^Location/)
})

test('learns reading speed from page turns', async ({ page }) => {
  await addBooks(page, PDF)
  await openBook(page, PDF_TITLE)
  // Fake the clock only once the book is open; pdf.js loading relies on real timers.
  await page.clock.install()
  const progress = page.getByTestId('footer-progress')
  await progress.click()

  // Before any reading, a default of two minutes a page: page 1 is the whole Introduction.
  await expect(progress).toHaveText('2 min left in chapter · 0%')
  await progress.click()
  await expect(progress).toHaveText('12 min left in book · 0%')

  // Read four pages at 30 seconds each, twice the default speed.
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(30_000)
    await page.keyboard.press('ArrowRight')
    await expect(progress).toContainText(`${(i + 1) * 20}%`)
  }
  // 2 pages left. With only two minutes of reading measured, the estimate is
  // still mostly the default (about 0.69 pages/min instead of 0.5).
  await expect(progress).toHaveText('3 min left in book · 80%')

  // A jump via the contents isn't counted as reading.
  await page.clock.fastForward(30_000)
  await page.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
  await page.getByRole('dialog').getByRole('listitem').getByRole('button', { name: 'Introduction' }).click()
  await expect(progress).toHaveText('9 min left in book · 0%')

  // The learned speed is kept for next time.
  await page.clock.runFor(1000) // let the position save
  await page.reload()
  await expect(progress).toHaveText('9 min left in book · 0%')
})
