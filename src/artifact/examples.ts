/**
 * Example data for the claude.ai preview, so every screen opens in a working state.
 * Everything here is clearly marked: trades carry the "example" tag and say so in their notes,
 * the account is named "Example …", and one click removes all of it.
 */
import { db, getMeta, setMeta, type Local } from '@/lib/data/db';
import { blankAccount, blankTrade } from '@/lib/data/repo';
import { derivedColumns } from '@/lib/domain/calc';
import { BUILTIN_INSTRUMENTS, roundToTick } from '@/lib/domain/instruments';
import { EXCHANGE_TZ, addDaysKey, dayKey, weekdayOfKey, zonedToIso } from '@/lib/domain/time';
import type { Account, JournalAnswers, Trade } from '@/lib/types';

export const EXAMPLE_TAG = 'example';
const FLAG = 'cadence-examples';

/** Small deterministic PRNG so the examples look the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSIONS = [
  { id: 'nyam', window: [9 * 60 + 35, 10 * 60 + 50], winP: 0.62, win: [1.1, 2.2], weight: 0.45, setups: ['Liquidity sweep + FVG', 'Opening range breakout'] },
  { id: 'london', window: [3 * 60, 5 * 60 + 30], winP: 0.45, win: [1, 1.8], weight: 0.15, setups: ['Order block retest'] },
  { id: 'lunch', window: [11 * 60 + 45, 13 * 60 + 15], winP: 0.25, win: [0.8, 1.4], weight: 0.2, setups: ['Reversal'] },
  { id: 'nypm', window: [13 * 60 + 45, 15 * 60 + 30], winP: 0.45, win: [1, 1.6], weight: 0.2, setups: ['Trend continuation'] },
] as const;

const INSTRUMENTS = [
  { symbol: 'NQ', price: 21420, stop: [10, 16], qty: [1, 1], fee: 4.24, weight: 0.35 },
  { symbol: 'MNQ', price: 21420, stop: [10, 16], qty: [2, 3], fee: 1.34, weight: 0.25 },
  { symbol: 'ES', price: 5940, stop: [3, 5.5], qty: [1, 1], fee: 4.24, weight: 0.22 },
  { symbol: 'GC', price: 2655, stop: [3, 5], qty: [1, 1], fee: 4.74, weight: 0.12 },
  { symbol: 'CL', price: 70.4, stop: [0.2, 0.35], qty: [1, 1], fee: 4.74, weight: 0.06 },
] as const;

const CONCEPTS: Record<string, string[]> = {
  'Liquidity sweep + FVG': ['liquidity_sweep', 'fvg', 'displacement'],
  'Opening range breakout': ['bos', 'killzone'],
  'Order block retest': ['order_block', 'bos'],
  Reversal: ['choch'],
  'Trend continuation': ['bos'],
};

function pickWeighted<T extends { weight: number }>(xs: readonly T[], r: number): T {
  let acc = 0;
  for (const x of xs) {
    acc += x.weight;
    if (r <= acc) return x;
  }
  return xs[xs.length - 1];
}

export function buildExamples(now = new Date()): { account: Account; trades: Trade[] } {
  const rand = rng(20261123);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

  const account = blankAccount({
    name: 'Example · Lucid 50K',
    plan: '50K evaluation (example rules)',
    size: 50000,
    starting_balance: 50000,
    max_drawdown: 2000,
    drawdown_type: 'trailing_eod',
    drawdown_lock: 50100,
    daily_loss_limit: 1000,
    profit_target: 3000,
    payout_target: 2000,
    consistency_pct: 50,
    personal_daily_risk: 600,
    notes: 'Example account. These rule values are samples — enter your own from Lucid Trading’s official rules.',
  });

  // The 24 weekdays before today (New York calendar).
  const days: string[] = [];
  let k = addDaysKey(dayKey(now, EXCHANGE_TZ), -1);
  while (days.length < 24) {
    if (weekdayOfKey(k) < 5) days.unshift(k);
    k = addDaysKey(k, -1);
  }

  const drift = new Map(INSTRUMENTS.map((i) => [i.symbol, i.price as number]));
  const trades: Trade[] = [];
  for (const day of days) {
    const n = rand() < 0.45 ? 1 : rand() < 0.8 ? 2 : 3;
    const picks = Array.from({ length: n }, () => pickWeighted(SESSIONS, rand())).sort((a, b) => a.window[0] - b.window[0]);
    for (const s of picks) {
      const inst = pickWeighted(INSTRUMENTS, rand());
      const spec = BUILTIN_INSTRUMENTS.find((x) => x.symbol === inst.symbol)!;
      const base = drift.get(inst.symbol)! * (1 + (rand() - 0.5) * 0.004);
      drift.set(inst.symbol, base);
      const long = rand() < 0.6;
      const dir = long ? 1 : -1;
      const stopDist = roundToTick(between(inst.stop[0], inst.stop[1]), spec);
      const entry = roundToTick(base, spec);
      const roll = rand();
      const r = roll < s.winP ? between(s.win[0], s.win[1]) : roll < s.winP + 0.06 ? 0 : rand() < 0.2 ? -0.5 : -1;
      const exit = roundToTick(entry + dir * r * stopDist, spec);
      const qty = Math.round(between(inst.qty[0], inst.qty[1] + 0.99) - 0.49);
      const minute = Math.round(between(s.window[0], s.window[1]));
      const [y, mo, d] = day.split('-').map(Number);
      const entryIso = zonedToIso(y, mo, d, Math.floor(minute / 60), minute % 60, 0, EXCHANGE_TZ);
      const held = r > 0 ? between(4, 26) : between(8, 48);
      const exitIso = new Date(new Date(entryIso).getTime() + held * 60_000).toISOString();
      const win = r > 0.05;
      const loss = r < -0.05;
      const setup = pick(s.setups);
      const journal: JournalAnswers = {
        before: win ? [pick(['calm', 'focused', 'confident'])] : s.id === 'lunch' ? [pick(['impatient', 'anxious'])] : [pick(['calm', 'tired', 'excited'])],
        during: win ? [pick(['disciplined', 'calm'])] : loss ? [pick(['nervous', 'impatient', 'disciplined'])] : ['calm'],
        after: win ? ['satisfied'] : loss ? [pick(['frustrated', 'disappointed', 'neutral'])] : ['relieved'],
        rule_compliance: win ? pick(['complete', 'complete', 'mostly']) : loss && s.id === 'lunch' ? pick(['partial', 'none']) : 'mostly',
        entry_quality: win ? pick(['A+', 'A', 'A']) : loss ? pick(['B', 'C', 'C']) : 'B',
        exit_quality: win ? [pick(['followed_plan', 'good', 'too_early'])] : loss ? [pick(['followed_plan', 'emotional'])] : ['followed_plan'],
        mistakes: loss && s.id === 'lunch' ? [pick(['early_entry', 'missed_confirmation', 'revenge'])] : ['none'],
        mistake_other: null,
        setup_quality: win ? 'valid' : loss && s.id === 'lunch' ? 'questionable' : 'imperfect',
        lessons: [win ? 'strategy' : s.id === 'lunch' ? pick(['patience', 'overtrading']) : 'entry_timing'],
        note: null,
      };
      const t = blankTrade({
        account_id: account.id,
        symbol: inst.symbol,
        direction: long ? 'long' : 'short',
        contracts: qty,
        entry_price: entry,
        exit_price: exit,
        stop_loss: roundToTick(entry - dir * stopDist, spec),
        take_profit: roundToTick(entry + dir * 2 * stopDist, spec),
        entry_time: entryIso,
        exit_time: exitIso,
        commission: Math.round(inst.fee * qty * 100) / 100,
        timeframe: s.id === 'lunch' ? '1m' : '5m',
        setup,
        bias: long ? 'bullish' : 'bearish',
        concepts: CONCEPTS[setup] ?? [],
        tags: [EXAMPLE_TAG],
        notes: 'Example trade (sample data).',
        journal,
        journal_completed_at: exitIso,
        source: 'import',
        created_at: exitIso,
        updated_at: exitIso,
      });
      trades.push({ ...t, ...derivedColumns(t) });
    }
  }
  // Leave the two most recent trades un-journaled so the check-in flow has something to show.
  for (const t of trades.slice(-2)) {
    t.journal = null;
    t.journal_completed_at = null;
  }
  return { account, trades };
}

export async function seedExamplesIfNeeded(): Promise<void> {
  let flag: string | null = null;
  try {
    flag = localStorage.getItem(FLAG);
  } catch {
    /* storage blocked: decide from the database alone */
  }
  if (flag) return;
  if ((await db().trades.count()) > 0) return;
  const { account, trades } = buildExamples();
  await db().transaction('rw', db().accounts, db().trades, db().meta, async () => {
    await db().accounts.put({ ...account, _dirty: 0 } as Local<Account>);
    await db().trades.bulkPut(trades.map((t) => ({ ...t, _dirty: 0 }) as Local<Trade>));
    await db().meta.put({ key: 'exampleAccountId', value: account.id });
  });
  try {
    localStorage.setItem(FLAG, 'seeded');
  } catch {
    /* ignore */
  }
}

export async function removeExamples(): Promise<number> {
  const ids = (await db().trades.toArray()).filter((t) => t.tags?.includes(EXAMPLE_TAG)).map((t) => t.id);
  const accountId = await getMeta<string>('exampleAccountId');
  await db().transaction('rw', [db().trades, db().attachments, db().blobs, db().accounts, db().meta, db().user_settings], async () => {
    const shots = await db().attachments.where('trade_id').anyOf(ids).primaryKeys();
    await db().attachments.bulkDelete(shots);
    await db().blobs.bulkDelete(shots);
    await db().trades.bulkDelete(ids);
    if (accountId) {
      // Your own trades keep existing; they're just no longer linked to the example account.
      await db().trades.where('account_id').equals(accountId).modify({ account_id: null });
      await db().accounts.delete(accountId);
      const s = await db().user_settings.get('settings');
      if (s?.default_account_id === accountId) await db().user_settings.update('settings', { default_account_id: null });
    }
    await setMeta('exampleAccountId', null);
  });
  try {
    localStorage.setItem(FLAG, 'removed');
  } catch {
    /* ignore */
  }
  return ids.length;
}
