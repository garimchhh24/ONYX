import { describe, expect, it } from 'vitest';
import type { Settings, Trade } from '../../types';
import { DEFAULT_SESSIONS, sessionLabel } from '../sessions';
import { outcome, plannedRR, tradePnl, tradeR, tradeRisk } from '../calc';
import { byWeekday, equityCurve, insights, rHistogram, summarize } from '../stats';
import { importText, parseDate, parseNumber } from '../importers';
import { chartImageUrl } from '../tradingview';

const settings: Settings = {
  id: 'settings', currency: 'USD', startingBalance: 10000, displayTimeZone: 'UTC',
  sessions: DEFAULT_SESSIONS, setups: [], mistakes: [], emotions: [], maxRiskPercent: 1,
};

let n = 0;
const mk = (p: Partial<Trade>): Trade => ({
  id: String(++n), symbol: 'EURUSD', direction: 'long', entryTime: '2026-03-02T10:00:00Z',
  entryPrice: 100, size: 1, pointValue: 1, fees: 0, tags: [], mistakes: [], analyses: [],
  source: 'test', createdAt: '', updatedAt: '', ...p,
});

describe('sessions', () => {
  it('detects sessions with DST', () => {
    expect(sessionLabel('2026-01-15T02:00:00Z', DEFAULT_SESSIONS)).toBe('Азия');
    // 07:30 UTC in July = 08:30 BST → London; Tokyo 16:30 → Asia too
    expect(sessionLabel('2026-07-15T07:30:00Z', DEFAULT_SESSIONS)).toBe('Азия + Лондон');
    // 07:30 UTC in January = 07:30 GMT → before London open
    expect(sessionLabel('2026-01-15T07:30:00Z', DEFAULT_SESSIONS)).toBe('Азия');
    expect(sessionLabel('2026-01-15T14:00:00Z', DEFAULT_SESSIONS)).toBe('Лондон + Нью-Йорк');
    expect(sessionLabel('2026-01-15T19:00:00Z', DEFAULT_SESSIONS)).toBe('Нью-Йорк');
    expect(sessionLabel('2026-01-15T23:00:00Z', DEFAULT_SESSIONS)).toBe('Вне сессий');
  });
});

describe('calc', () => {
  it('computes pnl, risk, R', () => {
    const t = mk({ entryPrice: 100, exitPrice: 106, stopLoss: 98, takeProfit: 108, size: 2, pointValue: 10, fees: 4 });
    expect(tradePnl(t)).toBe(116);
    expect(tradeRisk(t)).toBe(40);
    expect(tradeR(t)).toBeCloseTo(2.9);
    expect(plannedRR(t)).toBe(4);
    expect(outcome(t)).toBe('win');
    const s = mk({ direction: 'short', entryPrice: 100, exitPrice: 101, stopLoss: 101 });
    expect(tradePnl(s)).toBe(-1);
    expect(tradeR(s)).toBe(-1);
    expect(outcome(mk({}))).toBe('open');
    expect(outcome(mk({ exitPrice: 100.05, stopLoss: 99 }))).toBe('be');
  });
});

describe('stats', () => {
  const trades = [
    mk({ exitPrice: 102, stopLoss: 99, exitTime: '2026-03-02T11:00:00Z' }), // +2, 2R
    mk({ exitPrice: 99, stopLoss: 99, exitTime: '2026-03-03T11:00:00Z', entryTime: '2026-03-03T10:00:00Z' }), // -1
    mk({ exitPrice: 98, stopLoss: 99, exitTime: '2026-03-04T11:00:00Z', entryTime: '2026-03-04T10:00:00Z' }), // -2
    mk({ exitPrice: 104, stopLoss: 99, exitTime: '2026-03-05T11:00:00Z', entryTime: '2026-03-05T10:00:00Z' }), // +4
    mk({}), // open
  ];
  it('summarizes', () => {
    const s = summarize(trades, settings);
    expect(s.total).toBe(5);
    expect(s.open).toBe(1);
    expect(s.winRate).toBe(50);
    expect(s.netPnl).toBe(3);
    expect(s.profitFactor).toBe(2);
    expect(s.maxDrawdown).toBe(3);
    expect(s.maxLossStreak).toBe(2);
    expect(s.currentStreak).toBe(1);
    expect(s.totalR).toBe(3);
    expect(s.payoff).toBe(2);
    expect(s.requiredWinRate).toBeCloseTo(33.33, 1);
  });
  it('groups and curves', () => {
    expect(byWeekday(trades, settings).map((r) => r.key)).toEqual(['Пн', 'Вт', 'Ср', 'Чт']);
    const eq = equityCurve(trades, settings);
    expect(eq.at(-1)!.equity).toBe(10003);
    expect(eq[3].drawdown).toBe(-3);
    expect(rHistogram(trades).reduce((a, b) => a + b.count, 0)).toBe(4);
    expect(insights(trades, settings).length).toBe(1);
  });
});

