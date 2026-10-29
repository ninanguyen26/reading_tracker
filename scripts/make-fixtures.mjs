// Generates small sample books used by tests and manual QA:
//   tests/fixtures/sample.epub  (EPUB 3, cover, nav, 3 chapters)
//   tests/fixtures/sample.pdf   (6 pages with an outline)
// The text is original filler, so the files are safe to commit.
// Requires the `zip` command-line tool (preinstalled on macOS and most Linux).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'tests', 'fixtures')
mkdirSync(outDir, { recursive: true })

const sentences = [
  'The lamp at the top of the tower turned slowly through the night.',
  'Mara counted the seconds between each sweep of light across the water.',
  'Far below, the waves folded over the rocks with a patient, steady sound.',
  'She wrote the weather in the logbook, as her grandmother had done before her.',
  'A ship passed to the north, its lights small and bright against the dark.',
  'In the morning the fog came in, and the whole island seemed to hold its breath.',
  'There were letters to answer, and a stove to keep warm, and gulls to watch.',
  'Nothing about the work was quick, but all of it mattered to someone.',
]

const paragraph = (seed, count = 6) =>
  Array.from({ length: count }, (_, i) => sentences[(seed + i) % sentences.length]).join(' ')

// ---------- EPUB ----------

const chapters = [
  { id: 'ch1', title: 'Chapter 1: The Tower' },
  { id: 'ch2', title: 'Chapter 2: The Fog' },
  { id: 'ch3', title: 'Chapter 3: The Letter' },
]

const xhtml = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${title}</title></head>
<body>${body}</body>
</html>`

const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<rect width="600" height="900" fill="#1e3a5f"/>
<circle cx="300" cy="300" r="120" fill="#f5d76e"/>
<rect x="270" y="380" width="60" height="320" fill="#f4f1ea"/>
<text x="300" y="790" font-family="Georgia, serif" font-size="54" fill="#f4f1ea" text-anchor="middle">The Lighthouse Keeper</text>
</svg>`

const epubFiles = {
  'META-INF/container.xml': `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:7d1f5c2e-0b5a-4d8e-9c1a-reading-tracker-sample</dc:identifier>
    <dc:title>The Lighthouse Keeper</dc:title>
    <dc:creator>Avery Quinn</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
${chapters.map(c => `    <item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine>
${chapters.map(c => `    <itemref idref="${c.id}"/>`).join('\n')}
  </spine>
</package>`,
  'OEBPS/nav.xhtml': xhtml('Contents', `<nav epub:type="toc"><h1>Contents</h1><ol>
${chapters.map(c => `<li><a href="${c.id}.xhtml">${c.title}</a></li>`).join('\n')}
</ol></nav>`),
  'OEBPS/cover.svg': coverSvg,
}
chapters.forEach((c, n) => {
  const paras = Array.from({ length: 24 }, (_, i) => `<p>${paragraph(n * 3 + i)}</p>`).join('\n')
  epubFiles[`OEBPS/${c.id}.xhtml`] = xhtml(c.title, `<h1>${c.title}</h1>\n${paras}`)
})

const work = mkdtempSync(join(tmpdir(), 'epub-'))
writeFileSync(join(work, 'mimetype'), 'application/epub+zip')
for (const [path, content] of Object.entries(epubFiles)) {
  mkdirSync(dirname(join(work, path)), { recursive: true })
  writeFileSync(join(work, path), content)
}
const epubPath = join(outDir, 'sample.epub')
rmSync(epubPath, { force: true })
// The mimetype entry must come first and be stored uncompressed.
execFileSync('zip', ['-X0q', epubPath, 'mimetype'], { cwd: work })
execFileSync('zip', ['-X9rq', epubPath, 'META-INF', 'OEBPS'], { cwd: work })
rmSync(work, { recursive: true, force: true })

// ---------- PDF ----------

const pdfTitles = ['Introduction', 'Part One', 'Part Two', 'Part Three', 'Notes', 'Afterword']
const escapePdf = s => s.replace(/[\\()]/g, m => '\\' + m)
const wrap = (text, width = 80) => {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > width) { lines.push(line.trim()); line = '' }
    line += ' ' + word
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

const pageCount = pdfTitles.length
// Object numbers: 1 catalog, 2 pages, 3 font, 4 outlines,
// then per page: page, content, outline item.
const pageObj = i => 5 + i * 3
const contentObj = i => 6 + i * 3
const outlineObj = i => 7 + i * 3
const objects = {}
objects[1] = '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R /PageMode /UseOutlines >>'
objects[2] = `<< /Type /Pages /Kids [${pdfTitles.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pageCount} >>`
objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
objects[4] = `<< /Type /Outlines /First ${outlineObj(0)} 0 R /Last ${outlineObj(pageCount - 1)} 0 R /Count ${pageCount} >>`
pdfTitles.forEach((title, i) => {
  const body = wrap(Array.from({ length: 5 }, (_, p) => paragraph(i + p, 3)).join(' '))
  const ops = [
    'BT /F1 22 Tf 72 720 Td', `(${escapePdf(title)}) Tj`, 'ET',
    'BT /F1 11 Tf 72 680 Td 15 TL',
    ...body.map(l => `(${escapePdf(l)}) '`),
    'ET',
    `BT /F1 9 Tf 290 40 Td (${i + 1}) Tj ET`,
  ].join('\n')
  objects[pageObj(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj(i)} 0 R >>`
  objects[contentObj(i)] = `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`
  const links = [
    i > 0 ? `/Prev ${outlineObj(i - 1)} 0 R` : '',
    i < pageCount - 1 ? `/Next ${outlineObj(i + 1)} 0 R` : '',
  ].join(' ')
  objects[outlineObj(i)] = `<< /Title (${escapePdf(title)}) /Parent 4 0 R ${links} /Dest [${pageObj(i)} 0 R /Fit] >>`
})

const objCount = 4 + pageCount * 3
let pdf = '%PDF-1.4\n'
const offsets = []
for (let n = 1; n <= objCount; n++) {
  offsets[n] = Buffer.byteLength(pdf)
  pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`
}
const xrefAt = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`
for (let n = 1; n <= objCount; n++) pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objCount + 1} /Root 1 0 R /Info << /Title (Field Notes) /Author (Jordan Lee) >> >>\nstartxref\n${xrefAt}\n%%EOF\n`
writeFileSync(join(outDir, 'sample.pdf'), pdf)

console.log('Wrote tests/fixtures/sample.epub and tests/fixtures/sample.pdf')
