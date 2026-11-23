import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface PushRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured = false;
export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@cadence.app', pub, priv);
    configured = true;
  }
  return true;
}

/** Sends to each subscription; removes ones the push service reports as gone. */
export async function sendPush(admin: SupabaseClient, rows: PushRow[], payload: PushPayload): Promise<{ sent: number; removed: number; failed: number }> {
  let sent = 0;
  let removed = 0;
  let failed = 0;
  const body = JSON.stringify({ ...payload, url: payload.url ?? '/journal?filter=unjournaled', tag: payload.tag ?? 'cadence-reminder' });
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, body, { TTL: 4 * 3600, urgency: 'normal' });
        sent++;
        await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failures: 0 }).eq('id', r.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          removed++;
          await admin.from('push_subscriptions').delete().eq('id', r.id);
        } else {
          failed++;
          console.error('[push] send failed', status, (e as Error).message);
        }
      }
    }),
  );
  return { sent, removed, failed };
}
