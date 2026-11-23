import type { Instrument, Trade } from '../types';
import { findInstrument, isOnTick } from './instruments';

export interface Validation {
  errors: Record<string, string>;
  warnings: string[];
}

const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Hard errors block saving; warnings are shown but never block. */
export function validateTrade(t: Trade, instruments: Instrument[]): Validation {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const inst = findInstrument(t.symbol, instruments);

  if (!t.symbol?.trim()) errors.symbol = 'Choose an instrument.';
  else if (!inst) errors.symbol = `${t.symbol} has no contract specification. Add it in Settings → Instruments.`;
  if (!num(t.contracts) || t.contracts <= 0) errors.contracts = 'Contracts must be greater than 0.';
  else if (t.contracts > 10000) errors.contracts = 'That is more contracts than CADENCE supports.';

  for (const k of ['entry_price', 'exit_price', 'stop_loss', 'take_profit'] as const) {
    const v = t[k];
    if (v !== null && v !== undefined && (!Number.isFinite(v) || v <= 0)) errors[k] = 'Enter a positive price.';
  }
  if (num(t.commission) && t.commission < 0) errors.commission = 'Commission cannot be negative.';
  if (num(t.risk_amount) && t.risk_amount < 0) errors.risk_amount = 'Risk cannot be negative.';

  if (t.entry_time && isNaN(new Date(t.entry_time).getTime())) errors.entry_time = 'Invalid entry time.';
  if (t.exit_time && isNaN(new Date(t.exit_time).getTime())) errors.exit_time = 'Invalid exit time.';
  if (t.entry_time && t.exit_time && new Date(t.exit_time) < new Date(t.entry_time)) errors.exit_time = 'Exit must be after entry.';
  if (t.entry_time && new Date(t.entry_time).getTime() > Date.now() + 10 * 60_000) warnings.push('Entry time is in the future.');

  const hasResult = (num(t.entry_price) && num(t.exit_price)) || num(t.gross_pnl) || num(t.net_pnl);
  if (!hasResult) warnings.push('No exit price or platform P&L yet — the trade will count as incomplete in statistics.');

  if (inst) {
    for (const k of ['entry_price', 'exit_price', 'stop_loss', 'take_profit'] as const) {
      const v = t[k];
      if (num(v) && !isOnTick(v, inst)) warnings.push(`${label(k)} ${v} is not on the ${inst.symbol} tick grid (${inst.tick_size}).`);
    }
  }
  if (num(t.entry_price) && num(t.stop_loss)) {
    const wrong = t.direction === 'long' ? t.stop_loss >= t.entry_price : t.stop_loss <= t.entry_price;
    if (wrong) warnings.push(`Stop loss is on the wrong side of the entry for a ${t.direction}.`);
  }
  if (num(t.entry_price) && num(t.take_profit)) {
    const wrong = t.direction === 'long' ? t.take_profit <= t.entry_price : t.take_profit >= t.entry_price;
    if (wrong) warnings.push(`Take profit is on the wrong side of the entry for a ${t.direction}.`);
  }
  if (!num(t.stop_loss) && !num(t.risk_amount)) warnings.push('Without a stop loss or risk amount, R multiples can’t be calculated.');
  return { errors, warnings };
}

function label(k: string): string {
  return { entry_price: 'Entry', exit_price: 'Exit', stop_loss: 'Stop', take_profit: 'Target' }[k] ?? k;
}
