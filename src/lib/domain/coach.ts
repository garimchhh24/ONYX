import type { ETrade } from './calc';
import { money } from './format';
import {
  byDirection,
  byEmotionBefore,
  byEmotionDuring,
  byEntryQuality,
  byExitQuality,
  byHour,
  byInstrument,
  byMistake,
  byRuleCompliance,
  bySession,
  bySetup,
  byWeekday,
  closed,
  summarize,
  type GroupRow,
} from './stats';
import { EXCHANGE_TZ, WEEKDAYS, weekdayOfKey, zonedParts } from './time';

/**
 * Rule-based performance coach. It only speaks when the sample supports it:
 * a minimum total sample, a minimum per-group sample, and a Welch t-statistic
 * between the group and the rest of the trades.
 */

export const MIN_TRADES = 20;
export const MIN_GROUP = 8;
const T_THRESHOLD = 2;

export type Confidence = 'low' | 'medium' | 'high';

export interface Insight {
  id: string;
  dimension: string;
  title: string;
  detail: string;
  n: number;
  impact: 'positive' | 'negative';
  confidence: Confidence;
  t: number;
}

export interface CoachResult {
  ready: boolean;
  tradesNeeded: number;
  insights: Insight[];
  gaps: string[];
}

function meanVar(xs: number[]) {
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) : 0;
  return { n, m, v };
}

/** Welch's t statistic for two independent samples. */
export function welchT(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const A = meanVar(a);
  const B = meanVar(b);
  const se = Math.sqrt(A.v / A.n + B.v / B.n);
  if (!se) return 0;
  return (A.m - B.m) / se;
}

function confidenceOf(t: number, n: number): Confidence {
  const at = Math.abs(t);
  if (at >= 3 && n >= 20) return 'high';
  if (at >= 2.5 || n >= 15) return 'medium';
  return 'low';
}

type Grouper = (ts: ETrade[]) => GroupRow[];

const DIMENSIONS: { id: string; name: string; fn: Grouper; key: (t: ETrade) => string[] }[] = [
  { id: 'session', name: 'Session', fn: bySession, key: (t) => (t.sessionName ? [t.sessionName] : []) },
  { id: 'instrument', name: 'Instrument', fn: byInstrument, key: (t) => [t.symbol] },
  { id: 'setup', name: 'Setup', fn: bySetup, key: (t) => [t.setup || 'No setup'] },
  { id: 'weekday', name: 'Weekday', fn: byWeekday, key: (t) => [WEEKDAYS[weekdayOfKey(t.day)]] },
  {
    id: 'hour',
    name: 'Hour (NY)',
    fn: byHour,
    key: (t) => (t.entry_time ? [`${String(zonedParts(t.entry_time, EXCHANGE_TZ).hour).padStart(2, '0')}:00`] : []),
  },
  { id: 'direction', name: 'Direction', fn: byDirection, key: (t) => [t.direction] },
  { id: 'emotion_before', name: 'Emotion before entry', fn: byEmotionBefore, key: (t) => t.journal?.before ?? [] },
  { id: 'emotion_during', name: 'Emotion during trade', fn: byEmotionDuring, key: (t) => t.journal?.during ?? [] },
  { id: 'rules', name: 'Rule compliance', fn: byRuleCompliance, key: (t) => (t.journal?.rule_compliance ? [t.journal.rule_compliance] : []) },
  { id: 'entry', name: 'Entry quality', fn: byEntryQuality, key: (t) => (t.journal?.entry_quality ? [t.journal.entry_quality] : []) },
  { id: 'exit', name: 'Exit quality', fn: byExitQuality, key: (t) => t.journal?.exit_quality ?? [] },
  { id: 'mistake', name: 'Execution mistake', fn: byMistake, key: (t) => t.journal?.mistakes ?? [] },
];

