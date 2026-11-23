'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { SCREENSHOT_BUCKET } from '../supabase/env';
import type { Attachment } from '../types';
import { db, getMeta, setMeta, SYNCED_TABLES, type Local, type SyncedTableName } from './db';

/**
 * Local-first sync: every write lands in IndexedDB with `_dirty = 1`, then this engine
 * pushes dirty rows to Supabase (upsert) and pulls rows changed on other devices
 * (by the server-assigned `server_updated_at` cursor). Conflicts resolve last-write-wins
 * on the client edit time `updated_at` — enforced again by a trigger on the server.
 */

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pending: number;
  error: string | null;
}

const CONFLICT: Record<SyncedTableName, string> = {
  accounts: 'id',
  trades: 'id',
  attachments: 'id',
  day_reviews: 'user_id,id',
  ai_reports: 'id',
  user_settings: 'user_id',
};

const PAGE = 500;

type AnyRow = Local<Record<string, unknown> & { id: string; updated_at: string; user_id: string | null }>;

function toRemote(row: AnyRow, userId: string): Record<string, unknown> {
  const { _dirty: _ignored, ...rest } = row;
  void _ignored;
  return { ...rest, user_id: userId };
}

function fromRemote(row: Record<string, unknown>): AnyRow {
  const { server_updated_at: _s, ...rest } = row;
  void _s;
  return { ...(rest as AnyRow), _dirty: 0 };
}

class SyncEngine {
  private state: SyncState = { status: 'disabled', lastSyncedAt: null, pending: 0, error: null };
  private listeners = new Set<(s: SyncState) => void>();
  private sb: SupabaseClient | null = null;
  private userId: string | null = null;
  private running = false;
  private queued = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private onOnline = () => this.request(0);
  private onVisible = () => document.visibilityState === 'visible' && this.request(0);

  get snapshot(): SyncState {
    return this.state;
  }

  subscribe(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  get active(): boolean {
    return !!this.sb && !!this.userId;
  }

  async start(sb: SupabaseClient, userId: string) {
    this.stop();
    this.sb = sb;
    this.userId = userId;
    this.set({ status: navigator.onLine ? 'idle' : 'offline', error: null, lastSyncedAt: (await getMeta<string>('lastSyncedAt')) ?? null });
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.interval = setInterval(() => document.visibilityState === 'visible' && this.request(0), 60_000);
    await this.refreshPending();
    this.request(0);
  }

  stop() {
    this.sb = null;
    this.userId = null;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.interval) clearInterval(this.interval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.set({ status: 'disabled', error: null });
  }

  /** Schedule a sync (debounced so bursts of edits go up together). */
  request(delay = 800) {
    void this.refreshPending();
    if (!this.active) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(), delay);
  }

  async refreshPending() {
    let pending = 0;
    for (const t of SYNCED_TABLES) pending += await db()[t].where('_dirty').equals(1).count();
    if (pending !== this.state.pending) this.set({ pending });
    return pending;
  }

