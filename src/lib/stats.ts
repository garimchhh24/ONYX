import type { Settings } from '../types';
import { money, type ETrade } from './calc';
import { WEEKDAY_NAMES, weekdayOfKey, zonedParts } from './time';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const defined = <T,>(xs: (T | undefined)[]) => xs.filter((x): x is T => x !== undefined);

export const closedOnly = (ts: ETrade[]) => ts.filter((t) => t.outcome !== 'open');
const byEntry = (a: ETrade, b: ETrade) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime();

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
  totalR: number;
  rCount: number;
  maxDrawdown: number;
  bestDay?: { day: string; pnl: number };
  worstDay?: { day: string; pnl: number };
  greenDays: number;
  redDays: number;
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: number;
  avgHoldWin?: number;
  avgHoldLoss?: number;
  avgRisk?: number;
  requiredWinRate?: number;
  fees: number;
}

/** Trades must be sorted by exit time (enrichAll does that). */
export function summarize(all: ETrade[]): Summary {
  const closed = closedOnly(all);
  const nets = closed.map((t) => t.net!);
  const wins = closed.filter((t) => t.outcome === 'win');
  const losses = closed.filter((t) => t.outcome === 'loss');
  const winP = wins.map((t) => t.net!);
  const lossP = losses.map((t) => t.net!);
  const rs = defined(closed.map((t) => t.r));
  const grossProfit = sum(nets.filter((p) => p > 0));
  const grossLoss = sum(nets.filter((p) => p < 0));

  let eq = 0, peak = 0, maxDD = 0;
  for (const p of nets) {
    eq += p;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
  }
  let maxW = 0, maxL = 0, cur = 0;
  for (const t of closed) {
    if (t.outcome === 'win') cur = cur > 0 ? cur + 1 : 1;
    else if (t.outcome === 'loss') cur = cur < 0 ? cur - 1 : -1;
    else continue;
    maxW = Math.max(maxW, cur);
    maxL = Math.max(maxL, -cur);
  }
  const days = [...dailyPnl(closed).entries()].map(([day, v]) => ({ day, pnl: v.pnl }));
  const best = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : undefined;
  const worst = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : undefined;
  const avgWin = avg(winP);
  const avgLoss = avg(lossP);
  const payoff = avgWin !== undefined && avgLoss ? avgWin / Math.abs(avgLoss) : undefined;
  const decided = wins.length + losses.length;

  return {
    trades: closed.length,
    open: all.length - closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: closed.length - decided,
    winRate: decided ? (wins.length / decided) * 100 : undefined,
    net: sum(nets),
    grossProfit,
    grossLoss,
    profitFactor: grossLoss ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : undefined,
    avgWin,
    avgLoss,
    payoff,
    expectancy: avg(nets),
    avgR: avg(rs),
    totalR: sum(rs),
    rCount: rs.length,
    maxDrawdown: maxDD,
    bestDay: best && best.pnl > 0 ? best : undefined,
    worstDay: worst && worst.pnl < 0 ? worst : undefined,
    greenDays: days.filter((d) => d.pnl > 0).length,
    redDays: days.filter((d) => d.pnl < 0).length,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    currentStreak: cur,
    avgHoldWin: avg(defined(wins.map((t) => t.durationMin))),
    avgHoldLoss: avg(defined(losses.map((t) => t.durationMin))),
    avgRisk: avg(defined(closed.map((t) => t.risk))),
    requiredWinRate: payoff !== undefined ? (1 / (1 + payoff)) * 100 : undefined,
    fees: sum(closed.map((t) => t.feesUsd)),
  };
}

export interface GroupRow {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate?: number;
  pnl: number;
  avgR?: number;
  profitFactor?: number;
  expectancy?: number;
}

export function groupStats(trades: ETrade[], keyFn: (t: ETrade) => string | string[] | undefined, order?: string[]): GroupRow[] {
  const groups = new Map<string, ETrade[]>();
  for (const t of closedOnly(trades)) {
    const k = keyFn(t);
    for (const key of Array.isArray(k) ? k : k ? [k] : []) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
  }
  const rows = [...groups.entries()].map(([key, ts]): GroupRow => {
    const nets = ts.map((t) => t.net!);
    const wins = ts.filter((t) => t.outcome === 'win').length;
    const losses = ts.filter((t) => t.outcome === 'loss').length;
    const gp = sum(nets.filter((p) => p > 0));
    const gl = Math.abs(sum(nets.filter((p) => p < 0)));
    return {
      key,
      trades: ts.length,
      wins,
      losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : undefined,
      pnl: sum(nets),
      avgR: avg(defined(ts.map((t) => t.r))),
      profitFactor: gl ? gp / gl : gp > 0 ? Infinity : undefined,
      expectancy: avg(nets),
    };
  });
  if (order) rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else rows.sort((a, b) => b.pnl - a.pnl);
  return rows;
}

