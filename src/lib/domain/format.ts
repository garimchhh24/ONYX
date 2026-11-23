const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $1,234.50 · −$80.00 · +$12.00 (signed) */
export function money(v: number | undefined | null, opts: { signed?: boolean; cents?: boolean } = {}): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const cents = opts.cents ?? Math.abs(v) < 10_000;
  const s = (cents ? usd2 : usd0).format(Math.abs(v));
  if (v < 0 && Math.abs(v) >= 0.005) return '−' + s;
  return opts.signed && v > 0.004 ? '+' + s : s;
}

export function moneyShort(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1000 ? `$${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}K` : `$${Math.round(a)}`;
  return (v < 0 ? '−' : '') + s;
}

export function fmtNum(v: number | undefined | null, digits = 2, signed = false): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(digits);
  if (v < 0 && Number(s) !== 0) return '−' + s;
  return signed && v > 0 && Number(s) !== 0 ? '+' + s : s;
}

export function fmtR(v: number | undefined | null): string {
  return v === undefined || v === null || !Number.isFinite(v) ? '—' : fmtNum(v, 2, true) + 'R';
}

export function fmtPct(v: number | undefined | null, digits = 1): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

export function fmtPF(v: number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  if (v === Infinity) return '∞';
  return v.toFixed(2);
}

export function fmtPrice(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return Number(v.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export type Tone = 'pos' | 'neg' | 'flat';
export const tone = (v: number | undefined | null): Tone =>
  v === undefined || v === null || Math.abs(v) < 0.005 ? 'flat' : v > 0 ? 'pos' : 'neg';

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
