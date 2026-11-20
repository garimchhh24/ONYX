import type { Direction, Instrument, Timeframe } from '../types';
import { rootSymbol } from './instruments';
import { zonedToIso } from './time';

/**
 * Reading a TradingView screenshot of a position. This module is pure:
 * it builds the instruction for Claude and checks/normalises whatever comes back,
 * so a misread never reaches the form unchecked.
 */

export interface Recognition {
  found: boolean;
  symbol?: string;
  /** Ticker exactly as Claude read it (shown to the user) */
  symbolRaw?: string;
  timeframe?: Timeframe;
  direction?: Direction;
  entry?: number;
  stop?: number;
  target?: number;
  exit?: number;
  /** How the exit was obtained */
  exitSource?: 'shown' | 'target' | 'stop';
  quantity?: number;
  pnl?: number;
  entryTime?: string;
  exitTime?: string;
  confidence: number;
  note: string;
  /** Problems found while checking the reply (Russian, for the user) */
  warnings: string[];
}

export function visionPrompt(tiles: boolean): string {
  return [
    'You read trading screenshots for a futures trading journal.',
    tiles
      ? 'Image 1 is the whole screenshot of a TradingView chart (phone or desktop). Images 2 and 3 are enlarged top and bottom parts of the SAME screenshot — use them to read small labels and price-scale numbers.'
      : 'The image is a screenshot of a TradingView chart (phone or desktop).',
    '',
    'Find the ONE trade or position on it and extract it.',
    'Usually it is drawn with the "Long Position" / "Short Position" tool: a box split at the entry price into a green/teal profit zone (target) and a red stop zone.',
    'In a Long Position the profit zone is ABOVE the entry; in a Short Position it is BELOW the entry.',
    'Its labels look like "Target: 40.00 (0.18%) 160, Amount: 800", "Stop: 20.00 (0.09%) 80, Amount: 400" and a middle label "Open P&L: 250, Qty: 2, Risk/Reward Ratio: 2". When price has already reached the target or the stop the label says "Closed P&L".',
    'The entry, stop and target PRICES are where the zones begin/end — read them from the price-scale labels on the right; the numbers inside "Target:"/"Stop:" labels are DISTANCES, not prices.',
    'It may also be a broker position from the trading panel: a horizontal position line with quantity and P&L, order lines for stop loss / take profit, or buy/sell execution arrows.',
    'Never guess a value you cannot read — use null. Write numbers as plain JSON numbers without thousands separators (21450.25, not "21,450.25").',
    '',
    'Reply with only this JSON object:',
    '{"found": true, "symbol": "NQ1!", "timeframe": "5", "direction": "long", "entry": 21450.25, "stop": 21430, "target": 21490, "exit": null, "result": "target", "quantity": 2, "pnl": 1600, "date": null, "entryTime": "09:42", "exitTime": null, "timezone": "(UTC-5) New York", "confidence": 0.8, "note": ""}',
    '',
    'Fields:',
    '- found: false when no trade or position is visible (then other fields may be null).',
    '- symbol: ticker exactly as in the chart header/legend, e.g. "NQ1!", "MNQZ2025", "CME_MINI:ES1!".',
    '- timeframe: chart interval as shown: "1", "3", "5", "15", "1h", "4h", "D", "W" or "M".',
    '- direction: "long" or "short".',
    '- entry, stop, target: prices.',
    '- exit: price only if an exit is explicitly shown (execution arrow/label, closed position); otherwise null.',
    '- result: "target" or "stop" if price clearly reached it after the entry, "open" if neither was reached, else "unknown".',
    '- quantity: contracts / Qty if shown.',
    '- pnl: the Open/Closed P&L amount in account currency if shown; negative for a loss.',
    '- date (YYYY-MM-DD), entryTime and exitTime (24h "HH:MM"): only if clearly readable for the entry/exit bars.',
    '- timezone: the chart timezone text if visible (usually bottom right), e.g. "(UTC-5) New York".',
    '- confidence: 0..1 — how sure you are about direction, entry, stop and target.',
    '- note: one short sentence IN RUSSIAN about anything uncertain or missing, or "".',
  ].join('\n');
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const s = v.replace(/[\s,]/g, '').replace(/[−–]/g, '-');
    if (!/^[-+]?\d*\.?\d+$/.test(s)) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** "CME_MINI:NQ1!" → "NQ", "MNQZ2025" → "MNQ", "ES1!" → "ES" */
export function tvSymbol(raw: string, instruments: Instrument[]): string {
  let s = raw.trim().toUpperCase();
  s = s.slice(s.lastIndexOf(':') + 1);
  s = s.replace(/\d*!$/, '').replace(/\s+/g, '');
  return rootSymbol(s, instruments);
}

/** TradingView interval label → journal timeframe */
export function tvTimeframe(raw: string | undefined): Timeframe | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/\s+/g, '');
  if (t === 'M' || t === '1M' || /^1mo(n|nth)?$/i.test(t)) return '1M';
  const l = t.toLowerCase();
  const map: Record<string, Timeframe> = {
    '1': '1m', '1m': '1m', '1min': '1m',
    '3': '3m', '3m': '3m', '3min': '3m',
    '5': '5m', '5m': '5m', '5min': '5m',
    '15': '15m', '15m': '15m', '15min': '15m',
    '60': '1H', '1h': '1H', '1hr': '1H',
    '240': '4H', '4h': '4H', '4hr': '4H',
    d: '1D', '1d': '1D', day: '1D',
    w: '1W', '1w': '1W', week: '1W',
  };
  return map[l];
}

