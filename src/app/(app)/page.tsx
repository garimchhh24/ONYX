'use client';

import { CalendarCheck2, CircleDashed, Flame, PenLine, Plus, Sparkles, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EquityChart, GroupBars, OutcomeDonut, PnlBars, Sparkline } from '@/components/charts/Charts';
import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, PnlText, StatTile, TradeRow } from '@/components/trades/parts';
import { Button, Card, CardHeader, cn, ProgressBar, Segmented, Select, Skeleton } from '@/components/ui/core';
import { AnimatedNumber, Item, Stagger } from '@/components/ui/motion';
import { useToast } from '@/components/ui/overlay';
import { setDayReview, useAccounts, useAttachmentCounts, useDayReviews, useSettings, useTrades } from '@/lib/data/repo';
import { accountMetrics } from '@/lib/domain/accounts';
import { fmtNum, fmtPF, fmtPct, fmtR, money } from '@/lib/domain/format';
import { journalStatus } from '@/lib/domain/reminders';
import { byDirection, byInstrument, dailySeries, equityCurve, monthlySeries, summarize, weeklySeries } from '@/lib/domain/stats';
import { dayKey, formatDayKey, formatDuration } from '@/lib/domain/time';
import { useToday } from '@/lib/hooks/useToday';

type Period = 'daily' | 'weekly' | 'monthly';

