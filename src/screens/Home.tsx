import { useMemo, useRef } from 'react';
import { useJournal, useNav } from '../context';
import { fmtR, money } from '../lib/calc';
import { insights, summarize } from '../lib/stats';
import { formatDayKey, todayTradingDay } from '../lib/time';
import { AccountCard } from '../components/AccountCard';
import { TradeRow } from '../components/TradeRow';
import { WeekStrip } from '../components/Charts';
import { Brand, Icon, LOGO, TopBar } from '../ui';
import { SyncBadge } from '../components/SyncBadge';
import { loadDemo } from './demoActions';
import { useVisionAvailable } from '../lib/vision-client';

export function Home() {
  const { s, trades, states } = useJournal();
  const nav = useNav();
  const today = todayTradingDay();
  const todays = useMemo(() => trades.filter((t) => t.day === today), [trades, today]);
  const sum = useMemo(() => summarize(todays), [todays]);
  const tip = useMemo(() => insights(trades, s.settings)[0], [trades, s.settings]);
  const active = s.accounts.filter((a) => a.status === 'active');
  const recent = trades.slice(-5).reverse();
  const d = s.settings.discipline;
  const vision = useVisionAvailable();
  const shotInput = useRef<HTMLInputElement>(null);
  const shotButton = vision ? (
    <>
      <button type="button" className="card press shot-cta" onClick={() => shotInput.current?.click()}>
        <span className="shotfill-icon"><Icon name="camera" size={22} /></span>
        <span className="grow">
          <b>Сделка по скриншоту</b>
          <span className="tiny muted" style={{ display: 'block' }}>Прикрепите скриншот позиции из TradingView — поля заполнятся сами</span>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      <input
        ref={shotInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) nav.push({ kind: 'trade-edit', shot: f });
        }}
      />
    </>
  ) : null;

  // discipline (per trade, not per account)
  const closedToday = todays.filter((t) => t.outcome !== 'open').sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  let streak = 0;
  for (const t of closedToday) streak = t.outcome === 'loss' ? streak + 1 : t.outcome === 'win' ? 0 : streak;
  const lossesToday = closedToday.filter((t) => t.outcome === 'loss').length;
  const hitTrades = d.maxTradesPerDay !== undefined && todays.length >= d.maxTradesPerDay;
  const hitLosses = d.maxLossesPerDay !== undefined && streak >= d.maxLossesPerDay;
  const hitLoss = d.dailyLossLimit !== undefined && sum.net <= -d.dailyLossLimit;
  const copies = todays.length ? Math.max(...todays.map((t) => t.accountIds.length)) : 0;
  const totalToday = todays.reduce((a, t) => a + (t.net ?? 0) * Math.max(1, t.accountIds.length), 0);

  if (!s.accounts.length && !s.trades.length) {
    return (
      <>
        <TopBar title={<Brand />} right={<button className="icon-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Настройки"><Icon name="gear" /></button>} />
        <div className="card empty">
          <img src={LOGO} alt="" />
          <h2>Журнал проп-трейдера</h2>
          <p>Следите за целью, просадкой и дневным лимитом каждого челленджа и записывайте сделки за пару касаний.</p>
          <div className="steps">
            <div>Добавьте проп-счёт: фирму, размер и правила</div>
            <div>Записывайте сделки с телефона — кнопкой «+»</div>
            <div>Смотрите, где вы теряете и что улучшить</div>
          </div>
          <button className="btn chrome-btn block" onClick={() => nav.push({ kind: 'account-edit' })}>Добавить проп-счёт</button>
          <button className="btn block" onClick={() => void loadDemo()}>Посмотреть на демо-данных</button>
        </div>
        {shotButton && <div style={{ marginTop: 16 }}>{shotButton}</div>}
      </>
    );
  }

  return (
    <>
      <TopBar
        title={<Brand />}
        right={
          <>
            <SyncBadge />
            <button className="icon-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Настройки"><Icon name="gear" /></button>
          </>
        }
      />
      <div className="stack-lg">
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row between">
            <span className="hero-label">Сегодня · {formatDayKey(today)}</span>
            {todays.length > 0 && <span className="small dim">{todays.length} сд. · {sum.wins}W {sum.losses}L</span>}
          </div>
          <div className={`hero-num ${sum.net > 0 ? 'pos' : sum.net < 0 ? 'neg' : 'flat'}`}>{money(sum.net, { signed: true })}</div>
          <div className="small dim">
            {todays.length === 0 ? 'Сделок пока нет. Хорошего дня и чёткого плана.' : <>
              {sum.rCount ? `${fmtR(sum.totalR)} · ` : ''}на один счёт{copies > 1 ? ` · всего на ${copies} счетах ${money(totalToday, { signed: true, cents: false })}` : ''}
            </>}
          </div>
          {(d.maxTradesPerDay || d.maxLossesPerDay || d.dailyLossLimit) && (
            <div className="rules">
              {d.maxTradesPerDay ? <span className={`pill ${hitTrades ? 'warn' : ''}`}>Сделки {todays.length}/{d.maxTradesPerDay}</span> : null}
              {d.maxLossesPerDay ? <span className={`pill ${hitLosses ? 'warn' : ''}`}>Стопов подряд {streak}/{d.maxLossesPerDay}</span> : null}
              {d.dailyLossLimit ? <span className={`pill ${hitLoss ? 'bad' : ''}`}>Мой лимит {money(Math.min(0, sum.net), { cents: false })} / −{money(d.dailyLossLimit, { cents: false })}</span> : null}
              {lossesToday > 0 && !d.maxLossesPerDay && <span className="pill">Убытков {lossesToday}</span>}
            </div>
          )}
          {(hitTrades || hitLosses || hitLoss) && (
            <div className="banner warn">
              <Icon name="alert" size={18} />
              <span>Ваш лимит на сегодня достигнут. Лучшее, что можно сделать для счёта, — закрыть платформу.</span>
            </div>
          )}
        </section>

        {shotButton}

        {active.length > 0 && (
          <section className="stack">
            <div className="section-head">
              <h2>Счета</h2>
              <button className="link-btn" onClick={() => nav.setTab('accounts')}>Все</button>
            </div>
            {active.map((a) => {
              const st = states.get(a.id);
              return st ? <AccountCard key={a.id} st={st} onOpen={() => nav.push({ kind: 'account-view', id: a.id })} /> : null;
            })}
          </section>
        )}
        {active.length === 0 && (
          <button className="card press row" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => nav.push({ kind: 'account-edit' })}>
            <span className="icon-btn"><Icon name="plus" /></span>
            <span className="grow"><b>Добавить проп-счёт</b><span className="tiny muted" style={{ display: 'block' }}>Цель, просадка и лимиты будут считаться сами</span></span>
          </button>
        )}

        <section className="card"><WeekStrip trades={trades} /></section>

        {tip && trades.length >= 5 && (
          <section className="card stack" style={{ gap: 8 }}>
            <span className="hero-label">Вывод из ваших сделок</span>
            <ul className="insights"><li>{tip}</li></ul>
            <button className="link-btn" style={{ textAlign: 'left' }} onClick={() => nav.setTab('stats')}>Вся статистика →</button>
          </section>
        )}

        <section className="stack">
          <div className="section-head">
            <h2>Последние сделки</h2>
            {trades.length > 5 && <button className="link-btn" onClick={() => nav.setTab('journal')}>Журнал</button>}
          </div>
          <div className="card tight list">
            {recent.length ? recent.map((t) => <TradeRow key={t.id} t={t} showDate onOpen={() => nav.push({ kind: 'trade-view', id: t.id })} />) : <span className="muted small" style={{ padding: 8 }}>Нажмите «+», чтобы записать первую сделку.</span>}
          </div>
        </section>
      </div>
    </>
  );
}
