/**
 * Smoke test for the claude.ai preview build (npm run build:preview && npm run test:preview).
 * Serves the page inside the same document skeleton claude.ai adds, stubs the claude.ai runtime
 * (`sample`, `downloads`) and drives the main flows in Chromium.
 */
import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EXTRACTION, REVIEW, COACH } from './mock-anthropic.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = 'e2e/artifacts/preview';
mkdirSync(OUT, { recursive: true });

const page = readFileSync('artifact-dist/cadence-preview.html', 'utf8');
const doc = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(doc);
});
await new Promise((r) => server.listen(4321, '127.0.0.1', r));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

const stub = ({ EXTRACTION, REVIEW, COACH }) => {
  const reply = (input) => (input.includes('trade-screenshot analyst') ? EXTRACTION : input.includes('Review this trade') ? REVIEW : COACH);
  const sample = Object.assign(
    async (input) => ({ text: JSON.stringify(reply(input)), truncated: false }),
    {
      json: async (input, opts = {}) => {
        window.__sampleCalls = [...(window.__sampleCalls || []), { images: opts.images ? opts.images.length : 0, tier: opts.modelTier }];
        const text = JSON.stringify(reply(input));
        await new Promise((r) => setTimeout(r, 300));
        opts.onText?.({ text, delta: text });
        return reply(input);
      },
      limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } }),
    },
  );
  const downloads = { save: async (r) => ((window.__saved = [...(window.__saved || []), r.filename]), { status: 'saved' }) };
  window.claude = { use: async (name) => (name === 'sample' ? sample : name === 'downloads' ? downloads : null) };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(stub, { EXTRACTION, REVIEW, COACH });
const p = await ctx.newPage();
p.setDefaultTimeout(15000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text()) && errors.push(m.text()));

console.log('\nCADENCE preview\n');
await step('Opens on the dashboard with labelled example trades', async () => {
  await p.goto('http://127.0.0.1:4321/');
  await p.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await p.getByText(/example trades so every screen has data/).waitFor();
  await p.getByText('Total net P&L').waitFor();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
});

await step('Navigates every section without a server', async () => {
  for (const [label, heading] of [['Journal', 'Journal'], ['Analytics', 'Analytics'], ['Calendar', 'Calendar'], ['Settings', 'Settings'], ['Dashboard', 'Dashboard']]) {
    await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
    await p.getByRole('heading', { name: heading, exact: true }).first().waitFor();
  }
});

await step('Opens a trade, completes its journal and gets an AI review (sample stub)', async () => {
  await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal', exact: true }).click();
  await p.getByRole('button', { name: /Needs journal/ }).click();
  await p.locator('a[href^="/trade?id="]').first().click();
  await p.getByRole('button', { name: /Journal this trade/ }).click();
  for (const [title, picks, next] of [
    ['How did you feel before entering?', ['Calm'], true],
    ['How did you feel while in the position?', ['Disciplined'], true],
    ['How do you feel now?', ['Satisfied'], true],
    ['Did you follow your trading rules?', ['Completely followed'], false],
    ['Grade your entry', ['A'], false],
    ['How was your exit?', ['Followed plan'], true],
    ['Any execution mistakes?', ['No mistakes'], true],
    ['Was the setup valid?', ['Fully valid'], false],
    ['What is the main lesson?', ['Better patience'], true],
  ]) {
    await p.getByRole('heading', { name: title }).waitFor();
    for (const l of picks) await p.getByRole('button', { name: l, exact: true }).click();
    if (next) await p.getByRole('button', { name: 'Next' }).click();
  }
  await p.getByRole('button', { name: 'Save journal' }).click();
  await p.getByText('Journal saved').waitFor();
  await p.getByRole('button', { name: 'Generate review' }).click();
  await p.getByText('Patient, rule-based long').waitFor();
});

await step('Analyzes a screenshot through the sample capability', async () => {
  await p.getByRole('link', { name: 'Analyze trade' }).first().click();
  await p.locator('input[type=file][accept="image/*"]').setInputFiles('e2e/fixtures/nq-long.png');
  await p.getByRole('button', { name: 'Analyze 1 screenshot' }).click();
  await p.getByRole('heading', { name: 'Review what CADENCE read' }).waitFor();
  assert((await p.locator('#f-entry_price').inputValue()) === '21450.25', 'entry not filled');
  assert((await p.locator('#f-commission').inputValue()) === '', 'commission must stay empty');
  const calls = await p.evaluate(() => window.__sampleCalls);
  assert(calls.some((c) => c.images >= 1 && c.tier === 'complex'), `sample call ${JSON.stringify(calls)}`);
  await p.screenshot({ path: `${OUT}/confirm.png`, fullPage: true });
  await p.getByRole('button', { name: 'Confirm & journal' }).last().click();
  await p.getByRole('button', { name: 'Skip journal for now' }).click();
  await p.getByText('Trade saved').waitFor();
  await p.getByRole('heading', { name: 'NQ', exact: true }).waitFor();
});

await step('Coach finds patterns in the example data and writes a report', async () => {
  await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analytics', exact: true }).click();
  await p.getByRole('tab', { name: 'AI Coach' }).click();
  await p.getByText(/is costing you|is a strength/).first().waitFor();
  await p.getByRole('button', { name: 'Generate report' }).click();
  await p.getByText('NY AM session edge').waitFor();
});

await step('Exports CSV through the downloads capability', async () => {
  await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings', exact: true }).click();
  await p.getByRole('button', { name: 'Export CSV' }).click();
  await p.waitForFunction(() => (window.__saved || []).some((f) => f.endsWith('.csv')));
});

await step('Removes the example data and keeps your own trade', async () => {
  await p.getByRole('button', { name: 'Remove examples' }).click();
  await p.getByText(/Removed \d+ example trades/).waitFor();
  await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal', exact: true }).click();
  await p.getByText('1 trades recorded').waitFor();
});

const m = await browser.newContext({ ...devices['iPhone 14 Pro'] });
await m.addInitScript(stub, { EXTRACTION, REVIEW, COACH });
const mp = await m.newPage();
await step('Phone layout: no sideways scroll, bottom navigation works', async () => {
  await mp.goto('http://127.0.0.1:4321/');
  await mp.getByText('Total net P&L').waitFor();
  await mp.waitForTimeout(1000);
  await mp.screenshot({ path: `${OUT}/mobile.png` });
  await mp.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click();
  await mp.getByText('Month summary').waitFor();
  assert(!(await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'horizontal overflow');
});

const blank = await browser.newContext();
const bp = await blank.newPage();
await step('Without the claude.ai runtime, AI shows as unavailable (no crash)', async () => {
  await bp.goto('http://127.0.0.1:4321/');
  await bp.getByText('Total net P&L').waitFor();
  await bp.evaluate(() => document.querySelector('a[href="/analyze"]')?.click());
  await bp.getByText('AI analysis isn’t available on this deployment').waitFor();
});

await step('No uncaught errors', async () => assert(errors.length === 0, errors.slice(0, 3).join(' | ')));
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
