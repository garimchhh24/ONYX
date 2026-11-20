import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Settings, Trade } from '../types';
import type { EquityPoint, GroupRow } from '../lib/stats';
import { dailyPnl, rHistogram } from '../lib/stats';
import { fmtMoney, fmtNum, fmtPct } from '../lib/calc';
import { useChartColors } from './common';

const compact = (v: number) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function EquityChart({ data, settings }: { data: EquityPoint[]; settings: Settings }) {
  const c = useChartColors();
  const dates = (iso: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) : 'Старт');
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.line} stopOpacity={0.22} />
            <stop offset="100%" stopColor={c.line} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis dataKey="i" tickLine={false} axisLine={false} minTickGap={30} tickFormatter={(i) => dates(data[i]?.date ?? '')} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compact} domain={['auto', 'auto']} />
        <ReferenceLine y={settings.startingBalance} stroke={c.zero} strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: c.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as EquityPoint | undefined;
            if (!active || !p) return null;
            return (
              <div className="chart-tip">
                <div className="muted">{p.i ? `Сделка #${p.i} · ${p.symbol} · ${dates(p.date)}` : 'Стартовый баланс'}</div>
                <div>Баланс: <b>{fmtMoney(p.equity, settings.currency)}</b></div>
                {p.i > 0 && <div>Результат: <b className={p.pnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(p.pnl, settings.currency, true)}</b></div>}
                {p.drawdown < 0 && <div>Просадка от пика: <b className="neg">{fmtMoney(p.drawdown, settings.currency)}</b></div>}
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="equity" stroke={c.line} strokeWidth={2} fill="url(#eqFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ data, settings }: { data: EquityPoint[]; settings: Settings }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="i" hide />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compact} />
        <Tooltip
          cursor={{ stroke: c.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as EquityPoint | undefined;
            if (!active || !p) return null;
            return <div className="chart-tip">Сделка #{p.i}: <b>{fmtMoney(p.drawdown, settings.currency)}</b></div>;
          }}
        />
        <Area type="stepAfter" dataKey="drawdown" stroke={c.neg} strokeWidth={2} fill={c.neg} fillOpacity={0.15} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Diverging bar chart of PnL per group (session / weekday / hour). */
export function PnlBars({ rows, settings, height = 220 }: { rows: GroupRow[]; settings: Settings; height?: number }) {
  const c = useChartColors();
  if (!rows.length) return <div className="muted small">Нет данных</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={rows.length > 12 ? 2 : '20%'}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickLine={false} axisLine={false} interval={rows.length > 12 ? 2 : 0} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compact} />
        <ReferenceLine y={0} stroke={c.zero} />
        <Tooltip
          cursor={{ fill: c.grid, fillOpacity: 0.5 }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as GroupRow | undefined;
            if (!active || !r) return null;
            return (
              <div className="chart-tip">
                <div><b>{r.key}</b></div>
                <div>P&L: <b className={r.pnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(r.pnl, settings.currency, true)}</b></div>
                <div>Сделок: <b>{r.trades}</b> · Винрейт: <b>{fmtPct(r.winRate, 0)}</b></div>
                <div>Средний R: <b>{fmtNum(r.avgR, 2, true)}</b></div>
              </div>
            );
          }}
        />
        <Bar dataKey="pnl" radius={[3, 3, 3, 3]} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.key} fill={r.pnl >= 0 ? c.pos : c.neg} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RHistogram({ trades }: { trades: Trade[] }) {
  const c = useChartColors();
  const data = useMemo(() => rHistogram(trades), [trades]);
  const total = data.reduce((a, b) => a + b.count, 0);
  if (!total) return <div className="muted small">Укажите стоп-лосс или риск в сделках, чтобы видеть распределение R.</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={44} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: c.grid, fillOpacity: 0.5 }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as { bucket: string; count: number } | undefined;
            if (!active || !r) return null;
            return <div className="chart-tip">{r.bucket}R: <b>{r.count}</b> сделок ({((r.count / total) * 100).toFixed(0)}%)</div>;
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.bucket} fill={d.from >= 0 ? c.pos : c.neg} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function PnlCalendar({ trades, settings }: { trades: Trade[]; settings: Settings }) {
  const daily = useMemo(() => dailyPnl(trades, settings), [trades, settings]);
  const latest = useMemo(() => {
    const keys = [...daily.keys()].sort();
    const k = keys.at(-1);
    return k ? { y: Number(k.slice(0, 4)), m: Number(k.slice(5, 7)) - 1 } : { y: new Date().getFullYear(), m: new Date().getMonth() };
  }, [daily]);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const { y, m } = cursor ?? latest;
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const keyOf = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthVals = Array.from({ length: days }, (_, i) => daily.get(keyOf(i + 1))?.pnl ?? 0);
  const maxAbs = Math.max(1, ...monthVals.map(Math.abs));
  const monthTotal = monthVals.reduce((a, b) => a + b, 0);
  const shift = (d: number) => {
    const mm = m + d;
    setCursor({ y: y + Math.floor(mm / 12), m: ((mm % 12) + 12) % 12 });
  };
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn small" onClick={() => shift(-1)} aria-label="Предыдущий месяц">‹</button>
        <b style={{ minWidth: 130, textAlign: 'center' }}>{MONTHS[m]} {y}</b>
        <button className="btn small" onClick={() => shift(1)} aria-label="Следующий месяц">›</button>
        <span className="spacer" />
        <span className={`num ${monthTotal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(monthTotal, settings.currency, true)}</span>
      </div>
      <div className="cal">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={'e' + i} className="day empty" />)}
        {Array.from({ length: days }, (_, i) => {
          const v = daily.get(keyOf(i + 1));
          const pct = v ? Math.round(18 + (Math.abs(v.pnl) / maxAbs) * 62) : 0;
          const bg = v ? `color-mix(in oklab, var(${v.pnl >= 0 ? '--pos' : '--neg'}) ${pct}%, var(--neutral))` : undefined;
          return (
            <div key={i} className="day" style={{ background: bg }} title={v ? `${keyOf(i + 1)}: ${fmtMoney(v.pnl, settings.currency, true)}, сделок: ${v.trades}` : keyOf(i + 1)}>
              <span className="d">{i + 1}</span>
              {v && (
                <>
                  <span className="p num">{compact(v.pnl)}</span>
                  <span className="t">{v.trades} сд.</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GroupTable({ rows, settings, label }: { rows: GroupRow[]; settings: Settings; label: string }) {
  if (!rows.length) return <div className="muted small">Нет данных</div>;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th className="r">Сделок</th>
            <th className="r">Винрейт</th>
            <th className="r">Ср. R</th>
            <th className="r">PF</th>
            <th className="r">P&L</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td className="r">{r.trades}</td>
              <td className="r">{fmtPct(r.winRate, 0)}</td>
              <td className="r">{fmtNum(r.avgR, 2, true)}</td>
              <td className="r">{r.profitFactor === Infinity ? '∞' : fmtNum(r.profitFactor)}</td>
              <td className={`r ${r.pnl >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(r.pnl, settings.currency, true)}</td>
              <td className="bar-cell">
                <span
                  className="bar"
                  style={{
                    left: r.pnl >= 0 ? '50%' : `${50 - (Math.abs(r.pnl) / maxAbs) * 50}%`,
                    width: `${(Math.abs(r.pnl) / maxAbs) * 50}%`,
                    background: r.pnl >= 0 ? 'var(--pos)' : 'var(--neg)',
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
