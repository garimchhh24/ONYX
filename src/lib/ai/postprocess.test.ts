import { describe, expect, it } from 'vitest';
import { BUILTIN_INSTRUMENTS } from '../domain/instruments';
import { chartTimeZone, normalizeTimeframe, parseChartTime, processExtraction } from './postprocess';
import { ExtractionSchema, type ExtractionResult } from './schema';

const missing = { value: null, confidence: 0, source: 'missing' as const, evidence: '', image: null };
const vis = <T,>(value: T, confidence = 0.95, image = 1) => ({ value, confidence, source: 'visible' as const, evidence: 'label', image });

function base(p: Partial<ExtractionResult> = {}): ExtractionResult {
  return ExtractionSchema.parse({
    is_trade_screenshot: true,
    platform: 'tradingview',
    instrument: missing, contract: missing, direction: missing, entry_price: missing, exit_price: missing, stop_loss: missing,
    take_profit: missing, contracts: missing, entry_time: missing, exit_time: missing, chart_timezone: missing, gross_pnl: missing,
    net_pnl: missing, commission: missing, risk_amount: missing, realized_r: missing, trading_session: missing, setup_type: missing,
    timeframe: missing, market_bias: missing, market_structure: missing, concepts: [], other_concepts: [], observations: [],
    assumptions: [], conflicts: [], summary: '',
    ...p,
  });
}

const ctx = { instruments: BUILTIN_INSTRUMENTS, timezone: 'Europe/Berlin', now: new Date('2026-11-20T22:00:00Z') };

describe('AI extraction post-processing', () => {
  it('maps a TradingView long position with full provenance', () => {
    const r = processExtraction(
      base({
        instrument: vis('CME_MINI:NQZ2026'),
        direction: vis('long'),
        entry_price: vis(21450.25),
        stop_loss: vis(21430),
        take_profit: vis(21490, 0.6),
        contracts: vis(2),
        entry_time: vis('2026-11-20 09:42'),
        exit_time: vis('2026-11-20 10:05'),
        chart_timezone: vis('(UTC-5) New York'),
        timeframe: vis('5'),
        concepts: [{ concept: 'fvg', confidence: 0.8, evidence: 'drawn box', image: 1 }, { concept: 'smt', confidence: 0.3, evidence: 'weak', image: 1 }],
      }),
      ctx,
    );
    expect(r.fields).toMatchObject({ symbol: 'NQ', contract: 'NQZ6', direction: 'long', entry_price: 21450.25, contracts: 2, timeframe: '5m', concepts: ['fvg'] });
    expect(r.fields.entry_time).toBe('2026-11-20T14:42:00.000Z');
    expect(r.meta.entry_price).toMatchObject({ source: 'visible', needs_review: false, image: 0 });
    expect(r.meta.take_profit.needs_review).toBe(true); // low confidence
    expect(r.meta.duration.source).toBe('calculated');
  });

  it('swaps stop and target when labels contradict the stated direction', () => {
    const r = processExtraction(base({ instrument: vis('ES1!'), direction: vis('short'), entry_price: vis(5000), stop_loss: vis(4990), take_profit: vis(5010) }), ctx);
    expect(r.fields).toMatchObject({ direction: 'short', stop_loss: 5010, take_profit: 4990 });
    expect(r.warnings.join(' ')).toMatch(/swapped/);
  });

  it('flags prices off the tick grid and unknown instruments', () => {
    const r = processExtraction(base({ instrument: vis('ZZX1!'), entry_price: vis(100.13) }), ctx);
    expect(r.meta.symbol.needs_review).toBe(true);
    const es = processExtraction(base({ instrument: vis('ES'), entry_price: vis(5000.1) }), ctx);
    expect(es.meta.entry_price.needs_review).toBe(true);
    expect(es.warnings.join(' ')).toMatch(/tick grid/);
  });

  it('never records an inferred commission', () => {
    const r = processExtraction(base({ commission: { value: 4.2, confidence: 0.6, source: 'inferred', evidence: 'typical', image: null } }), ctx);
    expect(r.fields.commission).toBeUndefined();
    expect(r.assumptions.join(' ')).toMatch(/never assumes fees/);
    const v = processExtraction(base({ commission: vis(-8.4) }), ctx);
    expect(v.fields.commission).toBe(8.4);
  });

  it('marks assumed dates and uses the device zone when the chart zone is unknown', () => {
    const r = processExtraction(base({ entry_time: vis('09:30') }), ctx);
    expect(r.fields.entry_time).toBe('2026-11-20T08:30:00.000Z'); // Berlin
    expect(r.meta.entry_time).toMatchObject({ source: 'inferred', needs_review: true });
    expect(r.assumptions.some((a) => a.includes('assumed today'))).toBe(true);
  });

  it('rejects implausible sizes and future times', () => {
    const r = processExtraction(base({ contracts: vis(5000), entry_time: vis('2026-11-25 10:00') }), ctx);
    expect(r.fields.contracts).toBeUndefined();
    expect(r.fields.entry_time).toBeUndefined();
  });

  it('parses chart time zones and timeframes', () => {
    expect(chartTimeZone('(UTC-6) Chicago')).toBe('America/Chicago');
    expect(chartTimeZone('UTC+3')).toBe('Etc/GMT-3');
    expect(normalizeTimeframe('1h')).toBe('1H');
    expect(parseChartTime('2026-07-01 09:30', 'America/New_York', new Date())?.iso).toBe('2026-07-01T13:30:00.000Z');
  });
});
