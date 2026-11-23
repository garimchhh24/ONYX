'use client';

import { ArrowDownRight, ArrowUpRight, Camera, ChevronRight, CircleDashed, NotebookPen, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ETrade } from '@/lib/domain/calc';
import { fmtR, money } from '@/lib/domain/format';
import { formatDuration, formatTime } from '@/lib/domain/time';
import { Symbol } from '../brand/Logo';
import { Badge, cn } from '../ui/core';
import { AnimatedNumber } from '../ui/motion';

export function PnlText({ value, className, signed = true, animate }: { value: number | undefined | null; className?: string; signed?: boolean; animate?: boolean }) {
  const toneCls = value === undefined || value === null || Math.abs(value) < 0.005 ? 'text-fg' : value > 0 ? 'text-pos' : 'text-neg';
  if (animate && value !== undefined && value !== null) {
    return <AnimatedNumber value={value} format={(v) => money(v, { signed })} className={cn(toneCls, className)} />;
  }
  return <span className={cn('num', toneCls, className)}>{money(value, { signed })}</span>;
}

export function DirectionBadge({ direction }: { direction: 'long' | 'short' }) {
  return direction === 'long' ? (
    <Badge tone="pos" icon={<ArrowUpRight className="size-3" />}>
      Long
    </Badge>
  ) : (
    <Badge tone="neg" icon={<ArrowDownRight className="size-3" />}>
      Short
    </Badge>
  );
}

export function OutcomeBadge({ t }: { t: ETrade }) {
  if (t.outcome === 'open') return <Badge tone="warn">Incomplete</Badge>;
  if (t.outcome === 'breakeven') return <Badge>Breakeven</Badge>;
  return t.outcome === 'win' ? <Badge tone="pos">Win</Badge> : <Badge tone="neg">Loss</Badge>;
}

export function TradeRow({ t, accountName, shots = 0, showDate }: { t: ETrade; accountName?: string; shots?: number; showDate?: boolean }) {
  const journaled = !!t.journal_completed_at;
  return (
    <Link
      href={`/trade?id=${t.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition hover:border-white/[0.06] hover:bg-white/[0.025] md:px-4"
    >
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border text-[11px] font-semibold tracking-wide',
          t.direction === 'long' ? 'border-pos/20 bg-pos/[0.07] text-pos' : 'border-neg/20 bg-neg/[0.07] text-neg',
        )}
      >
        {t.direction === 'long' ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-semibold tracking-tight">{t.symbol}</span>
          <span className="text-[12px] text-faint">×{t.contracts}</span>
          {t.tags.includes('example') && <Badge className="py-0 text-[10px]">Example</Badge>}
          {t.setup && <span className="hidden truncate text-[12px] text-mute sm:inline">· {t.setup}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-faint">
          <span>{showDate ? `${t.day.slice(5).replace('-', '/')} · ` : ''}{formatTime(t.entry_time)}</span>
          {t.sessionName && <span className="hidden sm:inline">· {t.sessionName}</span>}
          {t.durationMin !== undefined && <span>· {formatDuration(t.durationMin)}</span>}
          {accountName && <span className="hidden truncate md:inline">· {accountName}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="hidden items-center gap-1.5 sm:flex">
          {t.source === 'ai' && <Sparkles className="size-3.5 text-violet/70" aria-label="Captured with AI" />}
          {shots > 0 && <Camera className="size-3.5 text-faint" aria-label={`${shots} screenshots`} />}
          {journaled ? <NotebookPen className="size-3.5 text-violet/70" aria-label="Journal complete" /> : <CircleDashed className="size-3.5 text-warn" aria-label="Journal incomplete" />}
        </div>
        <div className="text-right">
          {t.net !== undefined ? <PnlText value={t.net} className="text-[14.5px] font-semibold" /> : <span className="text-[13px] text-warn">Incomplete</span>}
          <div className="num text-[11.5px] text-faint">{t.r !== undefined ? fmtR(t.r) : t.net !== undefined ? 'no stop' : ''}</div>
        </div>
        <ChevronRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-mute" />
      </div>
    </Link>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'pos' | 'neg' | 'flat';
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('panel flex flex-col gap-2 p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={cn('num text-[22px] font-semibold leading-none tracking-tight', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{value}</div>
      {sub && <div className="text-[12px] text-faint">{sub}</div>}
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action, compact }: { title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-8' : 'py-16')}>
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-electric/25 blur-2xl" />
        <Symbol size={compact ? 44 : 64} variant="outline" className="relative opacity-90" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-mute">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
