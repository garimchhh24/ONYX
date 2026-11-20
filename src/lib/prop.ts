import type { Account, Cashflow, DrawdownType, Phase } from '../types';
import type { ETrade } from './calc';
import { todayTradingDay } from './time';

export const FIRMS = ['Lucid Trading', 'Tradeify', 'Apex', 'Topstep', 'Take Profit Trader', 'MyFundedFutures', 'Alpha Futures', 'Bulenox', 'Elite Trader Funding'];

export const PHASE_LABEL: Record<Phase, string> = { eval: 'Challenge', funded: 'Funded', live: 'Live' };
export const DD_LABEL: Record<DrawdownType, string> = { eod: 'EOD трейлинг', intraday: 'Интрадей трейлинг', static: 'Статичная' };

/** Typical evaluation parameters by size — a starting point, every firm differs. */
export const SIZE_PRESETS: { size: number; target: number; maxDrawdown: number; maxContracts: number }[] = [
  { size: 25_000, target: 1_500, maxDrawdown: 1_000, maxContracts: 2 },
  { size: 50_000, target: 3_000, maxDrawdown: 2_000, maxContracts: 4 },
  { size: 100_000, target: 6_000, maxDrawdown: 3_000, maxContracts: 8 },
  { size: 150_000, target: 9_000, maxDrawdown: 4_500, maxContracts: 12 },
];

export interface DayRow {
  day: string;
  pnl: number;
  trades: number;
  balance: number;
  threshold: number;
}

export interface AccountState {
  account: Account;
  trades: ETrade[];
  balance: number;
  /** trading P&L (excludes payouts/adjustments) */
  pnl: number;
  payouts: number;
  threshold: number;
  /** balance − threshold */
  buffer: number;
  bufferPct: number;
  thresholdLocked: boolean;
  breached: boolean;
  breachDay?: string;
  todayPnl: number;
  todayTrades: number;
  dailyLeft?: number;
  dailyViolations: string[];
  profit: number;
  targetPct?: number;
  targetLeft?: number;
  targetReached: boolean;
  bestDay: number;
  consistency?: number;
  consistencyOk: boolean;
  /** extra profit needed to satisfy consistency */
  consistencyNeed?: number;
  tradingDays: number;
  daysOk: boolean;
  contractViolations: number;
  readyToPass: boolean;
  days: DayRow[];
  level: 'ok' | 'warn' | 'bad' | 'done';
  headline: string;
}

type Event = { time: number; day: string; delta: number; trade?: ETrade };

