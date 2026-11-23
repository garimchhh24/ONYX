'use client';

import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { fmtPct, money, moneyShort } from '@/lib/domain/format';
import type { EquityPoint, GroupRow, PeriodRow } from '@/lib/domain/stats';
import { MIN_GROUP_SAMPLE } from '@/lib/domain/stats';
import { cn } from '../ui/core';

export const C = {
  violet: '#B46AFF',
  electric: '#8A2BE2',
  pos: '#3DDC97',
  neg: '#FF5C7A',
  neutral: '#6B6979',
  grid: 'rgba(217,217,226,0.05)',
  axis: '#7D7B8E',
};

// Recharts' tooltip generics are loose; payloads are narrowed explicitly below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TP = TooltipContentProps<any, any>;

const AXIS = { stroke: 'transparent', tick: { fill: C.axis, fontSize: 10.5 }, tickLine: false, axisLine: false } as const;

export function TooltipPanel({ title, rows }: { title?: ReactNode; rows: { label: ReactNode; value: ReactNode; tone?: 'pos' | 'neg' | 'flat'; swatch?: string }[] }) {
  return (
    <div className="min-w-[160px] rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2.5 shadow-2xl backdrop-blur-md">
      {title && <div className="mb-1.5 text-[11px] font-medium text-mute">{title}</div>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="flex items-center gap-1.5 text-mute">
              {r.swatch && <span className="size-2 rounded-full" style={{ background: r.swatch }} />}
              {r.label}
            </span>
            <span className={cn('num font-medium', r.tone === 'pos' ? 'text-pos' : r.tone === 'neg' ? 'text-neg' : 'text-fg')}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const tn = (v: number): 'pos' | 'neg' | 'flat' => (v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'flat');

export function ChartEmpty({ height = 220, children = 'Not enough data yet' }: { height?: number; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-white/[0.07] text-[13px] text-faint" style={{ height }}>
      {children}
    </div>
  );
}

/** Cumulative net P&L by trade with crosshair tooltip. */
export function EquityChart({ data, height = 260, compact }: { data: EquityPoint[]; height?: number; compact?: boolean }) {
  if (data.length < 2) return <ChartEmpty height={height}>The equity curve appears after two closed trades</ChartEmpty>;
  const series = [{ i: 0, ts: data[0].ts, label: 'Start', equity: 0, drawdown: 0, pnl: 0, symbol: '' }, ...data];
  const last = series[series.length - 1].equity;
  const stroke = last >= 0 ? C.violet : C.neg;
  return (
    <div style={{ height }} role="img" aria-label={`Equity curve over ${data.length} trades, ending at ${money(last)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, left: compact ? 4 : 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          {!compact && <XAxis dataKey="i" {...AXIS} tickFormatter={(v) => (v ? `#${v}` : '')} minTickGap={28} />}
          {!compact && <YAxis {...AXIS} width={52} tickFormatter={(v) => moneyShort(v)} />}
          <ReferenceLine y={0} stroke="rgba(217,217,226,0.18)" strokeDasharray="3 4" />
          <Tooltip
            cursor={{ stroke: 'rgba(217,217,226,0.25)', strokeWidth: 1 }}
            content={({ active, payload }: TP) => {
              const p = active && payload?.[0]?.payload as EquityPoint | undefined;
              if (!p || !p.i) return null;
              return (
                <TooltipPanel
                  title={`Trade #${p.i} · ${p.symbol} · ${p.label}`}
                  rows={[
                    { label: 'Equity', value: money(p.equity, { signed: true }), tone: tn(p.equity) },
                    { label: 'Trade', value: money(p.pnl, { signed: true }), tone: tn(p.pnl) },
                    ...(p.drawdown < 0 ? [{ label: 'From peak', value: money(p.drawdown), tone: 'neg' as const }] : []),
                  ]}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="equity" stroke={stroke} strokeWidth={2} fill="url(#eq-fill)" dot={false} activeDot={{ r: 4, stroke: '#0B0B0F', strokeWidth: 2, fill: stroke }} isAnimationActive animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Underwater chart: distance below the running equity peak. */
export function DrawdownChart({ data, height = 120 }: { data: EquityPoint[]; height?: number }) {
  if (data.length < 2) return null;
  return (
    <div style={{ height }} role="img" aria-label="Drawdown from equity peak">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.neg} stopOpacity={0.05} />
              <stop offset="100%" stopColor={C.neg} stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" hide />
          <YAxis {...AXIS} width={52} tickFormatter={(v) => moneyShort(v)} />
          <Tooltip
            cursor={{ stroke: 'rgba(217,217,226,0.25)' }}
            content={({ active, payload }: TP) => {
              const p = active && payload?.[0]?.payload as EquityPoint | undefined;
              if (!p) return null;
              return <TooltipPanel title={`Trade #${p.i} · ${p.label}`} rows={[{ label: 'Drawdown', value: money(p.drawdown), tone: p.drawdown < 0 ? 'neg' : 'flat' }]} />;
            }}
          />
          <Area type="stepAfter" dataKey="drawdown" stroke={C.neg} strokeWidth={1.5} fill="url(#dd-fill)" dot={false} isAnimationActive animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** P&L per period (day / week / month); bars rise or fall from zero. */
export function PnlBars({ data, height = 220, onSelect }: { data: PeriodRow[]; height?: number; onSelect?: (key: string) => void }) {
  if (!data.length) return <ChartEmpty height={height} />;
  return (
    <div style={{ height }} role="img" aria-label={`P&L by period, ${data.length} periods`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={data.length > 40 ? 1 : '22%'}>
          <XAxis dataKey="label" {...AXIS} minTickGap={16} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={52} tickFormatter={(v) => moneyShort(v)} />
          <ReferenceLine y={0} stroke="rgba(217,217,226,0.18)" />
          <Tooltip
            cursor={{ fill: 'rgba(180,106,255,0.07)' }}
            content={({ active, payload }: TP) => {
              const p = active && payload?.[0]?.payload as PeriodRow | undefined;
              if (!p) return null;
              return (
                <TooltipPanel
                  title={p.label}
                  rows={[
                    { label: 'Net P&L', value: money(p.pnl, { signed: true }), tone: tn(p.pnl) },
                    { label: 'Trades', value: p.trades },
                    { label: 'Win rate', value: fmtPct(p.winRate, 0) },
                    { label: 'Cumulative', value: money(p.cumulative, { signed: true }), tone: tn(p.cumulative) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="pnl" radius={[4, 4, 4, 4]} maxBarSize={36} isAnimationActive animationDuration={700} onClick={(d) => onSelect?.((d as unknown as PeriodRow).key)} cursor={onSelect ? 'pointer' : undefined}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.pnl >= 0 ? C.pos : C.neg} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Generic signed bars for grouped stats (hour of day, R buckets). */
export function SignedBars({ data, height = 200, valueLabel = 'Net P&L', format = (v: number) => money(v, { signed: true }) }: { data: { key: string; label: string; value: number; n?: number }[]; height?: number; valueLabel?: string; format?: (v: number) => string }) {
  if (!data.length) return <ChartEmpty height={height} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...AXIS} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? moneyShort(v) : String(v))} />
          <ReferenceLine y={0} stroke="rgba(217,217,226,0.18)" />
          <Tooltip
            cursor={{ fill: 'rgba(180,106,255,0.07)' }}
            content={({ active, payload }: TP) => {
              const p = active && payload?.[0]?.payload as { label: string; value: number; n?: number } | undefined;
              if (!p) return null;
              return <TooltipPanel title={p.label} rows={[{ label: valueLabel, value: format(p.value), tone: tn(p.value) }, ...(p.n !== undefined ? [{ label: 'Trades', value: p.n }] : [])]} />;
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={28} isAnimationActive animationDuration={700}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.value >= 0 ? C.pos : C.neg} fillOpacity={d.n !== undefined && d.n < MIN_GROUP_SAMPLE ? 0.35 : 0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBars({ data, height = 200 }: { data: { bucket: string; count: number; mid: number }[]; height?: number }) {
  if (!data.some((d) => d.count)) return <ChartEmpty height={height}>Add stop losses to see the R distribution</ChartEmpty>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="14%">
          <XAxis dataKey="bucket" {...AXIS} interval={0} angle={0} tick={{ fill: C.axis, fontSize: 9 }} />
          <YAxis {...AXIS} width={28} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(180,106,255,0.07)' }}
            content={({ active, payload }: TP) => {
              const p = active && payload?.[0]?.payload as { bucket: string; count: number } | undefined;
              if (!p) return null;
              return <TooltipPanel title={`${p.bucket} R`} rows={[{ label: 'Trades', value: p.count }]} />;
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={700}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.mid >= 0 ? C.pos : C.neg} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Win / loss / breakeven split with the win rate in the centre. */
export function OutcomeDonut({ wins, losses, breakeven, winRate, size = 168 }: { wins: number; losses: number; breakeven: number; winRate?: number; size?: number }) {
  const total = wins + losses + breakeven;
  const data = [
    { name: 'Wins', value: wins, color: C.pos },
    { name: 'Losses', value: losses, color: C.neg },
    { name: 'Breakeven', value: breakeven, color: C.neutral },
  ].filter((d) => d.value > 0);
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${wins} wins, ${losses} losses, ${breakeven} breakeven`}>
        {total ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius="72%" outerRadius="100%" paddingAngle={data.length > 1 ? 2.5 : 0} stroke="none" cornerRadius={4} startAngle={90} endAngle={-270} isAnimationActive animationDuration={900}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }: TP) => (active && payload?.[0] ? <TooltipPanel rows={[{ label: payload[0].name, value: `${payload[0].value} (${Math.round(((payload[0].value as number) / total) * 100)}%)`, swatch: (payload[0].payload as { color: string }).color }]} /> : null)} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="size-full rounded-full border-[10px] border-white/[0.05]" />
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num text-2xl font-semibold">{winRate !== undefined ? `${winRate.toFixed(0)}%` : '—'}</div>
            <div className="eyebrow mt-0.5 text-[9px]">Win rate</div>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 text-[13px]">
        {[
          { l: 'Wins', v: wins, c: C.pos },
          { l: 'Losses', v: losses, c: C.neg },
          { l: 'Breakeven', v: breakeven, c: C.neutral },
        ].map((r) => (
          <div key={r.l} className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full" style={{ background: r.c }} />
            <span className="w-20 text-mute">{r.l}</span>
            <span className="num font-medium">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranked group performance (accessible HTML bars). Small samples are flagged and muted. */
export function GroupBars({ rows, emptyText = 'No data in this period', limit, showWinRate = true }: { rows: GroupRow[]; emptyText?: string; limit?: number; showWinRate?: boolean }) {
  if (!rows.length) return <ChartEmpty height={120}>{emptyText}</ChartEmpty>;
  const list = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(...list.map((r) => Math.abs(r.pnl)), 1);
  return (
    <ul className="space-y-2.5">
      {list.map((r) => {
        const small = r.trades < MIN_GROUP_SAMPLE;
        const w = (Math.abs(r.pnl) / max) * 50;
        return (
          <li key={r.key} className={cn('group', small && 'opacity-55')}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-fg">{r.label}</span>
                <span className="shrink-0 text-faint">{r.trades} {r.trades === 1 ? 'trade' : 'trades'}</span>
                {small && <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[10px] text-faint" title={`Fewer than ${MIN_GROUP_SAMPLE} trades — not statistically meaningful`}>low sample</span>}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                {showWinRate && <span className="num text-[11.5px] text-mute">{fmtPct(r.winRate, 0)}</span>}
                <span className={cn('num font-medium', r.pnl >= 0 ? 'text-pos' : 'text-neg')}>{money(r.pnl, { signed: true, cents: false })}</span>
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-white/[0.04]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div
                className="absolute inset-y-0 rounded-full transition-all duration-700"
                style={{
                  width: `${w}%`,
                  left: r.pnl >= 0 ? '50%' : `${50 - w}%`,
                  background: r.pnl >= 0 ? C.pos : C.neg,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Tiny inline sparkline for stat tiles. */
export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, v }));
  const up = values[values.length - 1] >= values[0];
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`sp-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? C.violet : C.neg} stopOpacity={0.3} />
              <stop offset="100%" stopColor={up ? C.violet : C.neg} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={up ? C.violet : C.neg} strokeWidth={1.75} fill={`url(#sp-${up ? 'u' : 'd'})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
