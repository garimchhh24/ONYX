import type { AccountState } from '../lib/prop';
import { DD_LABEL, PHASE_LABEL } from '../lib/prop';
import { fmtPct, money } from '../lib/calc';
import { Bar, Icon, StatusPill } from '../ui';

export function bufferTone(st: AccountState): 'good' | 'warn' | 'bad' {
  if (st.breached || st.buffer <= 0) return 'bad';
  return st.bufferPct < 25 ? 'bad' : st.bufferPct < 50 ? 'warn' : 'good';
}

export function AccountCard({ st, onOpen, compact }: { st: AccountState; onOpen?: () => void; compact?: boolean }) {
  const a = st.account;
  const dd = a.maxDrawdown;
  return (
    <div className={`card acc-card stack${onOpen ? ' press' : ''}`} style={{ gap: 14 }} onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="row" style={{ gap: 6 }}>
            <span className="tag">{PHASE_LABEL[a.phase]}</span>
            <span className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.firm}</span>
          </div>
          <div className="name" style={{ marginTop: 6 }}>{a.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="bal chrome">{money(st.balance, { cents: false })}</div>
          <div className={`small num ${st.profit >= 0 ? 'pos' : 'neg'}`}>{money(st.profit, { signed: true, cents: false })}</div>
        </div>
      </div>

      {a.phase === 'eval' && a.profitTarget ? (
        <div className="metric">
          <div className="top">
            <span>Цель {money(a.profitTarget, { cents: false })}</span>
            <b>{st.targetReached ? 'выполнена' : `осталось ${money(st.targetLeft, { cents: false })}`}</b>
          </div>
          <Bar pct={st.targetPct ?? 0} tone="chrome" />
        </div>
      ) : null}

      <div className="metric">
        <div className="top">
          <span>До слива {st.thresholdLocked ? '· порог зафиксирован' : ''}</span>
          <b className={st.buffer <= 0 ? 'neg' : ''}>{money(Math.max(0, st.buffer), { cents: false })}</b>
        </div>
        <Bar pct={st.bufferPct} tone={bufferTone(st)} />
        {!compact && <span className="tiny muted">Порог {money(st.threshold, { cents: false })} · {DD_LABEL[a.drawdownType]} {money(dd, { cents: false })}</span>}
      </div>

      {!compact && (a.dailyLossLimit || a.consistencyPct || a.minDays) ? (
        <div className="row wrap" style={{ gap: 6 }}>
          {a.dailyLossLimit ? (
            <span className={`pill ${st.dailyLeft !== undefined && st.dailyLeft <= 0 ? 'bad' : st.dailyLeft !== undefined && st.dailyLeft < a.dailyLossLimit * 0.25 ? 'warn' : ''}`}>
              Лимит дня: {st.dailyLeft !== undefined && st.dailyLeft <= 0 ? 'исчерпан' : `ещё ${money(st.dailyLeft, { cents: false })}`}
            </span>
          ) : null}
          {a.consistencyPct ? (
            <span className={`pill ${st.consistency === undefined ? '' : st.consistencyOk ? 'good' : 'warn'}`}>
              Консистентность {st.consistency === undefined ? '—' : fmtPct(st.consistency)} / {a.consistencyPct}%
            </span>
          ) : null}
          {a.minDays ? <span className={`pill ${st.daysOk ? 'good' : ''}`}>Дней {st.tradingDays}/{a.minDays}</span> : null}
        </div>
      ) : null}

      <div className="row between">
        <StatusPill level={st.level} text={st.headline} />
        {onOpen && <span className="muted"><Icon name="chevron" size={18} /></span>}
      </div>
    </div>
  );
}
