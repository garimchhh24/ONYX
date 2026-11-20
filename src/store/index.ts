import { useSyncExternalStore } from 'react';
import type { Account, Cashflow, JournalData, Settings, Trade } from '../types';
import { CloudBackend, LocalBackend, dbErrorMessage, type ArtifactAssets, type ArtifactDB, type Backend, type Emitted, type Kind } from './backends';
import { DEFAULT_SETTINGS, normalizeAccount, normalizeCashflow, normalizeSettings, normalizeTrade, plain } from './defaults';

export interface StoreState extends JournalData {
  ready: boolean;
  backend: 'cloud' | 'local' | null;
  stale: boolean;
  error?: string;
  toast?: { id: number; text: string };
}

let state: StoreState = {
  ready: false,
  backend: null,
  stale: false,
  trades: [],
  accounts: [],
  cashflows: [],
  settings: DEFAULT_SETTINGS,
};
const listeners = new Set<() => void>();
let backend: Backend | null = null;
const loaded = new Set<string>();

function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore(): StoreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function getState() {
  return state;
}

let toastSeq = 0;
export function toast(text: string) {
  const id = ++toastSeq;
  set({ toast: { id, text } });
  setTimeout(() => state.toast?.id === id && set({ toast: undefined }), 2600);
}

function onEmit(d: Emitted) {
  const patch: Partial<StoreState> = {};
  if (d.trades) {
    patch.trades = d.trades.map(normalizeTrade);
    loaded.add('trades');
  }
  if (d.accounts) {
    patch.accounts = d.accounts.map(normalizeAccount);
    loaded.add('accounts');
  }
  if (d.cashflows) {
    patch.cashflows = d.cashflows.map(normalizeCashflow);
    loaded.add('cashflows');
  }
  if (d.settings !== undefined) {
    patch.settings = normalizeSettings(d.settings ?? undefined);
    loaded.add('settings');
  }
  if (!state.ready && loaded.size === 4) patch.ready = true;
  set(patch);
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

/** Picks Claude's synced storage when the app runs as a Claude artifact, otherwise the device. */
export async function initStore() {
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (claude?.use) {
    try {
      const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [ArtifactDB | null, { id(): Promise<string | null> } | null];
      const id = user ? await user.id() : null;
      if (db && id) {
        const assets = (await claude.use('assets').catch(() => null)) as ArtifactAssets | null;
        await start(new CloudBackend(db, id, assets));
        return;
      }
    } catch {
      /* fall back to device storage */
    }
  }
  await start(new LocalBackend());
}

async function start(b: Backend) {
  backend = b;
  set({ backend: b.kind });
  await b.start(onEmit, (s) => {
    const patch: Partial<StoreState> = {};
    if (s.stale !== undefined) patch.stale = s.stale;
    if (s.error) patch.error = s.error;
    if ((s.stale || s.error) && !state.ready) patch.ready = true; // show what we have
    if (s.confirmed) patch.error = undefined;
    set(patch);
  });
}

// ---------------- mutations (optimistic) ----------------

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

async function write(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    toast(dbErrorMessage(e));
    throw e;
  }
}

const listKey: Record<Kind, 'trades' | 'accounts' | 'cashflows'> = { trades: 'trades', accounts: 'accounts', cashflows: 'cashflows' };

async function putItem<T extends { id: string }>(kind: Kind, item: T) {
  const clean = plain(item);
  set({ [listKey[kind]]: upsert(state[listKey[kind]] as { id: string }[], clean) } as Partial<StoreState>);
  await write(() => backend!.put(kind, clean));
}

async function removeItem(kind: Kind, id: string) {
  set({ [listKey[kind]]: (state[listKey[kind]] as { id: string }[]).filter((x) => x.id !== id) } as Partial<StoreState>);
  await write(() => backend!.remove(kind, id));
}

