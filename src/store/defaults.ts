import type { Account, Cashflow, Settings, Trade } from '../types';
import { DEFAULT_INSTRUMENTS } from '../lib/instruments';
import { DEFAULT_SESSIONS } from '../lib/sessions';
import { EXCHANGE_TZ } from '../lib/time';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  instruments: DEFAULT_INSTRUMENTS,
  sessions: DEFAULT_SESSIONS,
  statsTimeZone: EXCHANGE_TZ,
  setups: ['Пробой', 'Ретест', 'Ложный пробой', 'Откат по тренду', 'Разворот от уровня', 'ORB', 'FVG', 'VWAP'],
  mistakes: ['Ранний вход', 'Погоня за ценой', 'Сдвинул стоп', 'Рано закрыл', 'Без стопа', 'Месть рынку', 'Превысил объём', 'Против тренда', 'Овертрейдинг', 'Вход на новостях'],
  emotions: ['Спокойствие', 'Уверенность', 'Страх', 'Жадность', 'FOMO', 'Злость', 'Скука', 'Усталость'],
  discipline: { maxTradesPerDay: 3, maxLossesPerDay: 2 },
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Fill gaps in stored records (older versions, partial imports). */
export function normalizeTrade(raw: Record<string, unknown>): Trade {
  const t = raw as unknown as Trade;
  return {
    ...t,
    accountIds: arr<string>(t.accountIds),
    mistakes: arr<string>(t.mistakes),
    analyses: arr(t.analyses),
    contracts: Number(t.contracts) || 1,
    mode: t.mode ?? 'prices',
    direction: t.direction === 'short' ? 'short' : 'long',
    symbol: String(t.symbol ?? '').toUpperCase(),
    source: t.source ?? 'manual',
  };
}

export function normalizeAccount(raw: Record<string, unknown>): Account {
  const a = raw as unknown as Account;
  return { ...a, drawdownLock: Number(a.drawdownLock) || 0, drawdownType: a.drawdownType ?? 'eod', status: a.status ?? 'active', phase: a.phase ?? 'eval' };
}

export function normalizeCashflow(raw: Record<string, unknown>): Cashflow {
  return raw as unknown as Cashflow;
}

export function normalizeSettings(raw: Record<string, unknown> | undefined): Settings {
  const s = (raw ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    id: 'settings',
    instruments: s.instruments?.length ? s.instruments : DEFAULT_SETTINGS.instruments,
    sessions: s.sessions?.length ? s.sessions : DEFAULT_SETTINGS.sessions,
    discipline: { ...(s.discipline ?? DEFAULT_SETTINGS.discipline) },
  };
}

/** JSON round-trip: drops undefined fields, unfreezes snapshot objects. */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