describe('importers', () => {
  it('parses numbers and dates', () => {
    expect(parseNumber('1 234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('-12.5 USD')).toBe(-12.5);
    expect(parseDate('2026.03.02 10:30:00', { kind: 'offset', minutes: 120 })).toBe('2026-03-02T08:30:00.000Z');
    expect(parseDate('02.03.2026 10:30', { kind: 'offset', minutes: 0 })).toBe('2026-03-02T10:30:00.000Z');
    expect(parseDate('2026-03-02T10:30:00Z', { kind: 'local' })).toBe('2026-03-02T10:30:00.000Z');
  });

  it('imports MetaTrader-style CSV with repeated Time/Price columns', () => {
    const csv = [
      'Time;Position;Symbol;Type;Volume;Price;S / L;T / P;Time;Price;Commission;Swap;Profit',
      '2026.03.02 10:00:00;111;EURUSD;buy;1.00;1.08000;1.07900;1.08300;2026.03.02 12:00:00;1.08200;-7.00;0.00;200.00',
      '2026.03.03 10:00:00;112;XAUUSD;sell;0.10;2000.00;2010.00;1980.00;2026.03.03 11:00:00;2010.00;-1.00;0.00;-100.00',
      ';;;balance;;;;;;;;;5000',
    ].join('\n');
    const r = importText(csv, 'history.csv', { tz: { kind: 'offset', minutes: 120 } });
    expect(r.trades).toHaveLength(2);
    const [a, b] = r.trades;
    expect(a.entryTime).toBe('2026-03-02T08:00:00.000Z');
    expect(a.exitPrice).toBe(1.082);
    expect(a.pnlOverride).toBe(193);
    expect(a.pointValue).toBeCloseTo(100000);
    expect(tradeRisk(a)).toBeCloseTo(100);
    expect(tradeR(a)).toBeCloseTo(1.93);
    expect(b.direction).toBe('short');
    expect(tradeR(b)).toBeCloseTo(-1.01);
    expect(r.skipped).toBe(1);
  });

  it('imports TradingView strategy tester list of trades', () => {
    const csv = [
      'Trade #,Type,Signal,Date/Time,Price USD,Contracts,Profit USD,Profit %',
      '1,Exit long,TP,2026-03-02 12:00,110,2,20,10',
      '1,Entry long,Breakout,2026-03-02 10:00,100,2,20,10',
      '2,Exit short,SL,2026-03-03 12:00,105,1,-5,-5',
      '2,Entry short,Fade,2026-03-03 10:00,100,1,-5,-5',
    ].join('\n');
    const r = importText(csv, 'BTCUSD_strategy.csv', { tz: { kind: 'offset', minutes: 0 } });
    expect(r.format).toContain('TradingView');
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0].symbol).toBe('BTCUSD');
    expect(r.trades[0].setup).toBe('Breakout');
    expect(tradePnl(r.trades[1])).toBe(-5);
    expect(r.trades[1].direction).toBe('short');
  });
});

describe('tradingview links', () => {
  it('derives snapshot image', () => {
    expect(chartImageUrl('https://www.tradingview.com/x/AbCd1234/')).toBe('https://s3.tradingview.com/snapshots/a/AbCd1234.png');
    expect(chartImageUrl('https://ru.tradingview.com/x/Zx9/')).toBe('https://s3.tradingview.com/snapshots/z/Zx9.png');
    expect(chartImageUrl('https://www.tradingview.com/chart/abc/')).toBeUndefined();
  });
});
