import Papa from 'papaparse';
import type { Direction, Instrument, Trade } from '../types';
import { uid } from './calc';
import { rootSymbol } from './instruments';
import { zonedToIso } from './time';

/**
 * Futures platform exports → trades:
 *  - Tradovate "Performance" CSV (buyPrice / sellPrice / boughtTimestamp / soldTimestamp / pnl)
 *  - NinjaTrader 8 "Trades" grid CSV (Instrument / Market pos. / Entry price / Exit price / Profit / Commission)
 *  - ProjectX platforms, e.g. TopstepX (ContractName / EnteredAt / ExitedAt / Type / Size / PnL / Fees)
 *  - any other CSV with recognisable column names
 */

export type TimeZoneMode = { kind: 'local' } | { kind: 'zone'; zone: string };

export interface ImportOptions {
  tz: TimeZoneMode;
  accountIds: string[];
  instruments: Instrument[];
}

export interface ImportResult {
  trades: Trade[];
  format: string;
  skipped: number;
  warnings: string[];
}

export const normHeader = (s: string) => s.toLowerCase().replace(/[\s/_\-#.:()&%$]+/g, '');

/** "$1,234.50", "$(25.00)", "-12.5", "1 234,56" → number */
export function parseNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  const negParen = /^\(.*\)$/.test(s.replace(/[$\s]/g, '')) || /\$\(/.test(s);
  s = s.replace(/[\s ]/g, '').replace(/[^\d.,\-+eE]/g, '');
  if (!s || s === '-') return undefined;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/^[-+]?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ''); // US thousands
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negParen ? -Math.abs(n) : n;
}

export function parseSide(v: unknown): Direction | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  if (/\b(buy|long|bot|bought|b)\b/.test(s) || /^(покупка|лонг)/.test(s)) return 'long';
  if (/\b(sell|short|sld|sold|s)\b/.test(s) || /^(продажа|шорт)/.test(s)) return 'short';
  return undefined;
}

/** "09/26/2024 09:31:10", "2024-09-26 09:31", "26.09.2024 9:31", "12/2/2024 9:31:05 AM", "...-05:00", epoch */
export function parseDate(v: unknown, tz: TimeZoneMode): string | undefined {
  const raw = String(v ?? '').trim();
  if (!raw) return undefined;
  if (/^\d{10,13}$/.test(raw)) return new Date(raw.length === 10 ? Number(raw) * 1000 : Number(raw)).toISOString();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(raw);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(raw))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw))) [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])];
  else {
    const dt = new Date(raw);
    return isNaN(dt.getTime()) ? undefined : dt.toISOString();
  }
  const rest = raw.slice(m[0].length);
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?/i.exec(rest);
  let hh = t ? Number(t[1]) : 0;
  const mm = t ? Number(t[2]) : 0;
  const ss = t?.[3] ? Number(t[3]) : 0;
  if (t?.[4]) {
    const pm = t[4].toLowerCase() === 'pm';
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  const off = /(Z|[+-]\d{2}:?\d{2})\s*$/.exec(rest);
  if (off) {
    const o = off[1] === 'Z' ? 0 : (off[1][0] === '-' ? -1 : 1) * (Number(off[1].slice(1, 3)) * 60 + Number(off[1].slice(-2)));
    return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss) - o * 60000).toISOString();
  }
  if (tz.kind === 'local') {
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    return isNaN(dt.getTime()) ? undefined : dt.toISOString();
  }
  return zonedToIso(y, mo, d, hh, mm, ss, tz.zone);
}

function base(opts: ImportOptions): Pick<Trade, 'id' | 'accountIds' | 'mistakes' | 'analyses' | 'source' | 'createdAt' | 'updatedAt' | 'mode'> {
  const now = new Date().toISOString();
  return { id: uid(), accountIds: [...opts.accountIds], mistakes: [], analyses: [], source: 'import', createdAt: now, updatedAt: now, mode: 'prices' };
}

type Field = 'id' | 'symbol' | 'side' | 'qty' | 'entryPrice' | 'exitPrice' | 'entryTime' | 'exitTime' | 'pnl' | 'fees';
const SYN: Record<Field, string[]> = {
  id: ['id', 'tradeid', 'tradenumber', 'trade', 'positionid', 'ticket'],
  symbol: ['symbol', 'instrument', 'contract', 'contractname', 'ticker', 'product', 'market'],
  side: ['side', 'type', 'marketpos', 'direction', 'position', 'action', 'buysell'],
  qty: ['qty', 'quantity', 'size', 'contracts', 'volume', 'filledqty', 'positionsize'],
  entryPrice: ['entryprice', 'avgentryprice', 'openprice', 'entry', 'avgentry'],
  exitPrice: ['exitprice', 'avgexitprice', 'closeprice', 'exit', 'avgexit'],
  entryTime: ['entrytime', 'enteredat', 'opentime', 'opened', 'entrydate', 'openedat', 'entrydatetime'],
  exitTime: ['exittime', 'exitedat', 'closetime', 'closed', 'exitdate', 'closedat', 'exitdatetime'],
  pnl: ['pnl', 'profit', 'pl', 'netpnl', 'grosspnl', 'realizedpnl', 'profitloss', 'netprofit'],
  fees: ['fees', 'fee', 'commission', 'commissions'],
};

