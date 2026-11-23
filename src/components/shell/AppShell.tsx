'use client';

import { BookOpen, CalendarDays, ChartNoAxesCombined, Cloud, CloudOff, LayoutDashboard, LoaderCircle, Plus, Settings, Smartphone, Sparkles, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useSyncState } from '@/lib/hooks/useSync';
import { Lockup, Symbol } from '../brand/Logo';
import { cn } from '../ui/core';
import { ReminderScheduler } from './ReminderScheduler';

export const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function SyncBadge({ compact }: { compact?: boolean }) {
  const { enabled, user } = useAuth();
  const s = useSyncState();
  if (!enabled || !user) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-faint" title="Data is stored on this device">
        <Smartphone className="size-3.5" /> {!compact && 'On this device'}
      </span>
    );
  }
  const map = {
    syncing: { icon: <LoaderCircle className="size-3.5 animate-spin text-violet" />, text: 'Syncing…' },
    idle: { icon: <Cloud className="size-3.5 text-pos" />, text: s.pending ? `${s.pending} pending` : 'Synced' },
    offline: { icon: <CloudOff className="size-3.5 text-warn" />, text: s.pending ? `Offline · ${s.pending} pending` : 'Offline' },
    error: { icon: <TriangleAlert className="size-3.5 text-neg" />, text: 'Sync error' },
    disabled: { icon: <Cloud className="size-3.5 text-faint" />, text: 'Connecting…' },
  }[s.status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-mute" title={s.error ?? map.text}>
      {map.icon} {!compact && map.text}
    </span>
  );
}

function Sidebar() {
  const path = usePathname();
  const { user } = useAuth();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,19,27,0.85),rgba(11,11,15,0.92))] px-4 py-6 backdrop-blur-xl md:flex">
      <Link href="/" className="mb-8 px-2" aria-label="CADENCE home">
        <Lockup size="sm" tagline />
      </Link>
      <Link
        href="/analyze"
        className="group relative mb-6 flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#9b45f0,#8a2be2_45%,#6a1fc4)] text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_30px_-10px_rgba(138,43,226,0.8)] transition hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_12px_36px_-8px_rgba(138,43,226,0.95)]"
      >
        <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.25),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
        <Sparkles className="size-4" /> Analyze trade
      </Link>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV.map((n) => {
          const active = isActive(path, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors', active ? 'text-fg' : 'text-mute hover:bg-white/[0.035] hover:text-fg')}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl border border-white/[0.07] bg-[linear-gradient(90deg,rgba(138,43,226,0.22),rgba(138,43,226,0.04))]"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                >
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-violet shadow-[0_0_12px_#b46aff]" />
                </motion.span>
              )}
              <Icon className={cn('relative size-[18px]', active && 'text-violet')} strokeWidth={1.8} />
              <span className="relative">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 px-2">
        <div className="hairline" />
        <SyncBadge />
        {user?.email && <div className="truncate text-[12px] text-faint">{user.email}</div>}
      </div>
    </aside>
  );
}

function BottomNav() {
  const path = usePathname();
  const items = [NAV[0], NAV[1], null, NAV[2], NAV[3], NAV[4]];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[rgba(11,11,15,0.94)] pb-[var(--safe-bottom)] backdrop-blur-2xl md:hidden"
    >
      <div className="mx-auto grid h-[62px] max-w-lg grid-cols-6 items-center px-1">
        {items.map((n, i) => {
          if (!n) {
            return (
              <div key="fab" className="flex justify-center">
                <Link
                  href="/analyze"
                  aria-label="Analyze a trade"
                  className="-mt-7 grid size-[54px] place-items-center rounded-[18px] bg-[linear-gradient(135deg,#a052f2,#8a2be2_50%,#5d1bb0)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_0_4px_rgba(11,11,15,1),0_10px_30px_-6px_rgba(138,43,226,0.9)] transition active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.2} />
                </Link>
              </div>
            );
          }
          const active = isActive(path, n.href);
          const Icon = n.icon;
          return (
            <Link key={i} href={n.href} aria-current={active ? 'page' : undefined} className="relative flex h-full flex-col items-center justify-center gap-1">
              {active && <motion.span layoutId="bottom-active" className="absolute top-0 h-[2px] w-7 rounded-full bg-violet shadow-[0_0_10px_#b46aff]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icon className={cn('size-[21px] transition-colors', active ? 'text-fg' : 'text-faint')} strokeWidth={active ? 2 : 1.7} />
              <span className={cn('text-[10px] font-medium tracking-wide transition-colors', active ? 'text-fg' : 'text-faint')}>{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-[rgba(11,11,15,0.75)] pt-[var(--safe-top)] backdrop-blur-2xl md:hidden">
      <div className="flex h-12 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="CADENCE home">
          <Symbol size={26} />
          <span className="font-display text-[13px] font-semibold tracking-[0.32em] text-chrome">CADENCE</span>
        </Link>
        <SyncBadge compact />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Sidebar />
      <MobileTopBar />
      <ReminderScheduler />
      <main className="min-h-dvh pb-[calc(84px+var(--safe-bottom))] md:pb-10 md:pl-[248px]">
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-5 md:px-8 md:pt-8">{children}</div>
      </main>
      <BottomNav />
    </>
  );
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-mute">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
