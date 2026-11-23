'use client';

import { Bot, Brain, ChartColumn, CircleAlert, Info, LineChart, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { CountBars, DrawdownChart, EquityChart, GroupBars, PnlBars, SignedBars } from '@/components/charts/Charts';
import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, StatTile } from '@/components/trades/parts';
import { Badge, Button, Card, CardHeader, cn, Input, Notice, Segmented, Select, Skeleton } from '@/components/ui/core';
import { Item, Stagger } from '@/components/ui/motion';
import { LogoLoader } from '@/components/brand/Logo';
import { AiClientError, requestCoach } from '@/lib/ai/client';
import { saveReport, useAccounts, useReports, useTrades } from '@/lib/data/repo';
import { coach, MIN_GROUP, MIN_TRADES, type Insight } from '@/lib/domain/coach';
import { fmtNum, fmtPF, fmtPct, fmtR, money } from '@/lib/domain/format';
import {
  applyFilter,
  byDirection,
  byEmotionBefore,
  byEmotionDuring,
  byEntryQuality,
  byExitQuality,
  byHour,
  byInstrument,
  byMistake,
  byRuleCompliance,
  bySession,
  bySetup,
  bySetupQuality,
  byWeekday,
  dailySeries,
  equityCurve,
  monthlySeries,
  rDistribution,
  summarize,
  weeklySeries,
  type RangePreset,
  type TradeFilter,
} from '@/lib/domain/stats';
import { formatDuration } from '@/lib/domain/time';
import { useServerConfig } from '@/lib/hooks/useServerConfig';
import { useToday } from '@/lib/hooks/useToday';
import { isArtifactRuntime } from '@/lib/runtime';
import type { AiReport, CoachPattern } from '@/lib/types';

type Tab = 'performance' | 'timing' | 'psychology' | 'coach';