function mapColumns(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = normHeader(h);
    for (const [f, list] of Object.entries(SYN) as [Field, string[]][]) {
      if (map[f] === undefined && list.includes(n)) map[f] = i;
    }
  });
  return map;
}

function rowsFromCsv(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true, delimiter: '' });
  return res.data.map((r) => r.map((c) => String(c ?? '').trim()));
}

function fromTradovate(header: string[], rows: string[][], opts: ImportOptions): ImportResult {
  const n = header.map(normHeader);
  const col = (k: string) => n.indexOf(k.toLowerCase());
  const [iSym, iQty, iBuy, iSell, iPnl, iBT, iST, iBF, iSF] = ['symbol', 'qty', 'buyprice', 'sellprice', 'pnl', 'boughttimestamp', 'soldtimestamp', 'buyfillid', 'sellfillid'].map(col);
  const trades: Trade[] = [];
  let skipped = 0;
  for (const r of rows) {
    const bought = parseDate(r[iBT], opts.tz);
    const sold = parseDate(r[iST], opts.tz);
    const buy = parseNumber(r[iBuy]);
    const sell = parseNumber(r[iSell]);
    if (!bought || !sold || buy === undefined || sell === undefined) { skipped++; continue; }
    const long = bought <= sold;
    trades.push({
      ...base(opts),
      symbol: rootSymbol(r[iSym], opts.instruments),
      direction: long ? 'long' : 'short',
      contracts: Math.abs(parseNumber(r[iQty]) ?? 1),
      entryTime: long ? bought : sold,
      exitTime: long ? sold : bought,
      entryPrice: long ? buy : sell,
      exitPrice: long ? sell : buy,
      gross: parseNumber(r[iPnl]),
      externalId: `tradovate:${r[iBF] ?? ''}:${r[iSF] ?? ''}:${bought}`,
    });
  }
  return { trades, format: 'Tradovate · Performance', skipped, warnings: [] };
}

function fromGeneric(header: string[], rows: string[][], opts: ImportOptions, format: string, source: string): ImportResult {
  const map = mapColumns(header);
  const get = (r: string[], f: Field) => (map[f] !== undefined ? r[map[f]!] : undefined);
  const warnings: string[] = [];
  if (map.side === undefined) warnings.push('Нет колонки направления (Side / Type / Market pos.) — такие строки пропущены.');
  const trades: Trade[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.every((c) => !c)) continue;
    const dir = parseSide(get(r, 'side'));
    const sym = String(get(r, 'symbol') ?? '').trim();
    const entryTime = parseDate(get(r, 'entryTime') ?? get(r, 'exitTime'), opts.tz);
    const entryPrice = parseNumber(get(r, 'entryPrice'));
    const pnl = parseNumber(get(r, 'pnl'));
    if (!dir || !sym || !entryTime || (entryPrice === undefined && pnl === undefined)) { skipped++; continue; }
    const fees = parseNumber(get(r, 'fees'));
    const id = String(get(r, 'id') ?? '').trim();
    trades.push({
      ...base(opts),
      symbol: rootSymbol(sym, opts.instruments),
      direction: dir,
      contracts: Math.abs(parseNumber(get(r, 'qty')) ?? 1) || 1,
      entryTime,
      exitTime: parseDate(get(r, 'exitTime'), opts.tz),
      entryPrice,
      exitPrice: parseNumber(get(r, 'exitPrice')),
      gross: pnl,
      fees: fees !== undefined ? Math.abs(fees) : undefined,
      externalId: id ? `${source}:${sym}:${id}:${entryTime}` : `${source}:${sym}:${entryTime}:${entryPrice ?? ''}`,
    });
  }
  return { trades, format, skipped, warnings };
}

export function importText(text: string, opts: ImportOptions): ImportResult {
  const rows = rowsFromCsv(text);
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const m = mapColumns(rows[i]);
    const n = rows[i].map(normHeader);
    if (n.includes('buyprice') && n.includes('sellprice')) { hi = i; break; }
    if (m.symbol !== undefined && (m.entryPrice !== undefined || m.pnl !== undefined)) { hi = i; break; }
  }
  if (hi < 0) return { trades: [], format: 'не распознан', skipped: rows.length, warnings: ['Не удалось найти колонки сделок. Нужен экспорт сделок (не ордеров) в CSV.'] };
  const header = rows[hi];
  const body = rows.slice(hi + 1);
  const n = header.map(normHeader);
  if (n.includes('buyprice') && n.includes('sellprice') && n.includes('boughttimestamp')) return fromTradovate(header, body, opts);
  if (n.includes('marketpos')) return fromGeneric(header, body, opts, 'NinjaTrader · Trades', 'ninjatrader');
  if (n.includes('contractname') || n.includes('enteredat')) return fromGeneric(header, body, opts, 'ProjectX · Trades', 'projectx');
  return fromGeneric(header, body, opts, 'CSV', 'csv');
}

export async function importFile(file: File, opts: ImportOptions): Promise<ImportResult> {
  return importText(await file.text(), opts);
}
