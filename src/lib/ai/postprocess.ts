import { contractCode, findInstrument, isOnTick, rootSymbol } from '../domain/instruments';
import { zonedToIso } from '../domain/time';
import type { FieldMeta, Instrument, Trade } from '../types';
import type { ExtractionResult } from './schema';

/**
 * Turns Claude's extraction into journal fields. Deterministic checks run here so a
 * misread never reaches the form unflagged: geometry vs. direction, tick grid,
 * sane sizes, time-zone conversion, and "commissions only when visible".
 */

export const REVIEW_BELOW = 0.75;

export interface ProcessedExtraction {
  isTrade: boolean;
  platform: string;
  fields: Partial<Trade>;
  meta: Record<string, FieldMeta>;
  warnings: string[];
  observations: string[];
  assumptions: string[];
  conflicts: string[];
  summary: string;
  otherConcepts: string[];
}

type Src = { value: unknown; confidence: number; source: 'visible' | 'inferred' | 'missing'; evidence: string; image: number | null };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const present = (f: Src) => f.source !== 'missing' && f.value !== null && f.value !== undefined && f.value !== '';

function metaOf(f: Src, opts: { confidence?: number; source?: FieldMeta['source']; review?: boolean } = {}): FieldMeta {
  const confidence = clamp01(opts.confidence ?? f.confidence);
  const source = opts.source ?? (f.source === 'visible' ? 'visible' : 'inferred');
  return {
    confidence,
    source,
    evidence: f.evidence?.slice(0, 240) || undefined,
    image: f.image !== null && f.image !== undefined && f.image >= 1 ? Math.round(f.image) - 1 : null,
    needs_review: opts.review ?? (confidence < REVIEW_BELOW || source === 'inferred'),
  };
}

/** "CME_MINI:NQ1!" → "NQ", "MNQZ2026" → "MNQ" */
export function tvSymbol(raw: string, instruments: Instrument[]): string {
  return rootSymbol(raw, instruments);
}

const TF_MAP: Record<string, string> = {
  '1': '1m', '1m': '1m', '1min': '1m', '2': '2m', '2m': '2m', '3': '3m', '3m': '3m', '5': '5m', '5m': '5m', '5min': '5m',
  '15': '15m', '15m': '15m', '30': '30m', '30m': '30m', '60': '1H', '1h': '1H', '240': '4H', '4h': '4H', d: '1D', '1d': '1D', day: '1D',
};

export function normalizeTimeframe(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '');
  return TF_MAP[t] ?? null;
}

const ZONES: [RegExp, string][] = [
  [/new\s*york|eastern|\bet\b|\best\b|\bedt\b/i, 'America/New_York'],
  [/chicago|central|\bct\b|\bcst\b|\bcdt\b|exchange/i, 'America/Chicago'],
  [/los\s*angeles|pacific|\bpst\b|\bpdt\b/i, 'America/Los_Angeles'],
  [/denver|mountain/i, 'America/Denver'],
  [/london/i, 'Europe/London'],
  [/berlin|paris|madrid|rome|amsterdam|warsaw|zurich/i, 'Europe/Berlin'],
  [/moscow/i, 'Europe/Moscow'],
  [/kyiv|kiev/i, 'Europe/Kyiv'],
  [/istanbul/i, 'Europe/Istanbul'],
  [/dubai/i, 'Asia/Dubai'],
  [/tashkent/i, 'Asia/Tashkent'],
  [/almaty/i, 'Asia/Almaty'],
  [/tokyo/i, 'Asia/Tokyo'],
  [/hong\s*kong/i, 'Asia/Hong_Kong'],
  [/singapore/i, 'Asia/Singapore'],
  [/sydney/i, 'Australia/Sydney'],
];

