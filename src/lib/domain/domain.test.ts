import { describe, expect, it } from 'vitest';
import type { Account, Trade } from '../types';
import { accountMetrics, reconcileAdjustment } from './accounts';
import { enrichAll, enrichTrade } from './calc';
import { coach, MIN_TRADES, welchT } from './coach';
import { tradesToCsv } from './csv';
import { BUILTIN_INSTRUMENTS, contractCode, mergeInstruments, rootSymbol } from './instruments';
import { isJournalComplete, emptyAnswers } from './questionnaire';
import { isDue, journalStatus, reminderMessage } from './reminders';
import { sessionFor } from './sessions';
import { applyFilter, byEmotionBefore, monthlySeries, summarize, weeklySeries } from './stats';
import { tradingDay, zonedToIso } from './time';

let seq = 0;
export function mkTrade(p: Partial<Trade> = {}): Trade {
  seq++;
  const now = '2026-11-10T15:00:00.000Z';
  return {
    id: `t${seq}`,
    user_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    account_id: null,
    symbol: 'NQ',
    contract: null,
    direction: 'long',
    contracts: 1,
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    entry_time: now,
    exit_time: null,
    commission: null,
    gross_pnl: null,
    net_pnl: null,
    risk_amount: null,
    session: null,
    trading_day: null,
    timeframe: null,
    setup: null,
    bias: null,
    market_structure: null,
    concepts: [],
    tags: [],
    notes: null,
    journal: null,
    journal_completed_at: null,
    ai_review: null,
    extraction: null,
    source: 'manual',
    ...p,
  };
}

const I = BUILTIN_INSTRUMENTS;

describe('futures P&L by contract specification', () => {
  const cases: [string, 'long' | 'short', number, number, number, number][] = [
    // symbol, direction, entry, exit, contracts, expected gross
    ['ES', 'long', 5000, 5004.25, 1, 212.5], // 17 ticks × $12.50
    ['NQ', 'short', 21000, 20990.5, 2, 380], // 9.5 pts × $20 × 2
    ['MES', 'long', 5000, 4998, 3, -30], // −2 pts × $5 × 3
    ['MNQ', 'long', 21000.25, 21010.75, 5, 105], // 10.5 × $2 × 5
    ['RTY', 'short', 2200, 2195.3, 1, 235], // 4.7 × $50
    ['M2K', 'long', 2200, 2201, 4, 20], // 1 × $5 × 4
    ['YM', 'long', 44000, 44030, 1, 150], // 30 × $5
    ['MYM', 'short', 44000, 44030, 2, -30], // −30 × $0.50 × 2
    ['CL', 'long', 70.5, 70.75, 1, 250], // 25 ticks × $10
    ['GC', 'short', 2650, 2648.4, 1, 160], // 1.6 × $100
  ];
  for (const [symbol, direction, entry, exit, contracts, gross] of cases) {
    it(`${symbol} ${direction} ${contracts}× ${entry}→${exit} = $${gross}`, () => {
      const t = enrichTrade(mkTrade({ symbol, direction, entry_price: entry, exit_price: exit, contracts }), I);
      expect(t.gross).toBeCloseTo(gross, 2);
      expect(t.net).toBeCloseTo(gross, 2); // no fees configured → never assumed
      expect(t.feeSource).toBe('unknown');
    });
  }

  it('applies explicit trade commission, then user-configured rates, never a default', () => {
    const base = { symbol: 'NQ', entry_price: 21000, exit_price: 21010, contracts: 2 };
    expect(enrichTrade(mkTrade({ ...base, commission: 8.4 }), I).net).toBeCloseTo(400 - 8.4);
    const withRates = mergeInstruments([{ symbol: 'NQ', name: '', tick_size: 0.25, tick_value: 5, commission_rt: 3.5 }]);
    const t = enrichTrade(mkTrade(base), withRates);
    expect(t.fees).toBe(7);
    expect(t.feeSource).toBe('settings');
    expect(t.net).toBe(393);
  });

  it('computes risk, R multiple, planned R:R and outcome', () => {
    const t = enrichTrade(mkTrade({ symbol: 'ES', entry_price: 5000, stop_loss: 4996, take_profit: 5012, exit_price: 5008 }), I);
    expect(t.risk).toBe(200);
    expect(t.r).toBeCloseTo(2);
    expect(t.plannedRR).toBeCloseTo(3);
    expect(t.outcome).toBe('win');
  });

  it('uses platform P&L only when prices are missing, and flags mismatches', () => {
    expect(enrichTrade(mkTrade({ net_pnl: -120 }), I).net).toBe(-120);
    const mm = enrichTrade(mkTrade({ symbol: 'NQ', entry_price: 21000, exit_price: 21010, gross_pnl: 260 }), I);
    expect(mm.gross).toBe(200);
    expect(mm.pnlMismatch).toBe(60);
  });

  it('calculates duration only from valid timestamps', () => {
    const t = enrichTrade(mkTrade({ entry_time: '2026-11-10T14:35:00Z', exit_time: '2026-11-10T14:52:30Z' }), I);
    expect(t.durationMin).toBeCloseTo(17.5);
    expect(enrichTrade(mkTrade({ entry_time: '2026-11-10T15:00:00Z', exit_time: '2026-11-10T14:00:00Z' }), I).durationMin).toBeUndefined();
  });
});

