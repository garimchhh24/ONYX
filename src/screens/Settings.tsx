import { useRef, useState } from 'react';
import type { Instrument, SessionDef, Settings as SettingsT } from '../types';
import { useJournal, useNav } from '../context';
import { enrichAll, fmtR, money, uid } from '../lib/calc';
import { importFile, type ImportResult, type TimeZoneMode } from '../lib/importers';
import { DEFAULT_INSTRUMENTS } from '../lib/instruments';
import { DEFAULT_SESSIONS } from '../lib/sessions';
import { bulkSave, exportJson, importJson, saveSettings, toast } from '../store';
import { Field, Icon, NumInput, Seg, Sheet, TopBar, saveFile } from '../ui';
import { hasDemo, loadDemo, removeDemo } from './demoActions';

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="stack">
      <div className="section-head"><h2>{title}</h2></div>
      <div className="card stack">{children}{hint && <span className="tiny muted">{hint}</span>}</div>
    </section>
  );
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('');
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="chips">
        {items.map((x) => (
          <button key={x} type="button" className="chip" onClick={() => onChange(items.filter((y) => y !== x))} aria-label={`Удалить ${x}`}>
            {x} <Icon name="x" size={13} />
          </button>
        ))}
      </div>
      <div className="row">
        <input className="input grow" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onChange([...items, v.trim()]); setV(''); } }} />
        <button type="button" className="btn" disabled={!v.trim() || items.includes(v.trim())} onClick={() => { onChange([...items, v.trim()]); setV(''); }}>Добавить</button>
      </div>
    </div>
  );
}

function InstrumentSheet({ inst, onSave, onDelete, onClose }: { inst: Instrument; onSave: (i: Instrument) => void; onDelete?: () => void; onClose: () => void }) {
  const [i, setI] = useState(inst);
  return (
    <Sheet title={inst.symbol || 'Новый инструмент'} onClose={onClose}>
      <div className="grid2">
        <Field label="Тикер"><input className="input" value={i.symbol} onChange={(e) => setI({ ...i, symbol: e.target.value.toUpperCase().replace(/\s/g, '') })} /></Field>
        <Field label="Название"><input className="input" value={i.name} onChange={(e) => setI({ ...i, name: e.target.value })} /></Field>
        <Field label="Шаг цены (тик)"><NumInput value={i.tickSize} onChange={(v) => setI({ ...i, tickSize: v ?? 0 })} /></Field>
        <Field label="Стоимость тика, $"><NumInput value={i.tickValue} onChange={(v) => setI({ ...i, tickValue: v ?? 0 })} /></Field>
        <Field label="Комиссия за контракт, $" hint="вход + выход"><NumInput value={i.commission} onChange={(v) => setI({ ...i, commission: v ?? 0 })} /></Field>
        <Field label="Тип"><Seg value={i.micro ? 'micro' : 'mini'} options={[['mini', 'Мини'], ['micro', 'Микро']]} onChange={(v) => setI({ ...i, micro: v === 'micro' })} /></Field>
      </div>
      <label className="row" style={{ gap: 10 }}>
        <input type="checkbox" checked={!!i.favorite} onChange={(e) => setI({ ...i, favorite: e.target.checked })} style={{ width: 20, height: 20 }} />
        <span>Показывать в быстром вводе</span>
      </label>
      <button className="btn chrome-btn block" disabled={!i.symbol || !i.tickSize || !i.tickValue} onClick={() => onSave(i)}>Сохранить</button>
      {onDelete && <button className="btn danger block" onClick={onDelete}>Удалить инструмент</button>}
    </Sheet>
  );
}

const TZ: [string, string][] = [
  ['local', 'Время телефона'],
  ['America/New_York', 'Нью-Йорк (ET)'],
  ['America/Chicago', 'Чикаго (CT)'],
  ['UTC', 'UTC'],
];