const ZONES: [RegExp, string][] = [
  [/new\s*york|eastern|\bet\b|\best\b|\bedt\b/i, 'America/New_York'],
  [/chicago|central|\bct\b|\bcst\b|\bcdt\b|exchange/i, 'America/Chicago'],
  [/los\s*angeles|pacific/i, 'America/Los_Angeles'],
  [/moscow|москв/i, 'Europe/Moscow'],
  [/london/i, 'Europe/London'],
  [/kyiv|kiev|киев|київ/i, 'Europe/Kyiv'],
  [/berlin|paris|madrid|rome|warsaw|amsterdam/i, 'Europe/Berlin'],
  [/istanbul/i, 'Europe/Istanbul'],
  [/dubai/i, 'Asia/Dubai'],
  [/almaty|алматы/i, 'Asia/Almaty'],
  [/tashkent|ташкент/i, 'Asia/Tashkent'],
  [/tokyo/i, 'Asia/Tokyo'],
  [/hong\s*kong/i, 'Asia/Hong_Kong'],
  [/singapore/i, 'Asia/Singapore'],
  [/sydney/i, 'Australia/Sydney'],
];

/** Chart timezone text → IANA zone (undefined = phone's local time). */
export function tvTimeZone(text: string | undefined): string | undefined {
  if (!text) return undefined;
  for (const [re, zone] of ZONES) if (re.test(text)) return zone;
  const m = /UTC\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(text);
  if (m) {
    if (m[3] && m[3] !== '00') return undefined;
    const h = Number(m[2]);
    if (h === 0) return 'UTC';
    return `Etc/GMT${m[1] === '+' ? '-' : '+'}${h}`; // Etc zones have inverted signs
  }
  if (/\bUTC\b|\bGMT\b/i.test(text)) return 'UTC';
  return undefined;
}

function toIso(date: string, hhmm: string, zone: string | undefined): string | undefined {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!d || !t) return undefined;
  const [y, mo, dd, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (h > 23 || mi > 59) return undefined;
  if (zone) {
    try {
      return zonedToIso(y, mo, dd, h, mi, 0, zone);
    } catch {
      /* unknown zone → local */
    }
  }
  const local = new Date(y, mo - 1, dd, h, mi);
  return isNaN(local.getTime()) ? undefined : local.toISOString();
}

