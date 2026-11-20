import { useMemo, useState } from 'react';
import type { Analysis, Direction, EntryMode, Trade } from '../types';
import { useJournal, useNav } from '../context';
import { enrichTrade, fmtNum, fmtR, money, uid } from '../lib/calc';
import { formatDuration, fromLocalInput, toLocalInput } from '../lib/time';
import { saveTrade, toast } from '../store';
import { AnalysesEditor } from '../components/Analyses';
import { Field, Icon, NumInput, Seg, Stepper, TopBar, memorize, remember } from '../ui';

type Sign = 'win' | 'loss';

interface Draft {
  accountIds: string[];
  symbol: string;
  direction: Direction;
  contracts: number;
  mode: EntryMode;
  entryPrice?: number;
  exitPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  stopPoints?: number;
  targetPoints?: number;
  resultAbs?: number;
  resultSign: Sign;
  pnlAbs?: number;
  pnlSign: Sign;
  riskUsd?: number;
  entryTime: string;
  exitTime: string;
  setup?: string;
  mistakes: string[];
  emotion?: string;
  rating?: number;
  followedPlan?: boolean;
  notes: string;
  analyses: Analysis[];
}

function toDraft(t: Trade | undefined, activeIds: string[]): Draft {
  if (!t) {
    const lastAcc = remember<string[]>('accounts', []).filter((id) => activeIds.includes(id));
    return {
      accountIds: lastAcc.length ? lastAcc : activeIds.slice(0, 1),
      symbol: remember('symbol', 'NQ'),
      direction: 'long',
      contracts: remember('contracts', 1),
      mode: remember<EntryMode>('mode', 'points'),
      resultSign: 'win',
      pnlSign: 'win',
      entryTime: toLocalInput(new Date().toISOString()),
      exitTime: '',
      mistakes: [],
      notes: '',
      analyses: [],
    };
  }
  return {
    accountIds: t.accountIds,
    symbol: t.symbol,
    direction: t.direction,
    contracts: t.contracts,
    mode: t.mode,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    stopPrice: t.stopPrice,
    targetPrice: t.targetPrice,
    stopPoints: t.stopPoints,
    targetPoints: t.targetPoints,
    resultAbs: t.resultPoints !== undefined ? Math.abs(t.resultPoints) : undefined,
    resultSign: (t.resultPoints ?? 0) < 0 ? 'loss' : 'win',
    pnlAbs: t.mode === 'money' && t.pnl !== undefined ? Math.abs(t.pnl) : undefined,
    pnlSign: (t.pnl ?? 0) < 0 ? 'loss' : 'win',
    riskUsd: t.riskUsd,
    entryTime: toLocalInput(t.entryTime),
    exitTime: toLocalInput(t.exitTime),
    setup: t.setup,
    mistakes: t.mistakes,
    emotion: t.emotion,
    rating: t.rating,
    followedPlan: t.followedPlan,
    notes: t.notes ?? '',
    analyses: t.analyses,
  };
}

