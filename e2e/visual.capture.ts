// Not a test: captures screenshots for manual review. Run with:
//   SHOTS_DIR=/some/dir npx playwright test visual.capture --config e2e/capture.config.ts
import { test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, mockDictionary, openBook, PDF, PDF_TITLE } from './helpers'

const dir = process.env.SHOTS_DIR ?? 'test-results/shots'

test('capture screens', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `${dir}/${info.project.name}-${name}.png` })
  await mockDictionary(page)
  await page.goto('/')
  await shot('01-empty')
  await addBooks(page, EPUB, PDF)
  await shot('02-library')
  await openBook(page, EPUB_TITLE)
  await page.waitForTimeout(600)
  await shot('03-epub')
  await page.getByRole('button', { name: 'Contents and bookmarks' }).click()
  await shot('04-toc')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('button', { name: 'Sepia' }).click()
  await page.waitForTimeout(400)
  await shot('05-settings-sepia')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await shot('06-epub-dark')
  await page.goto('/')
  await openBook(page, PDF_TITLE)
  await page.waitForTimeout(600)
  await shot('07-pdf-dark')
  await page.locator('.textLayer span', { hasText: 'Introduction' }).first().dblclick()
  await page.waitForTimeout(800)
  await shot('08-dictionary')
})
