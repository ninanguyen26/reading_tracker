import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addBooks, EPUB, EPUB_TITLE, footer, openBook, PDF, PDF_TITLE, selectInEpub } from './helpers'

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selected text' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Highlight' })
const openNotes = async (page: Page) => {
  await page.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
  await page.getByRole('tab', { name: /^Notes/ }).click()
}

test.describe('EPUB', () => {
  test.beforeEach(async ({ page }) => {
    await addBooks(page, EPUB)
    await openBook(page, EPUB_TITLE)
  })

  test('highlights selected text and lists it under Notes', async ({ page }) => {
    await selectInEpub(page, 'counted the seconds')
    await expect(toolbar(page)).toBeVisible()
    // Several words: no dictionary button.
    await expect(toolbar(page).getByRole('button', { name: 'Define' })).toHaveCount(0)
    await toolbar(page).getByRole('button', { name: 'Highlight green' }).click()
    await expect(toolbar(page)).toHaveCount(0)

    await openNotes(page)
    const panel = page.getByRole('dialog')
    await expect(panel.getByRole('tab', { name: 'Notes (1)' })).toBeVisible()
    await expect(panel).toContainText('counted the seconds')
    await expect(panel).toContainText('Chapter 1: The Tower')
  })

  test('tapping a highlight opens it to add a note, recolor, or delete', async ({ page }) => {
    const point = await selectInEpub(page, 'patient, steady sound')
    await toolbar(page).getByRole('button', { name: 'Highlight yellow' }).click()
    await expect(toolbar(page)).toHaveCount(0)
    await page.waitForTimeout(500) // foliate draws new highlights asynchronously

    // The highlight is drawn: tapping on it opens the editor instead of turning the page.
    const before = await footer(page).textContent()
    await page.mouse.click(point.x, point.y)
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page)).toContainText('patient, steady sound')
    await expect(footer(page)).toHaveText(before!)

    await sheet(page).getByRole('radio', { name: 'Pink' }).click()
    await expect(sheet(page).getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true')
    await sheet(page).getByPlaceholder('Add a note…').fill('Sounds like the sea.')
    await sheet(page).getByRole('button', { name: 'Save' }).click()
    await expect(sheet(page)).toHaveCount(0)
    await openNotes(page)
    await expect(page.getByRole('dialog')).toContainText('Sounds like the sea.')

    // Saved and redrawn after a reload.
    await page.reload()
    await expect(footer(page)).toContainText('%')
    await page.waitForTimeout(500)
    await page.mouse.click(point.x, point.y)
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByPlaceholder('Add a note…')).toHaveValue('Sounds like the sea.')
    await expect(sheet(page).getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true')

    await sheet(page).getByRole('button', { name: 'Delete' }).click()
    await sheet(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(sheet(page)).toHaveCount(0)
    await openNotes(page)
    await expect(page.getByRole('dialog')).toContainText('No highlights yet')
  })

  test('highlights several passages back to back', async ({ page }) => {
    await selectInEpub(page, 'counted the seconds')
    await toolbar(page).getByRole('button', { name: 'Highlight yellow' }).click()
    // Select again straight away: the first save must not clear this selection.
    await selectInEpub(page, 'patient, steady sound')
    await toolbar(page).getByRole('button', { name: 'Highlight blue' }).click()
    await selectInEpub(page, 'the logbook')
    await toolbar(page).getByRole('button', { name: 'Highlight pink' }).click()

    await openNotes(page)
    await expect(page.getByRole('tab', { name: 'Notes (3)' })).toBeVisible()
  })

  test('the Note button highlights and opens the note editor', async ({ page }) => {
    await selectInEpub(page, 'grandmother')
    await expect(toolbar(page).getByRole('button', { name: 'Define' })).toBeVisible()
    await toolbar(page).getByRole('button', { name: 'Note' }).click()
    const note = sheet(page).getByPlaceholder('Add a note…')
    await expect(note).toBeFocused()
    await note.fill('Family tradition')
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)

    await openNotes(page)
    await expect(page.getByRole('dialog')).toContainText('Family tradition')
  })

  test('jumps to a highlight from the Notes list', async ({ page }) => {
    await selectInEpub(page, 'counted the seconds')
    await toolbar(page).getByRole('button', { name: 'Highlight blue' }).click()
    await page.getByRole('button', { name: 'Contents, bookmarks and notes' }).click()
    await page.getByRole('button', { name: 'Chapter 3: The Letter' }).click()
    await expect(footer(page)).toContainText('Chapter 3')

    await openNotes(page)
    await page.getByRole('button', { name: /^Highlight: Mara counted the seconds|counted the seconds/ }).click()
    await expect(footer(page)).toContainText('Chapter 1')
    await expect(sheet(page)).toContainText('counted the seconds')
  })

  test('exports highlights and notes as Markdown', async ({ page }) => {
    await selectInEpub(page, 'the logbook')
    await toolbar(page).getByRole('button', { name: 'Note' }).click()
    await sheet(page).getByPlaceholder('Add a note…').fill('Keep a log')
    await sheet(page).getByRole('button', { name: 'Save' }).click()

    await openNotes(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export as Markdown' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('The Lighthouse Keeper - notes.md')
    const text = await readFile((await download.path())!, 'utf8')
    expect(text).toContain('# The Lighthouse Keeper')
    expect(text).toContain('## Chapter 1: The Tower')
    expect(text).toContain('> the logbook')
    expect(text).toContain('**Note:** Keep a log')
  })

  test('copies selected text', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await selectInEpub(page, 'stove to keep warm')
    await toolbar(page).getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByRole('status')).toHaveText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('stove to keep warm')
  })
})

