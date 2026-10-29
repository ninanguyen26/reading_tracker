import { expect, test, type Page } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, footer, openBook, PDF, PDF_TITLE, percent } from './helpers'

async function chooseLayout(page: Page, layout: 'Pages' | 'Scroll') {
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('button', { name: layout, exact: true }).click()
  await page.keyboard.press('Escape')
}

test.describe('EPUB', () => {
  test.beforeEach(async ({ page }) => {
    await addBooks(page, EPUB)
    await openBook(page, EPUB_TITLE)
  })

  test('scrolls continuously and remembers the layout', async ({ page }) => {
    await chooseLayout(page, 'Scroll')
    const flow = () => page.evaluate(() =>
      (document.querySelector('foliate-view') as unknown as { renderer?: Element } | null)?.renderer?.getAttribute('flow') ?? null)
    await expect.poll(flow).toBe('scrolled')
    await page.waitForTimeout(500) // let the new layout settle

    const start = await percent(page)
    const box = (await page.getByTestId('epub-view').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 600)
    await expect.poll(() => percent(page)).toBeGreaterThan(start)
    // Scrolling tucks the toolbar away.
    await expect(page.locator('header')).toHaveClass(/-translate-y-full/)

    await page.waitForTimeout(700)
    const saved = await percent(page)
    await page.reload()
    await expect.poll(flow).toBe('scrolled')
    await expect.poll(() => percent(page)).toBe(saved)

    // And back to pages (the toolbar shows again after the reload).
    await expect(page.locator('header')).not.toHaveClass(/-translate-y-full/)
    await chooseLayout(page, 'Pages')
    await expect.poll(flow).toBe('paginated')
  })
})

test.describe('PDF', () => {
  test.beforeEach(async ({ page }) => {
    await addBooks(page, PDF)
    await openBook(page, PDF_TITLE)
  })

  test('shows pages in one continuous column and tracks the current page', async ({ page }) => {
    await chooseLayout(page, 'Scroll')
    const view = page.getByTestId('pdf-view')
    await expect(view).toHaveAttribute('data-flow', 'scrolled')
    await expect(view.locator('[data-page]')).toHaveCount(6)

    const box = (await view.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 500)
    await expect(footer(page)).not.toContainText('Page 1 of 6')

    // Jumping via the contents scrolls that page into view.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2) // show the toolbar
    await page.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
    await page.getByRole('dialog').getByRole('listitem').getByRole('button', { name: 'Afterword' }).click()
    await expect(footer(page)).toContainText('Page 6 of 6')
    const last = view.locator('[data-page="6"]')
    await expect(last).toBeInViewport()
    await expect(last.locator('.textLayer')).toContainText('Afterword')

    // Switching back to pages keeps the place.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await chooseLayout(page, 'Pages')
    await expect(view).toHaveAttribute('data-flow', 'paginated')
    await expect(view.locator('[data-page]')).toHaveCount(1)
    await expect(footer(page)).toContainText('Page 6 of 6')
  })

  test('highlights text on any page while scrolling', async ({ page }) => {
    await chooseLayout(page, 'Scroll')
    const view = page.getByTestId('pdf-view')
    const second = view.locator('[data-page="2"]')
    await second.scrollIntoViewIfNeeded()
    await expect(second.locator('.textLayer')).toContainText('Part One')
    await second.locator('.textLayer span', { hasText: 'Part One' }).first().evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      document.getSelection()!.removeAllRanges()
      document.getSelection()!.addRange(range)
    })
    await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Highlight blue' }).click()
    await expect(second.locator('[data-highlight-id]')).toHaveCount(1)
    await expect(view.locator('[data-page="1"] [data-highlight-id]')).toHaveCount(0)

    // Scrolling hid the toolbar; a tap in the middle brings it back.
    const box = (await view.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20)

    await page.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
    await page.getByRole('tab', { name: /^Notes/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Part One · 20%')
  })
})
