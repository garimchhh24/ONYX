import type { Instrument, Settings, Trade } from '../types';
import { findInstrument, miniEquivalent, pointValue } from './instruments';
import { sessionLabel } from './sessions';
import { tradingDay } from './time';

export type Outcome = 'win' | 'loss' | 'be' | 'open';

/** |R| below this is breakeven; without risk, |$| below BE_USD */
export const BE_THRESHOLD_R = 0.1;
export const BE_USD = 0.5;

/** A trade with every derived number computed once. */
export interface ETrade extends Trade {
  inst?: Instrument;
  /** $ per 1.0 point for one contract */
  pv: number;
  /** signed points captured */
  points?: number;
  ticks?: number;
  gross?: number;
  feesUsd: number;
  /** net $ per account */
  net?: number;
  risk?: number;
  /** stop distance in points */
  riskPoints?: number;
  r?: number;
  plannedRR?: number;
  outcome: Outcome;
  session: string;
  /** CME trading day YYYY-MM-DD */
  day: string;
  durationMin?: number;
  miniEq: number;
}

const sign = (t: Trade) => (t.direction === 'long' ? 1 : -1);
const num = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function enrichTrade(t: Trade, settings: Settings): ETrade {
  const inst = findInstrument(t.symbol, settings.instruments);
  const pv = inst ? pointValue(inst) : 1;
  const contracts = t.contracts || 1;

  let points: number | undefined;
  let riskPoints: number | undefined;
  let targetPts: number | undefined;
  if (t.mode === 'prices') {
    if (num(t.entryPrice) && num(t.exitPrice)) points = (t.exitPrice - t.entryPrice) * sign(t);
    if (num(t.entryPrice) && num(t.stopPrice) && t.stopPrice !== 0) riskPoints = Math.abs(t.entryPrice - t.stopPrice);
    if (num(t.entryPrice) && num(t.targetPrice) && t.targetPrice !== 0) targetPts = Math.abs(t.targetPrice - t.entryPrice);
  } else if (t.mode === 'points') {
    if (num(t.resultPoints)) points = t.resultPoints;
    if (num(t.stopPoints) && t.stopPoints > 0) riskPoints = t.stopPoints;
    if (num(t.targetPoints) && t.targetPoints > 0) targetPts = t.targetPoints;
  } else {
    if (num(t.stopPoints) && t.stopPoints > 0) riskPoints = t.stopPoints;
  }

  const feesUsd = num(t.fees) ? t.fees : (inst?.commission ?? 0) * contracts;
  let gross: number | undefined = num(t.gross) ? t.gross : points !== undefined ? points * contracts * pv : undefined;
  let net: number | undefined;
  if (num(t.pnl)) {
    net = t.pnl;
    gross = gross ?? t.pnl + feesUsd;
  } else if (gross !== undefined) {
    net = gross - feesUsd;
  }
  if (points === undefined && gross !== undefined && pv) points = gross / contracts / pv;

  const risk = num(t.riskUsd) && t.riskUsd > 0 ? t.riskUsd : riskPoints ? riskPoints * contracts * pv : undefined;
  const r = net !== undefined && risk ? net / risk : undefined;

  let outcome: Outcome = 'open';
  if (net !== undefined) {
    const be = r !== undefined ? Math.abs(r) < BE_THRESHOLD_R : Math.abs(net) < BE_USD;
    outcome = be ? 'be' : net > 0 ? 'win' : 'loss';
  }
  const dur = t.exitTime ? (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 60000 : undefined;

  return {
    ...t,
    inst,
    pv,
    points,
    ticks: points !== undefined && inst ? points / inst.tickSize : undefined,
    gross,
    feesUsd,
    net,
    risk,
    riskPoints,
    r,
    plannedRR: riskPoints && targetPts ? targetPts / riskPoints : undefined,
    outcome,
    session: sessionLabel(t.entryTime, settings.sessions),
    day: tradingDay(t.exitTime ?? t.entryTime),
    durationMin: dur !== undefined && dur >= 0 ? dur : undefined,
    miniEq: miniEquivalent(contracts, inst),
  };
}

export function enrichAll(trades: Trade[], settings: Settings): ETrade[] {
  return trades
    .map((t) => enrichTrade(t, settings))
    .sort((a, b) => new Date(a.exitTime ?? a.entryTime).getTime() - new Date(b.exitTime ?? b.entryTime).getTime());
}

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- formatting ----------

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $1,234.50 / −$80.00 / +$12.00 (signed) */
export function money(v: number | undefined, opts: { signed?: boolean; cents?: boolean } = {}): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const cents = opts.cents ?? Math.abs(v) < 10_000;
  const s = (cents ? usd2 : usd0).format(Math.abs(v));
  if (v < 0) return '−' + s;
  return opts.signed && v > 0 ? '+' + s : s;
}

/** Short money: $12.4K */
export function moneyShort(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}K` : `$${Math.round(a)}`;
  return (v < 0 ? '−' : '') + s;
}

export function fmtNum(v: number | undefined, digits = 2, signed = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(digits);
  if (v < 0 && Number(s) !== 0) return '−' + s;
  return signed && v > 0 ? '+' + s : s;
}

export function fmtR(v: number | undefined): string {
  return v === undefined ? '—' : fmtNum(v, 2, true) + 'R';
}

export function fmtPct(v: number | undefined, digits = 0): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

export function fmtPrice(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return Number(v.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export const tone = (v: number | undefined): 'pos' | 'neg' | '' =>
  v === undefined || Math.abs(v) < 1e-9 ? '' : v > 0 ? 'pos' : 'neg';
