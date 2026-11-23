/**
 * Where CADENCE is running.
 * - "next": the full app (Next.js server, API routes, PWA).
 * - "artifact": the self-contained preview published on claude.ai — no server; AI runs on the
 *   viewer's own Claude account through the page's `sample` capability, files are saved through
 *   the `downloads` capability, and data stays in the browser.
 */
export const RUNTIME: 'next' | 'artifact' = process.env.NEXT_PUBLIC_CADENCE_RUNTIME === 'artifact' ? 'artifact' : 'next';
export const isArtifactRuntime = RUNTIME === 'artifact';

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

/** Resolve a claude.ai runtime capability, or null when this view can't run it. */
export async function useCapability<T>(name: string): Promise<T | null> {
  const claude = (globalThis as { claude?: ClaudeHost }).claude;
  if (!claude?.use) return null;
  try {
    return ((await claude.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}
