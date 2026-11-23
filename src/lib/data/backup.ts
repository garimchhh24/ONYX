'use client';

import { z } from 'zod';
import { db, SYNCED_TABLES, type SyncedTableName } from './db';
import { base64ToBlob, blobToBase64 } from './images';
import { sync } from './sync';

/** Full JSON backup of the journal (optionally with screenshots) and a merge-restore. */

export const BACKUP_VERSION = 1;

const BackupSchema = z.object({
  app: z.literal('cadence'),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exported_at: z.string(),
  tables: z.object({
    accounts: z.array(z.record(z.string(), z.unknown())).default([]),
    trades: z.array(z.record(z.string(), z.unknown())).default([]),
    attachments: z.array(z.record(z.string(), z.unknown())).default([]),
    day_reviews: z.array(z.record(z.string(), z.unknown())).default([]),
    ai_reports: z.array(z.record(z.string(), z.unknown())).default([]),
    user_settings: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  images: z.array(z.object({ id: z.string(), mime: z.string(), data: z.string() })).optional(),
});

export async function exportBackup(includeImages: boolean): Promise<Blob> {
  const tables: Record<string, unknown[]> = {};
  for (const t of SYNCED_TABLES) {
    const rows = await db()[t].toArray();
    tables[t] = rows.map((r) => {
      const { _dirty: _d, ...rest } = r as unknown as Record<string, unknown>;
      void _d;
      return rest;
    });
  }
  const images: { id: string; mime: string; data: string }[] = [];
  if (includeImages) {
    for (const b of await db().blobs.toArray()) images.push({ id: b.id, mime: b.blob.type || 'image/jpeg', data: await blobToBase64(b.blob) });
  }
  const payload = { app: 'cadence', version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables, ...(includeImages ? { images } : {}) };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export interface RestoreResult {
  added: number;
  updated: number;
  skipped: number;
  images: number;
}

/** Merge a backup into this device: newer edits win, nothing is deleted. */
export async function restoreBackup(file: Blob, userId: string | null): Promise<RestoreResult> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a valid CADENCE backup (invalid JSON).');
  }
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) throw new Error('This file is not a CADENCE backup or was made by a newer version.');
  const res: RestoreResult = { added: 0, updated: 0, skipped: 0, images: 0 };
  const d = db();
  await d.transaction('rw', [...SYNCED_TABLES.map((t) => d[t]), d.blobs], async () => {
    for (const t of SYNCED_TABLES as readonly SyncedTableName[]) {
      for (const raw of parsed.data.tables[t]) {
        const row = raw as { id?: unknown; updated_at?: unknown };
        if (typeof row.id !== 'string' || typeof row.updated_at !== 'string') {
          res.skipped++;
          continue;
        }
        const cur = (await d[t].get(row.id)) as { updated_at: string } | undefined;
        if (cur && cur.updated_at >= row.updated_at) {
          res.skipped++;
          continue;
        }
        await d[t].put({ ...(raw as object), user_id: userId, _dirty: 1 } as never);
        if (cur) res.updated++;
        else res.added++;
      }
    }
    for (const img of parsed.data.images ?? []) {
      if (await d.blobs.get(img.id)) continue;
      await d.blobs.put({ id: img.id, blob: base64ToBlob(img.data, img.mime) });
      res.images++;
    }
  });
  // Screenshots restored from the file are re-uploaded under the current account.
  const restoredImages = (parsed.data.images ?? []).map((i) => i.id);
  if (userId && restoredImages.length) {
    await d.attachments
      .where('id')
      .anyOf(restoredImages)
      .filter((a) => !a.storage_path || !a.storage_path.startsWith(`${userId}/`))
      .modify({ storage_path: null, _dirty: 1 } as never);
  }
  sync.request(0);
  return res;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
