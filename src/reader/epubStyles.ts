import type { ReaderSettings, Theme } from '../lib/db'

export const THEME_COLORS: Record<Theme, { bg: string; fg: string; link: string }> = {
  light: { bg: '#ffffff', fg: '#1c1917', link: '#1d4ed8' },
  sepia: { bg: '#f4ecd8', fg: '#3b2f22', link: '#8a4b0f' },
  dark: { bg: '#121212', fg: '#e7e2d9', link: '#8ab4f8' },
}

const FONT_STACKS = {
  serif: `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`,
  sans: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
}

/** CSS injected into each EPUB chapter so the reader's settings override the book's own styles. */
export function buildEpubCss(s: ReaderSettings): string {
  const c = THEME_COLORS[s.theme]
  const font = s.fontFamily === 'original' ? '' : `
    body, body *:not(pre):not(code):not(kbd):not(samp) {
      font-family: ${FONT_STACKS[s.fontFamily]} !important;
    }`
  // Light theme keeps the book's own colors; sepia and dark recolor everything.
  const recolor = s.theme === 'light' ? '' : `
    body * {
      color: inherit !important;
      background-color: transparent !important;
      border-color: currentColor !important;
    }`
  // Backgrounds stay transparent so the reader's themed background shows
  // through; foliate-js only samples a chapter's background once, when it loads.
  return `
    html {
      color-scheme: ${s.theme === 'dark' ? 'dark' : 'light'};
      font-size: ${s.fontSize}% !important;
      background: transparent !important;
      color: ${c.fg} !important;
    }
    body {
      background: transparent !important;
      color: ${c.fg} !important;
    }
    p, li, blockquote, dd {
      line-height: ${s.lineHeight} !important;
    }
    a:any-link {
      color: ${c.link} !important;
    }
    img, svg, video {
      max-width: 100%;
    }
    pre {
      white-space: pre-wrap !important;
    }${font}${recolor}`
}
