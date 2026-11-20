import type { Settings, Trade } from '../types';
import { uid } from './calc';

/** Random but plausible trades to explore the dashboard. */
export function demoTrades(settings: Settings, count = 140): Trade[] {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const symbols = [
    { s: 'EURUSD', p: 1.085, pv: 100000, size: 1, vol: 0.0012 },
    { s: 'GBPUSD', p: 1.27, pv: 100000, size: 1, vol: 0.0015 },
    { s: 'XAUUSD', p: 2350, pv: 100, size: 0.5, vol: 6 },
    { s: 'NQ', p: 18500, pv: 20, size: 1, vol: 25 },
    { s: 'BTCUSDT', p: 64000, pv: 1, size: 0.1, vol: 600 },
  ];
  const now = Date.now();
  const trades: Trade[] = [];
  for (let i = 0; i < count; i++) {
    const sym = pick(symbols);
    const day = Math.floor((count - i) * 0.9);
    const d = new Date(now - day * 86400000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 2);
    // sessions weighted: London/NY heavier, Asia worse results
    const hourUtc = pick([1, 3, 5, 8, 9, 10, 13, 14, 14, 15, 16, 19]);
    d.setUTCHours(hourUtc, Math.floor(rnd() * 60), 0, 0);
    const setup = pick(settings.setups.slice(0, 6));
    const dir = rnd() > 0.45 ? 'long' : 'short';
    const sign = dir === 'long' ? 1 : -1;
    const riskDist = sym.vol * (0.6 + rnd());
    const entry = sym.p * (1 + (rnd() - 0.5) * 0.04);
    const stop = entry - sign * riskDist;
    const tp = entry + sign * riskDist * pick([1.5, 2, 2.5, 3]);
    let edge = 0.48 + (hourUtc < 7 ? -0.12 : 0) + (setup === settings.setups[1] ? 0.1 : 0) + (setup === settings.setups[2] ? -0.08 : 0);
    const followed = rnd() > 0.25;
    if (!followed) edge -= 0.15;
    const win = rnd() < edge;
    const rMult = win ? 0.8 + rnd() * 2.2 : rnd() < 0.85 ? -1 : -(1 + rnd() * 0.6);
    const exit = entry + sign * riskDist * rMult;
    const holdMin = win ? 20 + rnd() * 180 : 15 + rnd() * 300;
    const mistakes = followed ? [] : [pick(settings.mistakes.slice(0, 8))];
    trades.push({
      id: uid(),
      symbol: sym.s,
      direction: dir,
      entryTime: d.toISOString(),
      exitTime: new Date(d.getTime() + holdMin * 60000).toISOString(),
      entryPrice: Number(entry.toPrecision(6)),
      exitPrice: Number(exit.toPrecision(6)),
      stopLoss: Number(stop.toPrecision(6)),
      takeProfit: Number(tp.toPrecision(6)),
      size: sym.size,
      pointValue: sym.pv,
      fees: Math.round(rnd() * 8 * 100) / 100,
      riskOverride: undefined,
      setup,
      tags: [],
      mistakes,
      emotion: followed ? pick(['Спокойствие', 'Уверенность']) : pick(['FOMO', 'Страх', 'Жадность', 'Раздражение']),
      rating: followed ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2),
      followedPlan: followed,
      analyses: [],
      source: 'demo',
      externalId: `demo:${i}`,
      account: 'Демо',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  // scale size so risk ≈ 0.5–1.2% of balance
  for (const t of trades) {
    const risk = Math.abs(t.entryPrice - (t.stopLoss ?? t.entryPrice)) * t.size * t.pointValue;
    const target = settings.startingBalance * (0.005 + rnd() * 0.007);
    if (risk > 0) t.size = Number(((t.size * target) / risk).toPrecision(2));
  }
  return trades;
}
