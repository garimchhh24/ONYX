import { useMemo, useState } from 'react';
import type { Analysis, Direction, Settings, Trade } from '../types';
import {
  durationMinutes, fmtMoney, fmtNum, fmtPct, outcome, plannedRR, riskPercent, tradePnl, tradeR, tradeRisk, tradeSession, uid,
} from '../lib/calc';
import { formatDuration, fromLocalInput, toLocalInput } from '../lib/time';
import { Analyses } from './Analyses';

interface Draft {
  symbol: string;
  direction: Direction;
  entryTime: string;
  exitTime: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  size: string;
  pointValue: string;
  fees: string;
  pnlOverride: string;
  riskOverride: string;
  account: string;
  setup: string;
  tags: string;
  mistakes: string[];
  emotion: string;
  rating: number;
  followedPlan: '' | 'yes' | 'no';
  notes: string;
  analyses: Analysis[];
}

const str = (v: number | undefined) => (v === undefined ? '' : String(v));
const num = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
};

function toDraft(t?: Trade): Draft {
  return {
    symbol: t?.symbol ?? '',
    direction: t?.direction ?? 'long',
    entryTime: toLocalInput(t?.entryTime ?? new Date().toISOString()),
    exitTime: toLocalInput(t?.exitTime),
    entryPrice: str(t?.entryPrice),
    exitPrice: str(t?.exitPrice),
    stopLoss: str(t?.stopLoss),
    takeProfit: str(t?.takeProfit),
    size: str(t?.size ?? 1),
    pointValue: str(t?.pointValue ?? 1),
    fees: str(t?.fees ?? 0),
    pnlOverride: str(t?.pnlOverride),
    riskOverride: str(t?.riskOverride),
    account: t?.account ?? '',
    setup: t?.setup ?? '',
    tags: (t?.tags ?? []).join(', '),
    mistakes: t?.mistakes ?? [],
    emotion: t?.emotion ?? '',
    rating: t?.rating ?? 0,
    followedPlan: t?.followedPlan === undefined ? '' : t.followedPlan ? 'yes' : 'no',
    notes: t?.notes ?? '',
    analyses: t?.analyses ?? [],
  };
}

function fromDraft(d: Draft, base?: Trade): Trade {
  const now = new Date().toISOString();
  return {
    ...(base ?? { id: uid(), source: 'manual', createdAt: now }),
    symbol: d.symbol.trim().toUpperCase(),
    direction: d.direction,
    entryTime: fromLocalInput(d.entryTime) ?? now,
    exitTime: fromLocalInput(d.exitTime),
    entryPrice: num(d.entryPrice) ?? 0,
    exitPrice: num(d.exitPrice),
    stopLoss: num(d.stopLoss),
    takeProfit: num(d.takeProfit),
    size: num(d.size) ?? 1,
    pointValue: num(d.pointValue) || 1,
    fees: num(d.fees) ?? 0,
    pnlOverride: num(d.pnlOverride),
    riskOverride: num(d.riskOverride),
    account: d.account.trim() || undefined,
    setup: d.setup.trim() || undefined,
    tags: d.tags.split(',').map((s) => s.trim()).filter(Boolean),
    mistakes: d.mistakes,
    emotion: d.emotion || undefined,
    rating: d.rating || undefined,
    followedPlan: d.followedPlan === '' ? undefined : d.followedPlan === 'yes',
    notes: d.notes.trim() || undefined,
    analyses: d.analyses,
    updatedAt: now,
  } as Trade;
}

