'use client';

import { ArrowDownUp, PenLine, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, PnlText, TradeRow } from '@/components/trades/parts';
import { Button, Card, Chip, cn, Input, Select, Skeleton } from '@/components/ui/core';
import { useAccounts, useAttachmentCounts, useTrades } from '@/lib/data/repo';
import type { ETrade } from '@/lib/domain/calc';
import { conceptLabel } from '@/lib/domain/questionnaire';
import { formatDayKey } from '@/lib/domain/time';

type Sort = 'newest' | 'oldest' | 'pnl_desc' | 'pnl_asc' | 'r_desc';
type OutcomeFilter = 'all' | 'win' | 'loss' | 'breakeven' | 'open';
type JournalFilter = 'all' | 'unjournaled' | 'journaled';

export default function JournalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Journal />
    </Suspense>
  );
}

function Journal() {
  const params = useSearchParams();
  const router = useRouter();
  const trades = useTrades();
  const accounts = useAccounts();
  const counts = useAttachmentCounts();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [account, setAccount] = useState('all');
  const [symbol, setSymbol] = useState('all');
  const [direction, setDirection] = useState<'all' | 'long' | 'short'>('all');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const journalFilter = (params.get('filter') as JournalFilter) || 'all';
  const setJournalFilter = (f: JournalFilter) => router.replace(f === 'all' ? '/journal' : `/journal?filter=${f}`, { scroll: false });

  const names = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);
  const symbols = useMemo(() => [...new Set((trades ?? []).map((t) => t.symbol))].sort(), [trades]);

  const filtered = useMemo(() => {
    if (!trades) return [];
    const needle = q.trim().toLowerCase();
    const list = trades.filter((t) => {
      if (account !== 'all' && (account === 'none' ? t.account_id : t.account_id !== account)) return false;
      if (symbol !== 'all' && t.symbol !== symbol) return false;
      if (direction !== 'all' && t.direction !== direction) return false;
      if (outcome !== 'all' && t.outcome !== outcome) return false;
      if (journalFilter === 'unjournaled' && t.journal_completed_at) return false;
      if (journalFilter === 'journaled' && !t.journal_completed_at) return false;
      if (needle) {
        const hay = [t.symbol, t.contract, t.setup, t.notes, t.sessionName, t.timeframe, t.market_structure, t.journal?.note, t.account_id ? names.get(t.account_id) : '', ...t.tags, ...t.concepts.map(conceptLabel), t.direction]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: ETrade, b: ETrade) => number> = {
      newest: (a, b) => b.ts - a.ts,
      oldest: (a, b) => a.ts - b.ts,
      pnl_desc: (a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity),
      pnl_asc: (a, b) => (a.net ?? Infinity) - (b.net ?? Infinity),
      r_desc: (a, b) => (b.r ?? -Infinity) - (a.r ?? -Infinity),
    };
    return list.sort(by[sort]);
  }, [trades, q, account, symbol, direction, outcome, journalFilter, sort, names]);

  const groups = useMemo(() => {
    if (sort !== 'newest' && sort !== 'oldest') return null;
    const m = new Map<string, ETrade[]>();
    for (const t of filtered) {
      if (!m.has(t.day)) m.set(t.day, []);
      m.get(t.day)!.push(t);
    }
    return [...m.entries()];
  }, [filtered, sort]);

  const activeFilters = [account !== 'all', symbol !== 'all', direction !== 'all', outcome !== 'all'].filter(Boolean).length;
  const clear = () => {
    setAccount('all');
    setSymbol('all');
    setDirection('all');
    setOutcome('all');
    setQ('');
    setJournalFilter('all');
  };
  const total = filtered.reduce((a, t) => a + (t.net ?? 0), 0);
  const unjournaledCount = (trades ?? []).filter((t) => !t.journal_completed_at).length;

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle={trades ? `${trades.length} trades recorded` : undefined}
        action={
          <>
            <Link href="/journal/new">
              <Button icon={<PenLine className="size-4" />}>Manual</Button>
            </Link>
            <Link href="/analyze">
              <Button variant="primary" icon={<Sparkles className="size-4" />}>
                Analyze
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol, setup, notes, tags…" className="pl-10" aria-label="Search trades" />
          </div>
          <Button onClick={() => setShowFilters((v) => !v)} className={cn('h-auto', showFilters && 'border-violet/40')} icon={<SlidersHorizontal className="size-4" />} aria-expanded={showFilters}>
            <span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 && <span className="num grid size-5 place-items-center rounded-full bg-electric text-[11px] text-white">{activeFilters}</span>}
          </Button>
          <div className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-full w-[52px] pl-9 text-transparent sm:w-auto sm:text-fg">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="pnl_desc">Best P&L</option>
              <option value="pnl_asc">Worst P&L</option>
              <option value="r_desc">Highest R</option>
            </Select>
          </div>
        </div>
        <div className="scroll-x -mx-4 flex gap-2 px-4">
          <Chip selected={journalFilter === 'all'} onClick={() => setJournalFilter('all')}>
            All
          </Chip>
          <Chip selected={journalFilter === 'unjournaled'} onClick={() => setJournalFilter('unjournaled')}>
            Needs journal {unjournaledCount > 0 && <span className="num text-warn">{unjournaledCount}</span>}
          </Chip>
          <Chip selected={journalFilter === 'journaled'} onClick={() => setJournalFilter('journaled')}>
            Journaled
          </Chip>
          <span className="mx-1 w-px shrink-0 bg-white/10" />
          {(['win', 'loss', 'breakeven', 'open'] as const).map((o) => (
            <Chip key={o} selected={outcome === o} onClick={() => setOutcome(outcome === o ? 'all' : o)}>
              {o === 'win' ? 'Wins' : o === 'loss' ? 'Losses' : o === 'breakeven' ? 'Breakeven' : 'Incomplete'}
            </Chip>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
                <Select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="all">All accounts</option>
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="none">No account</option>
                </Select>
                <Select aria-label="Instrument" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  <option value="all">All instruments</option>
                  {symbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Direction" value={direction} onChange={(e) => setDirection(e.target.value as 'all' | 'long' | 'short')}>
                  <option value="all">Long & short</option>
                  <option value="long">Long only</option>
                  <option value="short">Short only</option>
                </Select>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        {(activeFilters > 0 || q || journalFilter !== 'all') && trades && (
          <div className="flex items-center justify-between text-[12.5px] text-mute">
            <span>
              {filtered.length} of {trades.length} trades · <PnlText value={total} className="font-medium" />
            </span>
            <button onClick={clear} className="inline-flex items-center gap-1 text-violet hover:text-violet-soft">
              <X className="size-3.5" /> Clear
            </button>
          </div>
        )}
      </div>

      {!trades ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <Card>
          <EmptyState
            title="No trades yet"
            body="Capture your first trade from a screenshot, or enter it manually."
            action={
              <>
                <Link href="/analyze">
                  <Button variant="primary" icon={<Sparkles className="size-4" />}>
                    Analyze a screenshot
                  </Button>
                </Link>
                <Link href="/journal/new">
                  <Button icon={<PenLine className="size-4" />}>Add manually</Button>
                </Link>
              </>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState compact title="No trades match" body="Try a different search or clear the filters." action={<Button onClick={clear}>Clear filters</Button>} />
        </Card>
      ) : groups ? (
        <div className="space-y-4">
          {groups.map(([day, ts]) => {
            const dayPnl = ts.reduce((a, t) => a + (t.net ?? 0), 0);
            return (
              <Card key={day} className="p-1.5">
                <div className="flex items-center justify-between px-3.5 pb-1 pt-2.5">
                  <span className="text-[12.5px] font-medium text-mute">{formatDayKey(day)}</span>
                  <span className="flex items-center gap-2 text-[12.5px]">
                    <span className="text-faint">{ts.length} trade{ts.length === 1 ? '' : 's'}</span>
                    <PnlText value={dayPnl} className="font-medium" />
                  </span>
                </div>
                {ts.map((t) => (
                  <TradeRow key={t.id} t={t} accountName={t.account_id ? names.get(t.account_id) : undefined} shots={counts.get(t.id)} />
                ))}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-1.5">
          {filtered.map((t) => (
            <TradeRow key={t.id} t={t} showDate accountName={t.account_id ? names.get(t.account_id) : undefined} shots={counts.get(t.id)} />
          ))}
        </Card>
      )}
    </>
  );
}
