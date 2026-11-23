/**
 * CADENCE brand geometry — the single source of truth for every logo asset.
 *
 * Traced from the CADENCE brand board (design/cadence-brand-board.png): a folded chrome
 * ribbon forming a geometric "C" — a top band and a bottom band with parallel 45° cuts,
 * a chrome diagonal spine ending in a rounded tip, and an electric-purple inner fold.
 *
 * Pure string builders (no imports) so they run in the browser, on the server and in
 * `scripts/generate-brand.ts` (Node type stripping) alike.
 */

export type SymbolVariant = 'dark' | 'light' | 'mono' | 'flat' | 'outline';

/** Symbol artboard (ribbon spans 0..700 × 0..540; padded for the glow). */
export const SYMBOL_VIEWBOX = '-20 -20 740 580';
export const SYMBOL_ASPECT = 740 / 580;

export const P = {
  band: 'M8 340 L150 400 L645 400 L525 535 L145 535 Q108 535 92 508 L10 360 Q2 348 8 340 Z',
  fold: 'M300 146 L342 146 L162 400 Q128 428 88 410 L28 352 Z',
  main: 'M345 5 L695 5 L560 145 L335 145 Q314 145 300 158 L52 344 Q27 362 11 346 Q0 334 8 322 L312 14 Q323 5 345 5 Z',
  /** Outer silhouette (used for glow + outline variant). */
  outline:
    'M345 5 L695 5 L560 145 L342 146 L162 400 L645 400 L525 535 L145 535 Q108 535 92 508 L10 360 Q0 340 11 326 L312 14 Q323 5 345 5 Z',
  hiTop: 'M347 6.5 L693 6.5',
  hiBand: 'M154 401.5 L643 401.5',
  hiFold: 'M342 148 L162 400',
  hiCurl: 'M10 360 L92 508 Q108 535 145 535',
} as const;

interface Palette {
  chrome: [number, string][];
  fold: [number, string][];
  band: [number, string][];
  glow?: string;
  hi?: { top: string; band: string; fold: string; curl: string };
}

const PALETTES: Record<'dark' | 'light' | 'flat', Palette> = {
  dark: {
    chrome: [
      [0, '#A98BEA'],
      [0.28, '#E4E0F0'],
      [0.55, '#FFFFFF'],
      [0.8, '#D9D9E2'],
      [1, '#B9B7C8'],
    ],
    fold: [
      [0, '#4B1A92'],
      [0.45, '#7426D6'],
      [1, '#B46AFF'],
    ],
    band: [
      [0, '#8A2BE2'],
      [0.38, '#B98CF2'],
      [0.7, '#E6E2F0'],
      [1, '#D9D9E2'],
    ],
    glow: '#8A2BE2',
    hi: { top: '#FFFFFF', band: '#F3EEFF', fold: '#D7B8FF', curl: '#C99BFF' },
  },
  light: {
    chrome: [
      [0, '#5B2BA8'],
      [0.3, '#2A2735'],
      [0.6, '#15131C'],
      [1, '#3B3848'],
    ],
    fold: [
      [0, '#3A1172'],
      [0.5, '#7A2DE0'],
      [1, '#B46AFF'],
    ],
    band: [
      [0, '#8A2BE2'],
      [0.4, '#6B3BB0'],
      [0.75, '#2C2938'],
      [1, '#1D1B25'],
    ],
  },
  flat: {
    chrome: [
      [0, '#C9B8F2'],
      [0.5, '#F4F3F8'],
      [1, '#D9D9E2'],
    ],
    fold: [
      [0, '#6A22CC'],
      [1, '#B46AFF'],
    ],
    band: [
      [0, '#9A45EC'],
      [0.6, '#DCD6EE'],
      [1, '#D9D9E2'],
    ],
  },
};

const stops = (s: [number, string][]) => s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');

export interface SymbolOptions {
  /** Unique prefix for gradient ids (required when several inline SVGs share a page). */
  id?: string;
  /** Include the soft purple glow (dark variant only). */
  glow?: boolean;
  /** Fill for mono / outline variants. */
  color?: string;
  title?: string;
}