/** 1-based position of each trade within its trading day (by entry time). */
export function tradeNumberInDay(trades: ETrade[]): Map<string, number> {
  const byDay = new Map<string, ETrade[]>();
  for (const t of trades) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day)!.push(t);
  }
  const out = new Map<string, number>();
  for (const ts of byDay.values()) {
    ts.sort(byEntry).forEach((t, i) => out.set(t.id, i + 1));
  }
  return out;
}

/** Number of losses in a row (same day) right before each trade. */
export function lossesBefore(trades: ETrade[]): Map<string, number> {
  const out = new Map<string, number>();
  const byDay = new Map<string, ETrade[]>();
  for (const t of closedOnly(trades)) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day)!.push(t);
  }
  for (const ts of byDay.values()) {
    ts.sort(byEntry);
    let streak = 0;
    for (const t of ts) {
      out.set(t.id, streak);
      if (t.outcome === 'loss') streak++;
      else if (t.outcome === 'win') streak = 0;
    }
  }
  return out;
}

const SESSION_ORDER = (s: Settings) => [...s.sessions.map((x) => x.name), 'Вне сессий'];

export const bySession = (ts: ETrade[], s: Settings) => groupStats(ts, (t) => t.session, SESSION_ORDER(s)).filter((r) => r.trades);
export const bySymbol = (ts: ETrade[]) => groupStats(ts, (t) => t.symbol);
export const bySetup = (ts: ETrade[]) => groupStats(ts, (t) => t.setup || 'Без сетапа');
export const byDirection = (ts: ETrade[]) => groupStats(ts, (t) => (t.direction === 'long' ? 'Long' : 'Short'), ['Long', 'Short']);
export const byMistake = (ts: ETrade[]) => groupStats(ts, (t) => (t.mistakes.length ? t.mistakes : 'Без ошибок'));
export const byEmotion = (ts: ETrade[]) => groupStats(ts, (t) => t.emotion || undefined);
export const byPlan = (ts: ETrade[]) =>
  groupStats(ts, (t) => (t.followedPlan === undefined ? undefined : t.followedPlan ? 'По плану' : 'Вне плана'), ['По плану', 'Вне плана']);
export const byWeekday = (ts: ETrade[]) => groupStats(ts, (t) => WEEKDAY_NAMES[weekdayOfKey(t.day)], WEEKDAY_NAMES);
export const byHour = (ts: ETrade[], s: Settings) => {
  const order = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  return groupStats(ts, (t) => order[zonedParts(t.entryTime, s.statsTimeZone).hour], order);
};
export const byTradeNumber = (ts: ETrade[]) => {
  const n = tradeNumberInDay(ts);
  const order = ['1-я', '2-я', '3-я', '4+'];
  return groupStats(ts, (t) => order[Math.min(4, n.get(t.id) ?? 1) - 1], order);
};
export const byContracts = (ts: ETrade[]) =>
  groupStats(ts, (t) => `${t.contracts} ${t.symbol}`);

export interface EquityPoint {
  i: number;
  date: string;
  equity: number;
  pnl: number;
  drawdown: number;
  symbol: string;
}

export function equityCurve(trades: ETrade[]): EquityPoint[] {
  let eq = 0, peak = 0;
  const pts: EquityPoint[] = [{ i: 0, date: '', equity: 0, pnl: 0, drawdown: 0, symbol: '' }];
  closedOnly(trades).forEach((t, idx) => {
    eq += t.net!;
    peak = Math.max(peak, eq);
    pts.push({ i: idx + 1, date: t.exitTime ?? t.entryTime, equity: round2(eq), pnl: t.net!, drawdown: round2(eq - peak), symbol: t.symbol });
  });
  return pts;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function dailyPnl(trades: ETrade[]): Map<string, { pnl: number; trades: number; wins: number }> {
  const m = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of trades) {
    if (t.net === undefined) continue;
    const cur = m.get(t.day) ?? { pnl: 0, trades: 0, wins: 0 };
    cur.pnl += t.net;
    cur.trades += 1;
    if (t.outcome === 'win') cur.wins += 1;
    m.set(t.day, cur);
  }
  return m;
}

