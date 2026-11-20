import { useMemo, useState } from 'react';
import type { Settings, Trade } from '../types';
import { fmtMoney, fmtNum, fmtPct } from '../lib/calc';
import { formatDuration } from '../lib/time';
import {
  byDirection, byEmotion, byHour, byMistake, byPlan, byRating, bySession, bySetup, bySymbol, byWeekday,
  equityCurve, insights, summarize,
} from '../lib/stats';
import { DrawdownChart, EquityChart, GroupTable, PnlBars, PnlCalendar, RHistogram } from './Charts';
import { Kpi, tone } from './common';

type Breakdown = 'setup' | 'symbol' | 'direction' | 'mistakes' | 'emotion' | 'plan' | 'rating';
const BREAKDOWNS: { id: Breakdown; label: string }[] = [
  { id: 'setup', label: 'Сетапы' },
  { id: 'symbol', label: 'Инструменты' },
  { id: 'direction', label: 'Long / Short' },
  { id: 'mistakes', label: 'Ошибки' },
  { id: 'emotion', label: 'Эмоции' },
  { id: 'plan', label: 'План' },
  { id: 'rating', label: 'Оценка' },
];

export function Dashboard({ trades, settings }: { trades: Trade[]; settings: Settings }) {
  const s = useMemo(() => summarize(trades, settings), [trades, settings]);
  const eq = useMemo(() => equityCurve(trades, settings), [trades, settings]);
  const tips = useMemo(() => insights(trades, settings), [trades, settings]);
  const [bd, setBd] = useState<Breakdown>('setup');
  const [timeView, setTimeView] = useState<'session' | 'weekday' | 'hour'>('session');

  const timeRows = useMemo(
    () => (timeView === 'session' ? bySession(trades, settings) : timeView === 'weekday' ? byWeekday(trades, settings) : byHour(trades, settings)),
    [trades, settings, timeView],
  );
  const bdRows = useMemo(() => {
    switch (bd) {
      case 'setup': return bySetup(trades);
      case 'symbol': return bySymbol(trades);
      case 'direction': return byDirection(trades);
      case 'mistakes': return byMistake(trades);
      case 'emotion': return byEmotion(trades);
      case 'plan': return byPlan(trades);
      case 'rating': return byRating(trades);
    }
  }, [trades, bd]);

  const cur = settings.currency;
  const closed = s.wins + s.losses + s.breakeven;

  if (!trades.length) {
    return (
      <div className="card empty-state">
        <h2>Пока нет сделок</h2>
        <p>Добавьте сделку вручную, импортируйте историю из MetaTrader / TradingView / CSV или загрузите демо-данные во вкладке «Импорт».</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi hero label="Чистый P&L" value={fmtMoney(s.netPnl, cur, true)} tone={tone(s.netPnl)} sub={settings.startingBalance ? fmtPct((s.netPnl / settings.startingBalance) * 100) + ' к депозиту' : undefined} />
        <Kpi hero label="Винрейт" value={fmtPct(s.winRate)} sub={`${s.wins} W · ${s.losses} L · ${s.breakeven} BE`} />
        <Kpi label="Profit factor" value={s.profitFactor === Infinity ? '∞' : fmtNum(s.profitFactor)} sub="брутто прибыль / убыток" />
        <Kpi label="Матожидание" value={fmtMoney(s.expectancy, cur, true)} tone={tone(s.expectancy)} sub={`на сделку · ${fmtNum(s.avgR, 2, true)}R`} />
        <Kpi label="Сумма R" value={fmtNum(s.totalR, 1, true) + 'R'} tone={tone(s.totalR)} sub={`по ${s.rCount} сделкам со стопом`} />
        <Kpi label="Макс. просадка" value={fmtMoney(-s.maxDrawdown, cur)} tone={s.maxDrawdown ? 'neg' : undefined} sub={s.maxDrawdownPct !== undefined ? fmtPct(s.maxDrawdownPct) + ' от пика' : undefined} />
        <Kpi label="Ср. прибыль / убыток" value={`${fmtNum(s.payoff)}`} sub={`${fmtMoney(s.avgWin, cur)} / ${fmtMoney(s.avgLoss, cur)}`} />
        <Kpi label="Нужный винрейт" value={fmtPct(s.requiredWinRate)} sub="безубыток при текущем payoff" />
        <Kpi label="Сделок" value={String(closed)} sub={s.open ? `+ ${s.open} открытых` : 'закрытых'} />
        <Kpi label="Серия" value={s.currentStreak > 0 ? `${s.currentStreak} W` : s.currentStreak < 0 ? `${-s.currentStreak} L` : '—'} tone={tone(s.currentStreak)} sub={`макс. ${s.maxWinStreak} W / ${s.maxLossStreak} L`} />
        <Kpi label="Ср. риск" value={fmtMoney(s.avgRisk, cur)} sub={s.avgRiskPct !== undefined ? `${fmtPct(s.avgRiskPct, 2)} депозита${s.overRiskCount ? ` · ${s.overRiskCount} выше лимита` : ''}` : undefined} />
        <Kpi label="Время в сделке" value={formatDuration(s.avgHoldWin ?? NaN)} sub={`прибыльные · убыточные ${formatDuration(s.avgHoldLoss ?? NaN)}`} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Выводы</h2><span className="muted small">автоматический анализ ваших сделок</span></div>
        <ul className="insights">{tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Кривая капитала</h2><span className="muted small">лучшая сделка {fmtMoney(s.largestWin, cur)} · худшая {fmtMoney(s.largestLoss, cur)}</span></div>
          <EquityChart data={eq} settings={settings} />
          <h3 style={{ margin: '8px 0 4px' }}>Просадка</h3>
          <DrawdownChart data={eq} settings={settings} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Календарь P&L</h2></div>
          <PnlCalendar trades={trades} settings={settings} />
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            <h2>P&L по времени</h2>
            <div className="seg">
              <button className={timeView === 'session' ? 'on' : ''} onClick={() => setTimeView('session')}>Сессии</button>
              <button className={timeView === 'weekday' ? 'on' : ''} onClick={() => setTimeView('weekday')}>Дни</button>
              <button className={timeView === 'hour' ? 'on' : ''} onClick={() => setTimeView('hour')}>Часы</button>
            </div>
          </div>
          <PnlBars rows={timeRows} settings={settings} />
          {timeView === 'hour' && <div className="muted small">Часы входа в часовом поясе {settings.displayTimeZone}</div>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Распределение R</h2><span className="muted small">сколько сделок закрыто с каждым результатом</span></div>
          <RHistogram trades={trades} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Разбивка</h2>
          <div className="chips">
            {BREAKDOWNS.map((b) => (
              <button key={b.id} className={`chip${bd === b.id ? ' on' : ''}`} onClick={() => setBd(b.id)}>{b.label}</button>
            ))}
          </div>
        </div>
        <GroupTable rows={bdRows} settings={settings} label={BREAKDOWNS.find((b) => b.id === bd)!.label} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Сессии подробно</h2></div>
        <GroupTable rows={bySession(trades, settings)} settings={settings} label="Сессия" />
      </div>
    </div>
  );
}
