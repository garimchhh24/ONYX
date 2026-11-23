'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { derivedColumns, enrichAll, type ETrade } from '../domain/calc';
import { mergeInstruments } from '../domain/instruments';
import { DEFAULT_SETUPS } from '../domain/questionnaire';
import { localTimeZone } from '../domain/time';
import { getSupabase } from '../supabase/browser';
import type { Account, AiReport, Attachment, DayReview, Instrument, Trade, UserSettings } from '../types';
import { db, type Local } from './db';
import { fetchRemoteBlob, sync } from './sync';

// ───────── identity ─────────

let currentUser: string | null = null;
export const setRepoUser = (id: string | null) => {
  currentUser = id;
};

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const nowIso = () => new Date().toISOString();

function stamp<T extends { id?: string; created_at?: string }>(rec: T, existing?: { created_at: string; user_id: string | null }) {
  const t = nowIso();
  return {
    ...rec,
    id: rec.id ?? uid(),
    user_id: existing?.user_id ?? currentUser,
    created_at: existing?.created_at ?? rec.created_at ?? t,
    updated_at: t,
    deleted_at: null,
    _dirty: 1 as const,
  };
}

// ───────── trades ─────────

export function blankTrade(p: Partial<Trade> = {}): Trade {
  const t = nowIso();
  return {
    id: uid(),
    user_id: currentUser,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    account_id: null,
    symbol: 'NQ',
    contract: null,
    direction: 'long',
    contracts: 1,
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    entry_time: null,
    exit_time: null,
    commission: null,
    gross_pnl: null,
    net_pnl: null,
    risk_amount: null,
    session: null,
    trading_day: null,
    timeframe: null,
    setup: null,
    bias: null,
    market_structure: null,
    concepts: [],
    tags: [],
    notes: null,
    journal: null,
    journal_completed_at: null,
    ai_review: null,
    extraction: null,
    source: 'manual',
    ...p,
  };
}

export async function saveTrade(t: Trade): Promise<Trade> {
  const existing = await db().trades.get(t.id);
  const rec = { ...stamp(t, existing), ...derivedColumns(t) } as Local<Trade>;
  await db().trades.put(rec);
  sync.request();
  return rec;
}

export async function patchTrade(id: string, patch: Partial<Trade>): Promise<void> {
  const cur = await db().trades.get(id);
  if (!cur) throw new Error('Trade not found');
  const next = { ...cur, ...patch };
  await db().trades.put({ ...next, ...derivedColumns(next), updated_at: nowIso(), _dirty: 1 });
  sync.request();
}

export async function deleteTrade(id: string): Promise<void> {
  const t = nowIso();
  await db().transaction('rw', db().trades, db().attachments, async () => {
    await db().trades.update(id, { deleted_at: t, updated_at: t, _dirty: 1 });
    await db().attachments.where('trade_id').equals(id).modify({ deleted_at: t, updated_at: t, _dirty: 1 });
  });
  sync.request();
}

export async function restoreTrade(id: string): Promise<void> {
  const t = nowIso();
  await db().transaction('rw', db().trades, db().attachments, async () => {
    await db().trades.update(id, { deleted_at: null, updated_at: t, _dirty: 1 });
    await db().attachments.where('trade_id').equals(id).modify({ deleted_at: null, updated_at: t, _dirty: 1 });
  });
  sync.request();
}

/** Copy a trade's setup (not its result, journal or screenshots) into a new draft. */
export async function duplicateTrade(id: string): Promise<Trade> {
  const src = await db().trades.get(id);
  if (!src) throw new Error('Trade not found');
  const copy = blankTrade({
    account_id: src.account_id,
    symbol: src.symbol,
    contract: src.contract,
    direction: src.direction,
    contracts: src.contracts,
    entry_price: src.entry_price,
    exit_price: src.exit_price,
    stop_loss: src.stop_loss,
    take_profit: src.take_profit,
    entry_time: src.entry_time,
    exit_time: src.exit_time,
    commission: src.commission,
    gross_pnl: src.gross_pnl,
    net_pnl: src.net_pnl,
    risk_amount: src.risk_amount,
    timeframe: src.timeframe,
    setup: src.setup,
    bias: src.bias,
    market_structure: src.market_structure,
    concepts: [...src.concepts],
    tags: [...src.tags],
    notes: src.notes,
    source: 'manual',
  });
  return saveTrade(copy);
}

// ───────── attachments ─────────

export async function addAttachment(tradeId: string, blob: Blob, meta: { width?: number; height?: number; caption?: string | null }): Promise<Attachment> {
  const rec = stamp<Partial<Attachment>>({
    trade_id: tradeId,
    storage_path: null,
    mime: blob.type || 'image/jpeg',
    size: blob.size,
    width: meta.width ?? null,
    height: meta.height ?? null,
    caption: meta.caption ?? null,
  }) as Local<Attachment>;
  await db().transaction('rw', db().attachments, db().blobs, async () => {
    await db().blobs.put({ id: rec.id, blob });
    await db().attachments.put(rec);
  });
  sync.request();
  return rec;
}

export async function deleteAttachment(id: string): Promise<void> {
  const t = nowIso();
  await db().attachments.update(id, { deleted_at: t, updated_at: t, _dirty: 1 });
  sync.request();
}

// ───────── accounts ─────────

export function blankAccount(p: Partial<Account> = {}): Account {
  const t = nowIso();
  return {
    id: uid(),
    user_id: currentUser,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    name: '',
    firm: 'Lucid Trading',
    plan: null,
    phase: 'evaluation',
    size: null,
    starting_balance: 50000,
    balance_adjustment: 0,
    status: 'active',
    daily_loss_limit: null,
    max_drawdown: null,
    drawdown_type: 'trailing_eod',
    drawdown_lock: null,
    profit_target: null,
    payout_target: null,
    min_trading_days: null,
    consistency_pct: null,
    personal_daily_risk: null,
    personal_trade_risk: null,
    rules_source: 'user',
    rules_verified_at: null,
    rules_reference: null,
    notes: null,
    ...p,
  };
}

