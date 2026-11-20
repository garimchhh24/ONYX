import { useMemo, useState } from 'react';
import type { Account, Cashflow, CashflowType } from '../types';
import { useJournal, useNav } from '../context';
import { fmtPct, money, uid } from '../lib/calc';
import { CASHFLOW_LABEL, DD_LABEL, PHASE_LABEL, propEconomy } from '../lib/prop';
import { formatDayKey, todayTradingDay } from '../lib/time';
import { deleteAccount, deleteCashflow, saveAccount, saveCashflow, toast } from '../store';
import { AccountCard, bufferTone } from '../components/AccountCard';
import { SyncBadge } from '../components/SyncBadge';
import { Bar, ConfirmButton, Field, Icon, NumInput, Seg, Sheet, StatusPill, TopBar } from '../ui';

export function Accounts() {
  const { s, states } = useJournal();
  const nav = useNav();
  const eco = useMemo(() => propEconomy(s.accounts, s.cashflows), [s.accounts, s.cashflows]);
  const [showDone, setShowDone] = useState(false);
  const active = s.accounts.filter((a) => a.status === 'active');
  const done = s.accounts.filter((a) => a.status !== 'active');

  return (
    <>
      <TopBar
        title="Счета"
        right={
          <>
            <SyncBadge />
            <button className="icon-btn" onClick={() => nav.push({ kind: 'account-edit' })} aria-label="Добавить счёт"><Icon name="plus" /></button>
          </>
        }
      />
      <div className="stack-lg">
        <section className="card stack" style={{ gap: 12 }}>
          <span className="hero-label">Экономика пропов</span>
          <div className={`hero-num ${eco.net > 0 ? 'pos' : eco.net < 0 ? 'neg' : 'flat'}`}>{money(eco.net, { signed: true, cents: false })}</div>
          <div className="grid3">
            <div><div className="tiny muted">Выплаты</div><b className="display num pos">{money(eco.payouts, { cents: false })}</b></div>
            <div><div className="tiny muted">Потрачено</div><b className="display num neg">{money(eco.spent, { cents: false })}</b></div>
            <div><div className="tiny muted">Пройдено</div><b className="display num">{eco.passed}/{eco.passed + eco.failed} {eco.passRate !== undefined ? <span className="tiny muted">{fmtPct(eco.passRate)}</span> : null}</b></div>
          </div>
          <span className="tiny muted">Оплаты челленджей, активации и ресеты против полученных выплат. Добавляются в карточке счёта.</span>
        </section>

        {active.length === 0 && (
          <div className="card empty">
            <h2>Нет активных счетов</h2>
            <p>Добавьте челлендж или funded-счёт — приложение будет считать цель, просадку и лимиты.</p>
            <button className="btn chrome-btn" onClick={() => nav.push({ kind: 'account-edit' })}><Icon name="plus" size={18} />Добавить счёт</button>
          </div>
        )}
        {active.map((a) => {
          const st = states.get(a.id);
          return st ? <AccountCard key={a.id} st={st} onOpen={() => nav.push({ kind: 'account-view', id: a.id })} /> : null;
        })}

        {done.length > 0 && (
          <section className="stack">
            <button className="section-head link-btn" style={{ width: '100%' }} onClick={() => setShowDone(!showDone)}>
              <h2>Завершённые · {done.length}</h2>
              <Icon name={showDone ? 'up' : 'down'} size={16} />
            </button>
            {showDone && done.map((a) => {
              const st = states.get(a.id);
              return st ? <AccountCard key={a.id} st={st} compact onOpen={() => nav.push({ kind: 'account-view', id: a.id })} /> : null;
            })}
          </section>
        )}
      </div>
    </>
  );
}

const CF_TYPES: [CashflowType, string][] = [
  ['fee', 'Оплата'],
  ['activation', 'Активация'],
  ['reset', 'Ресет'],
  ['payout', 'Выплата'],
];

function CashflowSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [type, setType] = useState<CashflowType>(account.phase === 'eval' ? 'fee' : 'payout');
  const [amount, setAmount] = useState<number | undefined>();
  const [date, setDate] = useState(todayTradingDay());
  const [note, setNote] = useState('');
  return (
    <Sheet title="Деньги по счёту" onClose={onClose}>
      <Seg value={type} options={CF_TYPES} onChange={setType} />
      <Field label="Сумма, $"><NumInput big value={amount} onChange={setAmount} autoFocus placeholder="0" /></Field>
      <Field label="Дата"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Комментарий"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" /></Field>
      {type === 'payout' && <span className="tiny muted">Выплата уменьшает баланс счёта и учитывается в экономике пропов.</span>}
      <button
        className="btn chrome-btn block"
        disabled={!amount}
        onClick={() => {
          const c: Cashflow = { id: uid(), accountId: account.id, date, type, amount: Math.abs(amount!), note: note.trim() || undefined, createdAt: new Date().toISOString() };
          void saveCashflow(c);
          onClose();
        }}
      >
        Добавить
      </button>
    </Sheet>
  );
}