export function TradeForm({
  trade, settings, accounts, onSave, onDelete, onCancel,
}: {
  trade?: Trade;
  settings: Settings;
  accounts: string[];
  onSave: (t: Trade) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(trade));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const preview = useMemo(() => fromDraft(d, trade), [d, trade]);
  const valid = d.symbol.trim() && num(d.entryPrice) !== undefined && d.entryTime;

  const pnl = tradePnl(preview);
  const r = tradeR(preview);
  const rp = riskPercent(preview, settings);
  const o = outcome(preview);
  const field = (k: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </label>
  );

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(fromDraft(d, trade));
      }}
    >
      <div className="card">
        <div className="card-head">
          <h2>{trade ? `Сделка ${trade.symbol}` : 'Новая сделка'}</h2>
          <div className="seg">
            <button type="button" className={d.direction === 'long' ? 'on' : ''} onClick={() => set('direction', 'long')}>Long</button>
            <button type="button" className={d.direction === 'short' ? 'on' : ''} onClick={() => set('direction', 'short')}>Short</button>
          </div>
        </div>
        <div className="form-grid">
          {field('symbol', 'Инструмент *', { placeholder: 'EURUSD, BTCUSDT, NQ…', required: true})}
          {field('entryTime', 'Время входа *', { type: 'datetime-local', required: true })}
          {field('exitTime', 'Время выхода', { type: 'datetime-local' })}
          {field('entryPrice', 'Цена входа *', { inputMode: 'decimal', required: true })}
          {field('exitPrice', 'Цена выхода', { inputMode: 'decimal', placeholder: 'пусто = открыта' })}
          {field('stopLoss', 'Стоп-лосс', { inputMode: 'decimal' })}
          {field('takeProfit', 'Тейк-профит', { inputMode: 'decimal' })}
          {field('size', 'Объём (лоты / контракты)', { inputMode: 'decimal' })}
          {field('pointValue', 'Стоимость пункта', { inputMode: 'decimal', title: 'Сколько стоит движение цены на 1.0 при объёме 1. Форекс 1 лот = 100000, NQ = 20, ES = 50, крипта = 1' })}
          {field('fees', 'Комиссии + своп', { inputMode: 'decimal' })}
          {field('pnlOverride', 'P&L от брокера (необяз.)', { inputMode: 'decimal', placeholder: 'вместо расчёта' })}
          {field('riskOverride', `Риск в ${settings.currency} (необяз.)`, { inputMode: 'decimal', placeholder: 'иначе из стопа' })}
        </div>
        <div className="calc" style={{ marginTop: 12 }}>
          <div><span>Сессия (авто)</span><b>{tradeSession(preview, settings)}</b></div>
          <div><span>P&L</span><b className={o === 'win' ? 'pos' : o === 'loss' ? 'neg' : ''}>{o === 'open' ? 'открыта' : fmtMoney(pnl, settings.currency, true)}</b></div>
          <div><span>Риск</span><b>{fmtMoney(tradeRisk(preview), settings.currency)}</b></div>
          <div><span>Риск % депозита</span><b className={rp !== undefined && rp > settings.maxRiskPercent ? 'neg' : ''}>{fmtPct(rp, 2)}</b></div>
          <div><span>R-результат</span><b>{fmtNum(r, 2, true)}</b></div>
          <div><span>План R:R</span><b>{plannedRR(preview) !== undefined ? `1 : ${fmtNum(plannedRR(preview), 2)}` : '—'}</b></div>
          <div><span>Длительность</span><b>{formatDuration(durationMinutes(preview) ?? NaN)}</b></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Контекст и психология</h2></div>
        <div className="form-grid">
          <label className="field">
            <span>Сетап / стратегия</span>
            <input list="setups" value={d.setup} onChange={(e) => set('setup', e.target.value)} />
            <datalist id="setups">{settings.setups.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="field">
            <span>Счёт</span>
            <input list="accounts" value={d.account} onChange={(e) => set('account', e.target.value)} placeholder="Основной, Prop 100k…" />
            <datalist id="accounts">{accounts.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="field">
            <span>Эмоция</span>
            <select value={d.emotion} onChange={(e) => set('emotion', e.target.value)}>
              <option value="">—</option>
              {settings.emotions.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span>По торговому плану?</span>
            <select value={d.followedPlan} onChange={(e) => set('followedPlan', e.target.value as Draft['followedPlan'])}>
              <option value="">—</option>
              <option value="yes">Да</option>
              <option value="no">Нет</option>
            </select>
          </label>
          {field('tags', 'Теги (через запятую)', { placeholder: 'новости, A+ сетап…' })}
          <div className="field">
            <span>Оценка исполнения</span>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className={n <= d.rating ? 'on' : ''} onClick={() => set('rating', d.rating === n ? 0 : n)} aria-label={`${n} из 5`}>★</button>
              ))}
            </div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <span>Ошибки</span>
          <div className="chips">
            {settings.mistakes.map((m) => {
              const on = d.mistakes.includes(m);
              return (
                <button type="button" key={m} className={`chip${on ? ' on' : ''}`} onClick={() => set('mistakes', on ? d.mistakes.filter((x) => x !== m) : [...d.mistakes, m])}>{m}</button>
              );
            })}
          </div>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Заметки: почему вошёл, что увидел, что бы сделал иначе</span>
          <textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} rows={4} />
        </label>
      </div>

      <div className="card">
        <div className="card-head"><h2>Анализ по таймфреймам</h2></div>
        <Analyses value={d.analyses} onChange={(a) => set('analyses', a)} />
      </div>

      <div className="row">
        <button type="submit" className="btn primary" disabled={!valid}>Сохранить</button>
        <button type="button" className="btn" onClick={onCancel}>Отмена</button>
        <span className="spacer" />
        {onDelete && (
          <button type="button" className="btn danger" onClick={() => confirm('Удалить сделку?') && onDelete()}>Удалить</button>
        )}
      </div>
    </form>
  );
}
