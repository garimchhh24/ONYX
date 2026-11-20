import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ETrade } from '../lib/calc';
import { money, moneyShort, fmtR, fmtPct } from '../lib/calc';
import type { EquityPoint, GroupRow } from '../lib/stats';
import { dailyPnl, rHistogram } from '../lib/stats';
import { addDaysKey, todayTradingDay } from '../lib/time';

export const C = { pos: '#3987e5', neg: '#e66767', line: '#d9d9d9', grid: '#1d1d21', zero: '#3a3a3f', muted: '#7b7b7f', surface: '#0e0e10' };

const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'старт');

export function EquityChart({ data, height = 200 }: { data: EquityPoint[]; height?: number }) {
  if (data.length < 2) return <div className="muted small">Пока нет закрытых сделок</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="eqStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#9a9a9a" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="i" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(i) => shortDate(data[i]?.date ?? '')} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={moneyShort} />
        <ReferenceLine y={0} stroke={C.zero} strokeDasharray="3 4" />
        <Tooltip
          cursor={{ stroke: C.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as EquityPoint | undefined;
            if (!active || !p || !p.i) return null;
            return (
              <div className="chart-tip">
                <div className="muted">#{p.i} · {p.symbol} · {shortDate(p.date)}</div>
                <div>Итог: <b className="num">{money(p.equity, { signed: true })}</b></div>
                <div>Сделка: <b className={p.pnl >= 0 ? 'pos' : 'neg'}>{money(p.pnl, { signed: true })}</b></div>
                {p.drawdown < 0 && <div>От пика: <b className="neg">{money(p.drawdown)}</b></div>}
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="equity" stroke="url(#eqStroke)" strokeWidth={2} fill="url(#eqFill)" dot={false} activeDot={{ r: 4, fill: '#fff', stroke: C.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const barTip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
  const r = payload?.[0]?.payload as GroupRow | undefined;
  if (!active || !r) return null;
  return (
    <div className="chart-tip">
      <b>{r.key}</b>
      <div>P&L: <b className={r.pnl >= 0 ? 'pos' : 'neg'}>{money(r.pnl, { signed: true })}</b></div>
      <div>{r.trades} сд. · винрейт {fmtPct(r.winRate)} · {fmtR(r.avgR)}</div>
    </div>
  );
};

/** Horizontal bars — long category names (sessions) stay readable on a phone. */
export function PnlBarsH({ rows }: { rows: GroupRow[] }) {
  if (!rows.length) return <div className="muted small">Нет данных</div>;
  return (
    <ResponsiveContainer width="100%" height={rows.length * 36 + 28}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={moneyShort} />
        <YAxis type="category" dataKey="key" tickLine={false} axisLine={false} width={104} tick={{ fontSize: 11.5, fill: '#b7b7b1' }} />
        <ReferenceLine x={0} stroke={C.zero} />
        <Tooltip cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} content={barTip} />
        <Bar dataKey="pnl" radius={[3, 3, 3, 3]} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.key} fill={r.pnl >= 0 ? C.pos : C.neg} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PnlBars({ rows, height = 200 }: { rows: GroupRow[]; height?: number }) {
  if (!rows.length) return <div className="muted small">Нет данных</div>;
  const dense = rows.length > 8;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap={dense ? 2 : '18%'}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickLine={false} axisLine={false} interval={dense ? 'preserveStartEnd' : 0} tick={{ fontSize: 10 }} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={moneyShort} />
        <ReferenceLine y={0} stroke={C.zero} />
        <Tooltip cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} content={barTip} />
        <Bar dataKey="pnl" radius={[3, 3, 3, 3]} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.key} fill={r.pnl >= 0 ? C.pos : C.neg} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RHistogram({ trades }: { trades: ETrade[] }) {
  const data = useMemo(() => rHistogram(trades), [trades]);
  const total = data.reduce((a, b) => a + b.count, 0);
  if (!total) return <div className="muted small">Укажите стоп (в пунктах, ценой или риском в $), чтобы видеть результат в R.</div>;
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} interval={1} tick={{ fontSize: 9.5 }} />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: '#ffffff', fillOpacity: 0.04 }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as { bucket: string; count: number } | undefined;
            if (!active || !r) return null;
            return <div className="chart-tip">{r.bucket}R: <b>{r.count}</b> сд. ({((r.count / total) * 100).toFixed(0)}%)</div>;
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.bucket} fill={d.from >= 0 ? C.pos : C.neg} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function PnlCalendar({ trades }: { trades: ETrade[] }) {
  const daily = useMemo(() => dailyPnl(trades), [trades]);
  const latest = useMemo(() => {
    const k = [...daily.keys()].sort().at(-1) ?? todayTradingDay();
    return { y: Number(k.slice(0, 4)), m: Number(k.slice(5, 7)) - 1 };
  }, [daily]);
  const [cur, setCur] = useState<{ y: number; m: number } | null>(null);
  const { y, m } = cur ?? latest;
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const key = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const vals = Array.from({ length: days }, (_, i) => daily.get(key(i + 1))?.pnl ?? 0);
  const maxAbs = Math.max(1, ...vals.map(Math.abs));
  const total = vals.reduce((a, b) => a + b, 0);
  const shift = (d: number) => {
    const mm = m + d;
    setCur({ y: y + Math.floor(mm / 12), m: ((mm % 12) + 12) % 12 });
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row between">
        <div className="row">
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => shift(-1)} aria-label="Предыдущий месяц">‹</button>
          <b className="display" style={{ minWidth: 112, textAlign: 'center' }}>{MONTHS[m]} {y}</b>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => shift(1)} aria-label="Следующий месяц">›</button>
        </div>
        <b className={`display num ${total >= 0 ? 'pos' : 'neg'}`}>{money(total, { signed: true, cents: false })}</b>
      </div>
      <div className="cal">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={'e' + i} className="d e" />)}
        {Array.from({ length: days }, (_, i) => {
          const v = daily.get(key(i + 1));
          const pct = v ? Math.round(22 + (Math.abs(v.pnl) / maxAbs) * 58) : 0;
          const bg = v ? `color-mix(in oklab, ${v.pnl >= 0 ? C.pos : C.neg} ${pct}%, #151518)` : undefined;
          return (
            <div key={i} className="d" style={{ background: bg }} title={v ? `${key(i + 1)}: ${money(v.pnl, { signed: true })}, ${v.trades} сд.` : undefined}>
              <span>{i + 1}</span>
              {v && <b className="num">{moneyShort(v.pnl)}</b>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact list with a diverging bar — reads well on a phone. */
export function GroupList({ rows, empty = 'Нет данных' }: { rows: GroupRow[]; empty?: string }) {
  if (!rows.length) return <div className="muted small">{empty}</div>;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <div className="glist">
      {rows.map((r) => {
        const w = (Math.abs(r.pnl) / maxAbs) * 50;
        return (
          <div key={r.key}>
            <span className="k">{r.key}</span>
            <span className={`p ${r.pnl >= 0 ? 'pos' : 'neg'}`}>{money(r.pnl, { signed: true, cents: false })}</span>
            <span className="m">{r.trades} сд. · винрейт {fmtPct(r.winRate)} · PF {r.profitFactor === Infinity ? '∞' : r.profitFactor?.toFixed(2) ?? '—'}</span>
            <span className="m" style={{ textAlign: 'right' }}>{fmtR(r.avgR)}</span>
            <span className="barline">
              <span style={{ left: r.pnl >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: r.pnl >= 0 ? C.pos : C.neg }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Mon–Fri strip for the current trading week. */
export function WeekStrip({ trades }: { trades: ETrade[] }) {
  const today = todayTradingDay();
  const daily = useMemo(() => dailyPnl(trades), [trades]);
  const [y, mo, d] = today.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
  const monday = addDaysKey(today, -wd); // on weekends: the week that just ended
  const keys = Array.from({ length: 5 }, (_, i) => addDaysKey(monday, i));
  const total = keys.reduce((a, k) => a + (daily.get(k)?.pnl ?? 0), 0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between">
        <span className="hero-label">Эта неделя</span>
        <b className={`display num ${total > 0 ? 'pos' : total < 0 ? 'neg' : ''}`}>{money(total, { signed: true, cents: false })}</b>
      </div>
      <div className="week">
        {keys.map((k, i) => {
          const v = daily.get(k);
          const bg = v ? `color-mix(in oklab, ${v.pnl >= 0 ? C.pos : C.neg} 30%, #151518)` : undefined;
          return (
            <div key={k} className={k === today ? 'today' : ''} style={{ background: bg }}>
              <span>{['пн', 'вт', 'ср', 'чт', 'пт'][i]}</span>
              <b className={v ? '' : 'muted'}>{v ? moneyShort(v.pnl) : '—'}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
