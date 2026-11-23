import type { ETrade } from './calc';
import { labelOf } from './questionnaire';
import { SESSION_NAMES } from './sessions';
import { MONTHS, WEEKDAYS, EXCHANGE_TZ, weekStartKey, weekdayOfKey, zonedParts } from './time';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : undefined);
const defined = <T,>(xs: (T | undefined)[]) => xs.filter((x): x is T => x !== undefined);

/** Closed trades with a known net P&L */
export const closed = (ts: ETrade[]) => ts.filter((t) => t.net !== undefined);

export interface Summary {
  trades: number;
  open: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate?: number;
  net: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor?: number;
  avgWin?: number;
  avgLoss?: number;
  payoff?: number;
  expectancy?: number;
  avgR?: number;
  expectancyR?: number;
  totalR: number;
  rCount: number;
  maxDrawdown: number;
  maxDrawdownPct?: number;
  winDays: number;
  lossDays: number;
  flatDays: number;
  bestDay?: { day: string; pnl: number };
  worstDay?: { day: string; pnl: number };
  maxWinStreak: number;
  maxLossStreak: number;
  /** >0 = current winning streak length, <0 = losing streak */
  currentStreak: number;
  avgDuration?: number;
  avgDurationWin?: number;
  avgDurationLoss?: number;
  fees: number;
  feesUnknown: number;
  largestWin?: number;
  largestLoss?: number;
}

/** Trades must be sorted chronologically (enrichAll does that). */
export function summarize(all: ETrade[]): Summary {
  const cl = closed(all);
  const nets = cl.map((t) => t.net!);
  const wins = cl.filter((t) => t.outcome === 'win');
  const losses = cl.filter((t) => t.outcome === 'loss');
  const rs = defined(cl.map((t) => t.r));
  const grossProfit = sum(nets.filter((p) => p > 0));
  const grossLoss = sum(nets.filter((p) => p < 0));

  let eq = 0;
  let peak = 0;
  let maxDD = 0;
  let peakAtMaxDD = 0;
  for (const p of nets) {
    eq += p;
    peak = Math.max(peak, eq);
    if (peak - eq > maxDD) {
      maxDD = peak - eq;
      peakAtMaxDD = peak;
    }
  }
  let maxW = 0;
  let maxL = 0;
  let cur = 0;
  for (const t of cl) {
    if (t.outcome === 'win') cur = cur > 0 ? cur + 1 : 1;
    else if (t.outcome === 'loss') cur = cur < 0 ? cur - 1 : -1;
    else continue;
    maxW = Math.max(maxW, cur);
    maxL = Math.max(maxL, -cur);
  }
  const days = dailySeries(cl);
  const best = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : undefined;
  const worst = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : undefined;
  const avgWin = avg(wins.map((t) => t.net!));
  const avgLoss = avg(losses.map((t) => t.net!));
  const decided = wins.length + losses.length;

  return {
    trades: cl.length,
    open: all.length - cl.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: cl.length - decided,
    winRate: decided ? (wins.length / decided) * 100 : undefined,
    net: sum(nets),
    grossProfit,
    grossLoss,
    profitFactor: grossLoss ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : undefined,
    avgWin,
    avgLoss,
    payoff: avgWin !== undefined && avgLoss ? avgWin / Math.abs(avgLoss) : undefined,
    expectancy: avg(nets),
    avgR: avg(rs),
    expectancyR: avg(rs),
    totalR: sum(rs),
    rCount: rs.length,
    maxDrawdown: maxDD,
    maxDrawdownPct: peakAtMaxDD > 0 ? (maxDD / peakAtMaxDD) * 100 : undefined,
    winDays: days.filter((d) => d.pnl > 0.004).length,
    lossDays: days.filter((d) => d.pnl < -0.004).length,
    flatDays: days.filter((d) => Math.abs(d.pnl) <= 0.004).length,
    bestDay: best && best.pnl > 0 ? { day: best.key, pnl: best.pnl } : undefined,
    worstDay: worst && worst.pnl < 0 ? { day: worst.key, pnl: worst.pnl } : undefined,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    currentStreak: cur,
    avgDuration: avg(defined(cl.map((t) => t.durationMin))),
    avgDurationWin: avg(defined(wins.map((t) => t.durationMin))),
    avgDurationLoss: avg(defined(losses.map((t) => t.durationMin))),
    fees: sum(cl.map((t) => t.fees)),
    feesUnknown: cl.filter((t) => t.feeSource === 'unknown').length,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.net!)) : undefined,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.net!)) : undefined,
  };
}

// ───────── Time series ─────────

export interface PeriodRow {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate?: number;
  cumulative: number;
}

