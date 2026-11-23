import { dayKey, parseHHMM, zonedParts } from './time';

/**
 * Evening reminder decision — shared by the in-app scheduler and the push cron,
 * so both agree on when journaling counts as incomplete.
 */

export interface ReminderTrade {
  entry_time: string | null;
  exit_time: string | null;
  created_at: string;
  journal_completed_at: string | null;
  deleted_at: string | null;
}

export interface ReminderReview {
  id: string;
  status: 'no_trades' | 'complete';
  deleted_at: string | null;
}

export interface DayJournalStatus {
  day: string;
  tradesToday: number;
  unjournaled: number;
  review: 'no_trades' | 'complete' | null;
  complete: boolean;
  isWeekend: boolean;
}

export function journalStatus(trades: ReminderTrade[], reviews: ReminderReview[], now: Date, timeZone: string): DayJournalStatus {
  const day = dayKey(now, timeZone);
  const today = trades.filter((t) => !t.deleted_at && dayKey(t.entry_time ?? t.exit_time ?? t.created_at, timeZone) === day);
  const unjournaled = today.filter((t) => !t.journal_completed_at).length;
  const review = reviews.find((r) => r.id === day && !r.deleted_at)?.status ?? null;
  const isWeekend = zonedParts(now, timeZone).weekday >= 5;
  const complete = unjournaled === 0 && (today.length > 0 || review !== null || isWeekend);
  return { day, tradesToday: today.length, unjournaled, review, complete, isWeekend };
}

/** true when local time is within [reminder time, reminder time + window). */
export function isDue(now: Date, timeZone: string, time: string, windowMinutes = 15): boolean {
  const p = zonedParts(now, timeZone);
  const t = p.hour * 60 + p.minute;
  const start = parseHHMM(time);
  return t >= start && t < start + windowMinutes;
}

/** Has the reminder time already passed today (local)? */
export function isPast(now: Date, timeZone: string, time: string): boolean {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute >= parseHHMM(time);
}

export interface ReminderDecision {
  send: boolean;
  reason: string;
  title: string;
  body: string;
}

export function reminderMessage(s: DayJournalStatus): ReminderDecision {
  if (s.complete) return { send: false, reason: 'complete', title: '', body: '' };
  if (s.unjournaled > 0) {
    return {
      send: true,
      reason: 'unjournaled',
      title: 'Finish today’s journal',
      body: `${s.unjournaled} trade${s.unjournaled === 1 ? '' : 's'} from today still need${s.unjournaled === 1 ? 's' : ''} a 30-second review.`,
    };
  }
  return {
    send: true,
    reason: 'no_entries',
    title: 'Close out your trading day',
    body: 'Log today’s trades — or mark it as a no-trade day — while it’s fresh.',
  };
}
