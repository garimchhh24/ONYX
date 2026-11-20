import type { SessionDef } from '../types';
import { parseHHMM, zonedParts } from './time';

export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'asia', name: 'Азия', timeZone: 'Asia/Tokyo', start: '09:00', end: '18:00' },
  { id: 'london', name: 'Лондон', timeZone: 'Europe/London', start: '08:00', end: '17:00' },
  { id: 'newyork', name: 'Нью-Йорк', timeZone: 'America/New_York', start: '08:00', end: '17:00' },
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

/** All sessions active at the instant, in definition order. */
export function detectSessions(date: Date | string, sessions: SessionDef[]): SessionDef[] {
  return sessions.filter((s) => inSession(date, s));
}

/** Human label: single session, overlap ("Лондон + Нью-Йорк") or off-session. */
export function sessionLabel(date: Date | string, sessions: SessionDef[]): string {
  const hit = detectSessions(date, sessions);
  return hit.length ? hit.map((s) => s.name).join(' + ') : OFF_SESSION;
}