export function coach(all: ETrade[]): CoachResult {
  const cl = closed(all);
  const gaps = dataGaps(cl);
  if (cl.length < MIN_TRADES) {
    return { ready: false, tradesNeeded: MIN_TRADES - cl.length, insights: [], gaps };
  }
  const insights: Insight[] = [];
  for (const dim of DIMENSIONS) {
    const rows = dim.fn(cl).filter((r) => r.trades >= MIN_GROUP);
    for (const row of rows) {
      const inGroup: number[] = [];
      const rest: number[] = [];
      for (const t of cl) {
        (dim.key(t).includes(row.key) ? inGroup : rest).push(t.net!);
      }
      if (rest.length < MIN_GROUP) continue;
      const t = welchT(inGroup, rest);
      if (Math.abs(t) < T_THRESHOLD) continue;
      const restAvg = rest.reduce((a, b) => a + b, 0) / rest.length;
      const positive = t > 0;
      insights.push({
        id: `${dim.id}:${row.key}`,
        dimension: dim.name,
        title: positive ? `${dim.name}: "${row.label}" is a strength` : `${dim.name}: "${row.label}" is costing you`,
        detail: `${row.trades} trades averaging ${money(row.avgPnl, { signed: true })} vs ${money(restAvg, { signed: true })} for the rest (${row.winRate?.toFixed(0) ?? '—'}% win rate, total ${money(row.pnl, { signed: true })}).`,
        n: row.trades,
        impact: positive ? 'positive' : 'negative',
        confidence: confidenceOf(t, row.trades),
        t,
      });
    }
  }
  insights.push(...behaviouralInsights(cl));
  insights.sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
  return { ready: true, tradesNeeded: 0, insights: dedupe(insights).slice(0, 12), gaps };
}

function dedupe(xs: Insight[]): Insight[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** Tilt after consecutive losses, overtrading, and holding losers. */
function behaviouralInsights(cl: ETrade[]): Insight[] {
  const out: Insight[] = [];
  const byDay = new Map<string, ETrade[]>();
  for (const t of cl) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day)!.push(t);
  }
  const afterTwoLosses: number[] = [];
  const normal: number[] = [];
  const lateTrades: number[] = [];
  const earlyTrades: number[] = [];
  for (const day of byDay.values()) {
    day.sort((a, b) => a.ts - b.ts);
    let streak = 0;
    day.forEach((t, i) => {
      (streak >= 2 ? afterTwoLosses : normal).push(t.net!);
      (i >= 3 ? lateTrades : earlyTrades).push(t.net!);
      if (t.outcome === 'loss') streak++;
      else if (t.outcome === 'win') streak = 0;
    });
  }
  const tilt = welchT(afterTwoLosses, normal);
  if (afterTwoLosses.length >= MIN_GROUP && normal.length >= MIN_GROUP && tilt <= -T_THRESHOLD) {
    const s = afterTwoLosses.reduce((a, b) => a + b, 0);
    out.push({
      id: 'behaviour:tilt',
      dimension: 'Behaviour',
      title: 'Trading after two losses in a row is hurting results',
      detail: `${afterTwoLosses.length} trades taken after 2+ same-day losses produced ${money(s, { signed: true })}. A two-loss daily stop would have avoided them.`,
      n: afterTwoLosses.length,
      impact: 'negative',
      confidence: confidenceOf(tilt, afterTwoLosses.length),
      t: tilt,
    });
  }
  const over = welchT(lateTrades, earlyTrades);
  if (lateTrades.length >= MIN_GROUP && earlyTrades.length >= MIN_GROUP && over <= -T_THRESHOLD) {
    const s = lateTrades.reduce((a, b) => a + b, 0);
    out.push({
      id: 'behaviour:overtrading',
      dimension: 'Behaviour',
      title: 'Your 4th+ trade of the day underperforms',
      detail: `${lateTrades.length} trades beyond the third of the day produced ${money(s, { signed: true })}. Consider a three-trade daily cap.`,
      n: lateTrades.length,
      impact: 'negative',
      confidence: confidenceOf(over, lateTrades.length),
      t: over,
    });
  }
  const s = summarize(cl);
  const winsWithTime = cl.filter((t) => t.outcome === 'win' && t.durationMin !== undefined).length;
  const lossesWithTime = cl.filter((t) => t.outcome === 'loss' && t.durationMin !== undefined).length;
  if (winsWithTime >= 10 && lossesWithTime >= 10 && s.avgDurationLoss && s.avgDurationWin && s.avgDurationLoss > s.avgDurationWin * 1.5) {
    out.push({
      id: 'behaviour:holding-losers',
      dimension: 'Behaviour',
      title: 'Losing trades are held much longer than winners',
      detail: `Losers last ${(s.avgDurationLoss / s.avgDurationWin).toFixed(1)}× longer than winners on average (${lossesWithTime} losses, ${winsWithTime} wins with timestamps) — a sign of hoping instead of exiting.`,
      n: lossesWithTime + winsWithTime,
      impact: 'negative',
      confidence: lossesWithTime >= 20 ? 'medium' : 'low',
      t: -2.5,
    });
  }
  return out;
}