/** Chart time-zone label → IANA zone (undefined when unknown). */
export function chartTimeZone(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  for (const [re, zone] of ZONES) if (re.test(text)) return zone;
  const m = /UTC\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(text);
  if (m) {
    if (m[3] && m[3] !== '00') return undefined;
    const h = Number(m[2]);
    if (h === 0) return 'UTC';
    return `Etc/GMT${m[1] === '+' ? '-' : '+'}${h}`;
  }
  if (/\bUTC\b|\bGMT\b/i.test(text)) return 'UTC';
  return undefined;
}

function todayIn(zone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Parses "YYYY-MM-DD HH:MM" or "HH:MM" in a zone. Returns ISO + whether the date was assumed. */
export function parseChartTime(raw: string, zone: string, now: Date): { iso: string; assumedDate: boolean } | null {
  const s = raw.trim().replace('T', ' ');
  const full = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  let y: number, mo: number, d: number, h: number, mi: number, sec: number;
  let assumedDate = false;
  if (full) {
    [y, mo, d, h, mi, sec] = [Number(full[1]), Number(full[2]), Number(full[3]), Number(full[4]), Number(full[5]), Number(full[6] ?? 0)];
  } else if (timeOnly) {
    const [ty, tmo, td] = todayIn(zone, now).split('-').map(Number);
    [y, mo, d, h, mi, sec] = [ty, tmo, td, Number(timeOnly[1]), Number(timeOnly[2]), Number(timeOnly[3] ?? 0)];
    assumedDate = true;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  try {
    return { iso: zonedToIso(y, mo, d, h, mi, sec, zone), assumedDate };
  } catch {
    return null;
  }
}

export function processExtraction(x: ExtractionResult, ctx: { instruments: Instrument[]; timezone: string; now?: Date }): ProcessedExtraction {
  const now = ctx.now ?? new Date();
  const fields: Partial<Trade> = {};
  const meta: Record<string, FieldMeta> = {};
  const warnings: string[] = [];
  const assumptions = [...x.assumptions];

  // Instrument & contract
  if (present(x.instrument as Src)) {
    const raw = String(x.instrument.value);
    const root = tvSymbol(raw, ctx.instruments);
    fields.symbol = root;
    const known = !!findInstrument(root, ctx.instruments);
    meta.symbol = metaOf(x.instrument as Src, { review: !known || clamp01(x.instrument.confidence) < REVIEW_BELOW });
    if (!known) warnings.push(`“${raw}” isn’t a configured instrument. Pick the right contract or add its specs in Settings → Instruments.`);
    const code = contractCode(raw, ctx.instruments);
    if (code) {
      fields.contract = code;
      meta.contract = metaOf(x.instrument as Src);
    }
  }
  if (present(x.contract as Src) && !fields.contract) {
    fields.contract = String(x.contract.value).toUpperCase().slice(0, 24);
    meta.contract = metaOf(x.contract as Src);
  }
  const inst = findInstrument(fields.symbol, ctx.instruments);

  // Prices
  const price = (k: 'entry_price' | 'exit_price' | 'stop_loss' | 'take_profit', f: Src) => {
    if (!present(f)) return;
    const v = Number(f.value);
    if (!Number.isFinite(v) || v <= 0) return;
    fields[k] = v;
    const offTick = inst ? !isOnTick(v, inst) : false;
    meta[k] = metaOf(f, { review: offTick || undefined });
    if (offTick) {
      meta[k].needs_review = true;
      warnings.push(`${labelOf(k)} ${v} is off the ${inst!.symbol} tick grid (${inst!.tick_size}) — likely a misread.`);
    }
  };
  price('entry_price', x.entry_price as Src);
  price('exit_price', x.exit_price as Src);
  price('stop_loss', x.stop_loss as Src);
  price('take_profit', x.take_profit as Src);

  // Direction, cross-checked with geometry
  const said = present(x.direction as Src) ? String(x.direction.value).toLowerCase() : '';
  const saidDir = said.startsWith('l') || said === 'buy' ? 'long' : said.startsWith('s') || said === 'sell' ? 'short' : undefined;
  const { entry_price: e, stop_loss: sl, take_profit: tp } = fields;
  let geo: 'long' | 'short' | undefined;
  if (e && sl && sl !== e) geo = sl < e ? 'long' : 'short';
  else if (e && tp && tp !== e) geo = tp > e ? 'long' : 'short';
  if (saidDir && geo && saidDir !== geo && e && sl && tp && (sl - e) * (tp - e) < 0) {
    [fields.stop_loss, fields.take_profit] = [tp, sl];
    [meta.stop_loss, meta.take_profit] = [{ ...meta.take_profit, needs_review: true }, { ...meta.stop_loss, needs_review: true }];
    fields.direction = saidDir;
    meta.direction = metaOf(x.direction as Src, { review: true });
    warnings.push('Stop and target looked swapped relative to the direction — they were exchanged. Please confirm.');
  } else if (saidDir || geo) {
    fields.direction = (geo ?? saidDir)!;
    const conflict = !!(geo && saidDir && geo !== saidDir);
    meta.direction = saidDir
      ? metaOf(x.direction as Src, { review: conflict || undefined, confidence: conflict ? 0.5 : undefined })
      : { confidence: 0.7, source: 'inferred', evidence: 'From stop/target placement', image: null, needs_review: true };
    if (conflict) {
      meta.direction.needs_review = true;
      warnings.push('The stated direction disagrees with the stop placement — direction was set from the stop. Please confirm.');
    }
  }
  if (e && sl && tp && (sl - e) * (tp - e) > 0) warnings.push('Stop and target are on the same side of the entry — check both.');

  // Size
  if (present(x.contracts as Src)) {
    const q = Number(x.contracts.value);
    if (Number.isFinite(q) && q > 0 && q <= 1000) {
      const rounded = Math.abs(q - Math.round(q)) < 0.01 ? Math.round(q) : q;
      fields.contracts = rounded;
      meta.contracts = metaOf(x.contracts as Src, { review: rounded !== Math.round(rounded) || undefined });
    } else warnings.push(`Ignored an implausible position size (${x.contracts.value}).`);
  }

  // Times
  const zone = chartTimeZone(x.chart_timezone.value) ?? ctx.timezone;
  if (!chartTimeZone(x.chart_timezone.value) && (present(x.entry_time as Src) || present(x.exit_time as Src))) {
    assumptions.push(`Chart time zone not visible — times interpreted in your device time zone (${ctx.timezone}).`);
  }
  const time = (k: 'entry_time' | 'exit_time', f: Src) => {
    if (!present(f)) return undefined;
    const p = parseChartTime(String(f.value), zone, now);
    if (!p) return undefined;
    if (new Date(p.iso).getTime() > now.getTime() + 5 * 60_000) {
      warnings.push(`${k === 'entry_time' ? 'Entry' : 'Exit'} time would be in the future — ignored.`);
      return undefined;
    }
    fields[k] = p.iso;
    meta[k] = p.assumedDate ? metaOf(f, { confidence: f.confidence * 0.6, source: 'inferred', review: true }) : metaOf(f);
    if (p.assumedDate) assumptions.push(`${k === 'entry_time' ? 'Entry' : 'Exit'} date not visible — assumed today.`);
    return p;
  };
  const et = time('entry_time', x.entry_time as Src);
  const xt = time('exit_time', x.exit_time as Src);
  if (fields.entry_time && fields.exit_time && fields.exit_time < fields.entry_time) {
    if (et?.assumedDate || xt?.assumedDate) {
      fields.exit_time = new Date(new Date(fields.exit_time).getTime() + 86_400_000).toISOString();
      meta.exit_time = { ...meta.exit_time, needs_review: true };
      assumptions.push('Exit time earlier than entry — assumed the trade was held past midnight.');
    } else {
      warnings.push('Exit time is before entry time on the screenshot — exit time ignored.');
      delete fields.exit_time;
      delete meta.exit_time;
    }
  }
  if (fields.entry_time && fields.exit_time) {
    const c = Math.min(meta.entry_time.confidence, meta.exit_time.confidence);
    meta.duration = { confidence: c, source: 'calculated', evidence: 'Exit time − entry time', image: null, needs_review: c < REVIEW_BELOW };
  }

  // Money
  if (present(x.gross_pnl as Src) && Number.isFinite(Number(x.gross_pnl.value))) {
    fields.gross_pnl = Number(x.gross_pnl.value);
    meta.gross_pnl = metaOf(x.gross_pnl as Src);
  }
  if (present(x.net_pnl as Src) && Number.isFinite(Number(x.net_pnl.value))) {
    fields.net_pnl = Number(x.net_pnl.value);
    meta.net_pnl = metaOf(x.net_pnl as Src);
  }
  if (present(x.commission as Src)) {
    if (x.commission.source === 'visible' && Number.isFinite(Number(x.commission.value))) {
      fields.commission = Math.abs(Number(x.commission.value));
      meta.commission = metaOf(x.commission as Src);
    } else {
      assumptions.push('Commission was not displayed, so none was recorded (CADENCE never assumes fees).');
    }
  }
  if (present(x.risk_amount as Src) && x.risk_amount.source === 'visible' && Number(x.risk_amount.value) > 0) {
    fields.risk_amount = Math.abs(Number(x.risk_amount.value));
    meta.risk_amount = metaOf(x.risk_amount as Src);
  }

  // Strategy
  if (present(x.setup_type as Src)) {
    fields.setup = String(x.setup_type.value).slice(0, 120);
    meta.setup = metaOf(x.setup_type as Src);
  }
  if (present(x.timeframe as Src)) {
    const tf = normalizeTimeframe(String(x.timeframe.value));
    if (tf) {
      fields.timeframe = tf;
      meta.timeframe = metaOf(x.timeframe as Src);
    }
  }
  if (present(x.market_bias as Src)) {
    const b = String(x.market_bias.value).toLowerCase();
    const bias = b.startsWith('bull') ? 'bullish' : b.startsWith('bear') ? 'bearish' : b.startsWith('neut') ? 'neutral' : null;
    if (bias) {
      fields.bias = bias;
      meta.bias = metaOf(x.market_bias as Src);
    }
  }
  if (present(x.market_structure as Src)) {
    fields.market_structure = String(x.market_structure.value).slice(0, 500);
    meta.market_structure = metaOf(x.market_structure as Src);
  }
  const concepts = x.concepts.filter((c) => clamp01(c.confidence) >= 0.5);
  if (concepts.length) {
    fields.concepts = [...new Set(concepts.map((c) => c.concept))];
    const avg = concepts.reduce((a, c) => a + clamp01(c.confidence), 0) / concepts.length;
    meta.concepts = { confidence: avg, source: 'inferred', evidence: concepts.map((c) => `${c.concept}: ${c.evidence}`).join(' · ').slice(0, 240), image: null, needs_review: avg < REVIEW_BELOW };
  }
  const observations = [...x.observations];
  if (present(x.trading_session as Src)) observations.push(`Session noted on chart: ${x.trading_session.value}`);
  if (present(x.realized_r as Src)) observations.push(`Displayed R: ${x.realized_r.value}`);
  if (x.conflicts.length) warnings.push(...x.conflicts.map((c) => `Screenshots disagree: ${c}`));

  return {
    isTrade: x.is_trade_screenshot,
    platform: x.platform,
    fields,
    meta,
    warnings,
    observations,
    assumptions,
    conflicts: x.conflicts,
    summary: x.summary,
    otherConcepts: x.other_concepts,
  };
}

function labelOf(k: string) {
  return { entry_price: 'Entry', exit_price: 'Exit', stop_loss: 'Stop', take_profit: 'Target' }[k] ?? k;
}