function todayIn(zone: string | undefined, now: Date): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  try {
    return f.format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

/** Checks Claude's reply and turns it into trade fields. Geometry beats labels when they disagree. */
export function parseRecognition(raw: unknown, instruments: Instrument[], now = new Date()): Recognition {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { found: false, confidence: 0, note: 'Не удалось прочитать ответ.', warnings };
  }
  const r = raw as Record<string, unknown>;
  const note = str(r.note) ?? '';
  const confidence = Math.max(0, Math.min(1, num(r.confidence) ?? 0.5));
  let entry = num(r.entry);
  let stop = num(r.stop);
  let target = num(r.target);
  if (r.found === false && entry === undefined) return { found: false, confidence, note, warnings };

  const pos = (v: number | undefined) => (v !== undefined && v > 0 ? v : undefined);
  entry = pos(entry);
  stop = pos(stop);
  target = pos(target);

  // direction: where the stop and target sit relative to the entry, cross-checked with what Claude said
  const said = r.direction === 'long' || r.direction === 'short' ? (r.direction as Direction) : undefined;
  let geo: Direction | undefined;
  if (entry !== undefined && stop !== undefined && stop !== entry) geo = stop < entry ? 'long' : 'short';
  else if (entry !== undefined && target !== undefined && target !== entry) geo = target > entry ? 'long' : 'short';
  let direction: Direction | undefined;
  if (said && geo && geo !== said && entry !== undefined && stop !== undefined && target !== undefined && (stop - entry) * (target - entry) < 0) {
    // the zones were read the right way round but the labels swapped
    [stop, target] = [target, stop];
    direction = said;
    warnings.push('Стоп и тейк переставлены по направлению сделки — проверьте их.');
  } else {
    direction = geo ?? said;
    if (geo && said && geo !== said) warnings.push('Направление определено по расположению стопа — проверьте его.');
  }
  if (entry !== undefined && stop !== undefined && target !== undefined && (stop - entry) * (target - entry) > 0) {
    warnings.push('Стоп и тейк оказались по одну сторону от входа — проверьте их.');
  }

  let exit = pos(num(r.exit));
  let exitSource: Recognition['exitSource'] = exit !== undefined ? 'shown' : undefined;
  if (exit === undefined && r.result === 'target' && target !== undefined) {
    exit = target;
    exitSource = 'target';
  } else if (exit === undefined && r.result === 'stop' && stop !== undefined) {
    exit = stop;
    exitSource = 'stop';
  }

  const qRaw = num(r.quantity);
  const quantity = qRaw !== undefined && qRaw > 0 && qRaw <= 500 ? Math.round(qRaw) : undefined;
  const pnl = num(r.pnl);

  // times only when clearly read; a missing date means "today" in the chart's timezone
  const zone = tvTimeZone(str(r.timezone));
  const date = str(r.date) && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? String(r.date) : undefined;
  let entryTime: string | undefined;
  let exitTime: string | undefined;
  const et = str(r.entryTime);
  const xt = str(r.exitTime);
  if (et) {
    const day = date ?? todayIn(zone, now);
    entryTime = toIso(day, et, zone);
    if (entryTime && !date && new Date(entryTime).getTime() > now.getTime() + 5 * 60_000) entryTime = undefined;
    if (entryTime && xt) {
      exitTime = toIso(day, xt, zone);
      if (exitTime && exitTime < entryTime) exitTime = new Date(new Date(exitTime).getTime() + 86_400_000).toISOString();
    }
  }

  const symbolRaw = str(r.symbol);
  return {
    found: entry !== undefined || pnl !== undefined,
    symbol: symbolRaw ? tvSymbol(symbolRaw, instruments) : undefined,
    symbolRaw,
    timeframe: tvTimeframe(str(r.timeframe)),
    direction,
    entry,
    stop,
    target,
    exit,
    exitSource,
    quantity,
    pnl,
    entryTime,
    exitTime,
    confidence,
    note,
    warnings,
  };
}
