import type { Account } from '../types';
import type { ETrade } from './calc';
import { labelOf } from './questionnaire';

const esc = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const n2 = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '' : Math.round(v * 100) / 100);

export const CSV_COLUMNS = [
  'trade_id', 'trading_day', 'account', 'symbol', 'contract', 'direction', 'contracts',
  'entry_time', 'exit_time', 'duration_min', 'entry_price', 'exit_price', 'stop_loss', 'take_profit',
  'points', 'ticks', 'gross_pnl', 'commission', 'commission_source', 'net_pnl', 'risk', 'r_multiple', 'planned_rr',
  'outcome', 'session', 'setup', 'timeframe', 'bias', 'concepts',
  'emotion_before', 'emotion_during', 'emotion_after', 'rule_compliance', 'entry_quality', 'exit_quality',
  'mistakes', 'setup_quality', 'lessons', 'journal_note', 'notes', 'ai_score', 'source',
];

export function tradesToCsv(trades: ETrade[], accounts: Account[]): string {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = trades.map((t) => {
    const j = t.journal;
    return [
      t.id, t.day, t.account_id ? names.get(t.account_id) ?? '' : '', t.symbol, t.contract, t.direction, t.contracts,
      t.entry_time, t.exit_time, n2(t.durationMin), t.entry_price, t.exit_price, t.stop_loss, t.take_profit,
      n2(t.points), n2(t.ticks), n2(t.gross), n2(t.fees), t.feeSource, n2(t.net), n2(t.risk), n2(t.r), n2(t.plannedRR),
      t.outcome, t.sessionName, t.setup, t.timeframe, t.bias, t.concepts,
      j?.before.map((v) => labelOf('before', v)), j?.during.map((v) => labelOf('during', v)), j?.after.map((v) => labelOf('after', v)),
      j?.rule_compliance ? labelOf('rule_compliance', j.rule_compliance) : '', j?.entry_quality ?? '',
      j?.exit_quality.map((v) => labelOf('exit_quality', v)), j?.mistakes.map((v) => labelOf('mistakes', v)),
      j?.setup_quality ? labelOf('setup_quality', j.setup_quality) : '', j?.lessons.map((v) => labelOf('lessons', v)), j?.note,
      t.notes, t.ai_review?.score ?? '', t.source,
    ].map(esc).join(',');
  });
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
