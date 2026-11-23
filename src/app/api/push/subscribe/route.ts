import { z } from 'zod';
import { pushConfigured } from '@/lib/push/server';
import { adminClient, userFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Sub = z.object({
  endpoint: z.string().url().startsWith('https://').max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

/** Registers this device for evening reminders. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: 'Sign in to enable push reminders.' }, { status: 401 });
  const admin = adminClient();
  if (!admin || !pushConfigured()) return Response.json({ error: 'Push is not configured on this server.' }, { status: 503 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid push subscription.' }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  // An endpoint belongs to one browser profile; re-bind it to whoever is signed in now.
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
  const { error } = await admin.from('push_subscriptions').insert({
    user_id: user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  if (error) return Response.json({ error: 'Could not save the subscription.' }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ ok: true });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', user.id);
  return Response.json({ ok: true });
}
