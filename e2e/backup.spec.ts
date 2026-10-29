import { expect, test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, footer, openBook, PDF, PDF_TITLE, selectInEpub } from './helpers'

test('backs up a library and restores it on another device', async ({ page, browser }) => {
  // Build up a library with progress, a bookmark and a highlight with a note.
  await addBooks(page, EPUB, PDF)
  await openBook(page, PDF_TITLE)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(footer(page)).toContainText('Page 3 of 6')
  await page.getByRole('button', { name: 'Add bookmark' }).click()
  await page.waitForTimeout(700) // let the position save
  await page.getByRole('link', { name: 'Back to library' }).click()

  await openBook(page, EPUB_TITLE)
  await selectInEpub(page, 'the logbook')
  await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Note' }).click()
  await page.getByPlaceholder('Add a note…').fill('Backed up note')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: 'Back to library' }).click()

  await page.getByRole('button', { name: 'Library options' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Back up library' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^reading-tracker-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  await expect(page.getByRole('status')).toContainText('Backup saved')
  const backupPath = (await download.path())!

  // A fresh browser profile stands in for a new device.
  const fresh = await browser.newContext()
  const other = await fresh.newPage()
  await other.goto('/')
  await expect(other.getByText('Your library is empty')).toBeVisible()
  await other.getByTestId('restore-input').setInputFiles(backupPath)
  await expect(other.getByRole('status')).toHaveText('Restored 2 books, 1 highlight and 1 bookmark.')
  await expect(other.getByTestId('book-card')).toHaveCount(2)
  await expect(other.getByTestId('book-card').filter({ hasText: PDF_TITLE })).toContainText('40%')

  // The PDF opens where it was left, with its bookmark.
  await openBook(other, PDF_TITLE)
  await expect(footer(other)).toContainText('Page 3 of 6')
  await expect(other.getByRole('button', { name: 'Remove bookmark' })).toBeVisible()
  await other.getByRole('link', { name: 'Back to library' }).click()

  // The EPUB's highlight and note came across.
  await openBook(other, EPUB_TITLE)
  await other.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
  await other.getByRole('tab', { name: /^Notes/ }).click()
  await expect(other.getByRole('dialog')).toContainText('Backed up note')
  await other.getByRole('button', { name: 'Close', exact: true }).click()
  await other.getByRole('link', { name: 'Back to library' }).click()

  // Restoring the same backup again adds nothing twice.
  await other.getByRole('button', { name: 'Library options' }).click()
  await other.getByRole('menuitem', { name: 'Restore from backup…' }).click()
  await other.getByTestId('restore-input').setInputFiles(backupPath)
  await expect(other.getByRole('status')).toHaveText('Restored 0 books. 2 books were already in your library.')
  await expect(other.getByTestId('book-card')).toHaveCount(2)
  await fresh.close()
})

test('explains when a file is not a backup', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('restore-input').setInputFiles({ name: 'photos.zip', mimeType: 'application/zip', buffer: Buffer.from('not really a zip') })
  await expect(page.getByRole('alert')).toContainText("This isn't a Reading Tracker backup")
})