function periodize(ts: ETrade[], keyFn: (t: ETrade) => string, labelFn: (k: string) => string): PeriodRow[] {
  const m = new Map<string, PeriodRow>();
  for (const t of closed(ts)) {
    const k = keyFn(t);
    const row = m.get(k) ?? { key: k, label: labelFn(k), pnl: 0, trades: 0, wins: 0, losses: 0, cumulative: 0 };
    row.pnl += t.net!;
    row.trades++;
    if (t.outcome === 'win') row.wins++;
    if (t.outcome === 'loss') row.losses++;
    m.set(k, row);
  }
  const rows = [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  let c = 0;
  for (const r of rows) {
    r.pnl = Math.round(r.pnl * 100) / 100;
    c += r.pnl;
    r.cumulative = Math.round(c * 100) / 100;
    r.winRate = r.wins + r.losses ? (r.wins / (r.wins + r.losses)) * 100 : undefined;
  }
  return rows;
}

const shortDay = (k: string) => {
  const [, m, d] = k.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

export const dailySeries = (ts: ETrade[]) => periodize(ts, (t) => t.day, shortDay);
export const weeklySeries = (ts: ETrade[]) => periodize(ts, (t) => weekStartKey(t.day), (k) => `Wk ${shortDay(k)}`);
export const monthlySeries = (ts: ETrade[]) =>
  periodize(
    ts,
    (t) => t.day.slice(0, 7),
    (k) => {
      const [y, m] = k.split('-').map(Number);
      return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
    },
  );

export interface EquityPoint {
  i: number;
  ts: number;
  label: string;
  equity: number;
  drawdown: number;
  pnl: number;
  symbol: string;
}

export function equityCurve(ts: ETrade[]): EquityPoint[] {
  let eq = 0;
  let peak = 0;
  const out: EquityPoint[] = [];
  closed(ts).forEach((t, idx) => {
    eq += t.net!;
    peak = Math.max(peak, eq);
    out.push({
      i: idx + 1,
      ts: t.ts,
      label: shortDay(t.day),
      equity: Math.round(eq * 100) / 100,
      drawdown: Math.round((eq - peak) * 100) / 100,
      pnl: t.net!,
      symbol: t.symbol,
    });
  });
  return out;
}

// ───────── Grouping ─────────

export interface GroupRow {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate?: number;
  pnl: number;
  avgPnl?: number;
  avgR?: number;
  profitFactor?: number;
}

/** Minimum sample before a group is considered meaningful anywhere in the UI. */
export const MIN_GROUP_SAMPLE = 5;

export function groupStats(
  ts: ETrade[],
  keyFn: (t: ETrade) => string | string[] | null | undefined,
  opts: { order?: string[]; label?: (k: string) => string } = {},
): GroupRow[] {
  const groups = new Map<string, ETrade[]>();
  for (const t of closed(ts)) {
    const k = keyFn(t);
    for (const key of Array.isArray(k) ? k : k ? [k] : []) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
  }
  const rows = [...groups.entries()].map(([key, g]): GroupRow => {
    const nets = g.map((t) => t.net!);
    const wins = g.filter((t) => t.outcome === 'win').length;
    const losses = g.filter((t) => t.outcome === 'loss').length;
    const gp = sum(nets.filter((p) => p > 0));
    const gl = Math.abs(sum(nets.filter((p) => p < 0)));
    return {
      key,
      label: opts.label ? opts.label(key) : key,
      trades: g.length,
      wins,
      losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : undefined,
      pnl: Math.round(sum(nets) * 100) / 100,
      avgPnl: avg(nets),
      avgR: avg(defined(g.map((t) => t.r))),
      profitFactor: gl ? gp / gl : gp > 0 ? Infinity : undefined,
    };
  });
  if (opts.order) {
    const o = opts.order;
    rows.sort((a, b) => (o.indexOf(a.key) === -1 ? 99 : o.indexOf(a.key)) - (o.indexOf(b.key) === -1 ? 99 : o.indexOf(b.key)));
  } else rows.sort((a, b) => b.pnl - a.pnl);
  return rows;
}

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

export const byDirection = (ts: ETrade[]) =>
  groupStats(ts, (t) => t.direction, { order: ['long', 'short'], label: (k) => (k === 'long' ? 'Long' : 'Short') });
export const byInstrument = (ts: ETrade[]) => groupStats(ts, (t) => t.symbol);
export const bySession = (ts: ETrade[]) => groupStats(ts, (t) => t.sessionName ?? undefined, { order: SESSION_NAMES });
export const bySetup = (ts: ETrade[]) => groupStats(ts, (t) => t.setup || 'No setup');
export const byWeekday = (ts: ETrade[]) => groupStats(ts, (t) => WEEKDAYS[weekdayOfKey(t.day)], { order: WEEKDAYS });
/** Entry hour in New York time */
export const byHour = (ts: ETrade[]) =>
  groupStats(ts, (t) => (t.entry_time ? HOURS[zonedParts(t.entry_time, EXCHANGE_TZ).hour] : undefined), { order: HOURS });
export const byAccount = (ts: ETrade[], names: Map<string, string>) =>
  groupStats(ts, (t) => t.account_id ?? 'none', { label: (k) => names.get(k) ?? 'No account' });

export const byEmotionBefore = (ts: ETrade[]) => groupStats(ts, (t) => t.journal?.before, { label: (k) => labelOf('before', k) });
export const byEmotionDuring = (ts: ETrade[]) => groupStats(ts, (t) => t.journal?.during, { label: (k) => labelOf('during', k) });
export const byRuleCompliance = (ts: ETrade[]) =>
  groupStats(ts, (t) => t.journal?.rule_compliance, { order: ['complete', 'mostly', 'partial', 'none'], label: (k) => labelOf('rule_compliance', k) });
export const byEntryQuality = (ts: ETrade[]) =>
  groupStats(ts, (t) => t.journal?.entry_quality, { order: ['A+', 'A', 'B', 'C', 'poor'], label: (k) => labelOf('entry_quality', k) });
export const byExitQuality = (ts: ETrade[]) => groupStats(ts, (t) => t.journal?.exit_quality, { label: (k) => labelOf('exit_quality', k) });
export const byMistake = (ts: ETrade[]) => groupStats(ts, (t) => t.journal?.mistakes, { label: (k) => labelOf('mistakes', k) });
export const bySetupQuality = (ts: ETrade[]) =>
  groupStats(ts, (t) => t.journal?.setup_quality, { order: ['valid', 'imperfect', 'questionable', 'invalid'], label: (k) => labelOf('setup_quality', k) });

// ───────── Distributions ─────────

export function rDistribution(ts: ETrade[]): { bucket: string; count: number; mid: number }[] {
  const edges = [-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 5];
  const buckets = [{ bucket: '≤−3R', count: 0, mid: -3.5 }];
  for (let i = 0; i < edges.length - 1; i++) {
    buckets.push({ bucket: `${edges[i]}…${edges[i + 1]}`.replace(/-/g, '−'), count: 0, mid: (edges[i] + edges[i + 1]) / 2 });
  }
  buckets.push({ bucket: '≥5R', count: 0, mid: 5.5 });
  for (const t of closed(ts)) {
    if (t.r === undefined) continue;
    let idx = buckets.length - 1;
    if (t.r < edges[0]) idx = 0;
    else {
      for (let i = 0; i < edges.length - 1; i++) {
        if (t.r >= edges[i] && t.r < edges[i + 1]) {
          idx = i + 1;
          break;
        }
      }
    }
    buckets[idx].count++;
  }
  return buckets;
}

export function pnlDistribution(ts: ETrade[], bins = 12): { bucket: string; from: number; to: number; count: number }[] {
  const nets = closed(ts).map((t) => t.net!);
  if (!nets.length) return [];
  const lo = Math.min(...nets, 0);
  const hi = Math.max(...nets, 0);
  if (hi === lo) return [{ bucket: `$${Math.round(lo)}`, from: lo, to: hi, count: nets.length }];
  const step = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, count: 0, bucket: '' }));
  for (const n of nets) out[Math.min(bins - 1, Math.floor((n - lo) / step))].count++;
  for (const b of out) b.bucket = `${Math.round(b.from)}`;
  return out;
}

