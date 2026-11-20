import { useMemo, useState } from 'react';
import { useJournal } from '../context';
import { fmtNum, fmtPct, fmtR, money } from '../lib/calc';
import {
  byDirection, byEmotion, byHour, byMistake, byPlan, bySession, bySetup, bySymbol, byTradeNumber, byWeekday, equityCurve, insights, summarize,
} from '../lib/stats';
import { addDaysKey, formatDayKey, formatDuration, todayTradingDay } from '../lib/time';
import { EquityChart, GroupList, PnlBars, PnlBarsH, PnlCalendar, RHistogram } from '../components/Charts';
import { SyncBadge } from '../components/SyncBadge';
import { Seg, TopBar } from '../ui';

type Period = '7' | '30' | '90' | 'all';
type TimeView = 'session' | 'weekday' | 'hour' | 'number';
type Breakdown = 'setup' | 'symbol' | 'mistakes' | 'emotion' | 'direction' | 'plan';

const BD: [Breakdown, string][] = [
  ['setup', 'Сетапы'],
  ['symbol', 'Инструменты'],
  ['mistakes', 'Ошибки'],
  ['emotion', 'Состояние'],
  ['direction', 'Long / Short'],
  ['plan', 'План'],
];

function Kpi({ l, v, s, tone }: { l: string; v: string; s?: string; tone?: string }) {
  return (
    <div className="kpi">
      <div className="l">{l}</div>
      <div className={`v ${tone ?? ''}`}>{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export function Stats() {
  const { s, trades } = useJournal();
  const [period, setPeriod] = useState<Period>('30');
  const [acc, setAcc] = useState('');
  const [tv, setTv] = useState<TimeView>('session');
  const [bd, setBd] = useState<Breakdown>('setup');

  const list = useMemo(() => {
    const from = period === 'all' ? '' : addDaysKey(todayTradingDay(), -(Number(period) - 1));
    return trades.filter((t) => t.day >= from && (!acc || t.accountIds.includes(acc)));
  }, [trades, period, acc]);
  const sum = useMemo(() => summarize(list), [list]);
  const eq = useMemo(() => equityCurve(list), [list]);
  const tips = useMemo(() => insights(list, s.settings), [list, s.settings]);
  const timeRows = useMemo(() => {
    if (tv === 'session') return bySession(list, s.settings);
    if (tv === 'weekday') return byWeekday(list).filter((r) => r.trades);
    if (tv === 'hour') return byHour(list, s.settings).filter((r) => r.trades);
    return byTradeNumber(list).filter((r) => r.trades);
  }, [list, tv, s.settings]);
  const bdRows = useMemo(() => {
    switch (bd) {
      case 'setup': return bySetup(list);
      case 'symbol': return bySymbol(list);
      case 'mistakes': return byMistake(list);
      case 'emotion': return byEmotion(list);
      case 'direction': return byDirection(list);
      case 'plan': return byPlan(list);
    }
  }, [list, bd]);

  const t = (v: number | undefined) => (v === undefined ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const accounts = s.accounts.filter((a) => trades.some((x) => x.accountIds.includes(a.id)));

  return (
    <>
      <TopBar title="Статистика" right={<SyncBadge />} />
      <div className="stack-lg">
        <div className="stack">
          <Seg value={period} options={[['7', '7 дн'], ['30', '30 дн'], ['90', '90 дн'], ['all', 'Всё']]} onChange={setPeriod} />
          {accounts.length > 1 && (
            <div className="chips scroll">
              <button className={`chip${!acc ? ' on' : ''}`} onClick={() => setAcc('')}>Все счета</button>
              {accounts.map((a) => <button key={a.id} className={`chip${acc === a.id ? ' on' : ''}`} onClick={() => setAcc(a.id)}>{a.name}</button>)}
            </div>
          )}
        </div>

        {sum.trades === 0 ? (
          <div className="card empty"><h2>Нет закрытых сделок</h2><p>Выберите другой период или запишите сделку.</p></div>
        ) : (
          <>
            <section className="card stack" style={{ gap: 6 }}>
              <span className="hero-label">Чистый P&L на счёт</span>
              <div className={`hero-num ${sum.net > 0 ? 'pos' : sum.net < 0 ? 'neg' : 'flat'}`}>{money(sum.net, { signed: true })}</div>
              <span className="small dim">{sum.trades} сделок · {sum.greenDays} зелёных и {sum.redDays} красных дней · комиссии {money(sum.fees, { cents: false })}</span>
            </section>

            <div className="kpis">
              <Kpi l="Винрейт" v={fmtPct(sum.winRate)} s={`${sum.wins}W · ${sum.losses}L · ${sum.breakeven}BE`} />
              <Kpi l="Profit factor" v={sum.profitFactor === Infinity ? '∞' : fmtNum(sum.profitFactor)} s="прибыль / убыток" tone={sum.profitFactor !== undefined && sum.profitFactor < 1 ? 'neg' : ''} />
              <Kpi l="Матожидание" v={money(sum.expectancy, { signed: true })} s={sum.avgR !== undefined ? `${fmtR(sum.avgR)} на сделку` : 'на сделку'} tone={t(sum.expectancy)} />
              <Kpi l="Сумма R" v={sum.rCount ? fmtR(sum.totalR) : '—'} s={`по ${sum.rCount} сд. со стопом`} tone={t(sum.totalR)} />
              <Kpi l="Средн. прибыль" v={money(sum.avgWin, { cents: false })} s={`убыток ${money(sum.avgLoss, { cents: false })}`} />
              <Kpi l="Нужный винрейт" v={fmtPct(sum.requiredWinRate)} s={`прибыль/убыток ${fmtNum(sum.payoff, 2)}`} />
              <Kpi l="Макс. просадка" v={money(-sum.maxDrawdown, { cents: false })} s="по закрытым сделкам" tone={sum.maxDrawdown ? 'neg' : ''} />
              <Kpi l="Серии" v={`${sum.maxWinStreak}W / ${sum.maxLossStreak}L`} s={sum.currentStreak > 0 ? `сейчас ${sum.currentStreak}W` : sum.currentStreak < 0 ? `сейчас ${-sum.currentStreak}L` : 'макс. подряд'} />
              <Kpi l="Лучший день" v={sum.bestDay ? money(sum.bestDay.pnl, { signed: true, cents: false }) : '—'} s={sum.bestDay ? formatDayKey(sum.bestDay.day) : ''} tone="pos" />
              <Kpi l="Худший день" v={sum.worstDay ? money(sum.worstDay.pnl, { cents: false }) : '—'} s={sum.worstDay ? formatDayKey(sum.worstDay.day) : ''} tone="neg" />
              <Kpi l="Время в сделке" v={formatDuration(sum.avgHoldWin ?? NaN)} s={`убыточные ${formatDuration(sum.avgHoldLoss ?? NaN)}`} />
              <Kpi l="Средний риск" v={money(sum.avgRisk, { cents: false })} s="на сделку, на счёт" />
            </div>

            <section className="card stack" style={{ gap: 10 }}>
              <span className="hero-label">Выводы</span>
              <ul className="insights">{tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>

            <section className="card stack" style={{ gap: 8 }}>
              <span className="hero-label">Кривая P&L</span>
              <EquityChart data={eq} />
            </section>

            <section className="card"><PnlCalendar trades={list} /></section>

            <section className="card stack">
              <span className="hero-label">Когда вы зарабатываете</span>
              <Seg small value={tv} options={[['session', 'Сессии'], ['weekday', 'Дни'], ['hour', 'Часы'], ['number', '№ сделки']]} onChange={setTv} />
              {tv === 'session' ? <PnlBarsH rows={timeRows} /> : <PnlBars rows={timeRows} />}
              <span className="tiny muted">
                {tv === 'hour' ? `Час входа, ${s.settings.statsTimeZone === 'America/New_York' ? 'время Нью-Йорка' : s.settings.statsTimeZone}` : tv === 'number' ? 'Порядковый номер сделки за торговый день' : tv === 'session' ? 'Сессия определяется по времени входа (Нью-Йорк)' : 'Торговый день CME (с 18:00 NY)'}
              </span>
            </section>

            <section className="card stack">
              <span className="hero-label">Разбивка</span>
              <div className="chips scroll">
                {BD.map(([k, l]) => <button key={k} className={`chip${bd === k ? ' on' : ''}`} onClick={() => setBd(k)}>{l}</button>)}
              </div>
              <GroupList rows={bdRows} empty={bd === 'emotion' ? 'Отмечайте состояние в сделках' : bd === 'plan' ? 'Отмечайте «по плану» в сделках' : 'Нет данных'} />
            </section>

            <section className="card stack" style={{ gap: 8 }}>
              <span className="hero-label">Результат в R</span>
              <RHistogram trades={list} />
            </section>
          </>
        )}
      </div>
    </>
  );
}