test.describe('PDF', () => {
  test.beforeEach(async ({ page }) => {
    await addBooks(page, PDF)
    await openBook(page, PDF_TITLE)
  })

  /** Selects the first text-layer line containing `text`, returning its center. */
  async function selectPdfLine(page: Page, text: string) {
    const span = page.locator('.textLayer span', { hasText: text }).first()
    await span.evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      document.getSelection()!.removeAllRanges()
      document.getSelection()!.addRange(range)
    })
    const box = (await span.boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  test('highlights text on the page, keeps it aligned when zooming, and remembers it', async ({ page }) => {
    const point = await selectPdfLine(page, 'The lamp at the top')
    await toolbar(page).getByRole('button', { name: 'Highlight yellow' }).click()
    const mark = page.locator('[data-highlight-id]')
    await expect(mark).toHaveCount(1)

    // The mark covers the selected words.
    const span = (await page.locator('.textLayer span', { hasText: 'The lamp at the top' }).first().boundingBox())!
    const box = (await mark.boundingBox())!
    expect(box.x).toBeCloseTo(span.x, -1)
    expect(box.width).toBeCloseTo(span.width, -1)

    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await mark.boundingBox())!.width).toBeGreaterThan(box.width * 1.15)

    // Only drawn on its own page.
    await page.keyboard.press('ArrowRight')
    await expect(footer(page)).toContainText('Page 2 of 6')
    await expect(mark).toHaveCount(0)
    await page.keyboard.press('ArrowLeft')
    await expect(mark).toHaveCount(1)

    await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.reload()
    await expect(page.locator('[data-highlight-id]')).toHaveCount(1)
    await page.mouse.click(point.x, point.y)
    await expect(sheet(page)).toContainText('The lamp at the top')
    await expect(footer(page)).toContainText('Page 1 of 6')
  })

  test('lists PDF highlights with their page position', async ({ page }) => {
    await page.keyboard.press('ArrowRight')
    await expect(footer(page)).toContainText('Page 2 of 6')
    await selectPdfLine(page, 'Part One')
    await toolbar(page).getByRole('button', { name: 'Note' }).click()
    await sheet(page).getByPlaceholder('Add a note…').fill('Start of part one')
    await sheet(page).getByRole('button', { name: 'Save' }).click()

    await page.keyboard.press('ArrowLeft')
    await openNotes(page)
    const panel = page.getByRole('dialog')
    await expect(panel).toContainText('Part One · 20%')
    await expect(panel).toContainText('Start of part one')
    await panel.getByRole('button', { name: /^Highlight: Part One/ }).click()
    await expect(footer(page)).toContainText('Page 2 of 6')
  })
})
