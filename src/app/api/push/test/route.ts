import { pushConfigured, sendPush, type PushRow } from '@/lib/push/server';
import { adminClient, userFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends a test notification to the caller's own devices. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = adminClient();
  if (!admin || !pushConfigured()) return Response.json({ error: 'Push is not configured on this server.' }, { status: 503 });
  const { data } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('user_id', user.id);
  if (!data?.length) return Response.json({ error: 'No devices are subscribed.' }, { status: 404 });
  const r = await sendPush(admin, data as PushRow[], { title: 'CADENCE test reminder', body: 'Push notifications are working. Trade with intention.', url: '/', tag: 'cadence-test' });
  return Response.json(r);
}
