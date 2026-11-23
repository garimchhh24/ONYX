import type { Instrument, Trade } from '../types';
import { findInstrument, pointValue } from './instruments';
import { sessionFor } from './sessions';
import { tradingDay } from './time';

export type Outcome = 'win' | 'loss' | 'breakeven' | 'open';

/** |R| below this counts as breakeven; without R, |$| below BE_USD. */
export const BE_R = 0.05;
export const BE_USD = 1;

/** Where the commission figure came from. */
export type FeeSource = 'trade' | 'settings' | 'unknown';

/** A trade with every derived number computed once. */
export interface ETrade extends Trade {
  inst?: Instrument;
  /** $ per 1.0 point per contract (0 if the instrument is unknown) */
  pv: number;
  points?: number;
  ticks?: number;
  gross?: number;
  fees: number;
  feeSource: FeeSource;
  net?: number;
  risk?: number;
  riskPoints?: number;
  r?: number;
  plannedRR?: number;
  outcome: Outcome;
  sessionName: string | null;
  /** CME trading day YYYY-MM-DD (falls back to created date) */
  day: string;
  durationMin?: number;
  /** Platform-reported P&L disagrees with the contract-spec calculation */
  pnlMismatch?: number;
  /** Timestamp used for ordering */
  ts: number;
}

const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const round2 = (v: number) => Math.round(v * 100) / 100;

export function enrichTrade(t: Trade, instruments: Instrument[]): ETrade {
  const inst = findInstrument(t.symbol, instruments);
  const pv = inst ? pointValue(inst) : 0;
  const contracts = t.contracts > 0 ? t.contracts : 1;
  const dir = t.direction === 'long' ? 1 : -1;

  // Fees: explicit trade commission → user's configured per-contract rate → unknown (0)
  let fees = 0;
  let feeSource: FeeSource = 'unknown';
  if (num(t.commission)) {
    fees = Math.abs(t.commission);
    feeSource = 'trade';
  } else if (inst && num(inst.commission_rt)) {
    fees = round2(inst.commission_rt * contracts);
    feeSource = 'settings';
  }

  let points: number | undefined;
  let gross: number | undefined;
  let net: number | undefined;
  let pnlMismatch: number | undefined;

  if (num(t.entry_price) && num(t.exit_price)) {
    points = (t.exit_price - t.entry_price) * dir;
    if (pv) gross = round2(points * pv * contracts);
  }
  if (gross !== undefined) {
    if (num(t.gross_pnl) && Math.abs(t.gross_pnl - gross) > Math.max(1, (inst?.tick_value ?? 1) * contracts) - 1e-9) {
      pnlMismatch = round2(t.gross_pnl - gross);
    }
  } else if (num(t.gross_pnl)) {
    gross = t.gross_pnl;
  }

  if (gross !== undefined) net = round2(gross - fees);
  else if (num(t.net_pnl)) {
    net = t.net_pnl;
    if (feeSource !== 'unknown') gross = round2(net + fees);
  }
  if (points === undefined && gross !== undefined && pv) points = gross / contracts / pv;

  let riskPoints: number | undefined;
  if (num(t.entry_price) && num(t.stop_loss) && t.stop_loss !== t.entry_price) riskPoints = Math.abs(t.entry_price - t.stop_loss);
  const risk = num(t.risk_amount) && t.risk_amount > 0 ? t.risk_amount : riskPoints && pv ? round2(riskPoints * pv * contracts) : undefined;
  const r = net !== undefined && risk ? net / risk : undefined;

  let plannedRR: number | undefined;
  if (riskPoints && num(t.entry_price) && num(t.take_profit)) plannedRR = Math.abs(t.take_profit - t.entry_price) / riskPoints;

  let outcome: Outcome = 'open';
  if (net !== undefined) {
    const be = r !== undefined ? Math.abs(r) < BE_R : Math.abs(net) < BE_USD;
    outcome = be ? 'breakeven' : net > 0 ? 'win' : 'loss';
  }

  let durationMin: number | undefined;
  if (t.entry_time && t.exit_time) {
    const d = (new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / 60000;
    if (Number.isFinite(d) && d >= 0) durationMin = d;
  }

  const when = t.exit_time ?? t.entry_time ?? t.created_at;
  return {
    ...t,
    inst,
    pv,
    points,
    ticks: points !== undefined && inst ? Math.round((points / inst.tick_size) * 100) / 100 : undefined,
    gross,
    fees,
    feeSource,
    net,
    risk,
    riskPoints,
    r,
    plannedRR,
    outcome,
    sessionName: t.session ?? sessionFor(t.entry_time),
    day: t.trading_day ?? tradingDay(when),
    durationMin,
    pnlMismatch,
    ts: new Date(when).getTime(),
  };
}

/** Enrich and sort chronologically (oldest first). Deleted trades are excluded. */
export function enrichAll(trades: Trade[], instruments: Instrument[]): ETrade[] {
  return trades
    .filter((t) => !t.deleted_at)
    .map((t) => enrichTrade(t, instruments))
    .sort((a, b) => a.ts - b.ts);
}

/** Derived columns persisted with the trade (used by server-side reminder queries). */
export function derivedColumns(t: Pick<Trade, 'entry_time' | 'exit_time' | 'created_at'>): { session: string | null; trading_day: string } {
  return {
    session: sessionFor(t.entry_time),
    trading_day: tradingDay(t.exit_time ?? t.entry_time ?? t.created_at),
  };
}

/** Gross $ for a price move — the core futures formula, exposed for previews. */
export function grossFor(inst: Instrument, direction: 'long' | 'short', entry: number, exit: number, contracts: number): number {
  return round2((exit - entry) * (direction === 'long' ? 1 : -1) * pointValue(inst) * contracts);
}