// ───────── Filtering ─────────

export type RangePreset = '7d' | '30d' | '90d' | 'ytd' | '1y' | 'all' | 'custom';

export interface TradeFilter {
  range: RangePreset;
  from?: string;
  to?: string;
  accountId?: string | 'all';
  symbol?: string | 'all';
  direction?: 'long' | 'short' | 'all';
}

export function rangeBounds(f: Pick<TradeFilter, 'range' | 'from' | 'to'>, today: string): { from?: string; to?: string } {
  const minus = (n: number) => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
  };
  switch (f.range) {
    case '7d':
      return { from: minus(6), to: today };
    case '30d':
      return { from: minus(29), to: today };
    case '90d':
      return { from: minus(89), to: today };
    case '1y':
      return { from: minus(364), to: today };
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom':
      return { from: f.from || undefined, to: f.to || undefined };
    default:
      return {};
  }
}

export function applyFilter(ts: ETrade[], f: TradeFilter, today: string): ETrade[] {
  const { from, to } = rangeBounds(f, today);
  return ts.filter(
    (t) =>
      (!from || t.day >= from) &&
      (!to || t.day <= to) &&
      (!f.accountId || f.accountId === 'all' || t.account_id === f.accountId) &&
      (!f.symbol || f.symbol === 'all' || t.symbol === f.symbol) &&
      (!f.direction || f.direction === 'all' || t.direction === f.direction),
  );
}
