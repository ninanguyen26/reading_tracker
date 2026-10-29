import { expect, test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, openBook, PDF, PDF_TITLE } from './helpers'

test('shows an empty state before any books are added', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Your library is empty')).toBeVisible()
})

test('adds EPUB and PDF books with their titles, authors and covers', async ({ page }) => {
  await addBooks(page, EPUB, PDF)
  const epub = page.getByTestId('book-card').filter({ hasText: EPUB_TITLE })
  const pdf = page.getByTestId('book-card').filter({ hasText: PDF_TITLE })
  await expect(epub).toContainText('Avery Quinn')
  await expect(pdf).toContainText('Jordan Lee')
  await expect(epub.locator('img')).toBeVisible()
  await expect(pdf.locator('img')).toBeVisible()
  await expect(epub).toContainText('New')
})

test('rejects files that are not books', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByRole('alert')).toContainText('isn\'t an EPUB or PDF')
  await expect(page.getByTestId('book-card')).toHaveCount(0)
})

test('searches and sorts the library', async ({ page }) => {
  await addBooks(page, EPUB, PDF)
  await page.getByPlaceholder('Search title or author').fill('jordan')
  await expect(page.getByTestId('book-card')).toHaveCount(1)
  await expect(page.getByTestId('book-card')).toContainText(PDF_TITLE)

  await page.getByPlaceholder('Search title or author').fill('')
  await page.getByLabel('Sort by').selectOption('title')
  await expect(page.getByTestId('book-card').first()).toContainText(PDF_TITLE)
  await page.getByLabel('Sort by').selectOption('author')
  await expect(page.getByTestId('book-card').first()).toContainText(EPUB_TITLE)
})

test('deletes a book after confirming', async ({ page }) => {
  await addBooks(page, EPUB, PDF)
  await page.getByRole('button', { name: `Options for ${PDF_TITLE}` }).click()
  await page.getByRole('menuitem', { name: 'Delete book' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('book-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByTestId('book-card')).toHaveCount(1)
})

test('shows reading progress on the cover after reading', async ({ page }) => {
  await addBooks(page, PDF)
  await openBook(page, PDF_TITLE)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('footer')).toContainText('Page 3 of 6')
  await page.getByRole('link', { name: 'Back to library' }).click()
  await expect(page.getByTestId('book-card')).toContainText('40%')
})