export async function saveAccount(a: Account): Promise<Account> {
  const existing = await db().accounts.get(a.id);
  const rec = stamp(a, existing) as Local<Account>;
  await db().accounts.put(rec);
  sync.request();
  return rec;
}

export async function deleteAccount(id: string): Promise<void> {
  const t = nowIso();
  await db().transaction('rw', db().accounts, db().trades, async () => {
    await db().accounts.update(id, { deleted_at: t, updated_at: t, _dirty: 1 });
    // Trades stay in the journal; they are detached from the deleted account.
    await db().trades.where('account_id').equals(id).modify({ account_id: null, updated_at: t, _dirty: 1 });
  });
  sync.request();
}

// ───────── settings ─────────

export function defaultSettings(): UserSettings {
  const t = nowIso();
  return {
    id: 'settings',
    user_id: currentUser,
    created_at: t,
    updated_at: '1970-01-01T00:00:00.000Z',
    deleted_at: null,
    instruments: [],
    setups: DEFAULT_SETUPS,
    reminder: { enabled: true, time: '20:30', timezone: localTimeZone() },
    default_account_id: null,
    onboarded: false,
  };
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  const cur = (await db().user_settings.get('settings')) ?? defaultSettings();
  await db().user_settings.put({ ...cur, ...patch, id: 'settings', updated_at: nowIso(), _dirty: 1 });
  sync.request();
}

// ───────── day reviews & reports ─────────

export async function setDayReview(day: string, status: DayReview['status'] | null): Promise<void> {
  const existing = await db().day_reviews.get(day);
  const t = nowIso();
  if (status === null) {
    if (existing) await db().day_reviews.update(day, { deleted_at: t, updated_at: t, _dirty: 1 });
  } else {
    await db().day_reviews.put({ ...stamp({ id: day, status, note: null }, existing), id: day } as Local<DayReview>);
  }
  sync.request();
}

export async function saveReport(r: Omit<AiReport, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<void> {
  await db().ai_reports.put(stamp(r as AiReport & { id?: string; created_at?: string }) as Local<AiReport>);
  sync.request();
}

// ───────── hooks ─────────

const alive = <T extends { deleted_at: string | null }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !x.deleted_at);

export function useSettings(): UserSettings {
  const s = useLiveQuery(() => db().user_settings.get('settings'), []);
  return useMemo(() => {
    const d = defaultSettings();
    return s ? { ...d, ...s, reminder: { ...d.reminder, ...s.reminder } } : d;
  }, [s]);
}

export function useInstruments(): Instrument[] {
  const s = useSettings();
  return useMemo(() => mergeInstruments(s.instruments), [s.instruments]);
}

export function useRawTrades(): Trade[] | undefined {
  const rows = useLiveQuery(() => db().trades.toArray(), []);
  return useMemo(() => (rows ? alive(rows) : undefined), [rows]);
}

/** All trades enriched with P&L, R, session etc. — undefined while loading. */
export function useTrades(): ETrade[] | undefined {
  const rows = useRawTrades();
  const inst = useInstruments();
  return useMemo(() => (rows ? enrichAll(rows, inst) : undefined), [rows, inst]);
}

export function useTrade(id: string | undefined): { trade: Trade | undefined; loading: boolean } {
  const res = useLiveQuery(async () => (id ? ((await db().trades.get(id)) ?? null) : null), [id]);
  return { trade: res && !res.deleted_at ? res : undefined, loading: res === undefined };
}

export function useAccounts(): Account[] | undefined {
  const rows = useLiveQuery(() => db().accounts.toArray(), []);
  return useMemo(() => (rows ? alive(rows).sort((a, b) => a.created_at.localeCompare(b.created_at)) : undefined), [rows]);
}

export function useAttachments(tradeId: string | undefined): Attachment[] {
  const rows = useLiveQuery(() => (tradeId ? db().attachments.where('trade_id').equals(tradeId).toArray() : []), [tradeId]);
  return useMemo(() => alive(rows).sort((a, b) => a.created_at.localeCompare(b.created_at)), [rows]);
}

export function useAttachmentCounts(): Map<string, number> {
  const rows = useLiveQuery(() => db().attachments.toArray(), []);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alive(rows)) m.set(a.trade_id, (m.get(a.trade_id) ?? 0) + 1);
    return m;
  }, [rows]);
}

export function useDayReviews(): DayReview[] {
  const rows = useLiveQuery(() => db().day_reviews.toArray(), []);
  return useMemo(() => alive(rows), [rows]);
}

export function useReports(): AiReport[] {
  const rows = useLiveQuery(() => db().ai_reports.orderBy('created_at').reverse().toArray(), []);
  return useMemo(() => alive(rows), [rows]);
}

/** Object URL for a screenshot: local cache first, then Supabase Storage. */
export function useBlobUrl(a: Attachment | undefined): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({ url: null, missing: false });
  useEffect(() => {
    if (!a) return;
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      let blob = (await db().blobs.get(a.id))?.blob ?? null;
      if (!blob) {
        const sb = getSupabase();
        if (sb && a.storage_path) blob = await fetchRemoteBlob(sb, a);
      }
      if (cancelled) return;
      if (!blob) return setState({ url: null, missing: true });
      url = URL.createObjectURL(blob);
      setState({ url, missing: false });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [a]);
  return state;
}

export async function getBlob(id: string): Promise<Blob | null> {
  return (await db().blobs.get(id))?.blob ?? null;
}