export default function DashboardPage() {
  const all = useTrades();
  const accounts = useAccounts();
  const counts = useAttachmentCounts();
  const today = useToday();
  const [accountId, setAccountId] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('daily');

  const trades = useMemo(() => (all ?? []).filter((t) => accountId === 'all' || t.account_id === accountId), [all, accountId]);
  const s = useMemo(() => summarize(trades), [trades]);
  const curve = useMemo(() => equityCurve(trades), [trades]);
  const series = useMemo(() => {
    if (period === 'weekly') return weeklySeries(trades).slice(-16);
    if (period === 'monthly') return monthlySeries(trades).slice(-12);
    return dailySeries(trades).slice(-30);
  }, [trades, period]);
  const names = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);

  if (!all || !accounts) return <DashboardSkeleton />;

  const recent = [...trades].reverse().slice(0, 6);
  const dir = byDirection(trades);
  const longRow = dir.find((d) => d.key === 'long');
  const shortRow = dir.find((d) => d.key === 'short');

  return (
    <>
      <PageHeader
        eyebrow={formatDayKey(today, true)}
        title="Dashboard"
        action={
          <>
            {accounts.length > 0 && (
              <Select aria-label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-10 w-auto min-w-[150px] py-0 text-sm">
                <option value="all">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
            <Link href="/journal/new" className="hidden md:block">
              <Button icon={<PenLine className="size-4" />}>Manual entry</Button>
            </Link>
            <Link href="/analyze" className="hidden md:block">
              <Button variant="primary" icon={<Sparkles className="size-4" />}>
                Analyze trade
              </Button>
            </Link>
          </>
        }
      />

      <TodayPanel />

      {trades.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            title={all.length ? 'No trades for this account yet' : 'Your journal starts here'}
            body="Upload a screenshot from TradingView or your Lucid platform and CADENCE will read the trade for you — then a 30-second check-in captures the psychology behind it."
            action={
              <>
                <Link href="/analyze">
                  <Button variant="primary" icon={<Sparkles className="size-4" />}>
                    Analyze a screenshot
                  </Button>
                </Link>
                <Link href="/journal/new">
                  <Button icon={<Plus className="size-4" />}>Add a trade manually</Button>
                </Link>
                {accounts.length === 0 && (
                  <Link href="/accounts">
                    <Button variant="ghost" icon={<Wallet className="size-4" />}>
                      Set up a Lucid account
                    </Button>
                  </Link>
                )}
              </>
            }
          />
        </Card>
      ) : (
        <Stagger className="mt-5 space-y-5">
          {/* Hero */}
          <Item>
            <Card glow className="overflow-hidden p-5 md:p-6">
              <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-electric/20 blur-3xl" />
              <div className="relative grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end">
                <div>
                  <div className="eyebrow">Total net P&L</div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <AnimatedNumber
                      value={s.net}
                      format={(v) => money(v, { signed: true })}
                      className={cn('text-[40px] font-semibold leading-none tracking-tight md:text-[52px]', s.net >= 0 ? 'chrome-text' : 'text-neg')}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-mute">
                    <span>
                      <span className="num text-fg">{s.trades}</span> trades
                    </span>
                    <span>
                      <span className="num text-fg">{fmtPct(s.winRate, 0)}</span> win rate
                    </span>
                    <span>
                      PF <span className="num text-fg">{fmtPF(s.profitFactor)}</span>
                    </span>
                    {s.feesUnknown > 0 && <span className="text-warn">{s.feesUnknown} without commission data</span>}
                  </div>
                </div>
                <Sparkline values={[0, ...curve.map((c) => c.equity)]} height={86} />
              </div>
            </Card>
          </Item>

          {/* KPI grid */}
          <Item>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Total trades" value={s.trades} sub={`${s.wins}W · ${s.losses}L · ${s.breakeven}BE`} />
              <StatTile label="Win rate" value={fmtPct(s.winRate, 1)} sub={s.open ? `${s.open} incomplete` : 'wins ÷ decided'} />
              <StatTile label="Profit factor" value={fmtPF(s.profitFactor)} sub="gross win ÷ gross loss" />
              <StatTile label="Average R" value={fmtR(s.avgR)} tone={s.avgR === undefined ? undefined : s.avgR >= 0 ? 'pos' : 'neg'} sub={`${s.rCount} trades with risk`} />
              <StatTile label="Avg winner" value={money(s.avgWin)} tone="pos" sub={s.largestWin !== undefined ? `best ${money(s.largestWin)}` : undefined} />
              <StatTile label="Avg loser" value={money(s.avgLoss)} tone="neg" sub={s.largestLoss !== undefined ? `worst ${money(s.largestLoss)}` : undefined} />
              <StatTile label="Max drawdown" value={money(-s.maxDrawdown)} tone={s.maxDrawdown > 0 ? 'neg' : undefined} sub="peak-to-trough, closed trades" />
              <StatTile
                label="Current streak"
                value={s.currentStreak === 0 ? '—' : `${Math.abs(s.currentStreak)} ${s.currentStreak > 0 ? 'W' : 'L'}`}
                tone={s.currentStreak > 0 ? 'pos' : s.currentStreak < 0 ? 'neg' : undefined}
                icon={<Flame className="size-3.5" />}
                sub={`best ${s.maxWinStreak}W · worst ${s.maxLossStreak}L`}
              />
              <StatTile label="Winning days" value={s.winDays} tone="pos" sub={s.bestDay ? `best ${money(s.bestDay.pnl)}` : undefined} />
              <StatTile label="Losing days" value={s.lossDays} tone={s.lossDays ? 'neg' : undefined} sub={s.worstDay ? `worst ${money(s.worstDay.pnl)}` : undefined} />
              <StatTile label="Avg duration" value={formatDuration(s.avgDuration)} sub={s.avgDurationWin !== undefined && s.avgDurationLoss !== undefined ? `W ${formatDuration(s.avgDurationWin)} · L ${formatDuration(s.avgDurationLoss)}` : 'needs entry & exit times'} />
              <StatTile label="Expectancy" value={money(s.expectancy, { signed: true })} tone={s.expectancy === undefined ? undefined : s.expectancy >= 0 ? 'pos' : 'neg'} sub="average net per trade" />
            </div>
          </Item>

          {/* Equity + outcome */}
          <Item>
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <Card>
                <CardHeader eyebrow="Performance" title="Equity curve" action={<span className="num text-[12px] text-faint">{curve.length} closed trades</span>} />
                <div className="px-3 pb-4 pt-2">
                  <EquityChart data={curve} height={260} />
                </div>
              </Card>
              <Card>
                <CardHeader eyebrow="Distribution" title="Wins vs losses" />
                <div className="px-5 pb-5 pt-4">
                  <OutcomeDonut wins={s.wins} losses={s.losses} breakeven={s.breakeven} winRate={s.winRate} />
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.05] pt-4 text-[12.5px]">
                    <div>
                      <div className="text-faint">Payoff ratio</div>
                      <div className="num mt-0.5 text-[15px] font-medium">{s.payoff !== undefined ? fmtNum(s.payoff) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-faint">Total R</div>
                      <div className="num mt-0.5 text-[15px] font-medium">{s.rCount ? fmtR(s.totalR) : '—'}</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </Item>

          {/* P&L by period */}
          <Item>
            <Card>
              <CardHeader
                eyebrow="Net P&L"
                title={period === 'daily' ? 'Daily — last 30 sessions' : period === 'weekly' ? 'Weekly — last 16 weeks' : 'Monthly — last 12 months'}
                action={
                  <Segmented<Period>
                    size="sm"
                    value={period}
                    onChange={setPeriod}
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'monthly', label: 'Monthly' },
                    ]}
                  />
                }
              />
              <div className="px-3 pb-4 pt-3">
                <PnlBars data={series} height={230} />
              </div>
            </Card>
          </Item>

          {/* Direction + instruments */}
          <Item>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader eyebrow="Direction" title="Long vs short" />
                <div className="grid grid-cols-2 gap-3 p-5 pt-4">
                  {[
                    { label: 'Long', row: longRow, color: 'pos' },
                    { label: 'Short', row: shortRow, color: 'neg' },
                  ].map(({ label, row }) => (
                    <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between">
                        <span className="eyebrow">{label}</span>
                        <span className="num text-[12px] text-faint">{row?.trades ?? 0} trades</span>
                      </div>
                      <PnlText value={row?.pnl ?? 0} className="mt-2 block text-xl font-semibold" />
                      <div className="mt-3 space-y-1.5 text-[12px]">
                        <div className="flex justify-between text-mute">
                          <span>Win rate</span>
                          <span className="num text-fg">{fmtPct(row?.winRate, 0)}</span>
                        </div>
                        <ProgressBar value={(row?.winRate ?? 0) / 100} tone="violet" label={`${label} win rate`} />
                        <div className="flex justify-between pt-1 text-mute">
                          <span>Avg R</span>
                          <span className="num text-fg">{fmtR(row?.avgR)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader eyebrow="Instruments" title="Performance by contract" action={<Link href="/analytics" className="text-[12px] text-violet hover:text-violet-soft">Analytics →</Link>} />
                <div className="p-5 pt-4">
                  <GroupBars rows={byInstrument(trades)} limit={6} />
                </div>
              </Card>
            </div>
          </Item>

          {/* Recent trades */}
          <Item>
            <Card>
              <CardHeader eyebrow="Journal" title="Recent trades" action={<Link href="/journal" className="text-[12px] text-violet hover:text-violet-soft">View all →</Link>} />
              <div className="p-2 pt-2">
                {recent.map((t) => (
                  <TradeRow key={t.id} t={t} showDate accountName={t.account_id ? names.get(t.account_id) : undefined} shots={counts.get(t.id)} />
                ))}
              </div>
            </Card>
          </Item>

          {accounts.length > 0 && (
            <Item>
              <AccountsStrip today={today} accountFilter={accountId} />
            </Item>
          )}
        </Stagger>
      )}
    </>
  );
}

function TodayPanel() {
  const trades = useTrades();
  const reviews = useDayReviews();
  const settings = useSettings();
  const toast = useToast();
  if (!trades) return null;
  const status = journalStatus(trades, reviews, new Date(), settings.reminder.timezone);
  const tz = settings.reminder.timezone;
  const todayPnl = trades.filter((t) => dayKey(t.entry_time ?? t.exit_time ?? t.created_at, tz) === status.day).reduce((a, t) => a + (t.net ?? 0), 0);
  if (status.unjournaled > 0) {
    return (
      <Link href="/journal?filter=unjournaled" className="panel flex items-center gap-3 border-warn/20 p-4 transition hover:border-warn/35">
        <CircleDashed className="size-5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">
            {status.unjournaled} trade{status.unjournaled === 1 ? '' : 's'} from today need{status.unjournaled === 1 ? 's' : ''} a journal check-in
          </div>
          <div className="text-[12.5px] text-mute">Takes about 30 seconds each — capture it while it’s fresh.</div>
        </div>
        <span className="text-[13px] text-violet">Review →</span>
      </Link>
    );
  }
  if (status.tradesToday > 0 || status.review) {
    return (
      <div className="panel flex items-center gap-3 p-4">
        <CalendarCheck2 className="size-5 shrink-0 text-pos" />
        <div className="min-w-0 flex-1 text-[14px]">
          {status.review === 'no_trades' ? 'Marked as a no-trade day.' : `Today is fully journaled — ${status.tradesToday} trade${status.tradesToday === 1 ? '' : 's'}.`}
          {status.tradesToday > 0 && (
            <span className="ml-2">
              <PnlText value={todayPnl} className="font-medium" />
            </span>
          )}
        </div>
        {status.review === 'no_trades' && (
          <button className="text-[12.5px] text-mute hover:text-fg" onClick={() => setDayReview(status.day, null)}>
            Undo
          </button>
        )}
      </div>
    );
  }
  if (status.isWeekend) return null;
  return (
    <div className="panel flex flex-wrap items-center gap-3 p-4">
      <CalendarCheck2 className="size-5 shrink-0 text-faint" />
      <div className="min-w-[220px] flex-1">
        <div className="text-[14px] font-medium">No trades logged today</div>
        <div className="text-[12.5px] text-mute">Log your trades, or mark today as a no-trade day so tonight’s reminder stays quiet.</div>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await setDayReview(status.day, 'no_trades');
          toast({ tone: 'success', title: 'Marked as a no-trade day' });
        }}
      >
        No trades today
      </Button>
    </div>
  );
}

