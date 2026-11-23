/** The preview has no cloud accounts; this stands in for @supabase/supabase-js so it isn't bundled. */
export function createClient(): never {
  throw new Error('Cloud accounts are not available in the CADENCE preview.');
}
