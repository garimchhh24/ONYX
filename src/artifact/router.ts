/**
 * In-memory router for the claude.ai preview. claude.ai pages only pass plain `#name` hashes and
 * reserve some names, so navigation stays inside the page instead of the URL.
 */
type Listener = () => void;

let current = '/';
let stack: string[] = ['/'];
let index = 0;
const listeners = new Set<Listener>();

export const getLocation = () => current;

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function emit() {
  for (const l of listeners) l();
}

export function normalize(href: string): string {
  try {
    const u = new URL(href, `https://cadence.local${current}`);
    return (u.pathname || '/') + u.search;
  } catch {
    return '/';
  }
}

export function navigate(href: string, opts: { replace?: boolean; scroll?: boolean } = {}) {
  const next = normalize(href);
  if (opts.replace) stack[index] = next;
  else {
    stack = stack.slice(0, index + 1);
    stack.push(next);
    index = stack.length - 1;
  }
  current = next;
  emit();
  if (opts.scroll !== false) window.scrollTo({ top: 0 });
}

export function back() {
  if (index === 0) return;
  index--;
  current = stack[index];
  emit();
  window.scrollTo({ top: 0 });
}

export function forward() {
  if (index >= stack.length - 1) return;
  index++;
  current = stack[index];
  emit();
}
