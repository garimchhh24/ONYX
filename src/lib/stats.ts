import type { Settings, Trade } from '../types';
import {
  durationMinutes,
  formatCurrency,
  outcome,
  plannedRR,
  riskPercent,
  tradePnl,
  tradeR,
  tradeRisk,
  tradeSession,
} from './calc';
import { dayKey, WEEKDAY_NAMES, zonedParts } from './time';

export interface Summary {
  total: number;
  open: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** wins / (wins + losses) × 100 — breakeven trades excluded */
  winRate: number | undefined;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | undefined;
  avgWin: number | undefined;
  avgLoss: number | undefined;
  /** avg win / |avg loss| */
  payoff: number | undefined;
  /** average PnL per closed trade */
  expectancy: number | undefined;
  totalR: number;
  avgR: number | undefined;
  rCount: number;
  largestWin: number | undefined;
  largestLoss: number | undefined;
  maxDrawdown: number;
  maxDrawdownPct: number | undefined;
  maxWinStreak: number;
  maxLossStreak: number;
  /** positive = wins in a row, negative = losses in a row */
  currentStreak: number;
  avgHoldWin: number | undefined;
  avgHoldLoss: number | undefined;
  avgRisk: number | undefined;
  avgRiskPct: number | undefined;
  overRiskCount: number;
  avgPlannedRR: number | undefined;
  /** Breakeven win rate implied by the realized payoff ratio */
  requiredWinRate: number | undefined;
  totalFees: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function sortByExit(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) => new Date(a.exitTime ?? a.entryTime).getTime() - new Date(b.exitTime ?? b.entryTime).getTime(),
  );
}

export function summarize(trades: Trade[], settings: Settings): Summary {
  const closed = sortByExit(trades.filter((t) => outcome(t) !== 'open'));
  const pnls = closed.map((t) => tradePnl(t)!);
  const winsT = closed.filter((t) => outcome(t) === 'win');
  const lossT = closed.filter((t) => outcome(t) === 'loss');
  const winP = winsT.map((t) => tradePnl(t)!);
  const lossP = lossT.map((t) => tradePnl(t)!);
  const rs = closed.map(tradeR).filter((r): r is number => r !== undefined);

  const grossProfit = sum(pnls.filter((p) => p > 0));
  const grossLoss = sum(pnls.filter((p) => p < 0));

  // equity / drawdown
  let equity = settings.startingBalance || 0;
  let peak = equity;
  let maxDD = 0;
  let maxDDPct: number | undefined = settings.startingBalance ? 0 : undefined;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    if (maxDDPct !== undefined && peak > 0) maxDDPct = Math.max(maxDDPct, (dd / peak) * 100);
  }

  // streaks (breakeven does not break or extend a streak)
  let maxW = 0, maxL = 0, cur = 0;
  for (const t of closed) {
    const o = outcome(t);
    if (o === 'win') cur = cur > 0 ? cur + 1 : 1;
    else if (o === 'loss') cur = cur < 0 ? cur - 1 : -1;
    else continue;
    maxW = Math.max(maxW, cur);
    maxL = Math.max(maxL, -cur);
  }

  const risks = closed.map(tradeRisk).filter((r): r is number => r !== undefined);
  const riskPcts = closed.map((t) => riskPercent(t, settings)).filter((r): r is number => r !== undefined);
  const avgWin = avg(winP);
  const avgLoss = avg(lossP);
  const payoff = avgWin !== undefined && avgLoss ? avgWin / Math.abs(avgLoss) : undefined;
  const decided = winsT.length + lossT.length;

  return {
    total: trades.length,
    open: trades.length - closed.length,
    wins: winsT.length,
    losses: lossT.length,
    breakeven: closed.length - decided,
    winRate: decided ? (winsT.length / decided) * 100 : undefined,
    netPnl: sum(pnls),
    grossProfit,
    grossLoss,
    profitFactor: grossLoss ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : undefined,
    avgWin,
    avgLoss,
    payoff,
    expectancy: avg(pnls),
    totalR: sum(rs),
    avgR: avg(rs),
    rCount: rs.length,
    largestWin: winP.length ? Math.max(...winP) : undefined,
    largestLoss: lossP.length ? Math.min(...lossP) : undefined,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    currentStreak: cur,
    avgHoldWin: avg(winsT.map(durationMinutes).filter((d): d is number => d !== undefined)),
    avgHoldLoss: avg(lossT.map(durationMinutes).filter((d): d is number => d !== undefined)),
    avgRisk: avg(risks),
    avgRiskPct: avg(riskPcts),
    overRiskCount: riskPcts.filter((r) => r > settings.maxRiskPercent + 1e-9).length,
    avgPlannedRR: avg(closed.map(plannedRR).filter((r): r is number => r !== undefined)),
    requiredWinRate: payoff !== undefined ? (1 / (1 + payoff)) * 100 : undefined,
    totalFees: sum(closed.map((t) => t.fees || 0)),
  };
}

