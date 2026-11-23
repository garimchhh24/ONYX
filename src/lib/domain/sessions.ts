import { EXCHANGE_TZ, parseHHMM, zonedParts } from './time';

/** Futures day partitioned by New York time (DST handled by the zone). */
export const SESSIONS = [
  { id: 'asia', name: 'Asia', start: '18:00', end: '02:00' },
  { id: 'london', name: 'London', start: '02:00', end: '07:00' },
  { id: 'premarket', name: 'NY Pre-market', start: '07:00', end: '09:30' },
  { id: 'nyam', name: 'NY AM', start: '09:30', end: '11:30' },
  { id: 'lunch', name: 'NY Lunch', start: '11:30', end: '13:30' },
  { id: 'nypm', name: 'NY PM', start: '13:30', end: '16:00' },
  { id: 'after', name: 'After hours', start: '16:00', end: '18:00' },
] as const;

export const SESSION_NAMES: string[] = SESSIONS.map((s) => s.name);

export function sessionFor(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const p = zonedParts(d, EXCHANGE_TZ);
  const t = p.hour * 60 + p.minute;
  for (const s of SESSIONS) {
    const a = parseHHMM(s.start);
    const b = parseHHMM(s.end);
    if (a < b ? t >= a && t < b : t >= a || t < b) return s.name;
  }
  return null;
}
