'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDayReviews, useRawTrades, useSettings } from '@/lib/data/repo';
import { isDue, journalStatus, reminderMessage } from '@/lib/domain/reminders';
import { dayKey } from '@/lib/domain/time';
import { showLocalNotification } from '@/lib/push/client';

/**
 * In-app evening reminder. Covers devices without server push (device-only mode,
 * browsers without Web Push). Skipped when this device already receives server push,
 * so the reminder never arrives twice.
 */
export function ReminderScheduler() {
  const settings = useSettings();
  const trades = useRawTrades();
  const reviews = useDayReviews();
  const state = useRef({ settings, trades, reviews });
  state.current = { settings, trades, reviews };

  const tick = useCallback(async () => {
    const { settings: s, trades: ts, reviews: rv } = state.current;
    if (!s.reminder.enabled || !ts) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      if (localStorage.getItem('cadence-push') === '1') return;
    } catch {
      /* ignore */
    }
    const now = new Date();
    const tz = s.reminder.timezone;
    if (!isDue(now, tz, s.reminder.time, 15)) return;
    const key = `cadence-reminded:${dayKey(now, tz)}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    const decision = reminderMessage(journalStatus(ts, rv, now, tz));
    if (!decision.send) return;
    try {
      if (await showLocalNotification(decision.title, decision.body)) localStorage.setItem(key, '1');
    } catch {
      /* notification blocked by the platform */
    }
  }, []);

  // Re-check once journal data and settings have loaded or changed…
  const loaded = trades !== undefined;
  useEffect(() => {
    if (loaded) void tick();
  }, [loaded, settings.reminder, tick]);
  // …and every 30 seconds while CADENCE is open or backgrounded.
  useEffect(() => {
    const t = setInterval(() => void tick(), 30_000);
    return () => clearInterval(t);
  }, [tick]);
  return null;
}
