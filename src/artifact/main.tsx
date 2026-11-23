/**
 * CADENCE preview for claude.ai: the same screens and logic as the Next.js app, bundled into
 * one page. Routing is in-memory, AI runs through the page's `sample` capability, files are
 * saved through `downloads`, and data lives in this browser (in memory if storage is blocked).
 */
import '@/app/globals.css';
import { Component, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import AppLayout from '@/app/(app)/layout';
import Template from '@/app/(app)/template';
import Accounts from '@/app/(app)/accounts/page';
import Analytics from '@/app/(app)/analytics/page';
import Analyze from '@/app/(app)/analyze/page';
import Brand from '@/app/(app)/brand/page';
import CalendarPage from '@/app/(app)/calendar/page';
import NewTrade from '@/app/(app)/journal/new/page';
import Journal from '@/app/(app)/journal/page';
import Dashboard from '@/app/(app)/page';
import Settings from '@/app/(app)/settings/page';
import EditTrade from '@/app/(app)/trade/edit/page';
import Trade from '@/app/(app)/trade/page';
import NotFound from '@/app/not-found';
import { Providers } from '@/components/providers/Providers';
import { setDatabaseImplementation } from '@/lib/data/db';
import { seedExamplesIfNeeded } from './examples';
import { usePathname } from './next-navigation';
import { PreviewBanner, setMemoryOnly } from './PreviewBanner';

const ROUTES: Record<string, ComponentType> = {
  '/': Dashboard,
  '/journal': Journal,
  '/journal/new': NewTrade,
  '/trade': Trade,
  '/trade/edit': EditTrade,
  '/analyze': Analyze,
  '/analytics': Analytics,
  '/calendar': CalendarPage,
  '/settings': Settings,
  '/accounts': Accounts,
  '/brand': Brand,
};

function Router() {
  const path = usePathname();
  const Page = ROUTES[path];
  if (!Page) return <NotFound />;
  return (
    <AppLayout>
      <PreviewBanner />
      <Template key={path}>
        <Page />
      </Template>
    </AppLayout>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="eyebrow mb-3">Something went wrong</div>
          <p className="text-[14px] text-mute">{this.state.error.message}</p>
          <button type="button" className="mt-5 text-[14px] font-medium text-violet" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

/** Is IndexedDB usable in this view? (It can be blocked in private windows, previews and thumbnails.) */
async function storageWorks(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      const req = indexedDB.open('cadence-probe');
      req.onsuccess = () => {
        clearTimeout(timer);
        req.result.close();
        try {
          indexedDB.deleteDatabase('cadence-probe');
        } catch {
          /* ignore */
        }
        resolve(true);
      };
      req.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

async function boot() {
  document.documentElement.dataset.runtime = 'artifact';
  document.documentElement.lang = 'en';
  if (!(await storageWorks())) {
    const fake = await import('fake-indexeddb');
    setDatabaseImplementation({ indexedDB: fake.indexedDB as unknown as IDBFactory, IDBKeyRange: fake.IDBKeyRange as unknown as typeof IDBKeyRange });
    setMemoryOnly(true);
  }
  try {
    await seedExamplesIfNeeded();
  } catch (e) {
    console.warn('[cadence] example data was not loaded', e);
  }
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <Providers>
        <Router />
      </Providers>
    </ErrorBoundary>,
  );
}

void boot();
