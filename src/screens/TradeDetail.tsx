import { useJournal, useNav } from '../context';
import { fmtNum, fmtPrice, fmtR, money } from '../lib/calc';
import { formatDuration } from '../lib/time';
import { deleteTrade, toast } from '../store';
import { AnalysesView } from '../components/Analyses';
import { ConfirmButton, Icon, TopBar } from '../ui';

export function TradeDetail({ id }: { id: string }) {
  const { byId, accountName } = useJournal();
  const nav = useNav();
  const t = byId.get(id);
  if (!t) {
    return (
      <>
        <TopBar left={<button className="icon-btn" onClick={nav.pop} aria-label="Назад"><Icon name="back" /></button>} title="Сделка" />
        <div className="card muted">Сделка удалена.</div>
      </>
    );
  }
  const dt = (iso?: string) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const o = t.outcome;
  return (
    <>
      <TopBar
        left={<button className="icon-btn" onClick={nav.pop} aria-label="Назад"><Icon name="back" /></button>}
        title={<h1>{t.symbol} <span className="muted" style={{ fontSize: 16 }}>×{t.contracts}</span></h1>}
        right={<button className="icon-btn" onClick={() => nav.replace({ kind: 'trade-edit', id: t.id })} aria-label="Изменить"><Icon name="edit" /></button>}
      />
      <div className="stack-lg">
        <section className="card stack" style={{ gap: 8 }}>
          <div className="row between">
            <span className={`tag ${t.direction}`}>{t.direction === 'long' ? 'Long' : 'Short'}</span>
            <span className="small dim">{t.session}</span>
          </div>
          <div className={`hero-num ${o === 'win' ? 'pos' : o === 'loss' ? 'neg' : 'flat'}`}>{o === 'open' ? 'Открыта' : money(t.net, { signed: true })}</div>
          <div className="small dim">
            {t.r !== undefined ? `${fmtR(t.r)} · ` : ''}
            {t.points !== undefined ? `${fmtNum(t.points, 2, true)} пт · ` : ''}
            {t.accountIds.length > 1 ? `на счёт, всего ${money((t.net ?? 0) * t.accountIds.length, { signed: true, cents: false })}` : 'на счёт'}
          </div>
        </section>

        <section className="card facts">
          <div><span>Вход</span><b>{dt(t.entryTime)}</b></div>
          <div><span>Выход</span><b>{dt(t.exitTime)}</b></div>
          {t.mode === 'prices' ? (
            <>
              <div><span>Цена входа</span><b>{fmtPrice(t.entryPrice)}</b></div>
              <div><span>Цена выхода</span><b>{fmtPrice(t.exitPrice)}</b></div>
              <div><span>Стоп</span><b>{fmtPrice(t.stopPrice)}</b></div>
              <div><span>Тейк</span><b>{fmtPrice(t.targetPrice)}</b></div>
            </>
          ) : (
            <>
              <div><span>Стоп</span><b>{t.riskPoints !== undefined ? `${fmtNum(t.riskPoints, 2)} пт` : '—'}</b></div>
              <div><span>План R:R</span><b>{t.plannedRR ? `1:${fmtNum(t.plannedRR, 1)}` : '—'}</b></div>
            </>
          )}
          <div><span>Риск</span><b>{money(t.risk)}</b></div>
          <div><span>Комиссия</span><b>{money(t.feesUsd)}</b></div>
          <div><span>В сделке</span><b>{formatDuration(t.durationMin ?? NaN)}</b></div>
          <div><span>Сетап</span><b>{t.setup ?? '—'}</b></div>
          <div><span>По плану</span><b>{t.followedPlan === undefined ? '—' : t.followedPlan ? 'Да' : 'Нет'}</b></div>
          <div><span>Состояние</span><b>{t.emotion ?? '—'}</b></div>
          <div><span>Оценка</span><b>{t.rating ? '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating) : '—'}</b></div>
          <div style={{ gridColumn: '1 / -1' }}><span>Счета</span><b>{t.accountIds.length ? t.accountIds.map(accountName).join(', ') : 'без счёта'}</b></div>
        </section>

        {t.mistakes.length > 0 && (
          <section className="stack" style={{ gap: 8 }}>
            <div className="section-head"><h2>Ошибки</h2></div>
            <div className="chips">{t.mistakes.map((m) => <span key={m} className="pill bad">{m}</span>)}</div>
          </section>
        )}
        {t.notes && (
          <section className="card">
            <div className="hero-label" style={{ marginBottom: 6 }}>Заметка</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.notes}</div>
          </section>
        )}
        <section className="stack">
          <div className="section-head"><h2>Анализ</h2></div>
          <AnalysesView value={t.analyses} />
        </section>
        <div className="row">
          <button className="btn grow" onClick={() => nav.replace({ kind: 'trade-edit', id: t.id })}><Icon name="edit" size={18} />Изменить</button>
          <ConfirmButton label="Удалить" onConfirm={() => { nav.pop(); void deleteTrade(t).then(() => toast('Сделка удалена')); }} />
        </div>
      </div>
    </>
  );
}
