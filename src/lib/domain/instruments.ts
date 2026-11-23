import type { Instrument } from '../types';

/**
 * CME Group contract specifications (tick size and tick value are exchange facts).
 * Commissions are deliberately null — CADENCE never assumes fees; users set their own.
 */
export const BUILTIN_INSTRUMENTS: Instrument[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', tick_size: 0.25, tick_value: 12.5, exchange: 'CME' },
  { symbol: 'NQ', name: 'E-mini Nasdaq-100', tick_size: 0.25, tick_value: 5, exchange: 'CME' },
  { symbol: 'MES', name: 'Micro E-mini S&P 500', tick_size: 0.25, tick_value: 1.25, exchange: 'CME', micro: true },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', tick_size: 0.25, tick_value: 0.5, exchange: 'CME', micro: true },
  { symbol: 'RTY', name: 'E-mini Russell 2000', tick_size: 0.1, tick_value: 5, exchange: 'CME' },
  { symbol: 'M2K', name: 'Micro E-mini Russell 2000', tick_size: 0.1, tick_value: 0.5, exchange: 'CME', micro: true },
  { symbol: 'YM', name: 'E-mini Dow ($5)', tick_size: 1, tick_value: 5, exchange: 'CBOT' },
  { symbol: 'MYM', name: 'Micro E-mini Dow', tick_size: 1, tick_value: 0.5, exchange: 'CBOT', micro: true },
  { symbol: 'CL', name: 'Crude Oil', tick_size: 0.01, tick_value: 10, exchange: 'NYMEX' },
  { symbol: 'GC', name: 'Gold', tick_size: 0.1, tick_value: 10, exchange: 'COMEX' },
  { symbol: 'MCL', name: 'Micro WTI Crude Oil', tick_size: 0.01, tick_value: 1, exchange: 'NYMEX', micro: true },
  { symbol: 'MGC', name: 'Micro Gold', tick_size: 0.1, tick_value: 1, exchange: 'COMEX', micro: true },
  { symbol: 'SI', name: 'Silver', tick_size: 0.005, tick_value: 25, exchange: 'COMEX' },
  { symbol: 'NG', name: 'Henry Hub Natural Gas', tick_size: 0.001, tick_value: 10, exchange: 'NYMEX' },
  { symbol: '6E', name: 'Euro FX', tick_size: 0.00005, tick_value: 6.25, exchange: 'CME' },
  { symbol: 'ZN', name: '10-Year T-Note', tick_size: 0.015625, tick_value: 15.625, exchange: 'CBOT' },
].map((i) => ({ ...i, builtin: true, commission_rt: null }));

export const CORE_SYMBOLS = ['ES', 'NQ', 'MES', 'MNQ', 'RTY', 'M2K', 'YM', 'MYM', 'CL', 'GC'];

/** Built-ins merged with the user's custom instruments and commission overrides. */
export function mergeInstruments(custom: Instrument[] | undefined): Instrument[] {
  const map = new Map<string, Instrument>(BUILTIN_INSTRUMENTS.map((i) => [i.symbol, { ...i }]));
  for (const c of custom ?? []) {
    const s = c.symbol.toUpperCase();
    const base = map.get(s);
    if (base?.builtin) map.set(s, { ...base, commission_rt: c.commission_rt ?? null });
    else map.set(s, { ...c, symbol: s, builtin: false });
  }
  return [...map.values()];
}

export function pointValue(i: Instrument): number {
  return i.tick_value / i.tick_size;
}

export function findInstrument(symbol: string | null | undefined, list: Instrument[]): Instrument | undefined {
  if (!symbol) return undefined;
  const s = symbol.toUpperCase();
  return list.find((i) => i.symbol === s);
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/**
 * Contract/ticker → root symbol.
 * "MNQZ6" → "MNQ", "NQZ2026" → "NQ", "/ESH6" → "ES", "CME_MINI:NQ1!" → "NQ", "NQ 12-26" → "NQ".
 */
export function rootSymbol(raw: string, known: Instrument[] = BUILTIN_INSTRUMENTS): string {
  const roots = new Set(known.map((i) => i.symbol));
  let s = raw.trim().toUpperCase().replace(/^\//, '');
  s = s.slice(s.lastIndexOf(':') + 1);
  s = s.replace(/\d*!$/, '');
  if (s.includes('.')) {
    const seg = s.split('.').find((x) => roots.has(x));
    if (seg) return seg;
  }
  s = s.split(/[\s.]/)[0];
  if (roots.has(s)) return s;
  const m = new RegExp(`^([A-Z0-9]+?)([${MONTH_CODES}])(\\d{1,2}|\\d{4})$`).exec(s);
  if (m && roots.has(m[1])) return m[1];
  // Longest known root prefix (e.g. "MNQZ26X")
  const prefix = [...roots].sort((a, b) => b.length - a.length).find((r) => s.startsWith(r));
  if (prefix && m) return prefix;
  return m ? m[1] : s;
}

/** Specific contract code if the ticker names one ("NQZ2026" → "NQZ6"), else null. */
export function contractCode(raw: string, known: Instrument[] = BUILTIN_INSTRUMENTS): string | null {
  const root = rootSymbol(raw, known);
  let s = raw.trim().toUpperCase().replace(/^\//, '');
  s = s.slice(s.lastIndexOf(':') + 1).split(/[\s.]/)[0];
  const m = new RegExp(`^${root}([${MONTH_CODES}])(\\d{1,4})$`).exec(s);
  if (!m) return null;
  return `${root}${m[1]}${m[2].slice(-1)}`;
}

/** Round a price to the instrument's tick grid. */
export function roundToTick(price: number, inst?: Instrument): number {
  if (!inst) return price;
  const ticks = Math.round(price / inst.tick_size);
  return Number((ticks * inst.tick_size).toFixed(8));
}

export function isOnTick(price: number, inst: Instrument): boolean {
  const r = price / inst.tick_size;
  return Math.abs(r - Math.round(r)) < 1e-6;
}
