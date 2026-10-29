# Reading Tracker

A Kindle-style reader for your own EPUB and PDF books. It runs entirely in the browser: books, reading positions, bookmarks and settings are stored on your device (IndexedDB), and nothing is uploaded anywhere.

## Features

**Library**
- Add books with the **Add books** button or by dragging files anywhere onto the page
- Title, author and cover are read from the file
- Search by title or author; sort by recently read, recently added, title or author
- Progress bar on every book; delete with confirmation

**Reading**
- Page turns with tap zones (left/right third of the screen), swipes, or the arrow keys / Page Up / Page Down / Space
- Tap the middle of the page to show or hide the toolbars
- Opens exactly where you left off
- Table of contents (EPUB navigation or PDF outline) and a position slider
- Bookmarks: add, list, jump to, and remove
- Select a single word to look it up (Free Dictionary API, falling back to Wiktionary; needs a connection)

**Display**
- White, sepia and dark themes
- EPUB: text size, font (original, serif, sans), line spacing and margins
- PDF: zoom; themes are applied as a tint over the page

**Offline**
- Installable as an app (PWA); everything except the dictionary works without a connection

Books with DRM (for example purchases from the Kindle store) can't be opened.

## Tech stack

| Part | Library |
| --- | --- |
| App | Vite, React, TypeScript, React Router (hash routing, so any static host works) |
| Styling | Tailwind CSS |
| EPUB | [foliate-js](https://github.com/johnfactotum/foliate-js) |
| PDF | [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) |
| Storage | [Dexie](https://dexie.org) over IndexedDB |
| Offline | `vite-plugin-pwa` |
| Tests | Vitest + Testing Library + fake-indexeddb (unit), Playwright (end-to-end) |

## Getting started

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, desktop and phone viewports). Uses your installed Chrome locally; run `npx playwright install chromium` if you don't have Chrome. |
| `npm run fixtures` | Regenerate the sample books in `tests/fixtures/` (needs the `zip` command) |

## Project layout

```
src/
  lib/           storage (db.ts, library.ts), metadata extraction, dictionary, pdf.js setup
  pages/         LibraryPage and ReaderPage
  reader/        EPUB and PDF renderers, panels (contents, settings, dictionary), helpers
  components/    book cards, covers, icons
e2e/             Playwright tests
tests/fixtures/  generated sample EPUB and PDF
scripts/         fixture generator
```

## Deploying

`npm run build` produces a static site in `dist/` that can be hosted on Cloudflare Pages, Netlify, Vercel or GitHub Pages with no server configuration.
