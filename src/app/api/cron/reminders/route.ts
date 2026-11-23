import { isDue, journalStatus, reminderMessage, type ReminderReview, type ReminderTrade } from '@/lib/domain/reminders';
import { dayKey, isValidTimeZone } from '@/lib/domain/time';
import { pushConfigured, sendPush, type PushRow } from '@/lib/push/server';
import { adminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Evening reminder job. Run every 15 minutes (vercel.json cron, Supabase pg_cron + pg_net,
 * or any scheduler) with `Authorization: Bearer $CRON_SECRET`. Each user is reminded at most
 * once per local day, only inside the window after their configured time, and only when
 * today's journal is incomplete.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = adminClient();
  if (!admin || !pushConfigured()) return Response.json({ error: 'Push or Supabase service role not configured.' }, { status: 503 });

  const now = new Date();
  const windowMin = Number(process.env.REMINDER_WINDOW_MINUTES) || 30;
  const summary = { users: 0, due: 0, sent: 0, complete: 0, alreadySent: 0, removed: 0, failed: 0 };

  const subs: PushRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').range(from, from + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    subs.push(...((data ?? []) as PushRow[]));
    if (!data || data.length < 1000) break;
  }
  const byUser = new Map<string, PushRow[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  summary.users = byUser.size;

  const ids = [...byUser.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: settings }, { data: logs }] = await Promise.all([
      admin.from('user_settings').select('user_id,reminder').in('user_id', chunk),
      admin.from('reminder_log').select('user_id,last_sent_day').in('user_id', chunk),
    ]);
    const sentDay = new Map((logs ?? []).map((l) => [l.user_id as string, l.last_sent_day as string]));
    for (const uid of chunk) {
      const rem = (settings ?? []).find((s) => s.user_id === uid)?.reminder as { enabled?: boolean; time?: string; timezone?: string } | undefined;
      const tz = rem?.timezone && isValidTimeZone(rem.timezone) ? rem.timezone : 'UTC';
      const time = rem?.time && /^\d{2}:\d{2}$/.test(rem.time) ? rem.time : '20:30';
      if (rem && rem.enabled === false) continue;
      if (!isDue(now, tz, time, windowMin)) continue;
      summary.due++;
      const today = dayKey(now, tz);
      if (sentDay.get(uid) === today) {
        summary.alreadySent++;
        continue;
      }
      const since = new Date(now.getTime() - 48 * 3600_000).toISOString();
      const [{ data: trades }, { data: reviews }] = await Promise.all([
        admin
          .from('trades')
          .select('entry_time,exit_time,created_at,journal_completed_at,deleted_at')
          .eq('user_id', uid)
          .is('deleted_at', null)
          .or(`entry_time.gte."${since}",created_at.gte."${since}"`),
        admin.from('day_reviews').select('id,status,deleted_at').eq('user_id', uid).eq('id', today),
      ]);
      const decision = reminderMessage(journalStatus((trades ?? []) as ReminderTrade[], (reviews ?? []) as ReminderReview[], now, tz));
      if (!decision.send) {
        summary.complete++;
        continue;
      }
      const r = await sendPush(admin, byUser.get(uid)!, { title: decision.title, body: decision.body });
      summary.sent += r.sent;
      summary.removed += r.removed;
      summary.failed += r.failed;
      if (r.sent > 0) await admin.from('reminder_log').upsert({ user_id: uid, last_sent_day: today, last_sent_at: now.toISOString() });
    }
  }
  return Response.json({ ok: true, at: now.toISOString(), ...summary });
}