function fromDraft(d: Draft, base?: Trade): Trade {
  const now = new Date().toISOString();
  const t: Trade = {
    ...(base ?? { id: uid(), source: 'manual', createdAt: now }),
    accountIds: d.accountIds,
    symbol: d.symbol,
    direction: d.direction,
    contracts: d.contracts,
    mode: d.mode,
    entryTime: fromLocalInput(d.entryTime) ?? now,
    exitTime: fromLocalInput(d.exitTime),
    setup: d.setup,
    mistakes: d.mistakes,
    emotion: d.emotion,
    rating: d.rating,
    followedPlan: d.followedPlan,
    notes: d.notes.trim() || undefined,
    analyses: d.analyses,
    updatedAt: now,
  } as Trade;
  // clear every mode-specific field, then set the active mode's
  for (const k of ['entryPrice', 'exitPrice', 'stopPrice', 'targetPrice', 'stopPoints', 'targetPoints', 'resultPoints', 'pnl', 'gross', 'riskUsd'] as const) delete t[k];
  if (d.mode === 'prices') Object.assign(t, { entryPrice: d.entryPrice, exitPrice: d.exitPrice, stopPrice: d.stopPrice, targetPrice: d.targetPrice });
  if (d.mode === 'points')
    Object.assign(t, {
      stopPoints: d.stopPoints,
      targetPoints: d.targetPoints,
      resultPoints: d.resultAbs === undefined ? undefined : (d.resultSign === 'loss' ? -1 : 1) * d.resultAbs,
    });
  if (d.mode === 'money')
    Object.assign(t, {
      pnl: d.pnlAbs === undefined ? undefined : (d.pnlSign === 'loss' ? -1 : 1) * d.pnlAbs,
      riskUsd: d.riskUsd,
      stopPoints: d.stopPoints,
    });
  // keep platform data on imported trades edited in prices mode
  if (base?.source === 'import' && d.mode === 'prices' && base.gross !== undefined && d.entryPrice === base.entryPrice && d.exitPrice === base.exitPrice) t.gross = base.gross;
  return t;
}

function SignSeg({ value, onChange }: { value: Sign; onChange: (s: Sign) => void }) {
  return <Seg value={value} options={[['win', '+ Профит'], ['loss', '− Убыток']]} onChange={onChange} />;
}