/** Inner SVG markup for the symbol (no <svg> wrapper) — reused inside icons and lockups. */
export function symbolMarkup(variant: SymbolVariant, opts: SymbolOptions = {}): string {
  const id = opts.id ?? 'cs';
  if (variant === 'mono') {
    const c = opts.color ?? 'currentColor';
    return [
      `<path d="${P.band}" fill="${c}" fill-opacity="0.78"/>`,
      `<path d="${P.fold}" fill="${c}" fill-opacity="0.42"/>`,
      `<path d="${P.main}" fill="${c}"/>`,
    ].join('');
  }
  if (variant === 'outline') {
    const c = opts.color ?? '#B46AFF';
    return [
      `<path d="${P.outline}" fill="none" stroke="${c}" stroke-width="14" stroke-linejoin="round"/>`,
      `<path d="M300 158 L52 344" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-opacity="0.75"/>`,
    ].join('');
  }
  const pal = PALETTES[variant];
  const glow = (opts.glow ?? variant === 'dark') && pal.glow;
  const defs = [
    `<linearGradient id="${id}-chrome" x1="0" y1="1" x2="1" y2="0">${stops(pal.chrome)}</linearGradient>`,
    `<linearGradient id="${id}-fold" x1="0.7" y1="0" x2="0.2" y2="1">${stops(pal.fold)}</linearGradient>`,
    `<linearGradient id="${id}-band" x1="0" y1="0" x2="1" y2="0">${stops(pal.band)}</linearGradient>`,
    `<linearGradient id="${id}-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#1A1028" stop-opacity="0.25"/></linearGradient>`,
    glow
      ? `<filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      : '',
  ].join('');
  const parts = [`<defs>${defs}</defs>`];
  if (glow) {
    parts.push(
      `<g filter="url(#${id}-glow)" opacity="0.55"><path d="${P.outline}" fill="none" stroke="${pal.glow}" stroke-width="6" stroke-linejoin="round"/></g>`,
    );
  }
  parts.push(
    `<path d="${P.band}" fill="url(#${id}-band)"/>`,
    variant === 'flat' ? '' : `<path d="${P.band}" fill="url(#${id}-shade)"/>`,
    `<path d="${P.fold}" fill="url(#${id}-fold)"/>`,
    `<path d="${P.main}" fill="url(#${id}-chrome)"/>`,
  );
  if (pal.hi) {
    parts.push(
      `<path d="${P.hiTop}" stroke="${pal.hi.top}" stroke-width="2.5" stroke-opacity="0.9"/>`,
      `<path d="${P.hiBand}" stroke="${pal.hi.band}" stroke-width="2" stroke-opacity="0.7"/>`,
      `<path d="${P.hiFold}" stroke="${pal.hi.fold}" stroke-width="2" stroke-opacity="0.8"/>`,
      `<path d="${P.hiCurl}" fill="none" stroke="${pal.hi.curl}" stroke-width="2.5" stroke-opacity="0.9"/>`,
    );
  }
  return parts.join('');
}

export function symbolSvg(variant: SymbolVariant = 'dark', opts: SymbolOptions = {}): string {
  const title = opts.title ?? 'CADENCE';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SYMBOL_VIEWBOX}" role="img" aria-label="${title}">${symbolMarkup(variant, opts)}</svg>`;
}

// ───────────────────────── Wordmark ─────────────────────────
// Custom geometric lettering: Λ-style A, open-left D, terminals cut at the symbol's angle.

export const WORDMARK_VIEWBOX = '0 0 536 40';
export const WORDMARK_ASPECT = 536 / 40;

const L = {
  C: 'M56 0 H14 A14 14 0 0 0 0 14 V26 A14 14 0 0 0 14 40 H51 L56 33 H14 A7 7 0 0 1 7 26 V14 A7 7 0 0 1 14 7 H51 Z',
  A: 'M0 40 L28 0 L56 40 H46.5 L28 13.5 L9.5 40 Z',
  D: 'M5 0 H42 A14 14 0 0 1 56 14 V26 A14 14 0 0 1 42 40 H0 L5 33 H42 A7 7 0 0 0 49 26 V14 A7 7 0 0 0 42 7 H0 Z',
  E: 'M0 0 H56 L51 7 H7 V16.5 H48 L43 23.5 H7 V33 H56 L51 40 H0 Z',
  N: 'M0 40 V0 H8.5 L47.5 29 V0 H56 V40 H47.5 L8.5 11 V40 Z',
};

export const WORDMARK_PATH = (['C', 'A', 'D', 'E', 'N', 'C', 'E'] as const)
  .map((ch, i) => `<path transform="translate(${i * 80} 0)" d="${L[ch]}"/>`)
  .join('');

export type WordmarkVariant = 'chrome' | 'white' | 'dark' | 'mono';

export function wordmarkMarkup(variant: WordmarkVariant = 'chrome', id = 'cw', color?: string): string {
  if (variant === 'chrome') {
    return `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#E4E3EC"/><stop offset="1" stop-color="#B7B5C6"/></linearGradient></defs><g fill="url(#${id}-g)">${WORDMARK_PATH}</g>`;
  }
  const fill = color ?? (variant === 'white' ? '#FFFFFF' : variant === 'dark' ? '#0B0B0F' : 'currentColor');
  return `<g fill="${fill}">${WORDMARK_PATH}</g>`;
}

export function wordmarkSvg(variant: WordmarkVariant = 'chrome'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}" role="img" aria-label="CADENCE">${wordmarkMarkup(variant)}</svg>`;
}

