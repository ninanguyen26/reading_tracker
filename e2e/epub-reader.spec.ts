import { expect, test } from '@playwright/test'
import { addBooks, EPUB, EPUB_TITLE, evalInEpub, footer, mockDictionary, openBook, percent } from './helpers'

test.beforeEach(async ({ page }) => {
  await addBooks(page, EPUB)
  await openBook(page, EPUB_TITLE)
})

test('opens at the first chapter', async ({ page }) => {
  await expect(footer(page)).toContainText('Chapter 1: The Tower')
  await expect(footer(page)).toContainText(/Location 1 of \d+/)
  expect(await evalInEpub<string>(page, 'doc => doc.querySelector("h1").textContent')).toBe('Chapter 1: The Tower')
})

test('turns pages with the keyboard and remembers the position', async ({ page }) => {
  const start = await percent(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(start)
  const next = await percent(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(next)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => percent(page)).toBe(next)
  const saved = await footer(page).textContent()

  await page.waitForTimeout(700) // progress is saved shortly after the page settles
  await page.reload()
  await expect(footer(page)).toHaveText(saved!)
})

test('turns pages by tapping the sides and toggles toolbars in the middle', async ({ page }) => {
  const box = (await page.getByTestId('epub-view').boundingBox())!
  const start = await percent(page)
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2)
  await expect.poll(() => percent(page)).toBeGreaterThan(start)

  // Turning the page hides the toolbar; a middle tap brings it back.
  const header = page.locator('header')
  await expect(header).toHaveClass(/-translate-y-full/)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(header).not.toHaveClass(/-translate-y-full/)

  const before = await percent(page)
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2)
  await expect.poll(() => percent(page)).toBeLessThan(before)
})

test('jumps to a chapter from the table of contents', async ({ page }) => {
  await page.getByRole('button', { name: 'Contents and bookmarks' }).click()
  await page.getByRole('button', { name: 'Chapter 3: The Letter' }).click()
  await expect(footer(page)).toContainText('Chapter 3: The Letter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('applies and remembers display settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Larger text' }).click()
  await page.getByRole('button', { name: 'Larger text' }).click()
  await page.getByRole('button', { name: 'Sans' }).click()
  await page.getByRole('button', { name: 'Loose' }).click()
  await expect(page.getByRole('dialog', { name: 'Reading settings' })).toContainText('120%')

  const styles = () => evalInEpub<{ fg: string; rootSize: string; font: string; lineRatio: number }>(page, `doc => {
    const css = el => doc.defaultView.getComputedStyle(el)
    const p = doc.querySelector('p')
    return {
      fg: css(p).color,
      rootSize: css(doc.documentElement).fontSize,
      font: css(p).fontFamily,
      lineRatio: parseFloat(css(p).lineHeight) / parseFloat(css(p).fontSize),
    }
  }`)
  await expect.poll(async () => (await styles())?.fg).toBe('rgb(231, 226, 217)')
  const s = (await styles())!
  expect(s.rootSize).toBe('19.2px')
  expect(s.font).toContain('system-ui')
  expect(s.lineRatio).toBeCloseTo(1.8, 1)
  await expect(page.locator('.reader')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect.poll(async () => (await styles())?.fg).toBe('rgb(231, 226, 217)')
})

test('adds, lists, uses and removes bookmarks', async ({ page }) => {
  const start = await percent(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(start)
  await page.waitForTimeout(500) // let the page-turn animation finish
  await page.getByRole('button', { name: 'Add bookmark' }).click()
  await expect(page.getByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true')
  const marked = await percent(page)

  await page.getByRole('button', { name: 'Contents and bookmarks' }).click()
  await page.getByRole('button', { name: 'Chapter 3: The Letter' }).click()
  await expect(footer(page)).toContainText('Chapter 3')

  await page.getByRole('button', { name: 'Contents and bookmarks' }).click()
  await page.getByRole('button', { name: /Bookmarks/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Chapter 1: The Tower')
  await page.getByRole('dialog').getByRole('button', { name: /^Chapter 1: The Tower \d+%/ }).click()
  await expect.poll(() => percent(page)).toBe(marked)
  await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible()

  await page.getByRole('button', { name: 'Remove bookmark' }).click()
  await expect(page.getByRole('button', { name: 'Add bookmark' })).toBeVisible()
})

test('looks up a selected word in the dictionary', async ({ page }) => {
  await mockDictionary(page)
  await evalInEpub(page, `doc => {
    const p = doc.querySelector('p')
    const text = p.firstChild
    const start = text.textContent.indexOf('lamp')
    const range = doc.createRange()
    range.setStart(text, start)
    range.setEnd(text, start + 4)
    doc.getSelection().removeAllRanges()
    doc.getSelection().addRange(range)
  }`)
  const sheet = page.getByRole('dialog', { name: 'Definition of lamp' })
  await expect(sheet).toContainText('A test definition of lamp.')
  await expect(sheet).toContainText('noun')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})