export function accountState(account: Account, allTrades: ETrade[], cashflows: Cashflow[], today = todayTradingDay()): AccountState {
  const trades = allTrades.filter((t) => t.accountIds.includes(account.id) && t.net !== undefined);
  const flows = cashflows.filter((c) => c.accountId === account.id && (c.type === 'payout' || c.type === 'adjust'));

  const events: Event[] = [
    ...trades.map((t) => ({ time: new Date(t.exitTime ?? t.entryTime).getTime(), day: t.day, delta: t.net!, trade: t })),
    ...flows.map((c) => ({
      time: new Date(c.date + 'T23:59:00Z').getTime(),
      day: c.date,
      delta: c.type === 'payout' ? -Math.abs(c.amount) : c.amount,
    })),
  ].sort((a, b) => a.time - b.time);

  const start = account.startBalance;
  const dd = account.maxDrawdown;
  const lockLevel = start + (account.drawdownLock || 0);
  const trailing = account.drawdownType !== 'static';
  const thresholdFor = (peak: number) => (trailing ? Math.min(peak - dd, lockLevel) : start - dd);

  let balance = start;
  let peak = start;
  let threshold = thresholdFor(peak);
  let breached = false;
  let breachDay: string | undefined;
  const dayMap = new Map<string, DayRow>();
  let currentDay: string | undefined;

  const closeDay = () => {
    if (currentDay === undefined) return;
    if (account.drawdownType === 'eod') {
      peak = Math.max(peak, balance);
      threshold = Math.max(threshold, thresholdFor(peak));
    }
    const row = dayMap.get(currentDay);
    if (row) {
      row.balance = balance;
      row.threshold = threshold;
    }
  };

  for (const e of events) {
    if (e.day !== currentDay) {
      closeDay();
      currentDay = e.day;
    }
    balance += e.delta;
    if (e.trade) {
      const row = dayMap.get(e.day) ?? { day: e.day, pnl: 0, trades: 0, balance, threshold };
      row.pnl += e.delta;
      row.trades += 1;
      dayMap.set(e.day, row);
    }
    if (!breached && e.trade && balance <= threshold + 1e-9) {
      breached = true;
      breachDay = e.day;
    }
    if (account.drawdownType === 'intraday') {
      peak = Math.max(peak, balance);
      threshold = Math.max(threshold, thresholdFor(peak));
    }
  }
  // the threshold for "today" is set by the last completed day
  if (currentDay !== undefined && currentDay !== today) closeDay();
  else if (currentDay === today) {
    const row = dayMap.get(currentDay);
    if (row) {
      row.balance = balance;
      row.threshold = threshold;
    }
  }

  const days = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const pnl = trades.reduce((a, t) => a + t.net!, 0);
  const payouts = flows.filter((c) => c.type === 'payout').reduce((a, c) => a + Math.abs(c.amount), 0);
  const todayRow = dayMap.get(today);
  const todayPnl = todayRow?.pnl ?? 0;
  const dailyViolations = account.dailyLossLimit ? days.filter((d) => d.pnl <= -account.dailyLossLimit!).map((d) => d.day) : [];

  const profit = balance - start + payouts;
  const target = account.phase === 'eval' ? account.profitTarget : undefined;
  const targetReached = target !== undefined ? profit >= target : false;
  const bestDay = Math.max(0, ...days.map((d) => d.pnl));
  let consistency: number | undefined;
  let consistencyOk = true;
  let consistencyNeed: number | undefined;
  if (account.consistencyPct && pnl > 0) {
    consistency = (bestDay / pnl) * 100;
    consistencyOk = consistency <= account.consistencyPct + 1e-9;
    if (!consistencyOk) consistencyNeed = bestDay / (account.consistencyPct / 100) - pnl;
  }
  const tradingDays = days.filter((d) => d.trades > 0).length;
  const daysOk = !account.minDays || tradingDays >= account.minDays;
  const contractViolations = account.maxContracts ? trades.filter((t) => t.miniEq > account.maxContracts! + 1e-9).length : 0;
  const buffer = balance - threshold;
  const bufferPct = dd ? Math.max(0, Math.min(100, (buffer / dd) * 100)) : 100;
  const readyToPass = account.phase === 'eval' && targetReached && consistencyOk && daysOk && !breached;
  const dailyLeft = account.dailyLossLimit ? account.dailyLossLimit + Math.min(0, todayPnl) : undefined;

  let level: AccountState['level'] = 'ok';
  let headline = 'Активен';
  if (account.status === 'failed' || breached) {
    level = 'bad';
    headline = breached ? 'Порог просадки пробит' : 'Слит';
  } else if (account.status === 'passed') {
    level = 'done';
    headline = 'Пройден';
  } else if (account.status === 'archived') {
    headline = 'В архиве';
  } else if (readyToPass) {
    level = 'done';
    headline = 'Цель выполнена';
  } else if (bufferPct < 25) {
    level = 'warn';
    headline = 'Близко к сливу';
  } else if (dailyLeft !== undefined && account.dailyLossLimit && dailyLeft < account.dailyLossLimit * 0.25) {
    level = 'warn';
    headline = 'Близко к дневному лимиту';
  } else if (targetReached && !consistencyOk) {
    level = 'warn';
    headline = 'Цель есть, нужна консистентность';
  }

  return {
    account,
    trades,
    balance,
    pnl,
    payouts,
    threshold,
    buffer,
    bufferPct,
    thresholdLocked: trailing && threshold >= lockLevel - 1e-9,
    breached,
    breachDay,
    todayPnl,
    todayTrades: todayRow?.trades ?? 0,
    dailyLeft,
    dailyViolations,
    profit,
    targetPct: target ? Math.max(0, Math.min(100, (profit / target) * 100)) : undefined,
    targetLeft: target !== undefined ? Math.max(0, target - profit) : undefined,
    targetReached,
    bestDay,
    consistency,
    consistencyOk,
    consistencyNeed,
    tradingDays,
    daysOk,
    contractViolations,
    readyToPass,
    days,
    level,
    headline,
  };
}

export interface PropEconomy {
  spent: number;
  payouts: number;
  net: number;
  passed: number;
  failed: number;
  active: number;
  passRate?: number;
}

export function propEconomy(accounts: Account[], cashflows: Cashflow[]): PropEconomy {
  const spent = cashflows.filter((c) => c.type === 'fee' || c.type === 'activation' || c.type === 'reset').reduce((a, c) => a + Math.abs(c.amount), 0);
  const payouts = cashflows.filter((c) => c.type === 'payout').reduce((a, c) => a + Math.abs(c.amount), 0);
  const passed = accounts.filter((a) => a.status === 'passed').length;
  const failed = accounts.filter((a) => a.status === 'failed').length;
  return {
    spent,
    payouts,
    net: payouts - spent,
    passed,
    failed,
    active: accounts.filter((a) => a.status === 'active').length,
    passRate: passed + failed ? (passed / (passed + failed)) * 100 : undefined,
  };
}

export const CASHFLOW_LABEL: Record<Cashflow['type'], string> = {
  fee: 'Оплата челленджа',
  activation: 'Активация',
  reset: 'Ресет',
  payout: 'Выплата',
  adjust: 'Корректировка баланса',
};
