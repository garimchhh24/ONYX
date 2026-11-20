import Dexie, { type Table } from 'dexie';
import type { Account, Cashflow, Settings, Trade } from '../types';
import { plain } from './defaults';

export type Kind = 'trades' | 'accounts' | 'cashflows';
export const KINDS: Kind[] = ['trades', 'accounts', 'cashflows'];

export interface Emitted {
  trades?: Record<string, unknown>[];
  accounts?: Record<string, unknown>[];
  cashflows?: Record<string, unknown>[];
  settings?: Record<string, unknown> | null;
}

export interface Backend {
  kind: 'cloud' | 'local';
  start(emit: (d: Emitted) => void, status: (s: { confirmed?: boolean; stale?: boolean; error?: string }) => void): Promise<void>;
  put(kind: Kind, item: { id: string }): Promise<void>;
  remove(kind: Kind, id: string): Promise<void>;
  putSettings(s: Settings): Promise<void>;
  /** Stores a screenshot; returns the asset id (cloud) or undefined (caller keeps a data URL). */
  uploadImage(blob: Blob): Promise<string | undefined>;
  deleteImage(assetId: string): Promise<void>;
}

// ---------------- device storage (IndexedDB) ----------------

class LocalDB extends Dexie {
  trades!: Table<Trade, string>;
  accounts!: Table<Account, string>;
  cashflows!: Table<Cashflow, string>;
  settings!: Table<Settings, string>;
  constructor() {
    super('onyx-prop-journal');
    this.version(1).stores({ trades: 'id', accounts: 'id', cashflows: 'id', settings: 'id' });
  }
}

export class LocalBackend implements Backend {
  kind = 'local' as const;
  private db = new LocalDB();
  async start(emit: (d: Emitted) => void, status: (s: { confirmed?: boolean; error?: string }) => void) {
    try {
      const [trades, accounts, cashflows, settings] = await Promise.all([
        this.db.trades.toArray(),
        this.db.accounts.toArray(),
        this.db.cashflows.toArray(),
        this.db.settings.get('settings'),
      ]);
      emit({ trades: trades as never, accounts: accounts as never, cashflows: cashflows as never, settings: (settings as never) ?? null });
      status({ confirmed: true });
    } catch (e) {
      emit({ trades: [], accounts: [], cashflows: [], settings: null });
      status({ confirmed: true, error: 'Хранилище браузера недоступно: ' + (e as Error).message });
    }
  }
  async put(kind: Kind, item: { id: string }) {
    await (this.db[kind] as Table<{ id: string }, string>).put(plain(item));
  }
  async remove(kind: Kind, id: string) {
    await (this.db[kind] as Table<{ id: string }, string>).delete(id);
  }
  async putSettings(s: Settings) {
    await this.db.settings.put(plain(s));
  }
  async uploadImage() {
    return undefined;
  }
  async deleteImage() {}
}

// ---------------- Claude artifact storage (synced across devices) ----------------

/* Minimal shapes of the artifact runtime we use (see the platform type definitions). */
interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined; metadata: { fromCache: boolean } }
interface QuerySnap { docs: DocSnap[]; metadata: { fromCache: boolean } }
interface DocRef {
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, err?: (e: { code: string; message: string }) => void): () => void;
  collection(p: string): ColRef;
}
interface ColRef {
  doc(id: string): DocRef;
  onSnapshot(next: (s: QuerySnap) => void, err?: (e: { code: string; message: string }) => void): () => void;
}
export interface ArtifactDB { doc(p: string): DocRef }
export interface ArtifactAssets {
  upload(b: Blob, o?: { type?: string }): Promise<{ id: string; url: string }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}

const DB_ERRORS: Record<string, string> = {
  quota_exceeded: 'Хранилище заполнено — удалите старые скриншоты или демо-данные.',
  revoked: 'Доступ к данным отозван.',
  resource_exhausted: 'Слишком много запросов — подождите немного.',
};

export class CloudBackend implements Backend {
  kind = 'cloud' as const;
  constructor(private db: ArtifactDB, private uid: string, private assets: ArtifactAssets | null) {}
  private journal() {
    return this.db.doc(`data/users/${this.uid}/journal`);
  }
  private settingsDoc() {
    return this.db.doc(`data/users/${this.uid}/settings`);
  }
  async start(emit: (d: Emitted) => void, status: (s: { confirmed?: boolean; stale?: boolean; error?: string }) => void) {
    const waiting = new Set<string>([...KINDS, 'settings']);
    const timer = setTimeout(() => waiting.size && status({ stale: true }), 10_000);
    const confirm = (k: string, fromCache: boolean) => {
      if (fromCache || !waiting.has(k)) return;
      waiting.delete(k);
      if (!waiting.size) {
        clearTimeout(timer);
        status({ confirmed: true, stale: false });
      }
    };
    const onErr = (e: { code: string; message: string }) => {
      clearTimeout(timer);
      status({ error: DB_ERRORS[e.code] ?? 'Нет связи с хранилищем Claude. Данные могут быть неактуальны.' });
    };
    for (const kind of KINDS) {
      this.journal()
        .collection(kind)
        .onSnapshot((snap) => {
          emit({ [kind]: snap.docs.map((d) => d.data() ?? {}) });
          confirm(kind, snap.metadata.fromCache);
        }, onErr);
    }
    this.settingsDoc().onSnapshot((snap) => {
      emit({ settings: snap.exists ? (snap.data() ?? null) : null });
      confirm('settings', snap.metadata.fromCache);
    }, onErr);
  }
  async put(kind: Kind, item: { id: string }) {
    await withRetry(() => this.journal().collection(kind).doc(item.id).set(plain(item) as Record<string, unknown>));
  }
  async remove(kind: Kind, id: string) {
    await withRetry(() => this.journal().collection(kind).doc(id).delete());
  }
  async putSettings(s: Settings) {
    await withRetry(() => this.settingsDoc().set(plain(s) as unknown as Record<string, unknown>));
  }
  async uploadImage(blob: Blob) {
    if (!this.assets) return undefined;
    const r = await this.assets.upload(blob, { type: blob.type || 'image/jpeg' });
    return r.id;
  }
  async deleteImage(assetId: string) {
    try {
      await this.assets?.delete(assetId);
    } catch {
      /* already gone */
    }
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'unavailable') {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      return fn();
    }
    throw e;
  }
}

export function dbErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return (code && DB_ERRORS[code]) || 'Не удалось сохранить. Проверьте соединение и попробуйте ещё раз.';
}
