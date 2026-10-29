// Not a test: captures screenshots of search, time left and backup for manual review.
import { test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, openBook, PDF } from './helpers'

const dir = process.env.SHOTS_DIR ?? 'test-results/shots'

test('capture v3 screens', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `${dir}/${info.project.name}-${name}.png` })
  await page.goto('/')
  await shot('20-empty-restore')
  await addBooks(page, EPUB, PDF)
  await page.getByRole('button', { name: 'Library options' }).click()
  await shot('21-library-menu')
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 300)
  await openBook(page, EPUB_TITLE)
  await page.getByRole('button', { name: 'Search this book' }).click()
  await page.getByRole('searchbox').fill('fog came')
  await page.getByRole('searchbox').press('Enter')
  await page.getByText(/results for/).waitFor()
  await shot('22-search')
  await page.getByRole('dialog').locator('section').nth(1).getByRole('button').first().click()
  await page.waitForTimeout(600)
  await page.getByTestId('footer-progress').click()
  await shot('23-search-chip-time-left')
})
