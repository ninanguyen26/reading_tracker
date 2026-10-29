import { expect, test, type Page } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, PDF, PDF_TITLE } from './helpers'

const shelfTabs = (page: Page) => page.getByRole('tablist', { name: 'Shelves' }).getByRole('tab')
const cards = (page: Page) => page.getByTestId('book-card')

async function openBookMenu(page: Page, title: string) {
  await page.getByRole('button', { name: `Options for ${title}` }).click()
  return page.getByRole('menu', { name: `Options for ${title}` })
}

test('creates shelves, puts books on them, and filters the library', async ({ page }) => {
  await addBooks(page, EPUB, PDF)
  await expect(shelfTabs(page)).toHaveText(['All books 2'])

  // A new shelf from the shelf bar starts out empty and selected.
  await page.getByRole('button', { name: 'New shelf' }).click()
  await page.getByRole('textbox', { name: 'New shelf name' }).fill('Favorites')
  await page.keyboard.press('Enter')
  await expect(shelfTabs(page)).toHaveText(['All books 2', 'Favorites 0'])
  await expect(page.getByRole('tab', { name: 'Favorites 0' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('No books on this shelf yet.')).toBeVisible()

  // Put a book on it from the book's menu.
  await page.getByRole('tab', { name: /^All books/ }).click()
  let menu = await openBookMenu(page, PDF_TITLE)
  await menu.getByRole('menuitemcheckbox', { name: 'Favorites' }).click()
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Favorites' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // Make a second shelf straight from a book's menu.
  menu = await openBookMenu(page, EPUB_TITLE)
  await menu.getByRole('menuitem', { name: 'New shelf…' }).click()
  await menu.getByRole('textbox', { name: 'New shelf name' }).fill('To read')
  await page.keyboard.press('Enter')
  await expect(menu.getByRole('menuitemcheckbox', { name: 'To read' })).toHaveAttribute('aria-checked', 'true')
  await page.mouse.click(5, 500)
  await expect(shelfTabs(page)).toHaveText(['All books 2', 'Favorites 1', 'To read 1'])

  await page.getByRole('tab', { name: /^Favorites/ }).click()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page)).toContainText(PDF_TITLE)

  // The chosen shelf is remembered.
  await page.reload()
  await expect(page.getByRole('tab', { name: /^Favorites/ })).toHaveAttribute('aria-selected', 'true')
  await expect(cards(page)).toHaveCount(1)

  // Taking the book off the shelf.
  menu = await openBookMenu(page, PDF_TITLE)
  await menu.getByRole('menuitemcheckbox', { name: 'Favorites' }).click()
  await expect(page.getByText('No books on this shelf yet.')).toBeVisible()
})

test('renames and deletes shelves without deleting books', async ({ page }) => {
  await addBooks(page, EPUB, PDF)
  const menu = await openBookMenu(page, EPUB_TITLE)
  await menu.getByRole('menuitem', { name: 'New shelf…' }).click()
  await menu.getByRole('textbox', { name: 'New shelf name' }).fill('Classics')
  await page.keyboard.press('Enter')
  await page.mouse.click(5, 500)

  await page.getByRole('tab', { name: /^Classics/ }).click()
  await page.getByRole('button', { name: 'Options for shelf Classics' }).click()
  await page.getByRole('menuitem', { name: 'Rename shelf' }).click()
  const name = page.getByRole('textbox', { name: 'Rename shelf' })
  await name.fill('Old favorites')
  await name.press('Enter')
  await expect(shelfTabs(page)).toHaveText(['All books 2', 'Old favorites 1'])

  await page.getByRole('button', { name: 'Options for shelf Old favorites' }).click()
  await page.getByRole('menuitem', { name: 'Delete shelf' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(shelfTabs(page)).toHaveText(['All books 2'])
  await expect(cards(page)).toHaveCount(2)
})