describe('symbols, sessions and trading days', () => {
  it('parses contract codes and TradingView tickers', () => {
    expect(rootSymbol('MNQZ6')).toBe('MNQ');
    expect(rootSymbol('NQZ2026')).toBe('NQ');
    expect(rootSymbol('CME_MINI:ES1!')).toBe('ES');
    expect(rootSymbol('/GCG27')).toBe('GC');
    expect(rootSymbol('M2KH7')).toBe('M2K');
    expect(contractCode('NQZ2026')).toBe('NQZ6');
    expect(contractCode('NQ1!')).toBeNull();
  });

  it('detects sessions in New York time across DST', () => {
    expect(sessionFor(zonedToIso(2026, 7, 15, 9, 45, 0, 'America/New_York'))).toBe('NY AM');
    expect(sessionFor(zonedToIso(2026, 12, 15, 9, 45, 0, 'America/New_York'))).toBe('NY AM');
    expect(sessionFor(zonedToIso(2026, 12, 15, 3, 10, 0, 'America/New_York'))).toBe('London');
    expect(sessionFor(zonedToIso(2026, 12, 15, 20, 0, 0, 'America/New_York'))).toBe('Asia');
    expect(sessionFor(zonedToIso(2026, 12, 15, 12, 0, 0, 'America/New_York'))).toBe('NY Lunch');
  });

  it('rolls the CME trading day at 18:00 New York', () => {
    expect(tradingDay(zonedToIso(2026, 11, 10, 17, 59, 0, 'America/New_York'))).toBe('2026-11-10');
    expect(tradingDay(zonedToIso(2026, 11, 10, 18, 1, 0, 'America/New_York'))).toBe('2026-11-11');
  });
});

describe('statistics', () => {
  const trades = enrichAll(
    [
      mkTrade({ net_pnl: 300, exit_time: '2026-11-02T15:00:00Z', journal: { ...emptyAnswers(), before: ['calm'] } }),
      mkTrade({ net_pnl: -100, exit_time: '2026-11-02T16:00:00Z', journal: { ...emptyAnswers(), before: ['anxious'] } }),
      mkTrade({ net_pnl: -150, exit_time: '2026-11-03T15:00:00Z' }),
      mkTrade({ net_pnl: 200, exit_time: '2026-11-04T15:00:00Z' }),
      mkTrade({ net_pnl: 250, exit_time: '2026-12-01T15:00:00Z' }),
      mkTrade({ entry_price: 21000, exit_time: null }), // open
    ],
    I,
  );
  const s = summarize(trades);

  it('summarizes win rate, profit factor, expectancy and drawdown', () => {
    expect(s.trades).toBe(5);
    expect(s.open).toBe(1);
    expect(s.winRate).toBe(60);
    expect(s.net).toBe(500);
    expect(s.profitFactor).toBeCloseTo(750 / 250);
    expect(s.expectancy).toBe(100);
    expect(s.maxDrawdown).toBe(250);
    expect(s.winDays).toBe(3);
    expect(s.lossDays).toBe(1);
    expect(s.maxWinStreak).toBe(2);
    expect(s.maxLossStreak).toBe(2);
    expect(s.currentStreak).toBe(2);
  });

  it('builds weekly and monthly series', () => {
    expect(monthlySeries(trades).map((m) => [m.key, m.pnl])).toEqual([
      ['2026-11', 250],
      ['2026-12', 250],
    ]);
    expect(weeklySeries(trades)[0].key).toBe('2026-11-02');
  });

  it('groups by emotional state', () => {
    const rows = byEmotionBefore(trades);
    expect(rows.find((r) => r.key === 'calm')?.pnl).toBe(300);
    expect(rows.find((r) => r.key === 'anxious')?.pnl).toBe(-100);
  });

  it('filters by date range', () => {
    expect(applyFilter(trades, { range: '7d' }, '2026-12-03').length).toBe(1);
    expect(applyFilter(trades, { range: 'all' }, '2026-12-03').length).toBe(6);
  });
});

