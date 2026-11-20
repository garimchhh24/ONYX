import Papa from 'papaparse';
import type { Direction, Trade } from '../types';
import { uid } from './calc';

/**
 * Turns broker exports into trades without manual typing.
 * Supported:
 *  - MetaTrader 4/5 history report (HTML "Report" or CSV with Time/Symbol/Type/Volume/Price/S/L/T/P/Time/Price/Commission/Swap/Profit)
 *  - TradingView Strategy Tester "List of trades" CSV (Entry/Exit rows grouped by Trade #)
 *  - Generic CSV / TSV from cTrader, Binance, Bybit, NinjaTrader, TradeLocker… (columns matched by name)
 */

export type TimeZoneMode = { kind: 'local' } | { kind: 'offset'; minutes: number };

export interface ImportOptions {
  /** How to interpret timestamps without explicit offset (MT servers are usually UTC+2/+3). */
  tz: TimeZoneMode;
  account?: string;
}

export interface ImportResult {
  trades: Trade[];
  format: string;
  skipped: number;
  warnings: string[];
}

type Field =
  | 'id' | 'symbol' | 'side' | 'entryTime' | 'exitTime' | 'entryPrice' | 'exitPrice'
  | 'size' | 'sl' | 'tp' | 'commission' | 'swap' | 'profit' | 'time' | 'price';

const SYNONYMS: Record<Field, string[]> = {
  id: ['position', 'positionid', 'ticket', 'order', 'orderid', 'id', 'trade', 'tradeno', 'deal', 'позиция', 'тикет', 'ордер'],
  symbol: ['symbol', 'instrument', 'ticker', 'pair', 'market', 'contract', 'asset', 'символ', 'инструмент'],
  side: ['type', 'side', 'direction', 'action', 'buysell', 'тип', 'направление'],
  entryTime: ['opentime', 'entrytime', 'opendate', 'entrydate', 'timeopen', 'opened', 'openedat', 'времяоткрытия', 'датаоткрытия'],
  exitTime: ['closetime', 'exittime', 'closedate', 'exitdate', 'timeclose', 'closed', 'closedat', 'времязакрытия', 'датазакрытия'],
  entryPrice: ['openprice', 'entryprice', 'avgentryprice', 'priceopen', 'entry', 'ценаоткрытия'],
  exitPrice: ['closeprice', 'exitprice', 'avgexitprice', 'avgcloseprice', 'priceclose', 'exit', 'ценазакрытия'],
  size: ['volume', 'size', 'qty', 'quantity', 'lots', 'lot', 'contracts', 'amount', 'positionsize', 'positionsizeqty', 'объем', 'объём', 'лоты'],
  sl: ['sl', 'stoploss', 'stop', 'стоп', 'стоплосс'],
  tp: ['tp', 'takeprofit', 'target', 'тейк', 'тейкпрофит'],
  commission: ['commission', 'commissions', 'fee', 'fees', 'tradingfee', 'комиссия'],
  swap: ['swap', 'swaps', 'funding', 'fundingfee', 'своп'],
  profit: ['profit', 'pnl', 'pl', 'netprofit', 'realizedpnl', 'realisedpnl', 'closedpnl', 'netpl', 'grosspl', 'прибыль', 'результат'],
  time: ['time', 'date', 'datetime', 'dateandtime', 'время', 'дата'],
  price: ['price', 'цена'],
};