  async syncNow(): Promise<boolean> {
    if (!this.active) return false;
    if (this.running) {
      this.queued = true;
      return false;
    }
    if (!navigator.onLine) {
      this.set({ status: 'offline' });
      return false;
    }
    this.running = true;
    this.set({ status: 'syncing', error: null });
    try {
      await this.push();
      await this.pull();
      const now = new Date().toISOString();
      await setMeta('lastSyncedAt', now);
      await this.refreshPending();
      this.set({ status: 'idle', lastSyncedAt: now });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      this.set({ status: navigator.onLine ? 'error' : 'offline', error: msg });
      return false;
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        this.request(200);
      }
    }
  }

  private async push() {
    const sb = this.sb!;
    const uid = this.userId!;
    for (const table of SYNCED_TABLES) {
      const dirty = (await db()[table].where('_dirty').equals(1).toArray()) as unknown as AnyRow[];
      if (!dirty.length) continue;
      const ready: AnyRow[] = [];
      for (const row of dirty) {
        if (table === 'attachments') {
          const ok = await this.syncAttachmentFile(row as unknown as Local<Attachment>);
          if (!ok) continue;
          ready.push((await db().attachments.get(row.id)) as unknown as AnyRow);
        } else ready.push(row);
      }
      for (let i = 0; i < ready.length; i += PAGE) {
        const chunk = ready.slice(i, i + PAGE);
        const { error } = await sb.from(table).upsert(
          chunk.map((r) => toRemote(r, uid)),
          { onConflict: CONFLICT[table] },
        );
        if (error) throw new Error(`${table}: ${error.message}`);
        await db().transaction('rw', db()[table], async () => {
          for (const r of chunk) {
            const cur = (await db()[table].get(r.id)) as unknown as AnyRow | undefined;
            // Only clear the flag if nothing changed while the request was in flight.
            if (cur && cur.updated_at === r.updated_at) await db()[table].update(r.id, { _dirty: 0, user_id: uid } as never);
          }
        });
      }
    }
  }

  /** Upload a screenshot to Storage before its row is pushed (or remove it when deleted). */
  private async syncAttachmentFile(a: Local<Attachment>): Promise<boolean> {
    const sb = this.sb!;
    const uid = this.userId!;
    if (a.deleted_at) {
      if (a.storage_path) await sb.storage.from(SCREENSHOT_BUCKET).remove([a.storage_path]);
      return true;
    }
    if (a.storage_path) return true;
    const blob = await db().blobs.get(a.id);
    if (!blob) return true; // nothing to upload (row-only)
    const ext = a.mime === 'image/png' ? 'png' : a.mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${uid}/${a.trade_id}/${a.id}.${ext}`;
    const { error } = await sb.storage.from(SCREENSHOT_BUCKET).upload(path, blob.blob, { contentType: a.mime, upsert: true });
    if (error) {
      this.set({ error: `Screenshot upload: ${error.message}` });
      return false;
    }
    await db().attachments.update(a.id, { storage_path: path });
    return true;
  }

  private async pull() {
    const sb = this.sb!;
    for (const table of SYNCED_TABLES) {
      const key = `cursor:${table}`;
      let cursor = (await getMeta<string>(key)) ?? '1970-01-01T00:00:00Z';
      let seenAtCursor = new Set<string>((await getMeta<string[]>(`${key}:ids`)) ?? []);
      for (;;) {
        const { data, error } = await sb
          .from(table)
          .select('*')
          .gte('server_updated_at', cursor)
          .order('server_updated_at', { ascending: true })
          .limit(PAGE);
        if (error) throw new Error(`${table}: ${error.message}`);
        const rows = (data ?? []).filter((r) => !(r.server_updated_at === cursor && seenAtCursor.has(String(r.id))));
        if (rows.length) {
          await db().transaction('rw', db()[table], async () => {
            for (const r of rows) {
              const incoming = fromRemote(r);
              const local = (await db()[table].get(incoming.id)) as unknown as AnyRow | undefined;
              if (local && local._dirty === 1 && local.updated_at > incoming.updated_at) continue;
              await db()[table].put(incoming as never);
            }
          });
          const last = String(rows[rows.length - 1].server_updated_at);
          if (last !== cursor) seenAtCursor = new Set();
          cursor = last;
          for (const r of rows) if (r.server_updated_at === cursor) seenAtCursor.add(String(r.id));
          await setMeta(key, cursor);
          await setMeta(`${key}:ids`, [...seenAtCursor]);
        }
        if ((data ?? []).length < PAGE) break;
      }
    }
  }
}

export const sync = new SyncEngine();

/** Download a screenshot from Storage into the local cache (offline access afterwards). */
export async function fetchRemoteBlob(sb: SupabaseClient, a: Attachment): Promise<Blob | null> {
  if (!a.storage_path) return null;
  const { data, error } = await sb.storage.from(SCREENSHOT_BUCKET).download(a.storage_path);
  if (error || !data) return null;
  await db().blobs.put({ id: a.id, blob: data });
  return data;
}

/**
 * Called when a user signs in: wipe data that belongs to someone else on this device,
 * then adopt device-only records into the signed-in account so they sync up.
 */
export async function prepareForUser(userId: string) {
  const owner = await getMeta<string | null>('owner');
  let foreign = !!owner && owner !== userId;
  if (!foreign) {
    // Belt and braces: never show one account's rows to another, even if the owner marker is missing.
    for (const t of SYNCED_TABLES) {
      const table = db()[t] as unknown as import('dexie').Table<{ user_id: string | null }, string>;
      if ((await table.filter((r) => !!r.user_id && r.user_id !== userId).count()) > 0) {
        foreign = true;
        break;
      }
    }
  }
  if (foreign) await clearLocalData();
  for (const t of SYNCED_TABLES) {
    const table = db()[t] as unknown as import('dexie').Table<{ user_id: string | null; _dirty: 0 | 1 }, string>;
    await table.filter((r) => !r.user_id).modify({ user_id: userId, _dirty: 1 });
  }
  await setMeta('owner', userId);
}

export async function clearLocalData() {
  const d = db();
  await d.transaction('rw', [...SYNCED_TABLES.map((t) => d[t]), d.blobs, d.meta], async () => {
    for (const t of SYNCED_TABLES) await d[t].clear();
    await d.blobs.clear();
    await d.meta.clear();
  });
}
