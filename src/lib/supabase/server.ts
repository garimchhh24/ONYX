import 'server-only';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseEnabled } from './env';

/** Verifies the caller's Supabase access token (Authorization: Bearer …). */
export async function userFromRequest(req: Request): Promise<User | null> {
  if (!supabaseEnabled) return null;
  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** Service-role client for trusted server jobs (reminder cron). Bypasses RLS — never expose. */
export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseEnabled || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