export const saveTrade = (t: Trade) => putItem('trades', { ...t, updatedAt: new Date().toISOString() });
export const saveAccount = (a: Account) => putItem('accounts', { ...a, updatedAt: new Date().toISOString() });
export const saveCashflow = (c: Cashflow) => putItem('cashflows', c);
export const deleteCashflow = (id: string) => removeItem('cashflows', id);

export async function deleteTrade(t: Trade) {
  await removeItem('trades', t.id);
  for (const a of t.analyses) if (a.assetId) void backend?.deleteImage(a.assetId);
}

export async function deleteAccount(id: string) {
  const affected = state.trades.filter((t) => t.accountIds.includes(id));
  await removeItem('accounts', id);
  for (const t of affected) await saveTrade({ ...t, accountIds: t.accountIds.filter((x) => x !== id) });
  for (const c of state.cashflows.filter((c) => c.accountId === id)) await deleteCashflow(c.id);
}

let settingsTimer: ReturnType<typeof setTimeout> | undefined;
let settingsWrite: Promise<void> = Promise.resolve();

/** Updates settings at once; the write is coalesced so typing doesn't flood storage. */
export function saveSettings(s: Settings, immediate = false): Promise<void> {
  const clean = plain(s);
  set({ settings: normalizeSettings(clean as never) });
  clearTimeout(settingsTimer);
  return new Promise((resolve) => {
    const run = () => {
      // one write at a time to the settings document
      settingsWrite = settingsWrite.then(() => write(() => backend!.putSettings(getState().settings)).catch(() => undefined));
      void settingsWrite.then(resolve);
    };
    if (immediate) run();
    else settingsTimer = setTimeout(run, 700);
  });
}

/** Writes many records with limited concurrency; returns how many were written. */
export async function bulkSave(kind: Kind, items: { id: string }[], onProgress?: (done: number) => void): Promise<number> {
  const list = state[listKey[kind]] as { id: string }[];
  const merged = items.reduce((acc, it) => upsert(acc, plain(it)), list);
  set({ [listKey[kind]]: merged } as Partial<StoreState>);
  let done = 0;
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift()!;
      await backend!.put(kind, it);
      onProgress?.(++done);
    }
  };
  try {
    await Promise.all(Array.from({ length: backend?.kind === 'cloud' ? 4 : 1 }, worker));
  } catch (e) {
    toast(dbErrorMessage(e));
  }
  return done;
}

export async function bulkDelete(kind: Kind, ids: string[]) {
  const drop = new Set(ids);
  set({ [listKey[kind]]: (state[listKey[kind]] as { id: string }[]).filter((x) => !drop.has(x.id)) } as Partial<StoreState>);
  const queue = ids.slice();
  const worker = async () => {
    while (queue.length) await backend!.remove(kind, queue.shift()!);
  };
  try {
    await Promise.all(Array.from({ length: backend?.kind === 'cloud' ? 4 : 1 }, worker));
  } catch (e) {
    toast(dbErrorMessage(e));
  }
}

export async function uploadImage(blob: Blob): Promise<string | undefined> {
  try {
    return await backend?.uploadImage(blob);
  } catch {
    return undefined;
  }
}

export function exportJson(): string {
  const { trades, accounts, cashflows, settings } = state;
  return JSON.stringify({ app: 'onyx-prop-journal', version: 2, exportedAt: new Date().toISOString(), trades, accounts, cashflows, settings }, null, 2);
}

export async function importJson(text: string): Promise<number> {
  const data = JSON.parse(text);
  if (data?.app !== 'onyx-prop-journal' || !Array.isArray(data.trades)) throw new Error('Это не резервная копия ONYX');
  await bulkSave('accounts', (data.accounts ?? []).map(normalizeAccount));
  await bulkSave('cashflows', (data.cashflows ?? []).map(normalizeCashflow));
  const n = await bulkSave('trades', data.trades.map(normalizeTrade));
  if (data.settings) await saveSettings(normalizeSettings(data.settings), true);
  return n;
}