export interface GroupRow {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | undefined;
  pnl: number;
  avgR: number | undefined;
  profitFactor: number | undefined;
  expectancy: number | undefined;
}

export function groupStats(
  trades: Trade[],
  keyFn: (t: Trade) => string | string[] | undefined,
  order?: string[],
): GroupRow[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    if (outcome(t) === 'open') continue;
    const k = keyFn(t);
    const keys = Array.isArray(k) ? k : k ? [k] : [];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
  }
  const rows: GroupRow[] = [...groups.entries()].map(([key, ts]) => {
    const pnls = ts.map((t) => tradePnl(t)!);
    const wins = ts.filter((t) => outcome(t) === 'win').length;
    const losses = ts.filter((t) => outcome(t) === 'loss').length;
    const gp = sum(pnls.filter((p) => p > 0));
    const gl = Math.abs(sum(pnls.filter((p) => p < 0)));
    return {
      key,
      trades: ts.length,
      wins,
      losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : undefined,
      pnl: sum(pnls),
      avgR: avg(ts.map(tradeR).filter((r): r is number => r !== undefined)),
      profitFactor: gl ? gp / gl : gp > 0 ? Infinity : undefined,
      expectancy: avg(pnls),
    };
  });
  if (order) rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else rows.sort((a, b) => b.pnl - a.pnl);
  return rows;
}

export const bySession = (trades: Trade[], s: Settings) => groupStats(trades, (t) => tradeSession(t, s));
export const bySymbol = (trades: Trade[]) => groupStats(trades, (t) => t.symbol.toUpperCase());
export const bySetup = (trades: Trade[]) => groupStats(trades, (t) => t.setup || 'Без сетапа');
export const byDirection = (trades: Trade[]) =>
  groupStats(trades, (t) => (t.direction === 'long' ? 'Long' : 'Short'), ['Long', 'Short']);
export const byMistake = (trades: Trade[]) =>
  groupStats(trades, (t) => (t.mistakes.length ? t.mistakes : 'Без ошибок'));
export const byEmotion = (trades: Trade[]) => groupStats(trades, (t) => t.emotion || undefined);
export const byWeekday = (trades: Trade[], s: Settings) =>
  groupStats(trades, (t) => WEEKDAY_NAMES[zonedParts(t.entryTime, s.displayTimeZone).weekday], WEEKDAY_NAMES);
export const byHour = (trades: Trade[], s: Settings) => {
  const order = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  return groupStats(trades, (t) => order[zonedParts(t.entryTime, s.displayTimeZone).hour], order);
};
export const byPlan = (trades: Trade[]) =>
  groupStats(
    trades,
    (t) => (t.followedPlan === undefined ? undefined : t.followedPlan ? 'По плану' : 'Вне плана'),
    ['По плану', 'Вне плана'],
  );
export const byRating = (trades: Trade[]) =>
  groupStats(trades, (t) => (t.rating ? '★'.repeat(t.rating) : undefined), ['★', '★★', '★★★', '★★★★', '★★★★★']);

export interface EquityPoint {
  i: number;
  date: string;
  equity: number;
  pnl: number;
  drawdown: number;
  symbol: string;
}

export function equityCurve(trades: Trade[], settings: Settings): EquityPoint[] {
  const closed = sortByExit(trades.filter((t) => outcome(t) !== 'open'));
  let equity = settings.startingBalance || 0;
  let peak = equity;
  const pts: EquityPoint[] = [{ i: 0, date: '', equity, pnl: 0, drawdown: 0, symbol: 'Старт' }];
  closed.forEach((t, idx) => {
    const pnl = tradePnl(t)!;
    equity += pnl;
    peak = Math.max(peak, equity);
    pts.push({
      i: idx + 1,
      date: t.exitTime ?? t.entryTime,
      equity: Math.round(equity * 100) / 100,
      pnl,
      drawdown: Math.round((equity - peak) * 100) / 100,
      symbol: t.symbol,
    });
  });
  return pts;
}

export function dailyPnl(trades: Trade[], settings: Settings): Map<string, { pnl: number; trades: number }> {
  const m = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const pnl = tradePnl(t);
    if (pnl === undefined) continue;
    const k = dayKey(t.exitTime ?? t.entryTime, settings.displayTimeZone);
    const cur = m.get(k) ?? { pnl: 0, trades: 0 };
    cur.pnl += pnl;
    cur.trades += 1;
    m.set(k, cur);
  }
  return m;
}