export const normHeader = (s: string) =>
  s.toLowerCase().replace(/[\s/_\-#.:()&%]+/g, '').replace(/(usd|usdt|eur|rub|gbp)$/, '');

function matchField(h: string): Field | undefined {
  const n = normHeader(h);
  if (!n) return undefined;
  for (const [field, list] of Object.entries(SYNONYMS) as [Field, string[]][]) {
    if (list.includes(n)) return field;
  }
  return undefined;
}

/** Column index per field. Repeated "Time"/"Price" columns map to entry then exit (MetaTrader layout). */
function mapColumns(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const repeats: Record<'time' | 'price', number[]> = { time: [], price: [] };
  header.forEach((h, i) => {
    const f = matchField(h);
    if (!f) return;
    if (f === 'time' || f === 'price') repeats[f].push(i);
    else if (map[f] === undefined) map[f] = i;
  });
  if (map.entryTime === undefined && repeats.time.length) map.entryTime = repeats.time[0];
  if (map.exitTime === undefined && repeats.time.length > 1) map.exitTime = repeats.time[1];
  if (map.entryPrice === undefined && repeats.price.length) map.entryPrice = repeats.price[0];
  if (map.exitPrice === undefined && repeats.price.length > 1) map.exitPrice = repeats.price[1];
  return map;
}

export function parseNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  let s = String(v).trim().replace(/[\s ]/g, '').replace(/[^\d.,\-+eE]/g, '');
  if (!s || s === '-' ) return undefined;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseSide(v: unknown): Direction | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^(buy|long|b|bid|покупка|лонг)\b/.test(s) || /\b(buy|long)\b/.test(s)) return 'long';
  if (/^(sell|short|s|ask|продажа|шорт)\b/.test(s) || /\b(sell|short)\b/.test(s)) return 'short';
  return undefined;
}

/** Parses "2024.01.15 10:30:00", "2024-01-15T10:30", "15.01.2024 10:30", "01/15/2024 10:30 AM", epoch ms… */
export function parseDate(v: unknown, tz: TimeZoneMode): string | undefined {
  const raw = String(v ?? '').trim();
  if (!raw) return undefined;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    return new Date(raw.length === 10 ? n * 1000 : n).toISOString();
  }
  // explicit offset / Z → trust it
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(raw) && /\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  let y: number, mo: number, d: number;
  let m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(raw);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(raw))) {
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw))) {
    [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])]; // US order
  } else {
    const dt = new Date(raw);
    return isNaN(dt.getTime()) ? undefined : dt.toISOString();
  }
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(raw.slice(m[0].length));
  let hh = t ? Number(t[1]) : 0;
  const mm = t ? Number(t[2]) : 0;
  const ss = t?.[3] ? Number(t[3]) : 0;
  if (t?.[4]) {
    const pm = t[4].toLowerCase() === 'pm';
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  if (tz.kind === 'local') {
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    return isNaN(dt.getTime()) ? undefined : dt.toISOString();
  }
  const utc = Date.UTC(y, mo - 1, d, hh, mm, ss) - tz.minutes * 60000;
  return new Date(utc).toISOString();
}

