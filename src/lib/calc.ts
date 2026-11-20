import type { Settings, Trade } from '../types';
import { sessionLabel } from './sessions';

export type Outcome = 'win' | 'loss' | 'be' | 'open';

/** |R| below this is treated as breakeven */
export const BE_THRESHOLD_R = 0.1;

const dirSign = (t: Trade) => (t.direction === 'long' ? 1 : -1);

export function isClosed(t: Trade): boolean {
  return t.pnlOverride !== undefined || t.exitPrice !== undefined;
}

/** Net PnL in account currency (broker value wins over calculation). */
export function tradePnl(t: Trade): number | undefined {
  if (t.pnlOverride !== undefined) return t.pnlOverride;
  if (t.exitPrice === undefined) return undefined;
  const gross = (t.exitPrice - t.entryPrice) * dirSign(t) * t.size * (t.pointValue || 1);
  return gross - (t.fees || 0);
}

/** Money at risk: explicit value, or distance to stop × size × point value. */
export function tradeRisk(t: Trade): number | undefined {
  if (t.riskOverride !== undefined && t.riskOverride > 0) return t.riskOverride;
  if (t.stopLoss === undefined || !t.stopLoss) return undefined;
  const r = Math.abs(t.entryPrice - t.stopLoss) * t.size * (t.pointValue || 1);
  return r > 0 ? r : undefined;
}

/** Realized R multiple. */
export function tradeR(t: Trade): number | undefined {
  const pnl = tradePnl(t);
  const risk = tradeRisk(t);
  if (pnl === undefined || !risk) return undefined;
  return pnl / risk;
}

/** Planned reward:risk from TP and SL. */
export function plannedRR(t: Trade): number | undefined {
  if (!t.stopLoss || !t.takeProfit) return undefined;
  const risk = Math.abs(t.entryPrice - t.stopLoss);
  const reward = Math.abs(t.takeProfit - t.entryPrice);
  return risk > 0 ? reward / risk : undefined;
}

export function outcome(t: Trade): Outcome {
  const pnl = tradePnl(t);
  if (pnl === undefined) return 'open';
  const r = tradeR(t);
  if (r !== undefined ? Math.abs(r) < BE_THRESHOLD_R : pnl === 0) return 'be';
  return pnl > 0 ? 'win' : 'loss';
}

export function durationMinutes(t: Trade): number | undefined {
  if (!t.exitTime) return undefined;
  const ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
  return ms >= 0 ? ms / 60000 : undefined;
}

export function riskPercent(t: Trade, settings: Settings): number | undefined {
  const risk = tradeRisk(t);
  if (!risk || !settings.startingBalance) return undefined;
  return (risk / settings.startingBalance) * 100;
}

export function tradeSession(t: Trade, settings: Settings): string {
  return sessionLabel(t.entryTime, settings.sessions);
}

export function uid(): string {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
}

export function fmtMoney(v: number | undefined, currency = 'USD', signed = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const s = formatCurrency(v, currency, 2);
  return signed && v > 0 ? '+' + s : s;
}

export function fmtNum(v: number | undefined, digits = 2, signed = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return signed && v > 0 ? '+' + s : s;
}

export function fmtPct(v: number | undefined, digits = 1): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

/** Currency format that tolerates non-ISO codes like USDT. */
export function formatCurrency(v: number, currency: string, digits: number): string {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(v)} ${currency}`;
  }
}