export function rHistogram(trades: Trade[]): { bucket: string; from: number; count: number }[] {
  const edges = [-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 5];
  const buckets = [
    { bucket: '< -3R', from: -Infinity, count: 0 },
    ...edges.slice(0, -1).map((e, i) => ({ bucket: `${e}…${edges[i + 1]}`, from: e, count: 0 })),
    { bucket: '> 5R', from: 5, count: 0 },
  ];
  for (const t of trades) {
    const r = tradeR(t);
    if (r === undefined) continue;
    let idx = buckets.length - 1;
    for (let i = 1; i < buckets.length; i++) {
      if (r < buckets[i].from) {
        idx = i - 1;
        break;
      }
    }
    buckets[idx].count++;
  }
  return buckets;
}

/** Plain-language observations that point at what to change. */
export function insights(trades: Trade[], settings: Settings): string[] {
  const out: string[] = [];
  const closed = trades.filter((t) => outcome(t) !== 'open');
  if (closed.length < 5) {
    out.push('Нужно минимум 5 закрытых сделок для выводов. Чем больше выборка, тем надёжнее статистика (идеально — 30+).');
    return out;
  }
  const s = summarize(closed, settings);
  const cur = settings.currency;
  const money = (v: number) => formatCurrency(v, cur, 0);

  if (s.winRate !== undefined && s.requiredWinRate !== undefined) {
    const edge = s.winRate - s.requiredWinRate;
    out.push(
      edge >= 0
        ? `Винрейт ${s.winRate.toFixed(0)}% выше точки безубыточности ${s.requiredWinRate.toFixed(0)}% (при текущем соотношении прибыль/убыток ${s.payoff!.toFixed(2)}). Запас: ${edge.toFixed(0)} п.п.`
        : `Винрейт ${s.winRate.toFixed(0)}% ниже необходимых ${s.requiredWinRate.toFixed(0)}% при текущем соотношении прибыль/убыток ${s.payoff!.toFixed(2)}. Нужно либо держать прибыль дольше, либо резать убытки раньше.`,
    );
  }
  if (s.avgHoldLoss !== undefined && s.avgHoldWin !== undefined && s.avgHoldLoss > s.avgHoldWin * 1.5) {
    out.push(
      `Убыточные сделки вы держите в ${(s.avgHoldLoss / s.avgHoldWin).toFixed(1)} раза дольше прибыльных — признак «пересиживания» убытков.`,
    );
  }

  const pickBestWorst = (rows: GroupRow[], label: string) => {
    const valid = rows.filter((r) => r.trades >= 3);
    if (valid.length < 2) return;
    const best = valid.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    const worst = valid.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    if (best.key === worst.key) return;
    out.push(
      `${label}: лучше всего — «${best.key}» (${money(best.pnl)}, винрейт ${best.winRate?.toFixed(0) ?? '—'}%), хуже всего — «${worst.key}» (${money(worst.pnl)}, винрейт ${worst.winRate?.toFixed(0) ?? '—'}%).`,
    );
  };
  pickBestWorst(bySession(closed, settings), 'Сессии');
  pickBestWorst(byWeekday(closed, settings), 'Дни недели');
  pickBestWorst(bySetup(closed), 'Сетапы');
  pickBestWorst(bySymbol(closed), 'Инструменты');

  const plan = byPlan(closed);
  const on = plan.find((r) => r.key === 'По плану');
  const off = plan.find((r) => r.key === 'Вне плана');
  if (on && off && off.trades >= 2) {
    out.push(
      `Сделки по плану: ${money(on.pnl)} (винрейт ${on.winRate?.toFixed(0) ?? '—'}%). Вне плана: ${money(off.pnl)} (винрейт ${off.winRate?.toFixed(0) ?? '—'}%).`,
    );
  }
  const mistakes = byMistake(closed).filter((r) => r.key !== 'Без ошибок' && r.pnl < 0);
  if (mistakes.length) {
    const worst = mistakes.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    out.push(`Самая дорогая ошибка — «${worst.key}»: ${money(worst.pnl)} за ${worst.trades} сделок.`);
  }
  if (s.overRiskCount > 0) {
    out.push(`${s.overRiskCount} сделок с риском выше лимита ${settings.maxRiskPercent}% от депозита.`);
  }
  const dirs = byDirection(closed);
  if (dirs.length === 2 && dirs.every((d) => d.trades >= 3) && Math.sign(dirs[0].pnl) !== Math.sign(dirs[1].pnl)) {
    const good = dirs[0].pnl > 0 ? dirs[0] : dirs[1];
    out.push(`Прибыль приносят только ${good.key}-сделки (${money(good.pnl)}). Стоит пересмотреть противоположное направление.`);
  }
  return out;
}
