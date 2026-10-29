// Not a test: captures screenshots of the highlight UI for manual review.
import { test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, openBook, PDF, PDF_TITLE, selectInEpub } from './helpers'

const dir = process.env.SHOTS_DIR ?? 'test-results/shots'

test('capture highlight screens', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `${dir}/${info.project.name}-${name}.png` })
  await addBooks(page, EPUB, PDF)
  await openBook(page, EPUB_TITLE)
  await page.waitForTimeout(500)
  const toolbar = page.getByRole('toolbar', { name: 'Selected text' })
  await selectInEpub(page, 'counted the seconds between each sweep')
  await toolbar.waitFor()
  await shot('10-selection')
  await toolbar.getByRole('button', { name: 'Highlight yellow' }).click()
  await selectInEpub(page, 'patient, steady sound')
  await toolbar.getByRole('button', { name: 'Note' }).click()
  await page.getByPlaceholder('Add a note…').fill('Sounds like the sea — rhythm of the whole chapter.')
  await shot('11-note-editor')
  await page.getByRole('button', { name: 'Save' }).click()
  await selectInEpub(page, 'the logbook')
  await toolbar.getByRole('button', { name: 'Highlight blue' }).click()
  await page.waitForTimeout(400)
  await shot('12-highlights')
  await page.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
  await page.getByRole('tab', { name: /^Notes/ }).click()
  await shot('13-notes-tab')
  await page.goto('/')
  await openBook(page, PDF_TITLE)
  const span = page.locator('.textLayer span', { hasText: 'The lamp at the top' }).first()
  await span.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(r) })
  await toolbar.getByRole('button', { name: 'Highlight green' }).click()
  await page.waitForTimeout(300)
  await shot('14-pdf-highlight')
})
