import type { SessionDef } from '../types';
import { EXCHANGE_TZ, parseHHMM, zonedParts } from './time';

/** Futures day split by New York time (DST handled by the timezone). */
export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'asia', name: 'Азия', timeZone: EXCHANGE_TZ, start: '18:00', end: '03:00' },
  { id: 'london', name: 'Лондон', timeZone: EXCHANGE_TZ, start: '03:00', end: '08:30' },
  { id: 'premarket', name: 'Премаркет', timeZone: EXCHANGE_TZ, start: '08:30', end: '09:30' },
  { id: 'nyopen', name: 'NY открытие', timeZone: EXCHANGE_TZ, start: '09:30', end: '11:00' },
  { id: 'nylunch', name: 'NY ланч', timeZone: EXCHANGE_TZ, start: '11:00', end: '13:30' },
  { id: 'nyclose', name: 'NY закрытие', timeZone: EXCHANGE_TZ, start: '13:30', end: '16:00' },
  { id: 'after', name: 'После закрытия', timeZone: EXCHANGE_TZ, start: '16:00', end: '18:00' },
];

export const OFF_SESSION = 'Вне сессий';

/** Is the instant inside the session (wall-clock time in the session's own timezone)? */
export function inSession(date: Date | string, s: SessionDef): boolean {
  const p = zonedParts(date, s.timeZone);
  const t = p.hour * 60 + p.minute;
  const start = parseHHMM(s.start);
  const end = parseHHMM(s.end);
  if (start === end) return true;
  return start < end ? t >= start && t < end : t >= start || t < end; // wraps midnight
}

export function detectSessions(date: Date | string, sessions: SessionDef[]): SessionDef[] {
  return sessions.filter((s) => inSession(date, s));
}

/** Session label; overlapping custom sessions are joined ("Лондон + NY"). */
export function sessionLabel(date: Date | string, sessions: SessionDef[]): string {
  const hit = detectSessions(date, sessions);
  return hit.length ? hit.map((s) => s.name).join(' + ') : OFF_SESSION;
}