function AccountsStrip({ today, accountFilter }: { today: string; accountFilter: string }) {
  const accounts = useAccounts() ?? [];
  const trades = useTrades() ?? [];
  const list = accounts.filter((a) => a.status !== 'inactive' && (accountFilter === 'all' || a.id === accountFilter));
  if (!list.length) return null;
  return (
    <Card>
      <CardHeader eyebrow="Lucid Trading" title="Accounts" action={<Link href="/accounts" className="text-[12px] text-violet hover:text-violet-soft">Manage →</Link>} />
      <div className="scroll-x flex gap-3 p-5 pt-4">
        {list.map((a) => {
          const m = accountMetrics(a, trades, today);
          return (
            <Link key={a.id} href="/accounts" className="min-w-[230px] flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px] font-medium">{a.name}</span>
                <span className={cn('size-2 rounded-full', m.level === 'danger' ? 'bg-neg' : m.level === 'warn' ? 'bg-warn' : m.level === 'done' ? 'bg-violet' : 'bg-pos')} />
              </div>
              <div className="num mt-2 text-lg font-semibold">{money(m.balance)}</div>
              <div className="mt-0.5 text-[12px] text-mute">
                Today <PnlText value={m.todayPnl} />
              </div>
              {m.drawdownUsed !== null && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px] text-faint">
                    <span>Drawdown used</span>
                    <span className="num">{Math.round(m.drawdownUsed * 100)}%</span>
                  </div>
                  <ProgressBar value={m.drawdownUsed} tone={m.drawdownUsed > 0.75 ? 'neg' : m.drawdownUsed > 0.5 ? 'warn' : 'violet'} label="Drawdown used" />
                </div>
              )}
              {m.riskAllowance !== null && (
                <div className="mt-2 text-[12px] text-mute">
                  Can still risk today <span className="num text-fg">{money(m.riskAllowance)}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
