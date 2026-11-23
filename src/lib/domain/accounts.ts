import type { Account } from '../types';
import type { ETrade } from './calc';

/**
 * Prop account metrics. Every rule comes from the account's configuration —
 * nothing about Lucid Trading (or any firm) is hardcoded here.
 */

export interface AccountMetrics {
  account: Account;
  trades: number;
  realized: number;
  balance: number;
  todayPnl: number;
  todayTrades: number;
  peak: number;
  /** Balance at which the account fails (null when no max drawdown is configured) */
  threshold: number | null;
  thresholdLocked: boolean;
  /** balance − threshold */
  drawdownRoom: number | null;
  /** share of the max drawdown already used, 0..1+ */
  drawdownUsed: number | null;
  breached: boolean;
  /** Daily loss limit room left today */
  dailyRoom: number | null;
  /** Personal daily risk room left today */
  personalRoom: number | null;
  /** Smallest of the configured allowances — what you can still lose today */
  riskAllowance: number | null;
  profit: number;
  targetProgress: number | null;
  targetLeft: number | null;
  payoutProgress: number | null;
  payoutLeft: number | null;
  tradingDays: number;
  bestDay: number;
  /** best day / total profit, % */
  consistency: number | null;
  consistencyOk: boolean | null;
  level: 'ok' | 'warn' | 'danger' | 'done';
  headline: string;
}

export const PHASE_LABEL: Record<Account['phase'], string> = {
  evaluation: 'Evaluation',
  funded: 'Funded',
  live: 'Live',
  other: 'Other',
};

export const STATUS_LABEL: Record<Account['status'], string> = {
  active: 'Active',
  passed: 'Passed',
  payout: 'Payout eligible',
  breached: 'Breached',
  inactive: 'Inactive',
};

export const DRAWDOWN_LABEL: Record<Account['drawdown_type'], string> = {
  static: 'Static',
  trailing_eod: 'Trailing (end of day)',
  trailing_intraday: 'Trailing (intraday)',
};

export function accountMetrics(account: Account, all: ETrade[], today: string): AccountMetrics {
  const trades = all.filter((t) => t.account_id === account.id && t.net !== undefined).sort((a, b) => a.ts - b.ts);
  const start = account.starting_balance;
  const dd = account.max_drawdown && account.max_drawdown > 0 ? account.max_drawdown : null;
  const lock = account.drawdown_lock && account.drawdown_lock > 0 ? account.drawdown_lock : null;
  const trailing = account.drawdown_type !== 'static';
  const thresholdFor = (peak: number) => {
    if (dd === null) return null;
    if (!trailing) return start - dd;
    const t = peak - dd;
    return lock !== null ? Math.min(t, lock) : t;
  };

  let balance = start;
  let peak = start;
  let threshold = thresholdFor(peak);
  let breached = false;
  let currentDay: string | undefined;
  const dayPnl = new Map<string, number>();

  const closeDay = () => {
    if (account.drawdown_type === 'trailing_eod') {
      peak = Math.max(peak, balance);
      const t = thresholdFor(peak);
      if (t !== null && threshold !== null) threshold = Math.max(threshold, t);
    }
  };

  for (const t of trades) {
    if (currentDay !== undefined && t.day !== currentDay) closeDay();
    currentDay = t.day;
    balance += t.net!;
    dayPnl.set(t.day, (dayPnl.get(t.day) ?? 0) + t.net!);
    if (account.drawdown_type === 'trailing_intraday') {
      peak = Math.max(peak, balance);
      const th = thresholdFor(peak);
      if (th !== null && threshold !== null) threshold = Math.max(threshold, th);
    }
    if (threshold !== null && balance <= threshold + 1e-9) breached = true;
  }
  // The trailing-EOD threshold only updates after a day closes.
  if (currentDay !== undefined && currentDay < today) closeDay();

  const realized = round(balance - start);
  balance = round(balance + (account.balance_adjustment || 0));
  const todayPnl = round(dayPnl.get(today) ?? 0);
  const todayTrades = trades.filter((t) => t.day === today).length;

  const drawdownRoom = threshold !== null ? round(balance - threshold) : null;
  const drawdownUsed = dd !== null && drawdownRoom !== null ? Math.max(0, 1 - drawdownRoom / dd) : null;
  const dailyRoom = account.daily_loss_limit ? round(account.daily_loss_limit + Math.min(0, todayPnl)) : null;
  const personalRoom = account.personal_daily_risk ? round(account.personal_daily_risk + Math.min(0, todayPnl)) : null;
  const allowances = [drawdownRoom, dailyRoom, personalRoom].filter((x): x is number => x !== null);
  const riskAllowance = allowances.length ? Math.max(0, Math.min(...allowances)) : null;

  const profit = round(balance - start);
  const targetProgress = account.profit_target ? clamp01(profit / account.profit_target) : null;
  const targetLeft = account.profit_target ? Math.max(0, round(account.profit_target - profit)) : null;
  const payoutProgress = account.payout_target ? clamp01(profit / account.payout_target) : null;
  const payoutLeft = account.payout_target ? Math.max(0, round(account.payout_target - profit)) : null;

  const days = [...dayPnl.values()];
  const bestDay = days.length ? Math.max(...days) : 0;
  const consistency = profit > 0 && bestDay > 0 ? (bestDay / profit) * 100 : null;
  const consistencyOk = account.consistency_pct && consistency !== null ? consistency <= account.consistency_pct : null;

  let level: AccountMetrics['level'] = 'ok';
  let headline = 'Within your configured limits';
  if (breached || account.status === 'breached') {
    level = 'danger';
    headline = 'Drawdown threshold reached';
  } else if (drawdownUsed !== null && drawdownUsed >= 0.75) {
    level = 'danger';
    headline = `${Math.round(drawdownUsed * 100)}% of max drawdown used`;
  } else if (dailyRoom !== null && dailyRoom <= 0) {
    level = 'danger';
    headline = 'Daily loss limit reached';
  } else if ((drawdownUsed !== null && drawdownUsed >= 0.5) || (dailyRoom !== null && account.daily_loss_limit && dailyRoom < account.daily_loss_limit * 0.35)) {
    level = 'warn';
    headline = 'Getting close to a limit — size down';
  } else if (targetProgress !== null && targetProgress >= 1) {
    level = 'done';
    headline = 'Profit target reached';
  } else if (targetLeft !== null) {
    headline = `${fmt(targetLeft)} to profit target`;
  }

  return {
    account,
    trades: trades.length,
    realized,
    balance,
    todayPnl,
    todayTrades,
    peak: round(peak),
    threshold: threshold !== null ? round(threshold) : null,
    thresholdLocked: trailing && lock !== null && threshold !== null && threshold >= lock,
    drawdownRoom,
    drawdownUsed,
    breached,
    dailyRoom,
    personalRoom,
    riskAllowance,
    profit,
    targetProgress,
    targetLeft,
    payoutProgress,
    payoutLeft,
    tradingDays: dayPnl.size,
    bestDay: round(bestDay),
    consistency,
    consistencyOk,
    level,
    headline,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmt = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

/** Adjustment that makes the computed balance equal the balance shown on the platform. */
export function reconcileAdjustment(account: Account, all: ETrade[], platformBalance: number, today: string): number {
  const m = accountMetrics({ ...account, balance_adjustment: 0 }, all, today);
  return round(platformBalance - m.balance);
}
