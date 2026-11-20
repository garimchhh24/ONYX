import { useEffect, useMemo, useState } from 'react';
import type { Settings, Trade } from '../types';
import { tradeSession } from '../lib/calc';
import { OFF_SESSION } from '../lib/sessions';

export interface Filters {
  range: 'all' | '7' | '30' | '90' | 'ytd' | 'custom';
  from?: string;
  to?: string;
  account: string;
  symbol: string;
  setup: string;
  session: string;
  direction: '' | 'long' | 'short';
}

export const EMPTY_FILTERS: Filters = { range: 'all', account: '', symbol: '', setup: '', session: '', direction: '' };

export function applyFilters(trades: Trade[], f: Filters, settings: Settings): Trade[] {
  let from = -Infinity;
  let to = Infinity;
  const now = Date.now();
  if (f.range === 'ytd') from = new Date(new Date().getFullYear(), 0, 1).getTime();
  else if (f.range === 'custom') {
    if (f.from) from = new Date(f.from).getTime();
    if (f.to) to = new Date(f.to).getTime() + 86400000;
  } else if (f.range !== 'all') from = now - Number(f.range) * 86400000;
  return trades.filter((t) => {
    const ts = new Date(t.entryTime).getTime();
    if (ts < from || ts >= to) return false;
    if (f.account && (t.account || '') !== f.account) return false;
    if (f.symbol && t.symbol.toUpperCase() !== f.symbol) return false;
    if (f.setup && (t.setup || '') !== f.setup) return false;
    if (f.direction && t.direction !== f.direction) return false;
    if (f.session && !tradeSession(t, settings).split(' + ').includes(f.session)) return false;
    return true;
  });
}

export function FilterBar({ trades, settings, value, onChange }: { trades: Trade[]; settings: Settings; value: Filters; onChange: (f: Filters) => void }) {
  const opts = useMemo(() => {
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
    return {
      accounts: uniq(trades.map((t) => t.account)),
      symbols: uniq(trades.map((t) => t.symbol.toUpperCase())),
      setups: uniq(trades.map((t) => t.setup)),
    };
  }, [trades]);
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const active = JSON.stringify(value) !== JSON.stringify(EMPTY_FILTERS);
  return (
    <div className="filters">
      <select value={value.range} onChange={(e) => set({ range: e.target.value as Filters['range'] })} style={{ width: 150 }} aria-label="Период">
        <option value="all">Всё время</option>
        <option value="7">7 дней</option>
        <option value="30">30 дней</option>
        <option value="90">90 дней</option>
        <option value="ytd">С начала года</option>
        <option value="custom">Свой период…</option>
      </select>
      {value.range === 'custom' && (
        <>
          <input type="date" value={value.from ?? ''} onChange={(e) => set({ from: e.target.value })} style={{ width: 150 }} aria-label="С" />
          <input type="date" value={value.to ?? ''} onChange={(e) => set({ to: e.target.value })} style={{ width: 150 }} aria-label="По" />
        </>
      )}
      {opts.accounts.length > 1 && (
        <select value={value.account} onChange={(e) => set({ account: e.target.value })} style={{ width: 150 }} aria-label="Счёт">
          <option value="">Все счета</option>
          {opts.accounts.map((a) => <option key={a}>{a}</option>)}
        </select>
      )}
      <select value={value.symbol} onChange={(e) => set({ symbol: e.target.value })} style={{ width: 140 }} aria-label="Инструмент">
        <option value="">Все инструменты</option>
        {opts.symbols.map((a) => <option key={a}>{a}</option>)}
      </select>
      <select value={value.session} onChange={(e) => set({ session: e.target.value })} style={{ width: 140 }} aria-label="Сессия">
        <option value="">Все сессии</option>
        {settings.sessions.map((s) => <option key={s.id}>{s.name}</option>)}
        <option>{OFF_SESSION}</option>
      </select>
      <select value={value.setup} onChange={(e) => set({ setup: e.target.value })} style={{ width: 150 }} aria-label="Сетап">
        <option value="">Все сетапы</option>
        {opts.setups.map((a) => <option key={a}>{a}</option>)}
      </select>
      <select value={value.direction} onChange={(e) => set({ direction: e.target.value as Filters['direction'] })} style={{ width: 120 }} aria-label="Направление">
        <option value="">Long + Short</option>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>
      {active && <button className="btn small" onClick={() => onChange(EMPTY_FILTERS)}>Сбросить</button>}
    </div>
  );
}

/** Resolved chart colors for the current theme (SVG attributes can't read CSS vars reliably). */
export function useChartColors() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const h = () => setDark(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return dark
    ? { pos: '#3987e5', neg: '#e66767', line: '#3987e5', grid: '#2f2f2c', muted: '#8d8c85', surface: '#1a1a19', zero: '#55554f' }
    : { pos: '#2a78d6', neg: '#e34948', line: '#2a78d6', grid: '#e2e1dc', muted: '#7a7974', surface: '#fcfcfb', zero: '#b5b4ae' };
}

export function Kpi({ label, value, sub, tone, hero }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg'; hero?: boolean }) {
  return (
    <div className={`kpi${hero ? ' hero' : ''}`}>
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export const tone = (v: number | undefined): 'pos' | 'neg' | undefined => (v === undefined ? undefined : v > 0 ? 'pos' : v < 0 ? 'neg' : undefined);

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog">
      <img src={src} alt="График" />
    </div>
  );
}

export function download(name: string, content: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
