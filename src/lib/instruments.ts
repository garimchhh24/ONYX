import type { Instrument } from '../types';

/**
 * CME contract specs (tick size / tick value are exchange facts).
 * Commissions are typical round-turn values for prop accounts — editable in settings.
 */
export const DEFAULT_INSTRUMENTS: Instrument[] = [
  { symbol: 'NQ', name: 'E-mini Nasdaq-100', tickSize: 0.25, tickValue: 5, commission: 4, favorite: true },
  { symbol: 'MNQ', name: 'Micro Nasdaq-100', tickSize: 0.25, tickValue: 0.5, commission: 1.5, micro: true, favorite: true },
  { symbol: 'ES', name: 'E-mini S&P 500', tickSize: 0.25, tickValue: 12.5, commission: 4, favorite: true },
  { symbol: 'MES', name: 'Micro S&P 500', tickSize: 0.25, tickValue: 1.25, commission: 1.5, micro: true, favorite: true },
  { symbol: 'YM', name: 'E-mini Dow', tickSize: 1, tickValue: 5, commission: 4, favorite: true },
  { symbol: 'MYM', name: 'Micro Dow', tickSize: 1, tickValue: 0.5, commission: 1.5, micro: true },
  { symbol: 'RTY', name: 'E-mini Russell 2000', tickSize: 0.1, tickValue: 5, commission: 4 },
  { symbol: 'M2K', name: 'Micro Russell 2000', tickSize: 0.1, tickValue: 0.5, commission: 1.5, micro: true },
  { symbol: 'GC', name: 'Gold', tickSize: 0.1, tickValue: 10, commission: 4.5, favorite: true },
  { symbol: 'MGC', name: 'Micro Gold', tickSize: 0.1, tickValue: 1, commission: 1.6, micro: true, favorite: true },
  { symbol: 'SI', name: 'Silver', tickSize: 0.005, tickValue: 25, commission: 4.5 },
  { symbol: 'SIL', name: 'Micro Silver', tickSize: 0.005, tickValue: 5, commission: 1.6, micro: true },
  { symbol: 'CL', name: 'Crude Oil', tickSize: 0.01, tickValue: 10, commission: 4.5, favorite: true },
  { symbol: 'MCL', name: 'Micro Crude Oil', tickSize: 0.01, tickValue: 1, commission: 1.6, micro: true },
  { symbol: 'NG', name: 'Natural Gas', tickSize: 0.001, tickValue: 10, commission: 4.5 },
  { symbol: 'HG', name: 'Copper', tickSize: 0.0005, tickValue: 12.5, commission: 4.5 },
  { symbol: '6E', name: 'Euro FX', tickSize: 0.00005, tickValue: 6.25, commission: 4.5 },
  { symbol: 'M6E', name: 'Micro Euro FX', tickSize: 0.0001, tickValue: 1.25, commission: 1.5, micro: true },
  { symbol: '6B', name: 'British Pound', tickSize: 0.0001, tickValue: 6.25, commission: 4.5 },
  { symbol: '6J', name: 'Japanese Yen', tickSize: 0.0000005, tickValue: 6.25, commission: 4.5 },
  { symbol: 'ZB', name: '30Y T-Bond', tickSize: 0.03125, tickValue: 31.25, commission: 3.5 },
  { symbol: 'ZN', name: '10Y T-Note', tickSize: 0.015625, tickValue: 15.625, commission: 3.5 },
  { symbol: 'MBT', name: 'Micro Bitcoin', tickSize: 5, tickValue: 0.5, commission: 5, micro: true },
];

export function pointValue(i: Instrument): number {
  return i.tickValue / i.tickSize;
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/**
 * Contract code → root: "MNQZ4" → "MNQ", "NQ 12-24" → "NQ", "/ESH25" → "ES", "M2KM5" → "M2K".
 * Known roots win; unknown codes are returned upper-cased as-is.
 */
export function rootSymbol(raw: string, known: Instrument[] = DEFAULT_INSTRUMENTS): string {
  const roots = new Set(known.map((i) => i.symbol));
  const full = raw.trim().toUpperCase().replace(/^\//, '');
  // "CON.F.US.MNQ.Z24" style ids: take the first known segment
  if (full.includes('.')) {
    const seg = full.split('.').find((x) => roots.has(x));
    if (seg) return seg;
  }
  const s = full.split(/[\s.:]/)[0];
  if (roots.has(s)) return s;
  const m = new RegExp(`^([A-Z0-9]+?)([${MONTH_CODES}])(\\d{1,2}|\\d{4})$`).exec(s);
  if (m && (roots.has(m[1]) || m[1].length >= 2)) return m[1];
  return s;
}

export function findInstrument(symbol: string, list: Instrument[]): Instrument | undefined {
  const s = symbol.toUpperCase();
  return list.find((i) => i.symbol === s);
}

/** Mini-contract equivalent (10 micros = 1 mini) used for max-position rules. */
export function miniEquivalent(contracts: number, inst?: Instrument): number {
  return inst?.micro ? contracts / 10 : contracts;
}