export function rHistogram(trades: ETrade[]): { bucket: string; from: number; count: number }[] {
  const edges = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4];
  const buckets = [
    { bucket: '< −2', from: -Infinity, count: 0 },
    ...edges.slice(0, -1).map((e, i) => ({ bucket: `${e}…${edges[i + 1]}`.replace(/-/g, '−'), from: e, count: 0 })),
    { bucket: '> 4', from: 4, count: 0 },
  ];
  for (const t of trades) {
    if (t.r === undefined) continue;
    let idx = buckets.length - 1;
    for (let i = 1; i < buckets.length; i++) {
      if (t.r < buckets[i].from) {
        idx = i - 1;
        break;
      }
    }
    buckets[idx].count++;
  }
  return buckets;
}

/** Plain-language conclusions that point at what to change. */
export function insights(all: ETrade[], settings: Settings): string[] {
  const out: string[] = [];
  const closed = closedOnly(all);
  if (closed.length < 5) {
    out.push('Запишите хотя бы 5 сделок — и здесь появятся выводы: в какую сессию вы теряете, какие ошибки стоят дороже всего, когда пора остановиться.');
    return out;
  }
  const s = summarize(closed);
  const m = (v: number) => money(v, { cents: false });

  if (s.winRate !== undefined && s.requiredWinRate !== undefined && s.payoff !== undefined) {
    const edge = s.winRate - s.requiredWinRate;
    out.push(
      edge >= 0
        ? `Винрейт ${s.winRate.toFixed(0)}% при нужных ${s.requiredWinRate.toFixed(0)}% (средняя прибыль в ${s.payoff.toFixed(1)} раза больше убытка). Запас ${edge.toFixed(0)} п.п.`
        : `Винрейт ${s.winRate.toFixed(0)}% ниже нужных ${s.requiredWinRate.toFixed(0)}% при средней прибыли/убытке ${s.payoff.toFixed(2)}. Держите прибыль дольше или режьте убытки раньше.`,
    );
  }

  // overtrading: what if you stopped after N trades a day
  const nums = tradeNumberInDay(closed);
  for (const n of [2, 3]) {
    const extra = closed.filter((t) => (nums.get(t.id) ?? 1) > n);
    const pnl = sum(extra.map((t) => t.net!));
    if (extra.length >= 3 && pnl < 0) {
      out.push(`Сделки после ${n}-й за день принесли ${m(pnl)}. Лимит ${n} сделки в день добавил бы ${m(-pnl)}.`);
      break;
    }
  }
  // tilt: trades after 2+ losses in a row
  const lb = lossesBefore(closed);
  const tilt = closed.filter((t) => (lb.get(t.id) ?? 0) >= 2);
  if (tilt.length >= 3) {
    const pnl = sum(tilt.map((t) => t.net!));
    const wr = (tilt.filter((t) => t.outcome === 'win').length / tilt.length) * 100;
    if (pnl < 0) out.push(`После двух убытков подряд: винрейт ${wr.toFixed(0)}%, итог ${m(pnl)}. Правило «2 стопа — закрываю платформу» сэкономило бы ${m(-pnl)}.`);
  }

  const pick = (rows: GroupRow[], label: string) => {
    const valid = rows.filter((r) => r.trades >= 3);
    if (valid.length < 2) return;
    const best = valid.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    const worst = valid.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    if (best.key === worst.key || worst.pnl >= 0) return;
    out.push(`${label}: лучше всего «${best.key}» (${m(best.pnl)}, ${best.winRate?.toFixed(0) ?? '—'}%), хуже всего «${worst.key}» (${m(worst.pnl)}, ${worst.winRate?.toFixed(0) ?? '—'}%).`);
  };
  pick(bySession(closed, settings), 'Сессии');
  pick(bySetup(closed), 'Сетапы');
  pick(byWeekday(closed), 'Дни');
  pick(bySymbol(closed), 'Инструменты');

  const plan = byPlan(closed);
  const on = plan.find((r) => r.key === 'По плану');
  const off = plan.find((r) => r.key === 'Вне плана');
  if (on && off && off.trades >= 2 && off.pnl < on.pnl) {
    out.push(`По плану: ${m(on.pnl)} (${on.winRate?.toFixed(0) ?? '—'}%). Вне плана: ${m(off.pnl)} (${off.winRate?.toFixed(0) ?? '—'}%).`);
  }
  const mistakes = byMistake(closed).filter((r) => r.key !== 'Без ошибок' && r.pnl < 0);
  if (mistakes.length) {
    const w = mistakes.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    out.push(`Самая дорогая ошибка — «${w.key}»: ${m(w.pnl)} за ${w.trades} сд.`);
  }
  if (s.avgHoldLoss !== undefined && s.avgHoldWin !== undefined && s.avgHoldLoss > s.avgHoldWin * 1.5) {
    out.push(`Убыточные сделки вы держите в ${(s.avgHoldLoss / s.avgHoldWin).toFixed(1)} раза дольше прибыльных — признак пересиживания.`);
  }
  return out;
}