function ImportCard() {
  const { s } = useJournal();
  const [accountIds, setAccountIds] = useState<string[]>(() => s.accounts.filter((a) => a.status === 'active').slice(0, 1).map((a) => a.id));
  const [tz, setTz] = useState('local');
  const [res, setRes] = useState<(ImportResult & { file: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const tzMode = (): TimeZoneMode => (tz === 'local' ? { kind: 'local' } : { kind: 'zone', zone: tz });
  const existing = new Set(s.trades.map((t) => t.externalId).filter(Boolean));
  const fresh = res ? res.trades.filter((t) => !t.externalId || !existing.has(t.externalId)) : [];
  const preview = res ? enrichAll(fresh, s.settings) : [];
  const net = preview.reduce((a, t) => a + (t.net ?? 0), 0);

  return (
    <Section title="Импорт сделок" hint="Tradovate: Performance → экспорт CSV. NinjaTrader 8: Trade Performance → Trades → экспорт. TopstepX и другие ProjectX-платформы: история сделок → Export. Повторный импорт не создаёт дублей.">
      <Field label="На какие счета">
        <div className="chips">
          {s.accounts.filter((a) => a.status === 'active').map((a) => {
            const on = accountIds.includes(a.id);
            return <button key={a.id} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => setAccountIds(on ? accountIds.filter((x) => x !== a.id) : [...accountIds, a.id])}>{a.name}</button>;
          })}
          {!s.accounts.some((a) => a.status === 'active') && <span className="small muted">Сначала добавьте счёт — или импортируйте без счёта.</span>}
        </div>
      </Field>
      <Field label="Часовой пояс времени в файле">
        <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
          {TZ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <button className="btn block" onClick={() => ref.current?.click()}><Icon name="upload" size={18} />Выбрать CSV-файл</button>
      <input
        ref={ref}
        type="file"
        accept=".csv,.txt,text/csv"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            setRes({ ...(await importFile(f, { tz: tzMode(), accountIds, instruments: s.settings.instruments })), file: f.name });
          } catch (err) {
            toast('Не удалось прочитать файл: ' + (err as Error).message);
          }
        }}
      />
      {res && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="banner info" style={{ display: 'block' }}>
            <b>{res.file}</b> · {res.format}<br />
            Найдено {res.trades.length}, новых {fresh.length}{res.skipped ? `, пропущено строк ${res.skipped}` : ''} · итог {money(net, { signed: true })}
          </div>
          {res.warnings.map((w) => <span key={w} className="small" style={{ color: '#ffd16e' }}>{w}</span>)}
          <div className="list">
            {preview.slice(-5).reverse().map((t) => (
              <div key={t.id} className="kv">
                <span>{new Date(t.entryTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {t.symbol} ×{t.contracts} {t.direction === 'long' ? 'L' : 'S'}</span>
                <b className={t.outcome === 'win' ? 'pos' : t.outcome === 'loss' ? 'neg' : ''}>{money(t.net, { signed: true })}{t.r !== undefined ? ` · ${fmtR(t.r)}` : ''}</b>
              </div>
            ))}
          </div>
          <div className="grid2">
            <button className="btn" onClick={() => setRes(null)}>Отмена</button>
            <button
              className="btn chrome-btn"
              disabled={!fresh.length || busy}
              onClick={async () => {
                setBusy(true);
                const n = await bulkSave('trades', fresh.map((t) => ({ ...t, accountIds })));
                setBusy(false);
                setRes(null);
                toast(`Импортировано ${n} сделок`);
              }}
            >
              {busy ? 'Импорт…' : `Импортировать ${fresh.length}`}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

export function Settings() {
  const { s } = useJournal();
  const nav = useNav();
  const st = s.settings;
  const [inst, setInst] = useState<{ i: Instrument; isNew: boolean } | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<SettingsT>) => void saveSettings({ ...st, ...patch });
  const setSession = (id: string, patch: Partial<SessionDef>) => update({ sessions: st.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  return (
    <>
      <TopBar left={<button className="icon-btn" onClick={nav.pop} aria-label="Назад"><Icon name="back" /></button>} title="Настройки" />
      <div className="stack-lg">
        <Section title="Где хранятся данные">
          {s.backend === 'cloud' ? (
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span className="icon-btn" style={{ flex: 'none' }}><Icon name="cloud" /></span>
              <span className="small dim">В вашем аккаунте Claude. Журнал синхронизируется между телефоном и компьютером и виден только вам.{s.error ? ` Сейчас: ${s.error}` : ''}</span>
            </div>
          ) : (
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span className="icon-btn" style={{ flex: 'none' }}><Icon name="wallet" /></span>
              <span className="small dim">Только на этом устройстве (в браузере). Делайте резервную копию, чтобы не потерять журнал при очистке браузера или смене телефона.</span>
            </div>
          )}
        </Section>

        <Section title="Мои правила на день" hint="Пустое поле — правило выключено. При достижении лимита главная предложит закончить торговлю.">
          <div className="grid3">
            <Field label="Макс. сделок"><NumInput value={st.discipline.maxTradesPerDay} onChange={(v) => update({ discipline: { ...st.discipline, maxTradesPerDay: v || undefined } })} placeholder="—" /></Field>
            <Field label="Стопов подряд"><NumInput value={st.discipline.maxLossesPerDay} onChange={(v) => update({ discipline: { ...st.discipline, maxLossesPerDay: v || undefined } })} placeholder="—" /></Field>
            <Field label="Убыток, $"><NumInput value={st.discipline.dailyLossLimit} onChange={(v) => update({ discipline: { ...st.discipline, dailyLossLimit: v || undefined } })} placeholder="—" /></Field>
          </div>
        </Section>

        <Section title="Инструменты и комиссии" hint="Комиссии подставлены примерные — укажите свои (за контракт, вход + выход), чтобы P&L совпадал с платформой.">
          <div className="list">
            {st.instruments.map((i) => (
              <button key={i.symbol} className="trade-row" onClick={() => setInst({ i, isNew: false })}>
                <span className="sym" style={{ minWidth: 52 }}>{i.symbol}</span>
                <span className="grow tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.name} · тик {i.tickSize} = ${i.tickValue}</span>
                <span className="small num">${i.commission}</span>
                {i.favorite && <span className="muted"><Icon name="star" size={14} fill stroke={1} /></span>}
              </button>
            ))}
          </div>
          <div className="grid2">
            <button className="btn" onClick={() => setInst({ i: { symbol: '', name: '', tickSize: 0.25, tickValue: 1, commission: 1.5 }, isNew: true })}>+ Инструмент</button>
            <button className="btn" onClick={() => update({ instruments: DEFAULT_INSTRUMENTS })}>Сбросить</button>
          </div>
        </Section>

        <Section title="Сессии" hint="Время Нью-Йорка, переход на летнее время учитывается. Сессия сделки определяется автоматически по времени входа.">
          {st.sessions.map((x) => (
            <div key={x.id} className="grid3" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)' }}>
              <input className="input" value={x.name} onChange={(e) => setSession(x.id, { name: e.target.value })} aria-label="Название" />
              <input className="input" type="time" value={x.start} onChange={(e) => setSession(x.id, { start: e.target.value })} aria-label="Начало" />
              <input className="input" type="time" value={x.end} onChange={(e) => setSession(x.id, { end: e.target.value })} aria-label="Конец" />
            </div>
          ))}
          <div className="grid2">
            <button className="btn" onClick={() => update({ sessions: [...st.sessions, { id: uid(), name: 'Новая', timeZone: 'America/New_York', start: '09:30', end: '10:00' }] })}>+ Сессия</button>
            <button className="btn" onClick={() => update({ sessions: DEFAULT_SESSIONS })}>Сбросить</button>
          </div>
        </Section>

        <Section title="Сетапы"><ListEditor items={st.setups} onChange={(v) => update({ setups: v })} placeholder="Новый сетап" /></Section>
        <Section title="Ошибки"><ListEditor items={st.mistakes} onChange={(v) => update({ mistakes: v })} placeholder="Новая ошибка" /></Section>
        <Section title="Состояния"><ListEditor items={st.emotions} onChange={(v) => update({ emotions: v })} placeholder="Новое состояние" /></Section>

        <ImportCard />

        <Section title="Резервная копия">
          <div className="grid2">
            <button className="btn" onClick={() => void saveFile(`onyx-journal-${new Date().toISOString().slice(0, 10)}.json`, exportJson(), 'application/json')}><Icon name="download" size={18} />Скачать JSON</button>
            <button className="btn" onClick={() => backupRef.current?.click()}><Icon name="upload" size={18} />Восстановить</button>
          </div>
          <button className="btn block" onClick={() => void saveFile(`onyx-trades-${new Date().toISOString().slice(0, 10)}.csv`, tradesCsv(s), 'text/csv')}>Экспорт сделок в CSV (Excel)</button>
          <input
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                toast(`Восстановлено сделок: ${await importJson(await f.text())}`);
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          />
        </Section>

        <Section title="Демо-данные">
          {hasDemo() ? (
            <button className="btn danger block" onClick={() => void removeDemo()}>Удалить демо-данные</button>
          ) : (
            <button className="btn block" onClick={() => void loadDemo()}>Загрузить демо (3 счёта, ~100 сделок)</button>
          )}
        </Section>
        <p className="tiny muted" style={{ textAlign: 'center' }}>ONYX · журнал проп-трейдера</p>
      </div>
      {inst && (
        <InstrumentSheet
          inst={inst.i}
          onClose={() => setInst(null)}
          onSave={(i) => {
            const list = inst.isNew ? [...st.instruments.filter((x) => x.symbol !== i.symbol), i] : st.instruments.map((x) => (x.symbol === inst.i.symbol ? i : x));
            update({ instruments: list });
            setInst(null);
          }}
          onDelete={inst.isNew ? undefined : () => { update({ instruments: st.instruments.filter((x) => x.symbol !== inst.i.symbol) }); setInst(null); }}
        />
      )}
    </>
  );
}

function tradesCsv(s: ReturnType<typeof useJournal>['s']): string {
  const names = new Map(s.accounts.map((a) => [a.id, a.name]));
  const rows = enrichAll(s.trades, s.settings);
  const esc = (v: unknown) => {
    const str = v === undefined || v === null ? '' : String(v);
    return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = ['entry_time', 'exit_time', 'trading_day', 'accounts', 'symbol', 'direction', 'contracts', 'entry', 'exit', 'stop', 'points', 'net_pnl', 'fees', 'risk', 'r', 'session', 'setup', 'followed_plan', 'mistakes', 'emotion', 'rating', 'notes'];
  const lines = rows.map((t) =>
    [t.entryTime, t.exitTime, t.day, t.accountIds.map((id) => names.get(id) ?? id).join(' | '), t.symbol, t.direction, t.contracts, t.entryPrice, t.exitPrice, t.stopPrice, t.points?.toFixed(2), t.net?.toFixed(2), t.feesUsd.toFixed(2), t.risk?.toFixed(2), t.r?.toFixed(2), t.session, t.setup, t.followedPlan, t.mistakes.join(' | '), t.emotion, t.rating, t.notes]
      .map(esc)
      .join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\n');
}
