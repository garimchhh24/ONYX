'use client';

import { ChevronLeft, ChevronRight, MoonStar } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/AppShell';
import { PnlText, TradeRow } from '@/components/trades/parts';
import { Button, Card, cn, IconButton, Segmented, Skeleton } from '@/components/ui/core';
import { Sheet } from '@/components/ui/overlay';
import { setDayReview, useAccounts, useAttachmentCounts, useDayReviews, useTrades } from '@/lib/data/repo';
import type { ETrade } from '@/lib/domain/calc';
import { fmtPct, money, moneyShort } from '@/lib/domain/format';
import { addDaysKey, formatDayKey, MONTHS, weekdayOfKey } from '@/lib/domain/time';
import { useToday } from '@/lib/hooks/useToday';

interface DayCell {
  key: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export default function CalendarPage() {
  const all = useTrades();
  const accounts = useAccounts();
  const reviews = useDayReviews();
  const counts = useAttachmentCounts();
  const today = useToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [accountId, setAccountId] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [dir, setDir] = useState(1);

  const trades = useMemo(() => (all ?? []).filter((t) => t.net !== undefined && (accountId === 'all' || t.account_id === accountId)), [all, accountId]);
  const byDay = useMemo(() => {
    const m = new Map<string, DayCell & { list: ETrade[] }>();
    for (const t of trades) {
      const c = m.get(t.day) ?? { key: t.day, pnl: 0, trades: 0, wins: 0, losses: 0, list: [] };
      c.pnl += t.net!;
      c.trades++;
      if (t.outcome === 'win') c.wins++;
      if (t.outcome === 'loss') c.losses++;
      c.list.push(t);
      m.set(t.day, c);
    }
    return m;
  }, [trades]);

  const [y, mo] = month.split('-').map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = weekdayOfKey(first);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDaysKey(first, i))];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  const monthDays = [...byDay.values()].filter((d) => d.key.startsWith(month));
  const mPnl = monthDays.reduce((a, d) => a + d.pnl, 0);
  const mTrades = monthDays.reduce((a, d) => a + d.trades, 0);
  const mWins = monthDays.reduce((a, d) => a + d.wins, 0);
  const mLosses = monthDays.reduce((a, d) => a + d.losses, 0);
  const winDays = monthDays.filter((d) => d.pnl > 0.004).length;
  const lossDays = monthDays.filter((d) => d.pnl < -0.004).length;
  const best = monthDays.length ? Math.max(...monthDays.map((d) => d.pnl)) : 0;
  const maxAbs = Math.max(1, ...monthDays.map((d) => Math.abs(d.pnl)));
  const names = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  const shift = (n: number) => {
    setDir(n);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  if (!all) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;

  const sel = selected ? byDay.get(selected) : undefined;
  const selReview = selected ? reviews.find((r) => r.id === selected) : undefined;

  return (
    <>
      <PageHeader
        title="Calendar"
        action={
          (accounts?.length ?? 0) > 0 && (
            <select aria-label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="field h-10 w-auto py-0 text-sm">
              <option value="all">All accounts</option>
              {accounts!.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden p-3 md:p-5">
          <div className="mb-4 flex items-center justify-between px-1">
            <IconButton label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <div className="text-center">
              <div className="font-display text-lg font-semibold tracking-tight">
                {MONTHS[mo - 1]} {y}
              </div>
              <PnlText value={mPnl} className="text-[13px] font-medium" />
            </div>
            <IconButton label="Next month" onClick={() => shift(1)}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
          <div className="grid grid-cols-7 gap-1 pb-1.5 md:grid-cols-[repeat(7,1fr)_88px] md:gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="eyebrow text-center text-[9.5px]">
                {d}
              </div>
            ))}
            <div className="eyebrow hidden text-center text-[9.5px] md:block">Week</div>
          </div>
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={month} custom={dir} initial={{ opacity: 0, x: dir * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -30 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-1 md:space-y-1.5">
              {weeks.map((week, wi) => {
                const wDays = week.filter(Boolean).map((k) => byDay.get(k!)).filter(Boolean) as DayCell[];
                const wPnl = wDays.reduce((a, d) => a + d.pnl, 0);
                return (
                  <div key={wi} className="grid grid-cols-7 gap-1 md:grid-cols-[repeat(7,1fr)_88px] md:gap-1.5">
                    {week.map((k, di) => {
                      if (!k) return <div key={di} className="aspect-square md:aspect-[1.15]" />;
                      const d = byDay.get(k);
                      const review = reviews.find((r) => r.id === k);
                      const intensity = d ? 0.12 + 0.5 * (Math.abs(d.pnl) / maxAbs) : 0;
                      const isToday = k === today;
                      return (
                        <motion.button
                          key={k}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelected(k)}
                          aria-label={`${formatDayKey(k)}${d ? `, ${money(d.pnl)}, ${d.trades} trades` : ''}`}
                          className={cn(
                            'relative flex aspect-square flex-col rounded-lg border p-1 text-left transition-colors md:aspect-[1.15] md:rounded-xl md:p-2',
                            d ? (d.pnl >= 0 ? 'border-pos/25' : 'border-neg/25') : 'border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.04]',
                            isToday && 'ring-1 ring-violet/70',
                            selected === k && 'ring-2 ring-violet',
                          )}
                          style={d ? { background: d.pnl >= 0 ? `rgba(61,220,151,${intensity * 0.45})` : `rgba(255,92,122,${intensity * 0.45})` } : undefined}
                        >
                          <span className={cn('text-[10px] md:text-[12px]', isToday ? 'font-semibold text-violet-soft' : 'text-mute')}>{Number(k.slice(8))}</span>
                          {d ? (
                            <span className="mt-auto">
                              <span className={cn('num block truncate text-[9.5px] font-semibold md:text-[13px]', d.pnl >= 0 ? 'text-pos' : 'text-neg')}>{moneyShort(d.pnl)}</span>
                              <span className="hidden text-[10.5px] text-mute md:block">
                                {d.trades} trade{d.trades === 1 ? '' : 's'} · {d.wins + d.losses ? Math.round((d.wins / (d.wins + d.losses)) * 100) : 0}%
                              </span>
                            </span>
                          ) : review?.status === 'no_trades' ? (
                            <MoonStar className="mt-auto size-3 text-faint md:size-3.5" aria-label="No-trade day" />
                          ) : null}
                        </motion.button>
                      );
                    })}
                    <div className="hidden flex-col justify-center rounded-xl border border-white/[0.05] bg-white/[0.02] p-2 text-right md:flex">
                      {wDays.length ? (
                        <>
                          <PnlText value={wPnl} className="text-[12.5px] font-semibold" />
                          <span className="text-[10.5px] text-faint">{wDays.reduce((a, d) => a + d.trades, 0)} trades</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-faint">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </Card>

        <div className="space-y-3">
          <Card className="p-5">
            <div className="eyebrow">Month summary</div>
            <PnlText value={mPnl} animate className="mt-2 block text-[28px] font-semibold" />
            <dl className="mt-4 space-y-2.5 text-[13px]">
              {[
                ['Trades', mTrades],
                ['Win rate', fmtPct(mWins + mLosses ? (mWins / (mWins + mLosses)) * 100 : undefined, 0)],
                ['Trading days', monthDays.length],
                ['Winning days', <span key="w" className="text-pos">{winDays}</span>],
                ['Losing days', <span key="l" className="text-neg">{lossDays}</span>],
                ['Best day', best > 0 ? money(best) : '—'],
                ['Avg per day', monthDays.length ? money(mPnl / monthDays.length, { signed: true }) : '—'],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between">
                  <dt className="text-mute">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-4">
            <Segmented
              size="sm"
              className="w-full"
              value={month === today.slice(0, 7) ? 'now' : 'other'}
              onChange={(v) => v === 'now' && setMonth(today.slice(0, 7))}
              options={[
                { value: 'now', label: 'This month' },
                { value: 'other', label: month === today.slice(0, 7) ? 'Browse' : `${MONTHS[mo - 1]} ${y}` },
              ]}
            />
          </Card>
        </div>
      </div>

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatDayKey(selected, true) : ''}
        description={sel ? `${sel.trades} trade${sel.trades === 1 ? '' : 's'} · ${money(sel.pnl, { signed: true })}` : 'No trades recorded'}
      >
        {sel ? (
          <div className="-mx-2">
            {sel.list
              .slice()
              .sort((a, b) => a.ts - b.ts)
              .map((t) => (
                <TradeRow key={t.id} t={t} accountName={t.account_id ? names.get(t.account_id) : undefined} shots={counts.get(t.id)} />
              ))}
          </div>
        ) : selected ? (
          <div className="py-6 text-center">
            <p className="text-[13.5px] text-mute">{selReview?.status === 'no_trades' ? 'Marked as a no-trade day.' : 'Nothing journaled on this day.'}</p>
            {selected <= today && (
              <Button className="mt-4" size="sm" onClick={() => setDayReview(selected, selReview?.status === 'no_trades' ? null : 'no_trades')}>
                {selReview?.status === 'no_trades' ? 'Unmark no-trade day' : 'Mark as no-trade day'}
              </Button>
            )}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