// ───────────────────────── Lockup ─────────────────────────

/** Horizontal lockup: symbol │ CADENCE + tagline, as on the brand board header. */
export function lockupSvg(theme: 'dark' | 'light' = 'dark'): string {
  const symbol = symbolMarkup(theme === 'dark' ? 'dark' : 'light', { id: `lk-${theme}` });
  const word = wordmarkMarkup(theme === 'dark' ? 'chrome' : 'dark', `lkw-${theme}`);
  const divider = theme === 'dark' ? '#3A3550' : '#C9C6D6';
  const tag = theme === 'dark' ? '#D9D9E2' : '#2A2735';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1640 300" role="img" aria-label="CADENCE — Trade with intention">
<svg x="0" y="20" width="330" height="260" viewBox="${SYMBOL_VIEWBOX}">${symbol}</svg>
<rect x="392" y="40" width="2" height="220" fill="${divider}"/>
<svg x="460" y="70" width="1160" height="86.6" viewBox="${WORDMARK_VIEWBOX}">${word}</svg>
<rect x="560" y="218" width="70" height="3" rx="1.5" fill="#8A2BE2"/>
<rect x="1450" y="218" width="70" height="3" rx="1.5" fill="#8A2BE2"/>
<text x="1040" y="230" text-anchor="middle" fill="${tag}" font-family="Sora, Inter, 'Helvetica Neue', Arial, sans-serif" font-size="34" font-weight="500" letter-spacing="12">TRADE WITH INTENTION</text>
</svg>`;
}

// ───────────────────────── App icons ─────────────────────────

export type IconVariant = 'dark' | 'light' | 'mono' | 'violet' | 'outline';

/**
 * Full-bleed square app icon (iOS/Android apply their own corner mask).
 * `scale` = symbol width relative to the icon; use ≤0.56 for maskable icons.
 */
export function appIconSvg(variant: IconVariant = 'dark', size = 1024, scale = 0.66): string {
  const w = size * scale;
  const h = w / SYMBOL_ASPECT;
  const x = (size - w) / 2;
  const y = (size - h) / 2 + size * 0.01;
  const bg: Record<IconVariant, string> = {
    dark: `<radialGradient id="ib-dark" cx="0.3" cy="0.22" r="0.95"><stop offset="0" stop-color="#2A1450"/><stop offset="0.45" stop-color="#140D20"/><stop offset="1" stop-color="#0B0B0F"/></radialGradient>`,
    light: `<linearGradient id="ib-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6E4EE"/></linearGradient>`,
    mono: `<linearGradient id="ib-mono" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121216"/><stop offset="1" stop-color="#050507"/></linearGradient>`,
    violet: `<radialGradient id="ib-violet" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="#9B4DFF"/><stop offset="0.55" stop-color="#5B1CB0"/><stop offset="1" stop-color="#1A1028"/></radialGradient>`,
    outline: `<linearGradient id="ib-outline" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14101E"/><stop offset="1" stop-color="#0B0B0F"/></linearGradient>`,
  };
  const sym: Record<IconVariant, string> = {
    dark: symbolMarkup('dark', { id: 'ai-dark' }),
    light: symbolMarkup('light', { id: 'ai-light' }),
    mono: symbolMarkup('mono', { color: '#F4F4F7' }),
    violet: symbolMarkup('flat', { id: 'ai-violet' }),
    outline: symbolMarkup('outline', { color: '#B46AFF' }),
  };
  const sheen =
    variant === 'light'
      ? ''
      : `<radialGradient id="is-${variant}" cx="0.5" cy="0" r="0.75"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>${bg[variant]}${sheen}</defs>
<rect width="${size}" height="${size}" fill="url(#ib-${variant})"/>
${sheen ? `<rect width="${size}" height="${size * 0.6}" fill="url(#is-${variant})"/>` : ''}
<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${SYMBOL_VIEWBOX}">${sym[variant]}</svg>
</svg>`;
}