function baseTrade(source: string, account?: string): Omit<Trade, 'symbol' | 'direction' | 'entryTime' | 'entryPrice' | 'size'> {
  const now = new Date().toISOString();
  return {
    id: uid(),
    pointValue: 1,
    fees: 0,
    tags: [],
    mistakes: [],
    analyses: [],
    source,
    account,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Infers the money value of a 1.0 price move from broker profit,
 * so risk in money (and therefore R) can be computed from the stop loss automatically.
 */
function inferPointValue(gross: number | undefined, entry: number, exit: number | undefined, size: number, dir: Direction): number {
  if (gross === undefined || exit === undefined || !size) return 1;
  const move = (exit - entry) * (dir === 'long' ? 1 : -1) * size;
  if (Math.abs(move) < 1e-12 || Math.abs(gross) < 1e-9) return 1;
  const pv = gross / move;
  return pv > 0 && Number.isFinite(pv) ? Number(pv.toPrecision(6)) : 1;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const map = mapColumns(rows[i]);
    const hasSymbol = map.symbol !== undefined;
    const hasCore = map.entryPrice !== undefined || map.profit !== undefined;
    if ((hasSymbol && hasCore) || (map.id !== undefined && map.side !== undefined && (map.entryTime !== undefined || map.price !== undefined))) return i;
  }
  return -1;
}

function isTradingViewList(header: string[], rows: string[][]): boolean {
  const norm = header.map(normHeader);
  const typeIdx = norm.findIndex((h) => h === 'type');
  return (
    norm.some((h) => h === 'trade' || h === 'tradeno') &&
    typeIdx >= 0 &&
    rows.some((r) => /^(entry|exit)/i.test(String(r[typeIdx] ?? '').trim()))
  );
}

function fromTradingView(header: string[], rows: string[][], opts: ImportOptions, symbol: string): ImportResult {
  const norm = header.map(normHeader);
  const col = (pred: (h: string) => boolean) => norm.findIndex(pred);
  const iTrade = col((h) => h === 'trade' || h === 'tradeno');
  const iType = col((h) => h === 'type');
  const iSignal = col((h) => h === 'signal');
  const iTime = col((h) => h.startsWith('date') || h === 'time');
  const iPrice = col((h) => h.startsWith('price'));
  const iSize = col((h) => ['contracts', 'quantity', 'qty', 'size', 'positionsize', 'positionsizeqty'].includes(h));
  const iProfit = col((h) => h === 'profit' || h === 'netpl' || h === 'pl' || h === 'pnl');

  const groups = new Map<string, { entry?: string[]; exit?: string[] }>();
  for (const r of rows) {
    const id = String(r[iTrade] ?? '').trim();
    const type = String(r[iType] ?? '').trim().toLowerCase();
    if (!id || !type) continue;
    const g = groups.get(id) ?? {};
    if (type.startsWith('entry')) g.entry = r;
    else if (type.startsWith('exit')) g.exit = r;
    groups.set(id, g);
  }
  const trades: Trade[] = [];
  let skipped = 0;
  for (const [id, g] of groups) {
    if (!g.entry) { skipped++; continue; }
    const dir: Direction = /short/i.test(g.entry[iType]) ? 'short' : 'long';
    const entryPrice = parseNumber(g.entry[iPrice]);
    const entryTime = parseDate(g.entry[iTime], opts.tz);
    if (entryPrice === undefined || !entryTime) { skipped++; continue; }
    const size = parseNumber(g.entry[iSize]) ?? 1;
    const exitPrice = g.exit ? parseNumber(g.exit[iPrice]) : undefined;
    const profit = g.exit && iProfit >= 0 ? parseNumber(g.exit[iProfit]) : undefined;
    trades.push({
      ...baseTrade('tradingview', opts.account),
      symbol,
      direction: dir,
      entryTime,
      exitTime: g.exit ? parseDate(g.exit[iTime], opts.tz) : undefined,
      entryPrice,
      exitPrice,
      size,
      pointValue: inferPointValue(profit, entryPrice, exitPrice, size, dir),
      pnlOverride: profit,
      setup: iSignal >= 0 ? String(g.entry[iSignal] ?? '').trim() || undefined : undefined,
      externalId: `tv:${symbol}:${id}:${entryTime}`,
    });
  }
  return { trades, format: 'TradingView Strategy Tester', skipped, warnings: [] };
}

function fromGenericRows(header: string[], rows: string[][], opts: ImportOptions, format: string, source: string): ImportResult {
  const map = mapColumns(header);
  const warnings: string[] = [];
  if (map.side === undefined) warnings.push('Не найдена колонка направления (Type/Side) — строки без направления пропущены.');
  const get = (r: string[], f: Field) => (map[f] !== undefined ? r[map[f]!] : undefined);
  const trades: Trade[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.every((c) => !String(c ?? '').trim())) continue;
    const dir = parseSide(get(r, 'side'));
    const symbol = String(get(r, 'symbol') ?? '').trim();
    const entryPrice = parseNumber(get(r, 'entryPrice'));
    const entryTime = parseDate(get(r, 'entryTime') ?? get(r, 'exitTime'), opts.tz);
    if (!dir || !symbol || entryPrice === undefined || !entryTime) { skipped++; continue; }
    const size = Math.abs(parseNumber(get(r, 'size')) ?? 1);
    const exitPrice = parseNumber(get(r, 'exitPrice'));
    const commission = parseNumber(get(r, 'commission')) ?? 0;
    const swap = parseNumber(get(r, 'swap')) ?? 0;
    const profit = parseNumber(get(r, 'profit'));
    // MT/cTrader: profit is gross; commission & swap are signed (negative = cost)
    const fees = -(commission + swap);
    const sl = parseNumber(get(r, 'sl'));
    const tp = parseNumber(get(r, 'tp'));
    const id = String(get(r, 'id') ?? '').trim();
    trades.push({
      ...baseTrade(source, opts.account),
      symbol,
      direction: dir,
      entryTime,
      exitTime: parseDate(get(r, 'exitTime'), opts.tz),
      entryPrice,
      exitPrice,
      stopLoss: sl || undefined,
      takeProfit: tp || undefined,
      size,
      fees: Math.round(fees * 100) / 100,
      pointValue: inferPointValue(profit, entryPrice, exitPrice, size, dir),
      pnlOverride: profit !== undefined ? Math.round((profit - fees) * 100) / 100 : undefined,
      externalId: id ? `${source}:${id}` : `${source}:${symbol}:${entryTime}:${entryPrice}`,
    });
  }
  return { trades, format, skipped, warnings };
}

