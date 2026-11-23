/** Public Supabase config — inlined at build time. Empty values = device-only mode. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const SCREENSHOT_BUCKET = 'screenshots';