export function dataGaps(cl: ETrade[]): string[] {
  const gaps: string[] = [];
  const noJournal = cl.filter((t) => !t.journal_completed_at).length;
  const noR = cl.filter((t) => t.r === undefined).length;
  const noFees = cl.filter((t) => t.feeSource === 'unknown').length;
  const noTime = cl.filter((t) => !t.entry_time).length;
  if (noJournal) gaps.push(`${noJournal} trade${noJournal === 1 ? '' : 's'} without a completed journal — psychology patterns can't include them.`);
  if (noR) gaps.push(`${noR} trade${noR === 1 ? '' : 's'} without a stop loss or risk amount — excluded from R metrics.`);
  if (noFees) gaps.push(`${noFees} trade${noFees === 1 ? '' : 's'} without commission data — net P&L may be overstated. Set commissions in Settings → Instruments.`);
  if (noTime) gaps.push(`${noTime} trade${noTime === 1 ? '' : 's'} without an entry time — excluded from session and hour analysis.`);
  return gaps;
}

/** Compact, aggregated payload for the AI coach (no raw notes or screenshots). */
export function coachPayload(all: ETrade[]) {
  const cl = closed(all);
  const s = summarize(cl);
  const table = (rows: GroupRow[]) =>
    rows.map((r) => ({
      group: r.label,
      n: r.trades,
      win_rate: r.winRate !== undefined ? Math.round(r.winRate) : null,
      net: Math.round(r.pnl),
      avg_per_trade: r.avgPnl !== undefined ? Math.round(r.avgPnl) : null,
      avg_r: r.avgR !== undefined ? Number(r.avgR.toFixed(2)) : null,
      sufficient: r.trades >= MIN_GROUP,
    }));
  const c = coach(all);
  return {
    thresholds: { min_total_trades: MIN_TRADES, min_group_trades: MIN_GROUP },
    period: cl.length ? { from: cl[0].day, to: cl[cl.length - 1].day } : null,
    summary: {
      trades: s.trades,
      win_rate: s.winRate !== undefined ? Math.round(s.winRate) : null,
      net: Math.round(s.net),
      profit_factor: s.profitFactor === Infinity ? 'infinite' : s.profitFactor !== undefined ? Number(s.profitFactor.toFixed(2)) : null,
      expectancy: s.expectancy !== undefined ? Math.round(s.expectancy) : null,
      avg_r: s.avgR !== undefined ? Number(s.avgR.toFixed(2)) : null,
      max_drawdown: Math.round(s.maxDrawdown),
      max_win_streak: s.maxWinStreak,
      max_loss_streak: s.maxLossStreak,
      avg_minutes_winners: s.avgDurationWin !== undefined ? Math.round(s.avgDurationWin) : null,
      avg_minutes_losers: s.avgDurationLoss !== undefined ? Math.round(s.avgDurationLoss) : null,
    },
    groups: {
      session: table(bySession(cl)),
      instrument: table(byInstrument(cl)),
      setup: table(bySetup(cl)),
      weekday: table(byWeekday(cl)),
      direction: table(byDirection(cl)),
      emotion_before: table(byEmotionBefore(cl)),
      emotion_during: table(byEmotionDuring(cl)),
      rule_compliance: table(byRuleCompliance(cl)),
      entry_quality: table(byEntryQuality(cl)),
      exit_quality: table(byExitQuality(cl)),
      mistakes: table(byMistake(cl)),
    },
    statistically_supported_patterns: c.insights.map((i) => ({ title: i.title, detail: i.detail, n: i.n, confidence: i.confidence })),
    data_gaps: c.gaps,
  };
}

export type CoachPayload = ReturnType<typeof coachPayload>;
