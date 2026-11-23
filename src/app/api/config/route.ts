import { NextResponse } from 'next/server';
import { aiConfigured, aiModel, anonymousAiAllowed } from '@/lib/ai/config';
import { supabaseEnabled } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/** Feature availability for the client — never returns secrets. */
export async function GET() {
  const ai = aiConfigured();
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
  const pushReady = Boolean(vapid && process.env.VAPID_PRIVATE_KEY && supabaseEnabled && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return NextResponse.json(
    {
      ai: ai && (supabaseEnabled || anonymousAiAllowed()),
      aiAccess: !ai ? 'disabled' : supabaseEnabled ? 'user' : anonymousAiAllowed() ? 'anonymous' : 'disabled',
      model: ai ? aiModel() : null,
      supabase: supabaseEnabled,
      push: pushReady,
      vapidPublicKey: pushReady ? vapid : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