export function AccountDetail({ id }: { id: string }) {
  const { s, states } = useJournal();
  const nav = useNav();
  const [cf, setCf] = useState(false);
  const st = states.get(id);
  if (!st) {
    return (
      <>
        <TopBar left={<button className="icon-btn" onClick={nav.pop} aria-label="Назад"><Icon name="back" /></button>} title="Счёт" />
        <div className="card muted">Счёт удалён.</div>
      </>
    );
  }
  const a = st.account;
  const flows = s.cashflows.filter((c) => c.accountId === a.id).sort((x, y) => y.date.localeCompare(x.date));
  const setStatus = (status: Account['status']) => {
    void saveAccount({ ...a, status });
    toast(status === 'passed' ? 'Поздравляю с прохождением!' : status === 'failed' ? 'Счёт отмечен как слитый' : status === 'archived' ? 'Счёт в архиве' : 'Счёт снова активен');
  };

  return (
    <>
      <TopBar
        left={<button className="icon-btn" onClick={nav.pop} aria-label="Назад"><Icon name="back" /></button>}
        title={<h1 style={{ fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</h1>}
        right={<button className="icon-btn" onClick={() => nav.push({ kind: 'account-edit', id: a.id })} aria-label="Изменить"><Icon name="edit" /></button>}
      />
      <div className="stack-lg">
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <span className="tag">{PHASE_LABEL[a.phase]}</span>
            <span className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.firm} · {money(a.size, { cents: false })}</span>
          </div>
          <div className="hero-num flat">{money(st.balance)}</div>
          <div><StatusPill level={st.level} text={st.headline} /></div>
          <div className="small dim">
            P&L {money(st.pnl, { signed: true })}{st.payouts ? ` · выплачено ${money(st.payouts, { cents: false })}` : ''} · {st.trades.length} сд. · {st.tradingDays} дн.
          </div>
        </section>

        <section className="card stack" style={{ gap: 16 }}>
          {a.phase === 'eval' && a.profitTarget ? (
            <div className="metric">
              <div className="top"><span>Цель прибыли</span><b>{money(st.profit, { cents: false })} / {money(a.profitTarget, { cents: false })}</b></div>
              <Bar pct={st.targetPct ?? 0} tone="chrome" />
              <span className="tiny muted">{st.targetReached ? 'Цель выполнена' : `Осталось ${money(st.targetLeft, { cents: false })}`}</span>
            </div>
          ) : null}
          <div className="metric">
            <div className="top"><span>До слива</span><b className={st.buffer <= 0 ? 'neg' : ''}>{money(Math.max(0, st.buffer), { cents: false })}</b></div>
            <Bar pct={st.bufferPct} tone={bufferTone(st)} />
            <span className="tiny muted">
              Порог {money(st.threshold, { cents: false })} · {DD_LABEL[a.drawdownType]} {money(a.maxDrawdown, { cents: false })}
              {a.drawdownType !== 'static' ? (st.thresholdLocked ? ' · порог зафиксирован' : ` · фиксируется на ${money(a.startBalance + a.drawdownLock, { cents: false })}`) : ''}
              {st.breachDay ? ` · пробит ${formatDayKey(st.breachDay)}` : ''}
            </span>
            {a.drawdownType === 'intraday' && <span className="tiny muted">Интрадей-трейлинг считается по закрытым сделкам — плавающую прибыль приложение не видит.</span>}
          </div>
          {a.dailyLossLimit ? (
            <div className="metric">
              <div className="top"><span>Дневной лимит</span><b>{money(st.todayPnl, { signed: true, cents: false })} / −{money(a.dailyLossLimit, { cents: false })}</b></div>
              <Bar pct={((st.dailyLeft ?? 0) / a.dailyLossLimit) * 100} tone={(st.dailyLeft ?? 0) < a.dailyLossLimit * 0.25 ? 'bad' : (st.dailyLeft ?? 0) < a.dailyLossLimit * 0.5 ? 'warn' : 'good'} />
              <span className="tiny muted">Сегодня можно потерять ещё {money(st.dailyLeft, { cents: false })}{st.dailyViolations.length ? ` · превышен ${st.dailyViolations.length} раз` : ''}</span>
            </div>
          ) : null}
          <div>
            {a.consistencyPct ? (
              <div className="kv">
                <span>Консистентность (лучший день ≤ {a.consistencyPct}%)</span>
                <b className={st.consistency === undefined ? '' : st.consistencyOk ? 'pos' : 'neg'}>{st.consistency === undefined ? '—' : fmtPct(st.consistency)}</b>
              </div>
            ) : null}
            {a.consistencyPct && st.consistencyNeed ? (
              <div className="kv"><span>Для консистентности нужно ещё</span><b>{money(st.consistencyNeed, { cents: false })}</b></div>
            ) : null}
            <div className="kv"><span>Лучший день</span><b>{money(st.bestDay, { cents: false })}</b></div>
            {a.minDays ? <div className="kv"><span>Торговых дней</span><b className={st.daysOk ? 'pos' : ''}>{st.tradingDays} / {a.minDays}</b></div> : null}
            {a.maxContracts ? <div className="kv"><span>Макс. позиция</span><b className={st.contractViolations ? 'neg' : ''}>{a.maxContracts} мини{st.contractViolations ? ` · превышена ${st.contractViolations} раз` : ''}</b></div> : null}
            <div className="kv"><span>Старт</span><b>{formatDayKey(a.startDate)}</b></div>
          </div>
          {st.readyToPass && a.status === 'active' && (
            <button className="btn chrome-btn block" onClick={() => setStatus('passed')}><Icon name="check" size={18} />Отметить как пройденный</button>
          )}
        </section>

        <section className="stack">
          <div className="section-head"><h2>Деньги</h2><button className="link-btn" onClick={() => setCf(true)}>+ Добавить</button></div>
          <div className="card tight">
            {flows.length ? flows.map((c) => (
              <div className="kv" key={c.id}>
                <span>{CASHFLOW_LABEL[c.type]} · {formatDayKey(c.date)}{c.note ? ` · ${c.note}` : ''}</span>
                <span className="row" style={{ gap: 6 }}>
                  <b className={c.type === 'payout' ? 'pos' : 'neg'}>{c.type === 'payout' ? '+' : '−'}{money(Math.abs(c.amount), { cents: false })}</b>
                  <button className="link-btn" onClick={() => void deleteCashflow(c.id)} aria-label="Удалить"><Icon name="x" size={15} /></button>
                </span>
              </div>
            )) : <span className="small muted">Добавьте стоимость челленджа, активацию, ресеты и выплаты — увидите реальную окупаемость.</span>}
          </div>
        </section>

        <section className="stack">
          <div className="section-head"><h2>По дням</h2></div>
          <div className="card tight">
            {st.days.length ? st.days.slice().reverse().slice(0, 30).map((d) => (
              <div className="kv" key={d.day}>
                <span>{formatDayKey(d.day)} · {d.trades} сд.</span>
                <span className="row" style={{ gap: 10 }}>
                  <b className={d.pnl >= 0 ? 'pos' : 'neg'}>{money(d.pnl, { signed: true, cents: false })}</b>
                  <span className="tiny muted num">{money(d.balance, { cents: false })}</span>
                </span>
              </div>
            )) : <span className="small muted">Сделок по счёту пока нет.</span>}
          </div>
        </section>

        <section className="stack">
          <div className="section-head"><h2>Статус</h2></div>
          <div className="grid2">
            {a.status !== 'active' && <button className="btn" onClick={() => setStatus('active')}>Активен</button>}
            {a.status !== 'passed' && a.phase === 'eval' && <button className="btn" onClick={() => setStatus('passed')}><Icon name="check" size={17} />Пройден</button>}
            {a.status !== 'failed' && <button className="btn" onClick={() => setStatus('failed')}><Icon name="x" size={17} />Слит</button>}
            {a.status !== 'archived' && <button className="btn" onClick={() => setStatus('archived')}>В архив</button>}
          </div>
          {a.phase === 'eval' && (
            <button className="btn block" onClick={() => nav.push({ kind: 'account-edit', template: { firm: a.firm, size: a.size, phase: 'funded', name: a.name.replace(/challenge|челлендж|eval/gi, '').trim() + ' Funded', maxDrawdown: a.maxDrawdown, drawdownType: a.drawdownType, maxContracts: a.maxContracts } })}>
              Создать Funded-счёт после прохождения
            </button>
          )}
          <ConfirmButton label="Удалить счёт" confirmLabel="Удалить счёт и его деньги?" onConfirm={() => { nav.pop(); void deleteAccount(a.id).then(() => toast('Счёт удалён')); }} />
          <span className="tiny muted">Сделки при удалении счёта останутся в журнале.</span>
        </section>
      </div>
      {cf && <CashflowSheet account={a} onClose={() => setCf(false)} />}
    </>
  );
}
