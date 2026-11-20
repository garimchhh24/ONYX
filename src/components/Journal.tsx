import { useMemo, useState } from 'react';
import type { Settings, Trade } from '../types';
import { fmtMoney, fmtNum, outcome, tradePnl, tradeR, tradeSession } from '../lib/calc';
import { sortByExit } from '../lib/stats';

export function Journal({ trades, settings, onOpen }: { trades: Trade[]; settings: Settings; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = sortByExit(trades).reverse();
    if (!needle) return list;
    return list.filter((t) =>
      [t.symbol, t.setup, t.notes, t.emotion, ...t.tags, ...t.mistakes].some((x) => x?.toLowerCase().includes(needle)),
    );
  }, [trades, q]);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Сделки <span className="muted">({rows.length})</span></h2>
        <input placeholder="Поиск: тикер, сетап, тег, заметка…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
      </div>
      {!rows.length ? (
        <div className="muted">Сделок не найдено.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата входа</th>
                <th>Инструмент</th>
                <th>Напр.</th>
                <th>Сессия</th>
                <th>Сетап</th>
                <th className="r">Вход</th>
                <th className="r">Выход</th>
                <th className="r">R</th>
                <th className="r">P&L</th>
                <th>Анализы</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((t) => {
                const pnl = tradePnl(t);
                const o = outcome(t);
                return (
                  <tr key={t.id} className="clickable" onClick={() => onOpen(t.id)}>
                    <td>{new Date(t.entryTime).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><b>{t.symbol}</b></td>
                    <td><span className={`badge ${t.direction}`}>{t.direction === 'long' ? 'Long' : 'Short'}</span></td>
                    <td>{tradeSession(t, settings)}</td>
                    <td>{t.setup || <span className="muted">—</span>}</td>
                    <td className="r">{t.entryPrice}</td>
                    <td className="r">{t.exitPrice ?? <span className="muted">—</span>}</td>
                    <td className="r">{fmtNum(tradeR(t), 2, true)}</td>
                    <td className={`r ${o === 'win' ? 'pos' : o === 'loss' ? 'neg' : ''}`}>
                      {o === 'open' ? <span className="badge">открыта</span> : fmtMoney(pnl, settings.currency, true)}
                    </td>
                    <td>{t.analyses.length ? <span className="badge">{[...new Set(t.analyses.map((a) => a.timeframe))].join(' · ')}</span> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
          <button className="btn" onClick={() => setLimit(limit + 200)}>Показать ещё</button>
        </div>
      )}
    </div>
  );
}
