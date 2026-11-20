import { useMemo, useState } from 'react';
import { useJournal, useNav } from '../context';
import type { ETrade } from '../lib/calc';
import { money } from '../lib/calc';
import { addDaysKey, formatDayKey, todayTradingDay } from '../lib/time';
import { TradeRow } from '../components/TradeRow';
import { SyncBadge } from '../components/SyncBadge';
import { Icon, Seg, TopBar } from '../ui';

type Period = 'week' | 'month' | 'all';

export function Journal() {
  const { s, trades } = useJournal();
  const nav = useNav();
  const [acc, setAcc] = useState<string>('');
  const [period, setPeriod] = useState<Period>('month');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);

  const groups = useMemo(() => {
    const today = todayTradingDay();
    const from = period === 'week' ? addDaysKey(today, -6) : period === 'month' ? addDaysKey(today, -29) : '';
    const needle = q.trim().toLowerCase();
    const list = trades
      .filter((t) => (!acc || t.accountIds.includes(acc)) && t.day >= from)
      .filter((t) => !needle || [t.symbol, t.setup, t.notes, t.emotion, t.session, ...t.mistakes].some((x) => x?.toLowerCase().includes(needle)))
      .slice()
      .reverse();
    const map = new Map<string, ETrade[]>();
    for (const t of list) {
      if (!map.has(t.day)) map.set(t.day, []);
      map.get(t.day)!.push(t);
    }
    return [...map.entries()];
  }, [trades, acc, period, q]);

  let shown = 0;
  const accounts = s.accounts.filter((a) => a.status === 'active' || trades.some((t) => t.accountIds.includes(a.id)));

  return (
    <>
      <TopBar title="Журнал" right={<SyncBadge />} />
      <div className="stack">
        {accounts.length > 1 && (
          <div className="chips scroll">
            <button className={`chip${!acc ? ' on' : ''}`} onClick={() => setAcc('')}>Все счета</button>
            {accounts.map((a) => (
              <button key={a.id} className={`chip${acc === a.id ? ' on' : ''}`} onClick={() => setAcc(a.id)}>{a.name}</button>
            ))}
          </div>
        )}
        <Seg value={period} options={[['week', '7 дней'], ['month', '30 дней'], ['all', 'Всё']]} onChange={setPeriod} />
        <input className="input" placeholder="Поиск: NQ, сетап, ошибка, заметка" value={q} onChange={(e) => setQ(e.target.value)} />
        {!groups.length && (
          <div className="card empty">
            <h2>Пусто</h2>
            <p>{trades.length ? 'За этот период сделок нет.' : 'Запишите первую сделку — кнопка «+» внизу.'}</p>
            {!trades.length && <button className="btn chrome-btn" onClick={() => nav.push({ kind: 'trade-edit' })}><Icon name="plus" size={18} />Новая сделка</button>}
          </div>
        )}
        <div>
          {groups.map(([day, ts]) => {
            if (shown >= limit) return null;
            shown += ts.length;
            const pnl = ts.reduce((a, t) => a + (t.net ?? 0), 0);
            const wins = ts.filter((t) => t.outcome === 'win').length;
            return (
              <div key={day}>
                <div className="day-head">
                  <span>{formatDayKey(day)} · {ts.length} сд. · {wins}W</span>
                  <b className={pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : ''}>{money(pnl, { signed: true })}</b>
                </div>
                <div className="card tight list">
                  {ts.map((t) => <TradeRow key={t.id} t={t} onOpen={() => nav.push({ kind: 'trade-view', id: t.id })} />)}
                </div>
              </div>
            );
          })}
        </div>
        {groups.reduce((a, [, ts]) => a + ts.length, 0) > limit && (
          <button className="btn block" onClick={() => setLimit(limit + 60)}>Показать ещё</button>
        )}
      </div>
    </>
  );
}
