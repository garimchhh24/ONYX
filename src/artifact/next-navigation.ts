/** `next/navigation` for the claude.ai preview build (aliased by vite.artifact.config.mts). */
import { useMemo, useSyncExternalStore } from 'react';
import { back, forward, getLocation, navigate, subscribe } from './router';

const useLocation = () => useSyncExternalStore(subscribe, getLocation, getLocation);

export function usePathname(): string {
  return useLocation().split('?')[0] || '/';
}

export function useSearchParams(): URLSearchParams {
  const loc = useLocation();
  return useMemo(() => new URLSearchParams(loc.includes('?') ? loc.slice(loc.indexOf('?') + 1) : ''), [loc]);
}

export function useParams(): Record<string, string> {
  return {};
}

type NavOptions = { scroll?: boolean };
const router = {
  push: (href: string, opts?: NavOptions) => navigate(href, { scroll: opts?.scroll !== false }),
  replace: (href: string, opts?: NavOptions) => navigate(href, { replace: true, scroll: opts?.scroll !== false }),
  back,
  forward,
  refresh: () => undefined,
  prefetch: () => undefined,
};

export function useRouter() {
  return router;
}

export function redirect(href: string): never {
  navigate(href, { replace: true });
  throw new Error(`redirect to ${href}`);
}

export function notFound(): never {
  throw new Error('not found');
}
