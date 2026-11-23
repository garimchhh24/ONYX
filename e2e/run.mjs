/**
 * CADENCE end-to-end suite (production build, real browser).
 *   npm run build && npm run test:e2e
 * Starts `next start` against a local mock of the Anthropic API (see mock-anthropic.mjs),
 * then drives the app with Playwright: navigation, accounts, manual trades, editing,
 * duplication, deletion, AI screenshot analysis, smart journaling, AI review, analytics,
 * the coach, the calendar, export/backup/restore, reminders, PWA manifest and offline mode.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startMock } from './mock-anthropic.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const PORT = Number(process.env.E2E_PORT || 3200);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'e2e/artifacts';
mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    await globalThis.__failShot?.(name).catch(() => undefined);
    console.log(`  ✗ ${name}\n      ${e.message.split('\n').slice(0, 4).join('\n      ')}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ───────── Seed data for coach / analytics (synthetic test trades) ─────────
function seedBackup() {
  const trades = [];
  const days = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
  let n = 0;
  const journal = (calm) => ({
    before: [calm ? 'calm' : 'anxious'], during: [calm ? 'disciplined' : 'impatient'], after: [calm ? 'satisfied' : 'frustrated'],
    rule_compliance: calm ? 'complete' : 'partial', entry_quality: calm ? 'A' : 'C', exit_quality: [calm ? 'followed_plan' : 'too_early'],
    mistakes: calm ? ['none'] : ['early_entry'], mistake_other: null, setup_quality: calm ? 'valid' : 'questionable', lessons: ['patience'], note: null,
  });
  for (const d of days) {
    const day = `2026-11-${String(d).padStart(2, '0')}`;
    for (const am of [true, false]) {
      n++;
      const entry = am ? `${day}T14:45:00.000Z` : `${day}T17:15:00.000Z`;
      const exit = am ? `${day}T15:05:00.000Z` : `${day}T17:40:00.000Z`;
      const move = am ? 6 + (n % 4) : -(5 + (n % 3));
      trades.push({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: null, created_at: entry, updated_at: entry, deleted_at: null,
        account_id: null, symbol: 'NQ', contract: null, direction: 'long', contracts: 1, entry_price: 21000, exit_price: 21000 + move,
        stop_loss: 20990, take_profit: 21020, entry_time: entry, exit_time: exit, commission: null, gross_pnl: null, net_pnl: null, risk_amount: null,
        session: null, trading_day: day, timeframe: '5m', setup: am ? 'Opening range breakout' : 'Reversal', bias: 'bullish', market_structure: null,
        concepts: [], tags: [], notes: null, journal: journal(am), journal_completed_at: exit, ai_review: null, extraction: null, source: 'manual', _seed: true,
      });
    }
  }
  return { app: 'cadence', version: 1, exported_at: new Date().toISOString(), tables: { trades, accounts: [], attachments: [], day_reviews: [], ai_reports: [], user_settings: [] } };
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

async function answerQuestionnaire(page, saveLabel) {
  const pick = async (title, labels, next = true) => {
    await page.getByRole('heading', { name: title }).waitFor();
    for (const l of labels) await page.getByRole('button', { name: l, exact: true }).click();
    if (next) await page.getByRole('button', { name: 'Next' }).click();
  };
  await pick('How did you feel before entering?', ['Calm', 'Focused']);
  await pick('How did you feel while in the position?', ['Disciplined']);
  await pick('How do you feel now?', ['Satisfied']);
  await pick('Did you follow your trading rules?', ['Completely followed'], false);
  await pick('Grade your entry', ['A+'], false);
  await pick('How was your exit?', ['Followed plan']);
  await pick('Any execution mistakes?', ['No mistakes']);
  await pick('Was the setup valid?', ['Fully valid'], false);
  await pick('What is the main lesson?', ['Better patience']);
  await page.getByRole('heading', { name: 'Anything else worth remembering?' }).waitFor();
  await page.getByLabel('Journal note').fill('Waited for confirmation.');
  await page.getByRole('button', { name: saveLabel }).click();
}

async function main() {
  const { server: mock, requests } = await startMock(4010);
  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: 'test-key-e2e',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:4010',
    CADENCE_AI_ALLOW_ANONYMOUS: 'true',
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    PORT: String(PORT),
  };
  try {
    await fetch(`${BASE}/api/config`);
    throw new Error(`port ${PORT} is already in use — stop the other server first`);
  } catch (e) {
    if (String(e.message).includes('already in use')) throw e;
  }
  const app = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const stopApp = () => {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  process.on('exit', stopApp);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
  let appLog = '';
  app.stdout.on('data', (d) => (appLog += d));
  app.stderr.on('data', (d) => (appLog += d));
  await waitForServer();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ['notifications', 'clipboard-read'] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  globalThis.__failShot = (name) => page.screenshot({ path: `${OUT}/FAIL-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`, fullPage: true });
  // Headless Chromium always reports notifications as denied; stub the platform API and record calls
  // so the app's real reminder decision logic can be verified.
  await ctx.addInitScript(() => {
    const record = (title, opts) => {
      const list = JSON.parse(localStorage.getItem('e2e-notifications') || '[]');
      list.push({ title, body: opts && opts.body });
      localStorage.setItem('e2e-notifications', JSON.stringify(list));
    };
    try {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      ServiceWorkerRegistration.prototype.showNotification = async function (title, opts) {
        record(title, opts);
      };
      const Native = window.Notification;
      window.Notification = function (title, opts) {
        record(title, opts);
      };
      Object.defineProperty(window.Notification, 'permission', { get: () => 'granted' });
      window.Notification.requestPermission = async () => 'granted';
      void Native;
    } catch {
      /* ignore */
    }
  });
  let tradeUrl = '';

  console.log('\nCADENCE e2e\n');

  await step('API: config reports AI enabled (anonymous, single-user mode)', async () => {
    const c = await (await fetch(`${BASE}/api/config`)).json();
    assert(c.ai === true && c.aiAccess === 'anonymous' && c.model === 'claude-opus-5-5' && c.supabase === false, JSON.stringify(c));
    assert(!JSON.stringify(c).includes('test-key'), 'secret leaked in config');
  });

  await step('API: validation, auth and cron protection', async () => {
    const bad = await fetch(`${BASE}/api/ai/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"images":[]}' });
    assert(bad.status === 400, `analyze bad body → ${bad.status}`);
    const cron = await fetch(`${BASE}/api/cron/reminders`);
    assert(cron.status === 503 || cron.status === 401, `cron without secret → ${cron.status}`);
    const coach = await fetch(`${BASE}/api/ai/coach`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: { summary: { trades: 3 } } }) });
    assert(coach.status === 422, `coach with 3 trades → ${coach.status}`);
    const push = await fetch(`${BASE}/api/push/subscribe`, { method: 'POST', body: '{}' });
    assert(push.status === 401, `push subscribe unauthenticated → ${push.status}`);
  });

  await step('PWA: manifest, icons and service worker are served', async () => {
    const m = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    assert(m.display === 'standalone' && m.icons.length >= 3 && m.short_name === 'Cadence', 'manifest');
    for (const i of m.icons) assert((await fetch(BASE + i.src)).ok, `icon ${i.src}`);
    assert((await fetch(`${BASE}/icons/apple-touch-icon.png`)).ok, 'apple touch icon');
    const sw = await fetch(`${BASE}/sw.js`);
    assert(sw.ok && (await sw.text()).includes('notificationclick'), 'sw.js');
  });

  await step('Dashboard renders the empty state with brand shell', async () => {
    await page.goto(BASE + '/');
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
    await page.getByText('Your journal starts here').waitFor();
    assert(await page.getByRole('link', { name: 'CADENCE home' }).first().isVisible(), 'logo link');
    await shot('01-dashboard-empty');
  });

  await step('Navigation: every section loads from the sidebar', async () => {
    for (const [label, heading] of [['Journal', 'Journal'], ['Analytics', 'Analytics'], ['Calendar', 'Calendar'], ['Settings', 'Settings'], ['Dashboard', 'Dashboard']]) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: heading, exact: true }).first().waitFor({ timeout: 10000 });
    }
    await page.goto(BASE + '/brand');
    await page.getByRole('heading', { name: 'CADENCE brand' }).waitFor();
    await shot('02-brand');
  });

  await step('Reminder: in-app notification fires when today is not journaled', async () => {
    const weekday = await page.evaluate(() => [1, 2, 3, 4, 5].includes(new Date().getDay()));
    await page.goto(BASE + '/settings');
    await page.getByRole('heading', { name: 'Evening reminder' }).waitFor();
    const hhmm = await page.evaluate(() => {
      const d = new Date(Date.now() - 60_000);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    await page.locator('#rem-time').fill(hhmm);
    await page.waitForTimeout(400);
    await page.goto(BASE + '/');
    let flagged = false;
    for (let i = 0; i < 12 && !flagged; i++) {
      await page.waitForTimeout(500);
      flagged = await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('cadence-reminded:')));
    }
    if (weekday) assert(flagged, 'expected a reminder to be shown on a weekday with no trades');
    else assert(!flagged, 'no reminder expected on weekends without trades');
    const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('e2e-notifications') || '[]'));
    if (weekday) assert(notes.some((n) => n.title === 'Close out your trading day'), `notification not shown: ${JSON.stringify(notes)}`);
  });

  await step('Accounts: create a Lucid account with user-provided rules', async () => {
    await page.goto(BASE + '/accounts');
    await page.getByRole('button', { name: 'Add your first account' }).click();
    await page.locator('#a-name').fill('Lucid 50K Eval');
    await page.locator('#a-start').fill('50000');
    await page.locator('#a-max_drawdown').fill('2000');
    await page.locator('#a-daily_loss_limit').fill('1000');
    await page.locator('#a-profit_target').fill('3000');
    await page.locator('#a-personal_daily_risk').fill('600');
    await page.getByRole('button', { name: 'Save account' }).click();
    await page.getByRole('heading', { name: 'Lucid 50K Eval' }).waitFor();
    await page.getByText('User-provided rules — verify with Lucid').waitFor();
    await page.getByRole('button', { name: 'Make default' }).click();
    await page.getByText('Default', { exact: true }).waitFor();
  });

  await step('Manual trade: live contract-spec calculation, save, 30-second journal', async () => {
    await page.goto(BASE + '/journal/new');
    await page.locator('#f-symbol').selectOption('ES');
    await page.locator('#f-qty').fill('2');
    await page.locator('#f-entry_price').fill('5000');
    await page.locator('#f-exit_price').fill('5004.25');
    await page.locator('#f-stop_loss').fill('4996');
    await page.locator('#f-take_profit').fill('5012');
    await page.locator('#f-entry-time').fill('2026-11-23T09:40');
    await page.locator('#f-exit-time').fill('2026-11-23T09:58');
    await page.getByText('+$425.00').first().waitFor();
    await page.getByText('Not set').first().waitFor(); // fees never assumed
    await page.getByText('+1.06R').waitFor();
    await shot('03-manual-entry');
    await page.getByRole('button', { name: 'Save & journal' }).click();
    await answerQuestionnaire(page, 'Save journal');
    await page.getByText('Journal saved').waitFor();
    await page.waitForTimeout(2200);
    await page.getByRole('heading', { name: 'ES', exact: true }).waitFor();
    tradeUrl = page.url();
    assert(tradeUrl.includes('/trade?id='), tradeUrl);
    await page.getByText('Completely followed').waitFor();
    await page.getByText('Lucid 50K Eval').first().waitFor(); // default account applied
    await shot('04-trade-detail');
  });

  await step('Edit trade: P&L recalculates from the new exit', async () => {
    await page.locator('a[href^="/trade/edit"]').click();
    await page.locator('#f-exit_price').fill('4998');
    await page.getByText('−$200.00').first().waitFor();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('−$200.00').first().waitFor();
    await page.getByText('Loss', { exact: true }).waitFor();
  });

  await step('Duplicate and delete with undo', async () => {
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await page.getByRole('heading', { name: /Edit ES trade/ }).waitFor();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.goto(BASE + '/journal');
    await page.getByText('2 trades recorded').waitFor();
    await page.locator('a[href^="/trade?id="]').first().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete trade' }).click();
    await page.getByText('1 trades recorded').waitFor();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByText('2 trades recorded').waitFor();
    await page.locator('a[href^="/trade?id="]').first().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete trade' }).click();
    await page.getByText('1 trades recorded').waitFor();
  });

  await step('Journal: search, filters and sorting', async () => {
    await page.getByLabel('Search trades').fill('zzz-nothing');
    await page.getByText('No trades match').waitFor();
    await page.getByLabel('Search trades').fill('ES');
    await page.locator('a[href^="/trade?id="]').first().waitFor();
    await page.getByLabel('Sort').selectOption('pnl_desc');
    await page.getByRole('button', { name: 'Losses' }).click();
    await page.locator('a[href^="/trade?id="]').first().waitFor();
    await page.getByRole('button', { name: 'Clear' }).click();
  });

  await step('AI analysis: upload → streamed progress → confidence review → journal → AI review', async () => {
    await page.goto(BASE + '/analyze');
    await page.getByText('Drop screenshots here').waitFor();
    await page.locator('input[type=file][accept="image/*"]').setInputFiles('e2e/fixtures/nq-long.png');
    await page.getByRole('button', { name: 'Analyze 1 screenshot' }).click();
    await page.getByText('Analyzing your trade').waitFor();
    await shot('05-analyzing');
    await page.getByRole('heading', { name: 'Review what CADENCE read' }).waitFor({ timeout: 30000 });
    assert((await page.locator('#f-symbol').inputValue()) === 'NQ', 'symbol NQ');
    assert((await page.locator('#f-entry_price').inputValue()) === '21450.25', 'entry');
    assert((await page.locator('#f-qty').inputValue()) === '2', 'qty');
    assert((await page.locator('#f-commission').inputValue()) === '', 'commission must stay empty');
    await page.getByText('Visible · 95%').first().waitFor();
    await page.getByText('Please confirm the highlighted fields').waitFor();
    await page.getByText('+$1,290.00').first().waitFor();
    await page.getByText('+1.59R').waitFor();
    await shot('06-ai-confirm');
    await page.getByRole('button', { name: 'Confirm & journal' }).last().click();
    await answerQuestionnaire(page, 'Save trade');
    await page.getByText('Trade saved').waitFor();
    await page.getByText('Patient, rule-based long').waitFor({ timeout: 20000 });
    await page.getByText('Pre-define a scale-out level before entering.').waitFor();
    await page.getByText('AI captured').waitFor();
    await shot('07-ai-review');
    const ex = requests.find((r) => r.kind === 'extraction');
    assert(ex && ex.images === 1 && ex.stream && ex.hasFormat && ex.fallbacks === 'default' && String(ex.beta).includes('server-side-fallback'), `extraction request ${JSON.stringify(ex)}`);
    assert(requests.some((r) => r.kind === 'review'), 'review requested');
  });

  await step('Dashboard metrics update from journal data', async () => {
    await page.goto(BASE + '/');
    await page.getByText('Total net P&L').waitFor();
    await page.getByRole('heading', { name: 'Equity curve' }).waitFor();
    await page.waitForTimeout(1200);
    const hero = await page.locator('text=Total net P&L').locator('..').innerText();
    assert(hero.includes('1,090'), `net should be 1290 − 200 = 1,090: ${hero}`);
    await shot('08-dashboard');
  });

  await step('Calendar: day cell opens the trades for that date', async () => {
    await page.goto(BASE + '/calendar');
    await page.getByText('Month summary').waitFor();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Next month' }).click();
    await page.getByRole('button', { name: /Nov 20/ }).click();
    await page.getByRole('dialog').getByText('NQ').first().waitFor();
    await shot('09-calendar-day');
    await page.keyboard.press('Escape');
  });

  await step('Export CSV and full JSON backup', async () => {
    await page.goto(BASE + '/settings');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const csvPath = `${OUT}/export.csv`;
    await csv.saveAs(csvPath);
    const text = require('node:fs').readFileSync(csvPath, 'utf8');
    assert(text.startsWith('trade_id,trading_day') && text.split('\r\n').length >= 3, 'csv content');
    const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Full backup' }).click()]);
    await bk.saveAs(`${OUT}/backup.json`);
    const json = JSON.parse(require('node:fs').readFileSync(`${OUT}/backup.json`, 'utf8'));
    assert(json.app === 'cadence' && json.tables.trades.length >= 2 && json.images.length >= 1, 'backup content');
  });

  await step('Restore merges a backup (30 seeded trades)', async () => {
    writeFileSync(`${OUT}/seed-backup.json`, JSON.stringify(seedBackup()));
    await page.locator('input[type=file][accept*="json"]').setInputFiles(`${OUT}/seed-backup.json`);
    await page.getByText(/30 added/).waitFor();
  });

  await step('Analytics: filters, tabs and psychology breakdowns', async () => {
    await page.goto(BASE + '/analytics');
    await page.getByText('Cumulative net P&L').waitFor();
    await page.getByRole('tab', { name: 'Timing' }).click();
    await page.getByText('Best trading sessions').waitFor();
    await page.getByText('NY AM').first().waitFor();
    await page.getByRole('tab', { name: 'Psychology' }).click();
    await page.getByText('Emotional state vs profitability').waitFor();
    await page.getByText('Anxious').first().waitFor();
    await shot('10-analytics-psychology');
    await page.getByRole('tab', { name: '7D' }).click();
    await page.getByRole('tab', { name: 'All' }).click();
  });

  await step('AI coach: statistical patterns + report (small samples filtered)', async () => {
    await page.getByRole('tab', { name: 'AI Coach' }).click();
    await page.getByText('Statistically supported patterns').waitFor();
    await page.getByText(/is costing you|is a strength/).first().waitFor();
    await page.getByRole('button', { name: 'Generate report' }).click();
    await page.getByText('NY AM session edge').waitFor({ timeout: 20000 });
    assert((await page.getByText('Friday afternoons').count()) === 0, 'pattern with n=3 must be filtered out');
    await shot('11-coach');
  });

  await step('Offline: previously loaded app and journal open without network', async () => {
    await page.goto(BASE + '/journal');
    const href = await page.locator('a[href^="/trade?id="]').first().getAttribute('href');
    await page.goto(BASE + href);
    const symbol = (await page.locator('h1').first().innerText()).trim();
    await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
    await page.waitForTimeout(3000); // let the service worker finish precaching
    await ctx.setOffline(true);
    try {
      await page.goto(BASE + '/journal');
      await page.getByText(/trades recorded/).waitFor({ timeout: 15000 });
      await page.goto(BASE + href);
      await page.getByRole('heading', { name: symbol, exact: true }).waitFor({ timeout: 15000 });
      await page.goto(BASE + '/analytics');
      await page.getByText('Cumulative net P&L').waitFor({ timeout: 15000 });
    } finally {
      await ctx.setOffline(false);
    }
  });

  // ───────── Mobile ─────────
  const m = await browser.newContext({ ...devices['iPhone 14 Pro'], permissions: ['notifications'] });
  const mp = await m.newPage();
  mp.setDefaultTimeout(15000);
  mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));

  await step('Mobile: bottom navigation, FAB and responsive layouts', async () => {
    await mp.goto(BASE + '/settings');
    await mp.locator('input[type=file][accept*="json"]').setInputFiles(`${OUT}/seed-backup.json`);
    await mp.getByText(/30 added/).waitFor();
    await mp.goto(BASE + '/');
    await mp.getByText('Total net P&L').waitFor();
    await mp.waitForTimeout(1200);
    await mp.screenshot({ path: `${OUT}/12-mobile-dashboard.png` });
    const nav = mp.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Journal' }).click();
    await mp.getByRole('heading', { name: 'Journal', exact: true }).waitFor();
    await mp.screenshot({ path: `${OUT}/13-mobile-journal.png` });
    await nav.getByRole('link', { name: 'Calendar' }).click();
    await mp.getByText('Month summary').waitFor();
    await mp.screenshot({ path: `${OUT}/14-mobile-calendar.png` });
    await nav.getByRole('link', { name: 'Analyze a trade' }).click();
    await mp.getByText('Drop screenshots here').waitFor();
    await mp.screenshot({ path: `${OUT}/15-mobile-analyze.png` });
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, 'horizontal overflow on mobile');
  });

  await step('Mobile: questionnaire is tap-only', async () => {
    await mp.goto(BASE + '/journal');
    await mp.locator('a[href^="/trade?id="]').first().click();
    await mp.getByRole('heading', { name: 'NQ', exact: true }).waitFor();
    await mp.getByText('Psychology & execution').waitFor();
    await mp.screenshot({ path: `${OUT}/16-mobile-trade.png`, fullPage: true });
  });

  await step('No uncaught errors in the browser console', async () => {
    assert(errors.length === 0, errors.slice(0, 5).join('\n'));
  });

  await browser.close();
  stopApp();
  mock.close();
  const failed = results.filter((r) => !r.ok);
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, appLog: appLog.slice(-4000) }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} failed` : ''}\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
