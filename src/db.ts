import Dexie, { type Table } from 'dexie';
import type { Settings, Trade } from './types';
import { DEFAULT_SESSIONS } from './lib/sessions';
import { localTimeZone } from './lib/time';

class JournalDB extends Dexie {
  trades!: Table<Trade, string>;
  settings!: Table<Settings, string>;
  constructor() {
    super('onyx-journal');
    this.version(1).stores({
      trades: 'id, entryTime, exitTime, symbol, setup, externalId, account',
      settings: 'id',
    });
  }
}

export const db = new JournalDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: 'USD',
  startingBalance: 10000,
  displayTimeZone: localTimeZone(),
  sessions: DEFAULT_SESSIONS,
  setups: ['Пробой', 'Ретест', 'Ложный пробой', 'Отбой от уровня', 'Тренд / откат', 'Order Block', 'FVG', 'Liquidity sweep'],
  mistakes: ['Ранний вход', 'Поздний вход', 'Сдвинул стоп', 'Рано закрыл', 'Без стопа', 'FOMO', 'Месть рынку', 'Превышен риск', 'Против тренда', 'Овертрейдинг'],
  emotions: ['Спокойствие', 'Уверенность', 'Страх', 'Жадность', 'FOMO', 'Раздражение', 'Усталость', 'Эйфория'],
  maxRiskPercent: 1,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveTrade(t: Trade) {
  await db.trades.put({ ...t, updatedAt: new Date().toISOString() });
}

/** Adds imported trades, skipping ones already present (same externalId). */
export async function addImported(trades: Trade[]): Promise<{ added: number; duplicates: number }> {
  const existing = new Set((await db.trades.toArray()).map((t) => t.externalId).filter(Boolean));
  const fresh = trades.filter((t) => !t.externalId || !existing.has(t.externalId));
  await db.trades.bulkPut(fresh);
  return { added: fresh.length, duplicates: trades.length - fresh.length };
}

export async function exportBackup(): Promise<string> {
  const [trades, settings] = await Promise.all([db.trades.toArray(), db.settings.toArray()]);
  return JSON.stringify({ app: 'onyx-journal', version: 1, exportedAt: new Date().toISOString(), trades, settings }, null, 2);
}

export async function importBackup(json: string): Promise<number> {
  const data = JSON.parse(json);
  if (!Array.isArray(data.trades)) throw new Error('Неверный файл резервной копии');
  await db.transaction('rw', db.trades, db.settings, async () => {
    await db.trades.bulkPut(data.trades);
    if (Array.isArray(data.settings) && data.settings[0]) await db.settings.put(data.settings[0]);
  });
  return data.trades.length;
}
