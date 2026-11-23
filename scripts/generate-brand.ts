/**
 * Generates every CADENCE brand asset from src/lib/brand/geometry.ts:
 *   public/brand/*.svg   — logo, symbol (dark/light/mono/flat/outline), wordmark, lockups
 *   public/icons/*.png   — app icons, maskable icon, Apple touch icon, favicons
 *   public/brand/og.png  — social preview
 *
 * Usage: npm run icons   (needs Playwright + Chromium; set PLAYWRIGHT_PATH if it is installed globally)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { appIconSvg, lockupSvg, symbolSvg, wordmarkSvg } from '../src/lib/brand/geometry.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

mkdirSync('public/brand', { recursive: true });
mkdirSync('public/icons', { recursive: true });

const svgs: Record<string, string> = {
  'cadence-symbol.svg': symbolSvg('dark'),
  'cadence-symbol-light.svg': symbolSvg('light'),
  'cadence-symbol-mono.svg': symbolSvg('mono', { color: '#FFFFFF' }),
  'cadence-symbol-mono-black.svg': symbolSvg('mono', { color: '#0B0B0F' }),
  'cadence-symbol-small.svg': symbolSvg('flat'),
  'cadence-symbol-outline.svg': symbolSvg('outline'),
  'cadence-wordmark.svg': wordmarkSvg('chrome'),
  'cadence-wordmark-dark.svg': wordmarkSvg('dark'),
  'cadence-logo.svg': lockupSvg('dark'),
  'cadence-logo-light.svg': lockupSvg('light'),
  'cadence-app-icon.svg': appIconSvg('dark'),
  'cadence-app-icon-light.svg': appIconSvg('light'),
  'cadence-app-icon-mono.svg': appIconSvg('mono'),
  'cadence-app-icon-violet.svg': appIconSvg('violet'),
  'cadence-app-icon-outline.svg': appIconSvg('outline'),
};
for (const [name, svg] of Object.entries(svgs)) writeFileSync(`public/brand/${name}`, svg + '\n');

const pngs: { out: string; svg: string; size: number; h?: number }[] = [
  { out: 'public/icons/icon-192.png', svg: appIconSvg('dark', 192), size: 192 },
  { out: 'public/icons/icon-512.png', svg: appIconSvg('dark', 512), size: 512 },
  { out: 'public/icons/icon-1024.png', svg: appIconSvg('dark', 1024), size: 1024 },
  { out: 'public/icons/maskable-512.png', svg: appIconSvg('dark', 512, 0.52), size: 512 },
  { out: 'public/icons/apple-touch-icon.png', svg: appIconSvg('dark', 180, 0.64), size: 180 },
  { out: 'public/icons/favicon-32.png', svg: appIconSvg('violet', 32, 0.8), size: 32 },
  { out: 'public/icons/favicon-64.png', svg: appIconSvg('dark', 64, 0.76), size: 64 },
  { out: 'public/icons/badge-96.png', svg: symbolSvg('mono', { color: '#FFFFFF' }), size: 96 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const p of pngs) {
  const h = p.h ?? p.size;
  await page.setViewportSize({ width: p.size, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${p.svg.replace('<svg ', `<svg style="display:block;width:${p.size}px;height:${h}px" `)}</body></html>`,
  );
  await page.screenshot({ path: p.out, omitBackground: true });
  console.log('✓', p.out);
}
// Social preview
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:grid;place-items:center;background:radial-gradient(120% 90% at 20% 10%,#2A1450 0%,#120C1C 45%,#0B0B0F 100%)">
<div style="width:980px">${lockupSvg('dark').replace('<svg ', '<svg style="width:980px;height:auto;display:block" ')}</div></body></html>`);
await page.screenshot({ path: 'public/brand/og.png' });
console.log('✓ public/brand/og.png');
await browser.close();
