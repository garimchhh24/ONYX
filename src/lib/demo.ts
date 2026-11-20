import type { Account, Cashflow, Settings, Trade } from '../types';
import { enrichAll, uid } from './calc';
import { findInstrument } from './instruments';
import { accountState } from './prop';
import { summarize } from './stats';
import { addDaysKey, todayTradingDay, weekdayOfKey, zonedToIso } from './time';

type Demo = { accounts: Account[]; trades: Trade[]; cashflows: Cashflow[] };

/** YYYY-MM-DD + New York wall-clock time → ISO */
function zonedToIsoNY(day: string, h: number, m: number): string {
  const [y, mo, d] = day.split('-').map(Number);
  return zonedToIso(y, mo, d, h + Math.floor(m / 60), m % 60, 0, 'America/New_York');
}

const NOTES = [
  'Ретест уровня после открытия, стоп за свингом. Отработал по плану.',
  'Зашёл раньше подтверждения — цена ещё не закрепилась.',
  'Ждал откат к VWAP, вход по лимитке, частично зафиксировал на 1R.',
  'Ланч, тонкий рынок. Не стоило входить.',
  'Ложный пробой хая Лондона, быстрый возврат в диапазон.',
  'После двух стопов захотелось отыграться — классика.',
];

function generate(settings: Settings, seed: number): Demo {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const now = new Date().toISOString();
  const today = todayTradingDay();
  const startDay = addDaysKey(today, -45);

  const evalAcc: Account = {
    id: 'demo-eval', firm: 'Demo Prop', name: '50K Challenge (демо)', size: 50_000, phase: 'eval', status: 'active',
    startBalance: 50_000, startDate: addDaysKey(today, -20), profitTarget: 3_000, maxDrawdown: 2_000, drawdownType: 'eod',
    drawdownLock: 0, dailyLossLimit: 1_000, consistencyPct: 50, minDays: 5, maxContracts: 4, createdAt: now, updatedAt: now,
  };
  const fundedAcc: Account = {
    id: 'demo-funded', firm: 'Demo Prop', name: '100K Funded (демо)', size: 100_000, phase: 'funded', status: 'active',
    startBalance: 100_000, startDate: startDay, maxDrawdown: 3_000, drawdownType: 'eod', drawdownLock: 100,
    consistencyPct: 40, maxContracts: 8, createdAt: now, updatedAt: now,
  };
  const failedAcc: Account = {
    id: 'demo-failed', firm: 'Demo Prop', name: '50K Challenge #1 (демо)', size: 50_000, phase: 'eval', status: 'failed',
    startBalance: 50_000, startDate: addDaysKey(today, -70), profitTarget: 3_000, maxDrawdown: 2_000, drawdownType: 'eod',
    drawdownLock: 0, createdAt: now, updatedAt: now,
  };

  // NY time windows and how this demo trader does in them
  const windows = [
    { h: 9, m: 32, edge: 0.1 }, { h: 9, m: 48, edge: 0.1 }, { h: 10, m: 12, edge: 0.05 },
    { h: 11, m: 35, edge: -0.15 }, { h: 12, m: 40, edge: -0.15 }, { h: 3, m: 15, edge: 0 },
    { h: 14, m: 5, edge: -0.02 }, { h: 8, m: 40, edge: -0.04 }, { h: 20, m: 30, edge: -0.06 },
  ];
  const setups = settings.setups.slice(0, 5);
  const sizes: Record<string, { c: number[]; stop: [number, number] }> = {
    NQ: { c: [1], stop: [8, 16] },
    MNQ: { c: [4, 5, 6, 8], stop: [10, 24] },
    ES: { c: [1], stop: [3, 6] },
    MES: { c: [4, 5, 6], stop: [4, 8] },
    GC: { c: [1], stop: [2, 3.5] },
  };
  const trades: Trade[] = [];
  for (let d = 0; d <= 45; d++) {
    const day = addDaysKey(startDay, d);
    if (weekdayOfKey(day) > 4 || rnd() < 0.12) continue;
    const n = pick([1, 1, 2, 2, 2, 3, 3, 4]);
    let losses = 0;
    for (let k = 0; k < n; k++) {
      const w = pick(windows);
      const sym = pick(['NQ', 'NQ', 'NQ', 'MNQ', 'MNQ', 'ES', 'MES', 'GC']);
      const inst = findInstrument(sym, settings.instruments)!;
      const spec = sizes[sym];
      const contracts = pick(spec.c);
      const setup = pick(setups);
      const tilted = losses >= 2;
      const followed = !tilted && rnd() > 0.18;
      let p = 0.47 + w.edge - k * 0.05 + (setup === setups[1] ? 0.08 : 0) + (setup === setups[3] ? -0.08 : 0);
      if (!followed) p -= 0.15;
      const win = rnd() < p;
      const stop = Math.round((spec.stop[0] + rnd() * (spec.stop[1] - spec.stop[0])) / inst.tickSize) * inst.tickSize;
      const rMult = win ? 1 + rnd() * 1.8 : rnd() < 0.8 ? -1 : -(0.4 + rnd() * 0.5);
      const resultPts = Math.round((stop * rMult) / inst.tickSize) * inst.tickSize;
      // evening (Asia) trades happen the calendar evening before the trading day
      const entry = zonedToIsoNY(w.h >= 18 ? addDaysKey(day, -1) : day, w.h, w.m + Math.floor(rnd() * 15) + k * 9);
      const hold = (win ? 5 + rnd() * 30 : 4 + rnd() * 45) * 60000;
      if (!win) losses++;
      const mistakes = followed ? [] : tilted ? ['Месть рынку'] : [pick(settings.mistakes.slice(0, 7))];
      trades.push({
        id: uid(),
        accountIds: day >= evalAcc.startDate ? ['demo-eval', 'demo-funded'] : ['demo-funded'],
        symbol: sym,
        direction: rnd() > 0.45 ? 'long' : 'short',
        contracts,
        entryTime: entry,
        exitTime: new Date(new Date(entry).getTime() + hold).toISOString(),
        mode: 'points',
        stopPoints: stop,
        targetPoints: Math.round((stop * pick([1.5, 2, 2.5])) / inst.tickSize) * inst.tickSize,
        resultPoints: resultPts,
        setup,
        mistakes,
        emotion: followed ? pick(['Спокойствие', 'Спокойствие', 'Уверенность']) : tilted ? 'Злость' : pick(['FOMO', 'Страх', 'Жадность', 'Скука']),
        rating: followed ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2),
        followedPlan: followed,
        notes: rnd() < 0.3 ? pick(NOTES) : undefined,
        analyses: [],
        source: 'demo',
        externalId: `demo:${day}:${k}`,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const cashflows: Cashflow[] = [
    { id: 'demo-cf1', accountId: 'demo-failed', date: failedAcc.startDate, type: 'fee', amount: 150, createdAt: now },
    { id: 'demo-cf2', accountId: 'demo-funded', date: addDaysKey(today, -52), type: 'fee', amount: 250, createdAt: now },
    { id: 'demo-cf3', accountId: 'demo-funded', date: addDaysKey(today, -47), type: 'activation', amount: 130, createdAt: now },
    { id: 'demo-cf4', accountId: 'demo-eval', date: evalAcc.startDate, type: 'fee', amount: 150, createdAt: now },
    { id: 'demo-cf5', accountId: 'demo-funded', date: addDaysKey(today, -8), type: 'payout', amount: 1_500, createdAt: now },
  ];
  return { accounts: [evalAcc, fundedAcc, failedAcc], trades, cashflows };
}

/** A believable month of futures prop trading: eval on its way, funded with a payout. */
export function demoData(settings: Settings): Demo {
  for (let seed = 7; seed < 600; seed++) {
    const d = generate(settings, seed);
    const et = enrichAll(d.trades, settings);
    const ev = accountState(d.accounts[0], et, d.cashflows);
    const fu = accountState(d.accounts[1], et, d.cashflows);
    const sum = summarize(et);
    const progress = ev.profit / (d.accounts[0].profitTarget ?? 1);
    if (
      !ev.breached && !fu.breached && progress > 0.45 && progress < 0.9 && !ev.dailyViolations.length && ev.consistencyOk &&
      fu.buffer > 1_400 && fu.pnl > 3_000 && sum.winRate !== undefined && sum.winRate > 40 && sum.winRate < 60
    ) {
      return d;
    }
  }
  return generate(settings, 7);
}
