import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Minimal browser globals the sync engine touches.
const g = globalThis as Record<string, unknown>;
g.window = { addEventListener() {}, removeEventListener() {} };
g.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

type Row = Record<string, unknown> & { id: string; updated_at: string };

/** In-memory Supabase stand-in that mimics the migration's sync-guard trigger. */
function fakeSupabase() {
  const tables = new Map<string, Map<string, Row>>();
  const files = new Map<string, Blob>();
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const keyOf = (table: string, r: Row) => (table === 'day_reviews' ? `${r.user_id}:${r.id}` : table === 'user_settings' ? String(r.user_id) : r.id);
  const t = (name: string) => tables.get(name) ?? tables.set(name, new Map()).get(name)!;
  return {
    tables,
    files,
    from(name: string) {
      return {
        async upsert(rows: Row[]) {
          for (const r of rows) {
            const cur = t(name).get(keyOf(name, r));
            if (cur && cur.updated_at > r.updated_at) continue; // stale write ignored (trigger)
            t(name).set(keyOf(name, r), { ...cur, ...r, created_at: cur?.created_at ?? r.created_at, server_updated_at: new Date(++clock).toISOString() });
          }
          return { error: null };
        },
        select() {
          let since = '';
          let limit = 1000;
          const q = {
            gte(_c: string, v: string) {
              since = v;
              return q;
            },
            order() {
              return q;
            },
            limit(n: number) {
              limit = n;
              return Promise.resolve({
                data: [...t(name).values()].filter((r) => String(r.server_updated_at) >= since).sort((a, b) => String(a.server_updated_at).localeCompare(String(b.server_updated_at))).slice(0, limit),
                error: null,
              });
            },
          };
          return q;
        },
      };
    },
    storage: {
      from() {
        return {
          async upload(path: string, blob: Blob) {
            files.set(path, blob);
            return { error: null };
          },
          async download(path: string) {
            return files.has(path) ? { data: files.get(path)!, error: null } : { data: null, error: { message: 'not found' } };
          },
          async remove(paths: string[]) {
            paths.forEach((p) => files.delete(p));
            return { error: null };
          },
        };
      },
    },
  };
}

const UID = '11111111-1111-4111-8111-111111111111';

describe('sync engine (local-first ⇄ Supabase)', async () => {
  const { db } = await import('./db');
  const { sync, prepareForUser, clearLocalData, fetchRemoteBlob } = await import('./sync');
  const repo = await import('./repo');
  const sb = fakeSupabase();

  beforeAll(async () => {
    await clearLocalData();
  });
  afterAll(() => sync.stop());

  it('adopts device-only records on sign-in and pushes them', async () => {
    const t = await repo.saveTrade(repo.blankTrade({ symbol: 'ES', entry_price: 5000, exit_price: 5002, notes: 'from device' }));
    await repo.addAttachment(t.id, new Blob(['png-bytes'], { type: 'image/jpeg' }), { width: 10, height: 10 });
    await repo.setDayReview('2026-11-20', 'no_trades');
    await repo.saveSettings({ setups: ['A+ only'] });
    await prepareForUser(UID);
    repo.setRepoUser(UID);
    await sync.start(sb as never, UID);
    expect(await sync.syncNow()).toBe(true);

    const remote = sb.tables.get('trades')!.get(t.id)!;
    expect(remote.user_id).toBe(UID);
    expect(remote.notes).toBe('from device');
    expect('_dirty' in remote).toBe(false);
    const att = [...sb.tables.get('attachments')!.values()][0];
    expect(att.storage_path).toBe(`${UID}/${t.id}/${att.id}.jpg`);
    expect(sb.files.has(String(att.storage_path))).toBe(true);
    expect(sb.tables.get('day_reviews')!.get(`${UID}:2026-11-20`)?.status).toBe('no_trades');
    expect(sb.tables.get('user_settings')!.get(UID)?.setups).toEqual(['A+ only']);
    expect(await db().trades.where('_dirty').equals(1).count()).toBe(0);
    expect(sync.snapshot.status).toBe('idle');
  });

  it('restores everything on a fresh device (pull)', async () => {
    await clearLocalData();
    expect(await db().trades.count()).toBe(0);
    await sync.syncNow();
    const trades = await db().trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: 'ES', user_id: UID, _dirty: 0 });
    expect(await db().day_reviews.get('2026-11-20')).toBeTruthy();
    const a = (await db().attachments.toArray())[0];
    expect(await db().blobs.get(a.id)).toBeUndefined(); // screenshots download lazily…
    const blob = await fetchRemoteBlob(sb as never, a);
    expect(await blob?.text()).toBe('png-bytes'); // …and are then cached for offline use
    expect(await db().blobs.get(a.id)).toBeTruthy();
  });

  it('resolves conflicts last-write-wins in both directions', async () => {
    const [t] = await db().trades.toArray();
    // Another device edits later on the server…
    const remote = sb.tables.get('trades')!.get(t.id)!;
    sb.tables.get('trades')!.set(t.id, { ...remote, notes: 'newer remote edit', updated_at: '2099-01-01T00:00:00.000Z', server_updated_at: '2099-01-01T00:00:00.000Z' });
    // …while this device holds an older unsynced edit.
    await db().trades.update(t.id, { notes: 'older local edit', updated_at: '2026-06-01T00:00:00.000Z', _dirty: 1 });
    await sync.syncNow();
    expect(sb.tables.get('trades')!.get(t.id)!.notes).toBe('newer remote edit');
    expect((await db().trades.get(t.id))!.notes).toBe('newer remote edit');

    // A newer local edit wins over the server copy.
    await repo.patchTrade(t.id, { notes: 'newest local edit' });
    await db().trades.update(t.id, { updated_at: '2100-01-01T00:00:00.000Z' });
    await sync.syncNow();
    expect(sb.tables.get('trades')!.get(t.id)!.notes).toBe('newest local edit');
  });

  it('propagates deletes as tombstones', async () => {
    const [t] = await db().trades.toArray();
    await repo.deleteTrade(t.id);
    await db().trades.update(t.id, { updated_at: '2101-01-01T00:00:00.000Z' });
    await db().attachments.where('trade_id').equals(t.id).modify({ updated_at: '2101-01-01T00:00:00.000Z' });
    await sync.syncNow();
    expect(sb.tables.get('trades')!.get(t.id)!.deleted_at).toBeTruthy();
    expect(sb.files.size).toBe(0); // the screenshot object was removed from Storage
  });

  it('wipes another user’s data when a different account signs in', async () => {
    await prepareForUser('22222222-2222-4222-8222-222222222222');
    expect(await db().trades.count()).toBe(0);
    expect(await db().blobs.count()).toBe(0);
  });
});