describe('Lucid account metrics (user-configured rules)', () => {
  const account: Account = {
    id: 'a1', user_id: null, created_at: '', updated_at: '', deleted_at: null,
    name: 'Flex 50K', firm: 'Lucid Trading', plan: 'Test plan', phase: 'evaluation', size: 50000,
    starting_balance: 50000, balance_adjustment: 0, status: 'active', daily_loss_limit: 1000, max_drawdown: 2000,
    drawdown_type: 'trailing_eod', drawdown_lock: 50100, profit_target: 3000, payout_target: null, min_trading_days: null,
    consistency_pct: 50, personal_daily_risk: 500, personal_trade_risk: null, rules_source: 'user', rules_verified_at: null,
    rules_reference: null, notes: null,
  };
  const tr = (day: string, net: number) => mkTrade({ account_id: 'a1', net_pnl: net, trading_day: day, exit_time: `${day}T15:00:00Z` });

  it('trails the drawdown at end of day and locks it', () => {
    const ts = enrichAll([tr('2026-11-02', 1500), tr('2026-11-03', 1000), tr('2026-11-05', -300)], I);
    const m = accountMetrics(account, ts, '2026-11-05');
    expect(m.balance).toBe(52200);
    // peak EOD 52,500 → 50,500 but locked at 50,100
    expect(m.threshold).toBe(50100);
    expect(m.thresholdLocked).toBe(true);
    expect(m.todayPnl).toBe(-300);
    expect(m.dailyRoom).toBe(700);
    expect(m.personalRoom).toBe(200);
    expect(m.riskAllowance).toBe(200);
    expect(m.targetLeft).toBe(800);
    expect(m.consistency).toBeCloseTo((1500 / 2200) * 100);
    expect(m.consistencyOk).toBe(false);
  });

  it('detects a breach and reconciles with the platform balance', () => {
    const ts = enrichAll([tr('2026-11-02', -1200), tr('2026-11-03', -900)], I);
    const m = accountMetrics(account, ts, '2026-11-03');
    expect(m.breached).toBe(true);
    expect(m.level).toBe('danger');
    expect(reconcileAdjustment(account, ts, 47850, '2026-11-03')).toBe(-50);
  });
});

describe('journaling and reminders', () => {
  it('requires the core questions for a complete journal', () => {
    const a = emptyAnswers();
    expect(isJournalComplete(a)).toBe(false);
    expect(isJournalComplete({ ...a, rule_compliance: 'complete', entry_quality: 'A', exit_quality: ['good'], mistakes: ['none'] })).toBe(true);
  });

  const tz = 'America/New_York';
  const evening = new Date(zonedToIso(2026, 11, 11, 20, 35, 0, tz)); // Wednesday 8:35 PM
  it('is due inside the 15-minute window after the configured time', () => {
    expect(isDue(evening, tz, '20:30')).toBe(true);
    expect(isDue(evening, tz, '21:00')).toBe(false);
  });

  it('reminds only when journaling is incomplete', () => {
    const t = (journaled: boolean) =>
      ({ entry_time: zonedToIso(2026, 11, 11, 10, 0, 0, tz), exit_time: null, created_at: '', deleted_at: null, journal_completed_at: journaled ? 'x' : null });
    expect(reminderMessage(journalStatus([t(true)], [], evening, tz)).send).toBe(false);
    expect(reminderMessage(journalStatus([t(true), t(false)], [], evening, tz)).reason).toBe('unjournaled');
    expect(reminderMessage(journalStatus([], [], evening, tz)).reason).toBe('no_entries');
    expect(reminderMessage(journalStatus([], [{ id: '2026-11-11', status: 'no_trades', deleted_at: null }], evening, tz)).send).toBe(false);
    const saturday = new Date(zonedToIso(2026, 11, 14, 20, 35, 0, tz));
    expect(reminderMessage(journalStatus([], [], saturday, tz)).send).toBe(false);
  });
});

describe('coach', () => {
  it('stays silent below the minimum sample', () => {
    const r = coach(enrichAll([mkTrade({ net_pnl: 100 })], I));
    expect(r.ready).toBe(false);
    expect(r.tradesNeeded).toBe(MIN_TRADES - 1);
    expect(r.insights).toEqual([]);
  });

  it('reports a pattern only with a significant difference', () => {
    const ts: Trade[] = [];
    for (let i = 0; i < 30; i++) {
      const day = `2026-10-${String((i % 28) + 1).padStart(2, '0')}`;
      const nyAm = i % 2 === 0;
      ts.push(
        mkTrade({
          trading_day: day,
          exit_time: `${day}T15:00:00Z`,
          session: nyAm ? 'NY AM' : 'NY Lunch',
          net_pnl: nyAm ? 150 + (i % 5) * 10 : -120 - (i % 4) * 10,
        }),
      );
    }
    const r = coach(enrichAll(ts, I));
    expect(r.ready).toBe(true);
    expect(r.insights.some((x) => x.id === 'session:NY Lunch' && x.impact === 'negative')).toBe(true);
    expect(welchT([1, 1, 1], [1, 1, 1])).toBe(0);
  });
});

describe('CSV export', () => {
  it('escapes values and includes computed columns', () => {
    const csv = tradesToCsv(enrichAll([mkTrade({ symbol: 'ES', entry_price: 5000, exit_price: 5001, notes: 'held, then "scaled"' })], I), []);
    const [header, row] = csv.trim().split('\r\n');
    expect(header.split(',')).toContain('net_pnl');
    expect(row).toContain('"held, then ""scaled"""');
    expect(row).toContain(',50,');
  });
});
