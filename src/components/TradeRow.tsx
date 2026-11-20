import type { ETrade } from '../lib/calc';
import { fmtR, money } from '../lib/calc';
import { formatTime } from '../lib/time';
import { Icon } from '../ui';

export function TradeRow({ t, onOpen, showDate }: { t: ETrade; onOpen: () => void; showDate?: boolean }) {
  const when = showDate
    ? new Date(t.entryTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + formatTime(t.entryTime)
    : formatTime(t.entryTime);
  return (
    <button type="button" className="trade-row" onClick={onOpen}>
      <span className={`tag ${t.direction}`} style={{ minWidth: 30, textAlign: 'center' }}>{t.direction === 'long' ? 'L' : 'S'}</span>
      <span className="grow">
        <span className="row" style={{ gap: 6 }}>
          <span className="sym">{t.symbol}</span>
          <span className="small muted">×{t.contracts}</span>
          {t.analyses.length > 0 && <span className="muted"><Icon name="image" size={14} /></span>}
        </span>
        <span className="tiny muted" style={{ display: 'block', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {when} · {t.session}{t.setup ? ` · ${t.setup}` : ''}
        </span>
      </span>
      <span>
        <span className={`pnl ${t.outcome === 'win' ? 'pos' : t.outcome === 'loss' ? 'neg' : ''}`} style={{ display: 'block' }}>
          {t.outcome === 'open' ? 'открыта' : money(t.net, { signed: true })}
        </span>
        <span className="tiny muted" style={{ display: 'block', textAlign: 'right' }}>{t.r !== undefined ? fmtR(t.r) : t.outcome === 'be' ? 'BE' : ''}</span>
      </span>
    </button>
  );
}