export default function AnalyticsPage() {
  const all = useTrades();
  const accounts = useAccounts();
  const today = useToday();
  const [filter, setFilter] = useState<TradeFilter>({ range: 'all', accountId: 'all', symbol: 'all', direction: 'all' });
  const [tab, setTab] = useState<Tab>('performance');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const trades = useMemo(() => (all ? applyFilter(all, filter, today) : []), [all, filter, today]);
  const s = useMemo(() => summarize(trades), [trades]);
  const curve = useMemo(() => equityCurve(trades), [trades]);
  const symbols = useMemo(() => [...new Set((all ?? []).map((t) => t.symbol))].sort(), [all]);

  if (!all || !accounts) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;

  const set = (p: Partial<TradeFilter>) => setFilter((f) => ({ ...f, ...p }));
  const series = period === 'weekly' ? weeklySeries(trades) : period === 'monthly' ? monthlySeries(trades) : dailySeries(trades);

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${s.trades} closed trades in view`} />

      {/* Filters: one row above the charts */}
      <Card className="mb-5 flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <div className="scroll-x -mx-1 px-1">
          <Segmented<RangePreset>
            size="sm"
            value={filter.range}
            onChange={(range) => set({ range })}
            options={[
              { value: '7d', label: '7D' },
              { value: '30d', label: '30D' },
              { value: '90d', label: '90D' },
              { value: 'ytd', label: 'YTD' },
              { value: '1y', label: '1Y' },
              { value: 'all', label: 'All' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        {filter.range === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={filter.from ?? ''} onChange={(e) => set({ from: e.target.value })} className="h-9 py-0 text-sm" aria-label="From" />
            <span className="text-faint">–</span>
            <Input type="date" value={filter.to ?? ''} onChange={(e) => set({ to: e.target.value })} className="h-9 py-0 text-sm" aria-label="To" />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 md:ml-auto md:flex">
          <Select aria-label="Account" value={filter.accountId} onChange={(e) => set({ accountId: e.target.value })} className="h-9 py-0 text-sm">
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Instrument" value={filter.symbol} onChange={(e) => set({ symbol: e.target.value })} className="h-9 py-0 text-sm">
            <option value="all">All instruments</option>
            {symbols.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <Select aria-label="Direction" value={filter.direction} onChange={(e) => set({ direction: e.target.value as TradeFilter['direction'] })} className="h-9 py-0 text-sm">
            <option value="all">Long & short</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </Select>
        </div>
      </Card>

      {s.trades === 0 ? (
        <Card>
          <EmptyState title="No closed trades in this view" body="Change the filters above, or journal a few trades to unlock analytics." />
        </Card>
      ) : (
        <Stagger className="space-y-5">
          <Item>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <StatTile label="Net P&L" value={money(s.net, { signed: true, cents: false })} tone={s.net >= 0 ? 'pos' : 'neg'} />
              <StatTile label="Win rate" value={fmtPct(s.winRate, 1)} sub={`${s.wins}W / ${s.losses}L`} />
              <StatTile label="Profit factor" value={fmtPF(s.profitFactor)} />
              <StatTile label="Expectancy" value={money(s.expectancy, { signed: true })} tone={(s.expectancy ?? 0) >= 0 ? 'pos' : 'neg'} sub="per trade" />
              <StatTile label="Avg R" value={fmtR(s.avgR)} sub={`${s.rCount} with risk`} />
              <StatTile label="Max DD" value={money(-s.maxDrawdown, { cents: false })} tone={s.maxDrawdown ? 'neg' : undefined} />
              <StatTile label="Max win streak" value={s.maxWinStreak} />
              <StatTile label="Max loss streak" value={s.maxLossStreak} />
            </div>
          </Item>

          <Item>
            <Segmented<Tab>
              className="w-full md:w-auto"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'performance', label: 'Performance' },
                { value: 'timing', label: 'Timing' },
                { value: 'psychology', label: 'Psychology' },
                { value: 'coach', label: 'AI Coach' },
              ]}
            />
          </Item>

          {tab === 'performance' && (
            <>
              <Item>
                <Card>
                  <CardHeader eyebrow="Equity" title="Cumulative net P&L" action={<span className="text-[12px] text-faint">Hover for trade details</span>} />
                  <div className="px-3 pt-2">
                    <EquityChart data={curve} height={280} />
                  </div>
                  <div className="px-3 pb-4">
                    <div className="eyebrow mb-1 px-2 pt-3 text-[9.5px]">Drawdown from peak</div>
                    <DrawdownChart data={curve} />
                  </div>
                </Card>
              </Item>
              <Item>
                <Card>
                  <CardHeader
                    eyebrow="Net P&L"
                    title="By period"
                    action={
                      <Segmented
                        size="sm"
                        value={period}
                        onChange={setPeriod}
                        options={[
                          { value: 'daily', label: 'Day' },
                          { value: 'weekly', label: 'Week' },
                          { value: 'monthly', label: 'Month' },
                        ]}
                      />
                    }
                  />
                  <div className="px-3 pb-4 pt-3">
                    <PnlBars data={series} height={240} />
                  </div>
                </Card>
              </Item>
              <Item>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel eyebrow="Instruments" title="Best & worst instruments">
                    <GroupBars rows={byInstrument(trades)} />
                  </Panel>
                  <Panel eyebrow="Setups" title="Performance by setup">
                    <GroupBars rows={bySetup(trades)} />
                  </Panel>
                  <Panel eyebrow="Direction" title="Long vs short">
                    <GroupBars rows={byDirection(trades)} />
                  </Panel>
                  <Panel eyebrow="Distribution" title="R-multiple distribution">
                    <CountBars data={rDistribution(trades)} />
                  </Panel>
                </div>
              </Item>
              <Item>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatTile label="Avg winner" value={money(s.avgWin)} tone="pos" />
                  <StatTile label="Avg loser" value={money(s.avgLoss)} tone="neg" />
                  <StatTile label="Payoff ratio" value={s.payoff !== undefined ? fmtNum(s.payoff) : '—'} />
                  <StatTile label="Fees paid" value={money(s.fees)} sub={s.feesUnknown ? `${s.feesUnknown} trades missing fees` : 'all trades have fees'} />
                </div>
              </Item>
            </>
          )}

          {tab === 'timing' && (
            <Item>
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel eyebrow="Sessions" title="Best trading sessions">
                  <GroupBars rows={bySession(trades)} emptyText="Add entry times to see session performance" />
                </Panel>
                <Panel eyebrow="Weekdays" title="Performance by weekday">
                  <GroupBars rows={byWeekday(trades)} />
                </Panel>
                <Panel eyebrow="Hour (New York time)" title="Performance by entry hour" className="lg:col-span-2">
                  <SignedBars data={byHour(trades).map((r) => ({ key: r.key, label: r.key.slice(0, 2), value: r.pnl, n: r.trades }))} height={220} />
                  <p className="mt-2 text-[11.5px] text-faint">Faded bars have fewer than 5 trades.</p>
                </Panel>
                <div className="grid grid-cols-3 gap-3 lg:col-span-2">
                  <StatTile label="Avg duration" value={formatDuration(s.avgDuration)} />
                  <StatTile label="Winners held" value={formatDuration(s.avgDurationWin)} />
                  <StatTile label="Losers held" value={formatDuration(s.avgDurationLoss)} />
                </div>
              </div>
            </Item>
          )}

          {tab === 'psychology' && (
            <Item>
              {trades.filter((t) => t.journal).length === 0 ? (
                <Card>
                  <EmptyState compact title="No journal data yet" body="Complete the 30-second check-in after each trade to see how emotions and discipline affect your results." />
                </Card>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel eyebrow="Before entry" title="Emotional state vs profitability">
                    <GroupBars rows={byEmotionBefore(trades)} />
                  </Panel>
                  <Panel eyebrow="During trade" title="In-trade state vs profitability">
                    <GroupBars rows={byEmotionDuring(trades)} />
                  </Panel>
                  <Panel eyebrow="Discipline" title="Rule compliance vs profitability">
                    <GroupBars rows={byRuleCompliance(trades)} />
                  </Panel>
                  <Panel eyebrow="Execution" title="Entry quality vs profitability">
                    <GroupBars rows={byEntryQuality(trades)} />
                  </Panel>
                  <Panel eyebrow="Execution" title="Exit quality vs profitability">
                    <GroupBars rows={byExitQuality(trades)} />
                  </Panel>
                  <Panel eyebrow="Mistakes" title="Cost of execution mistakes">
                    <GroupBars rows={byMistake(trades)} />
                  </Panel>
                  <Panel eyebrow="Setup" title="Setup quality vs profitability" className="lg:col-span-2">
                    <GroupBars rows={bySetupQuality(trades)} />
                  </Panel>
                </div>
              )}
            </Item>
          )}

          {tab === 'coach' && (
            <Item>
              <CoachPanel trades={trades} />
            </Item>
          )}
        </Stagger>
      )}
    </>
  );
}

function Panel({ eyebrow, title, children, className }: { eyebrow: string; title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader eyebrow={eyebrow} title={title} />
      <div className="p-5 pt-4">{children}</div>
    </Card>
  );
}

function ConfidenceTag({ c }: { c: 'low' | 'medium' | 'high' }) {
  return <Badge tone={c === 'high' ? 'pos' : c === 'medium' ? 'violet' : 'neutral'}>{c} confidence</Badge>;
}

function InsightCard({ i }: { i: Insight }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', i.impact === 'positive' ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg')}>
          {i.impact === 'positive' ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-medium leading-snug">{i.title}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{i.detail}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ConfidenceTag c={i.confidence} />
            <Badge>n = {i.n}</Badge>
            <Badge>t = {i.t.toFixed(1)}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function PatternList({ title, items, icon }: { title: string; items: CoachPattern[]; icon: ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="eyebrow mb-2 flex items-center gap-2">
        {icon}
        {title}
      </div>
      <div className="space-y-2.5">
        {items.map((p) => (
          <div key={p.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[14px] font-medium">{p.title}</div>
            <p className="mt-1 text-[12.5px] text-mute">{p.evidence}</p>
            <p className="mt-2 text-[13px] text-chrome/90">→ {p.suggestion}</p>
            <div className="mt-2 flex gap-1.5">
              <ConfidenceTag c={p.confidence} />
              <Badge>n = {p.sample_size}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportView({ r }: { r: AiReport }) {
  const c = r.content;
  return (
    <div className="space-y-5">
      <p className="text-[14px] leading-relaxed text-chrome/90">{c.summary}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <PatternList title="Strengths" items={c.strengths} icon={<TrendingUp className="size-3.5 text-pos" />} />
        <PatternList title="Weaknesses" items={c.weaknesses} icon={<TrendingDown className="size-3.5 text-neg" />} />
      </div>
      {c.focus.length > 0 && (
        <div className="rounded-2xl border border-electric/30 bg-electric/[0.08] p-4">
          <div className="eyebrow mb-2 text-violet-soft">Focus for the next sessions</div>
          <ol className="list-decimal space-y-1 pl-5 text-[13.5px]">
            {c.focus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        </div>
      )}
      {c.data_gaps.length > 0 && (
        <div className="text-[12.5px] text-mute">
          <div className="eyebrow mb-1.5">Data gaps</div>
          {c.data_gaps.map((g) => (
            <div key={g}>· {g}</div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-faint">
        {r.trade_count} trades · {r.period_from} → {r.period_to} · generated {new Date(r.created_at).toLocaleString()}
      </div>
    </div>
  );
}

function CoachPanel({ trades }: { trades: ReturnType<typeof applyFilter> }) {
  const result = useMemo(() => coach(trades), [trades]);
  const reports = useReports();
  const cfg = useServerConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = reports[0];

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { report, model, payload } = await requestCoach(trades);
      await saveReport({ kind: 'coach', period_from: payload.period?.from ?? null, period_to: payload.period?.to ?? null, trade_count: payload.summary.trades, model, content: report });
    } catch (e) {
      setError(e instanceof AiClientError || e instanceof Error ? e.message : 'Coach failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <ChartColumn className="size-4 text-violet" />
          <h3 className="font-display text-[15px] font-semibold">Statistically supported patterns</h3>
        </div>
        {!result.ready ? (
          <Notice tone="neutral" icon={<Info className="size-4 text-violet" />} title={`${result.tradesNeeded} more closed trade${result.tradesNeeded === 1 ? '' : 's'} needed`}>
            CADENCE only reports patterns backed by enough data: at least {MIN_TRADES} trades overall and {MIN_GROUP} per group, with a meaningful statistical difference.
          </Notice>
        ) : result.insights.length === 0 ? (
          <Notice tone="neutral" icon={<Info className="size-4 text-violet" />} title="No significant patterns yet">
            Your results are consistent across sessions, setups and states — or the differences aren’t large enough to be reliable yet.
          </Notice>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {result.insights.map((i) => (
              <InsightCard key={i.id} i={i} />
            ))}
          </div>
        )}
        {result.gaps.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-white/[0.05] pt-4 text-[12.5px] text-mute">
            {result.gaps.map((g) => (
              <li key={g} className="flex gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                {g}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card glow className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-violet" />
            <h3 className="font-display text-[15px] font-semibold">AI Performance Coach</h3>
          </div>
          {cfg?.ai && result.ready && (
            <Button variant={latest ? 'secondary' : 'primary'} size="sm" onClick={generate} loading={busy} icon={<Sparkles className="size-3.5" />}>
              {latest ? 'New report' : 'Generate report'}
            </Button>
          )}
        </div>
        {busy ? (
          <div className="flex items-center gap-4 py-6">
            <LogoLoader size={44} label="Coach is analyzing" />
            <div>
              <div className="text-[14px] font-medium">Studying {trades.length} trades…</div>
              <div className="text-[12.5px] text-mute">Only aggregated statistics are sent — no notes or screenshots.</div>
            </div>
          </div>
        ) : latest ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ReportView r={latest} />
          </motion.div>
        ) : !result.ready ? (
          <p className="text-[13.5px] text-mute">The AI coach unlocks at {MIN_TRADES} closed trades so its conclusions rest on real evidence.</p>
        ) : cfg && !cfg.ai ? (
          <p className="text-[13.5px] text-mute">{isArtifactRuntime ? 'Open this page on claude.ai while signed in to generate a coach report.' : 'AI is not configured on this deployment.'} The statistical patterns above work without it.</p>
        ) : (
          <p className="flex items-center gap-2 text-[13.5px] text-mute">
            <Brain className="size-4" /> Get a written analysis of recurring patterns with concrete rules to improve.
          </p>
        )}
        {error && (
          <Notice tone="neg" className="mt-3">
            {error}
          </Notice>
        )}
        {reports.length > 1 && (
          <details className="mt-5 border-t border-white/[0.05] pt-4 text-[12.5px] text-mute">
            <summary className="cursor-pointer">
              <LineChart className="mr-1 inline size-3.5" /> Previous reports ({reports.length - 1})
            </summary>
            <div className="mt-3 space-y-6">
              {reports.slice(1, 6).map((r) => (
                <ReportView key={r.id} r={r} />
              ))}
            </div>
          </details>
        )}
      </Card>
    </div>
  );
}
