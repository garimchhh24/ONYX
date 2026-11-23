import Dexie, { type Table } from 'dexie';
import type { AiReport, Attachment, Account, DayReview, Trade, UserSettings } from '../types';

/** A synced record as stored on the device. `_dirty` = changed locally, not yet pushed. */
export type Local<T> = T & { _dirty: 0 | 1 };

export interface BlobRow {
  id: string;
  blob: Blob;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class CadenceDB extends Dexie {
  trades!: Table<Local<Trade>, string>;
  accounts!: Table<Local<Account>, string>;
  attachments!: Table<Local<Attachment>, string>;
  day_reviews!: Table<Local<DayReview>, string>;
  ai_reports!: Table<Local<AiReport>, string>;
  user_settings!: Table<Local<UserSettings>, string>;
  blobs!: Table<BlobRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'cadence') {
    super(name);
    this.version(1).stores({
      trades: 'id, _dirty, trading_day, account_id, updated_at, user_id',
      accounts: 'id, _dirty, user_id',
      attachments: 'id, _dirty, trade_id, user_id',
      day_reviews: 'id, _dirty, user_id',
      ai_reports: 'id, _dirty, created_at, user_id',
      user_settings: 'id, _dirty, user_id',
      blobs: 'id',
      meta: 'key',
    });
  }
}

let instance: CadenceDB | null = null;

export function db(): CadenceDB {
  if (!instance) instance = new CadenceDB();
  return instance;
}

export const SYNCED_TABLES = ['accounts', 'trades', 'attachments', 'day_reviews', 'ai_reports', 'user_settings'] as const;
export type SyncedTableName = (typeof SYNCED_TABLES)[number];

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db().meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value });
}