export function TradeEditor({ id }: { id?: string }) {
  const { s } = useJournal();
  const nav = useNav();
  const base = id ? s.trades.find((t) => t.id === id) : undefined;
  const active = s.accounts.filter((a) => a.status === 'active');
  const [d, setD] = useState<Draft>(() => toDraft(base, active.map((a) => a.id)));
  const [allSymbols, setAllSymbols] = useState(false);
  const [more, setMore] = useState(() => !!base || remember('more', false));
  const [customSetup, setCustomSetup] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const preview = useMemo(() => enrichTrade(fromDraft(d, base), s.settings), [d, base, s.settings]);
  const inst = preview.inst;
  const favorites = s.settings.instruments.filter((i) => i.favorite || i.symbol === d.symbol);
  const shownSymbols = allSymbols ? s.settings.instruments : favorites;
  // accounts the trade belongs to, incl. finished ones when editing
  const accountChoices = [...active, ...s.accounts.filter((a) => a.status !== 'active' && d.accountIds.includes(a.id))];

  const save = async () => {
    if (!d.symbol) return;
    const t = fromDraft(d, base);
    memorize('accounts', d.accountIds);
    memorize('symbol', d.symbol);
    memorize('contracts', d.contracts);
    memorize('mode', d.mode);
    nav.pop();
    try {
      await saveTrade(t);
      const e = enrichTrade(t, s.settings);
      toast(e.net !== undefined ? `Сохранено: ${money(e.net, { signed: true })}` : 'Сделка сохранена');
    } catch {
      /* toast shown by store */
    }
  };

  const o = preview.outcome;
  return (
    <>
      <TopBar
        left={<button className="icon-btn" onClick={nav.pop} aria-label="Закрыть"><Icon name="close" /></button>}
        title={base ? 'Сделка' : 'Новая сделка'}
      />
      <div className="stack-lg">
        {accountChoices.length > 0 ? (
          <Field label={accountChoices.length > 1 ? 'Счета (можно несколько — копитрейдинг)' : 'Счёт'}>
            <div className="chips">
              {accountChoices.map((a) => {
                const on = d.accountIds.includes(a.id);
                return (
                  <button key={a.id} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => set('accountIds', on ? d.accountIds.filter((x) => x !== a.id) : [...d.accountIds, a.id])}>
                    {a.name}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : (
          <div className="banner info"><Icon name="accounts" size={18} /><span>Нет активных проп-счетов — сделка попадёт только в общую статистику. Счёт можно добавить во вкладке «Счета».</span></div>
        )}

        <Field label="Инструмент" hint={inst ? `тик ${inst.tickSize} = $${inst.tickValue} · пункт $${fmtNum(inst.tickValue / inst.tickSize, 2)} · комиссия $${inst.commission}` : 'Нет в списке инструментов — P&L считается 1:1'}>
          <div className="chips">
            {shownSymbols.map((i) => (
              <button key={i.symbol} type="button" className={`chip sym${d.symbol === i.symbol ? ' on' : ''}`} onClick={() => set('symbol', i.symbol)}>
                {i.symbol}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setAllSymbols((v) => !v)}>{allSymbols ? 'Меньше' : 'Ещё…'}</button>
          </div>
        </Field>

        <div className="dir">
          <button type="button" className={`long${d.direction === 'long' ? ' on' : ''}`} onClick={() => set('direction', 'long')}><Icon name="up" size={18} stroke={2.4} />LONG</button>
          <button type="button" className={`short${d.direction === 'short' ? ' on' : ''}`} onClick={() => set('direction', 'short')}><Icon name="down" size={18} stroke={2.4} />SHORT</button>
        </div>

        <div className="grid2">
          <Field label="Контракты"><Stepper value={d.contracts} onChange={(v) => set('contracts', v)} /></Field>
          <Field label="Ввод результата">
            <Seg value={d.mode} options={[['points', 'Пункты'], ['prices', 'Цены'], ['money', '$']]} onChange={(m) => set('mode', m)} />
          </Field>
        </div>

        {d.mode === 'points' && (
          <div className="stack">
            <div className="grid2">
              <Field label="Стоп, пунктов"><NumInput value={d.stopPoints} onChange={(v) => set('stopPoints', v)} placeholder="напр. 15" /></Field>
              <Field label="Тейк, пунктов"><NumInput value={d.targetPoints} onChange={(v) => set('targetPoints', v)} placeholder="необязательно" /></Field>
            </div>
            <Field label="Результат, пунктов">
              <div className="signed">
                <NumInput big value={d.resultAbs} onChange={(v) => set('resultAbs', v)} placeholder="0" />
                <SignSeg value={d.resultSign} onChange={(v) => set('resultSign', v)} />
              </div>
            </Field>
          </div>
        )}
        {d.mode === 'prices' && (
          <div className="grid2">
            <Field label="Вход"><NumInput value={d.entryPrice} onChange={(v) => set('entryPrice', v)} placeholder="21450.25" /></Field>
            <Field label="Выход"><NumInput value={d.exitPrice} onChange={(v) => set('exitPrice', v)} placeholder="пусто — открыта" /></Field>
            <Field label="Стоп"><NumInput value={d.stopPrice} onChange={(v) => set('stopPrice', v)} /></Field>
            <Field label="Тейк"><NumInput value={d.targetPrice} onChange={(v) => set('targetPrice', v)} placeholder="необязательно" /></Field>
          </div>
        )}
        {d.mode === 'money' && (
          <div className="stack">
            <Field label="Результат, $ (после комиссий)">
              <div className="signed">
                <NumInput big value={d.pnlAbs} onChange={(v) => set('pnlAbs', v)} placeholder="0" />
                <SignSeg value={d.pnlSign} onChange={(v) => set('pnlSign', v)} />
              </div>
            </Field>
            <div className="grid2">
              <Field label="Риск, $"><NumInput value={d.riskUsd} onChange={(v) => set('riskUsd', v)} placeholder="для R" /></Field>
              <Field label="или стоп, пунктов"><NumInput value={d.stopPoints} onChange={(v) => set('stopPoints', v)} placeholder="для R" /></Field>
            </div>
          </div>
        )}

        <div className="calc">
          <div className="main">
            <span className="hero-label">P&L на счёт</span>
            <b className={o === 'win' ? 'pos' : o === 'loss' ? 'neg' : ''}>{o === 'open' ? '—' : money(preview.net, { signed: true })}</b>
          </div>
          <div><span>R</span><b>{fmtR(preview.r)}</b></div>
          <div><span>Риск</span><b>{money(preview.risk, { cents: false })}</b></div>
          <div><span>Пункты</span><b>{fmtNum(preview.points, 2, true)}</b></div>
          <div><span>Комиссия</span><b>{money(preview.feesUsd)}</b></div>
          <div><span>План R:R</span><b>{preview.plannedRR ? `1:${fmtNum(preview.plannedRR, 1)}` : '—'}</b></div>
          <div><span>Сессия</span><b style={{ fontSize: 13 }}>{preview.session}</b></div>
        </div>

        <div className="grid2">
          <Field label="Вход"><input className="input" type="datetime-local" value={d.entryTime} onChange={(e) => set('entryTime', e.target.value)} /></Field>
          <Field label="Выход" hint={preview.durationMin !== undefined ? `в сделке ${formatDuration(preview.durationMin)}` : undefined}>
            <input className="input" type="datetime-local" value={d.exitTime} onChange={(e) => set('exitTime', e.target.value)} />
          </Field>
        </div>

        <details className="more" open={more} onToggle={(e) => { const v = (e.target as HTMLDetailsElement).open; setMore(v); memorize('more', v); }}>
          <summary className="btn block" style={{ justifyContent: 'space-between' }}>
            <span>Сетап, ошибки, эмоции, скриншоты</span>
            <Icon name={more ? 'up' : 'down'} size={18} />
          </summary>
          <div className="stack-lg" style={{ marginTop: 18 }}>
            <Field label="Сетап">
              <div className="chips">
                {[...new Set([...s.settings.setups, ...(d.setup ? [d.setup] : [])])].map((x) => (
                  <button key={x} type="button" className={`chip${d.setup === x ? ' on' : ''}`} onClick={() => set('setup', d.setup === x ? undefined : x)}>{x}</button>
                ))}
              </div>
              <div className="row">
                <input className="input grow" placeholder="Свой сетап" value={customSetup} onChange={(e) => setCustomSetup(e.target.value)} />
                <button type="button" className="btn" disabled={!customSetup.trim()} onClick={() => { set('setup', customSetup.trim()); setCustomSetup(''); }}>OK</button>
              </div>
            </Field>
            <Field label="По торговому плану?">
              <Seg value={d.followedPlan === undefined ? 'none' : d.followedPlan ? 'yes' : 'no'} options={[['yes', 'Да'], ['no', 'Нет'], ['none', 'Не отмечать']]} onChange={(v) => set('followedPlan', v === 'none' ? undefined : v === 'yes')} />
            </Field>
            <Field label="Ошибки">
              <div className="chips">
                {s.settings.mistakes.map((m) => {
                  const on = d.mistakes.includes(m);
                  return <button key={m} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => set('mistakes', on ? d.mistakes.filter((x) => x !== m) : [...d.mistakes, m])}>{m}</button>;
                })}
              </div>
            </Field>
            <Field label="Состояние">
              <div className="chips">
                {s.settings.emotions.map((m) => (
                  <button key={m} type="button" className={`chip${d.emotion === m ? ' on' : ''}`} onClick={() => set('emotion', d.emotion === m ? undefined : m)}>{m}</button>
                ))}
              </div>
            </Field>
            <Field label="Оценка исполнения">
              <div className="row" style={{ gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => set('rating', d.rating === n ? undefined : n)} aria-label={`${n} из 5`}
                    style={{ border: 0, background: 'none', padding: 4, color: n <= (d.rating ?? 0) ? '#ededed' : '#3a3a3f' }}>
                    <Icon name="star" size={30} fill stroke={1} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Заметка">
              <textarea className="input" placeholder="Почему вошёл, что увидел, что сделал бы иначе" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            <Field label="Анализ по таймфреймам">
              <AnalysesEditor value={d.analyses} onChange={(a) => set('analyses', a)} />
            </Field>
          </div>
        </details>
      </div>
      <div className="sticky-save">
        <div>
          <button className="btn chrome-btn block" onClick={save} disabled={!d.symbol}>
            <Icon name="check" size={20} stroke={2.4} />
            Сохранить
          </button>
        </div>
      </div>
    </>
  );
}