function rowsFromCsv(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true, delimiter: '' });
  return res.data.map((r) => r.map((c) => String(c ?? '').trim()));
}

/** Pulls every table row out of an HTML report (MetaTrader "Report" / "Statement"). */
export function rowsFromHtml(html: string): string[][][] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('table')].map((table) =>
    [...table.querySelectorAll('tr')].map((tr) => {
      const cells: string[] = [];
      for (const td of tr.querySelectorAll('td,th')) {
        const span = Number(td.getAttribute('colspan') || 1);
        cells.push((td.textContent ?? '').trim());
        for (let k = 1; k < span; k++) cells.push('');
      }
      return cells;
    }),
  );
}

function fromRows(rows: string[][], opts: ImportOptions, fileName: string, html: boolean): ImportResult {
  const hi = findHeaderRow(rows);
  if (hi < 0) return { trades: [], format: 'неизвестный', skipped: rows.length, warnings: ['Не удалось распознать колонки.'] };
  const header = rows[hi];
  let body = rows.slice(hi + 1);
  if (isTradingViewList(header, body)) {
    const sym = (fileName.split(/[_\s]/)[0] || 'TV').replace(/\.[^.]+$/, '').toUpperCase();
    return fromTradingView(header, body, opts, sym);
  }
  const isMt = header.map(normHeader).some((h) => h === 'sl' || h === 'tp') && html;
  if (html) {
    // MT5 reports contain several sections (Positions, Orders, Deals); stop at the next section header
    const end = body.findIndex((r) => r.filter((c) => c).length === 1 && /^[A-Za-zА-Яа-я ]+$/.test(r.find((c) => c) ?? ''));
    if (end > 0) body = body.slice(0, end);
  }
  return fromGenericRows(header, body, opts, isMt ? 'MetaTrader отчёт' : html ? 'HTML отчёт' : 'CSV', isMt ? 'mt' : 'csv');
}

export async function importFile(file: File, opts: ImportOptions): Promise<ImportResult> {
  const text = await file.text();
  return importText(text, file.name, opts);
}

export function importText(text: string, fileName: string, opts: ImportOptions): ImportResult {
  const looksHtml = /<table[\s>]/i.test(text);
  if (looksHtml && typeof DOMParser !== 'undefined') {
    let best: ImportResult | undefined;
    for (const rows of rowsFromHtml(text)) {
      const r = fromRows(rows, opts, fileName, true);
      if (!best || r.trades.length > best.trades.length) best = r;
    }
    return best ?? { trades: [], format: 'HTML', skipped: 0, warnings: ['Таблицы со сделками не найдены.'] };
  }
  return fromRows(rowsFromCsv(text), opts, fileName, false);
}
