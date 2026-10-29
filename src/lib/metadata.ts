import type { BookFormat } from './db'

export interface BookMetadata {
  title: string
  author: string
  cover: Blob | null
}

/** Works out the format from the file's first bytes, falling back to its extension. */
export async function detectFormat(file: Blob & { name?: string }): Promise<BookFormat | null> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const magic = String.fromCharCode(...head)
  if (magic === '%PDF') return 'pdf'
  if (magic === 'PK\u0003\u0004') return 'epub'
  const ext = file.name?.toLowerCase().split('.').pop()
  if (ext === 'pdf' || ext === 'epub') return ext
  return null
}

/** "my_great-book.epub" -> "my great book" */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled'
}

// foliate-js metadata values can be plain strings or language maps like { en: 'Title' }
type LanguageMap = string | Record<string, string> | undefined
type Contributor = string | { name?: LanguageMap }

const fromLanguageMap = (x: LanguageMap): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  return Object.values(x)[0] ?? ''
}

export function formatContributors(author: Contributor | Contributor[] | undefined): string {
  const list = Array.isArray(author) ? author : author ? [author] : []
  return list
    .map(a => (typeof a === 'string' ? a : fromLanguageMap(a.name)))
    .filter(Boolean)
    .join(', ')
}

async function readEpubMetadata(file: File): Promise<BookMetadata> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  try {
    const cover = await book.getCover?.().catch(() => null)
    return {
      title: fromLanguageMap(book.metadata?.title),
      author: formatContributors(book.metadata?.author as Contributor | Contributor[] | undefined),
      cover: cover ?? null,
    }
  } finally {
    book.destroy?.()
  }
}

async function readPdfMetadata(file: File): Promise<BookMetadata> {
  const { pdfjs } = await import('./pdfjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    const { info } = (await doc.getMetadata()) as { info: { Title?: string; Author?: string } }
    return {
      title: info.Title?.trim() ?? '',
      author: info.Author?.trim() ?? '',
      cover: await renderPdfCover(doc).catch(() => null),
    }
  } finally {
    await doc.destroy()
  }
}

async function renderPdfCover(doc: import('pdfjs-dist').PDFDocumentProxy): Promise<Blob | null> {
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: 400 / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvas, viewport }).promise
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

/** Reads title, author and a cover image. Missing fields fall back to the file name. */
export async function extractMetadata(file: File, format: BookFormat): Promise<BookMetadata> {
  let meta: BookMetadata = { title: '', author: '', cover: null }
  try {
    meta = format === 'epub' ? await readEpubMetadata(file) : await readPdfMetadata(file)
  } catch (err) {
    console.warn('Could not read book metadata', err)
  }
  return {
    title: meta.title || titleFromFileName(file.name),
    author: meta.author || 'Unknown author',
    cover: meta.cover,
  }
}
