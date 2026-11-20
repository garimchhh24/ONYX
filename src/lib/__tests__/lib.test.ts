import { describe, expect, it } from 'vitest';
import type { Account, Cashflow, Trade } from '../../types';
import { DEFAULT_SETTINGS } from '../../store/defaults';
import { enrichAll, enrichTrade, money } from '../calc';
import { rootSymbol } from '../instruments';
import { DEFAULT_SESSIONS, sessionLabel } from '../sessions';
import { accountState, propEconomy } from '../prop';
import { byTradeNumber, equityCurve, insights, lossesBefore, summarize } from '../stats';
import { importText, parseDate, parseNumber } from '../importers';
import { tradingDay, zonedToIso } from '../time';
import { chartImageUrl } from '../tradingview';
import { demoData } from '../demo';

const S = DEFAULT_SETTINGS;
let n = 0;
const mk = (p: Partial<Trade>): Trade => ({
  id: 't' + ++n, accountIds: ['a'], symbol: 'NQ', direction: 'long', contracts: 1, mode: 'points',
  entryTime: '2026-03-02T15:00:00Z', mistakes: [], analyses: [], source: 'manual', createdAt: '', updatedAt: '', ...p,
});
const ny = (d: string, h: number, m = 0) => {
  const [y, mo, dd] = d.split('-').map(Number);
  return zonedToIso(y, mo, dd, h, m, 0, 'America/New_York');
};

describe('time & sessions', () => {
  it('maps NY wall-clock with DST', () => {
    expect(ny('2026-01-15', 9, 30)).toBe('2026-01-15T14:30:00.000Z');
    expect(ny('2026-07-15', 9, 30)).toBe('2026-07-15T13:30:00.000Z');
  });
  it('uses the CME trading day (18:00 ET roll)', () => {
    expect(tradingDay(ny('2026-03-02', 17, 59))).toBe('2026-03-02');
    expect(tradingDay(ny('2026-03-02', 18, 30))).toBe('2026-03-03');
    expect(tradingDay(ny('2026-03-01', 19, 0))).toBe('2026-03-02'); // Sunday evening → Monday
  });
  it('detects futures sessions in NY time', () => {
    expect(sessionLabel(ny('2026-07-10', 9, 45), DEFAULT_SESSIONS)).toBe('NY открытие');
    expect(sessionLabel(ny('2026-01-10', 12, 0), DEFAULT_SESSIONS)).toBe('NY ланч');
    expect(sessionLabel(ny('2026-01-10', 4, 0), DEFAULT_SESSIONS)).toBe('Лондон');
    expect(sessionLabel(ny('2026-01-10', 21, 0), DEFAULT_SESSIONS)).toBe('Азия');
    expect(sessionLabel(ny('2026-01-10', 8, 45), DEFAULT_SESSIONS)).toBe('Премаркет');
    expect(sessionLabel(ny('2026-01-10', 15, 0), DEFAULT_SESSIONS)).toBe('NY закрытие');
  });
});

describe('futures math', () => {
  it('points mode: NQ $20/pt, commission per contract', () => {
    const t = enrichTrade(mk({ contracts: 2, stopPoints: 10, targetPoints: 25, resultPoints: 20 }), S);
    expect(t.gross).toBe(800);
    expect(t.feesUsd).toBe(8);
    expect(t.net).toBe(792);
    expect(t.risk).toBe(400);
    expect(t.r).toBeCloseTo(1.98);
    expect(t.plannedRR).toBe(2.5);
    expect(t.ticks).toBe(80);
    expect(t.outcome).toBe('win');
  });
  it('prices mode short on MES', () => {
    const t = enrichTrade(mk({ symbol: 'MES', mode: 'prices', direction: 'short', contracts: 5, entryPrice: 5000, exitPrice: 5004, stopPrice: 5004 }), S);
    expect(t.gross).toBe(-100);
    expect(t.net).toBeCloseTo(-107.5);
    expect(t.r).toBeCloseTo(-1.075);
    expect(t.outcome).toBe('loss');
    expect(t.miniEq).toBe(0.5);
  });
  it('money mode uses the entered net value', () => {
    const t = enrichTrade(mk({ mode: 'money', pnl: -250, riskUsd: 250 }), S);
    expect(t.net).toBe(-250);
    expect(t.r).toBe(-1);
  });
  it('imported gross minus commission; breakeven and open', () => {
    expect(enrichTrade(mk({ mode: 'prices', gross: 100, entryPrice: 1, exitPrice: 2 }), S).net).toBe(96);
    expect(enrichTrade(mk({ resultPoints: 0.25, stopPoints: 10 }), S).outcome).toBe('be');
    expect(enrichTrade(mk({ resultPoints: undefined }), S).outcome).toBe('open');
  });
  it('formats money', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(money(-80, { cents: false })).toBe('−$80');
    expect(money(12, { signed: true })).toBe('+$12.00');
  });
  it('parses contract codes', () => {
    expect(rootSymbol('MNQZ4')).toBe('MNQ');
    expect(rootSymbol('NQ 12-24')).toBe('NQ');
    expect(rootSymbol('/ESH25')).toBe('ES');
    expect(rootSymbol('M2KM5')).toBe('M2K');
    expect(rootSymbol('MGCG25')).toBe('MGC');
    expect(rootSymbol('CON.F.US.MNQ.Z24')).toBe('MNQ');
    expect(rootSymbol('6EZ4')).toBe('6E');
  });
});

const acc = (p: Partial<Account> = {}): Account => ({
  id: 'a', firm: 'X', name: '50K', size: 50_000, phase: 'eval', status: 'active', startBalance: 50_000, startDate: '2026-03-01',
  profitTarget: 3_000, maxDrawdown: 2_000, drawdownType: 'eod', drawdownLock: 0, createdAt: '', updatedAt: '', ...p,
});
const day = (d: string, pts: number, extra: Partial<Trade> = {}) => mk({ entryTime: ny(d, 10), exitTime: ny(d, 10, 30), resultPoints: pts, ...extra });

describe('prop account rules', () => {
  it('EOD trailing drawdown, target, consistency, days', () => {
    // NQ 1 contract: $20/pt minus $4
    const trades = enrichAll([day('2026-03-02', 50), day('2026-03-03', 25), day('2026-03-04', -10), day('2026-03-05', 60)], S);
    const st = accountState(acc({ consistencyPct: 50, minDays: 3 }), trades, [], '2026-03-06');
    // day nets: 996, 496, -204, 1196 → balance 52,484
    expect(st.balance).toBe(52_484);
    expect(st.days.map((d) => d.pnl)).toEqual([996, 496, -204, 1196]);
    // EOD peaks: 50,996 → 51,492 → 51,492 → 52,688 → threshold 50,688 after last day (capped at 50,000 lock!)
    expect(st.threshold).toBe(50_000); // lock = start
    expect(st.thresholdLocked).toBe(true);
    expect(st.buffer).toBe(2_484);
    expect(st.targetLeft).toBe(516);
    expect(st.bestDay).toBe(1196);
    expect(st.consistency).toBeCloseTo((1196 / 2484) * 100);
    expect(st.consistencyOk).toBe(true);
    expect(st.tradingDays).toBe(4);
    expect(st.daysOk).toBe(true);
    expect(st.readyToPass).toBe(false);
  });
  it('threshold trails before the lock and breach is detected', () => {
    const a = acc({ maxDrawdown: 2_000, drawdownLock: 5_000 });
    const trades = enrichAll([day('2026-03-02', 50), day('2026-03-03', -60), day('2026-03-04', -50)], S);
    const st = accountState(a, trades, [], '2026-03-05');
    // after day1 EOD 50,996 → threshold 48,996; day2 −1,204 → 49,792; day3 −1,004 → 48,788 ≤ 48,996 → breached
    expect(st.breached).toBe(true);
    expect(st.breachDay).toBe('2026-03-04');
    expect(st.level).toBe('bad');
  });
  it('intraday trailing follows the peak after each trade; static never moves', () => {
    const trades = enrichAll([day('2026-03-02', 50), day('2026-03-02', -20)], S);
    const intra = accountState(acc({ drawdownType: 'intraday', drawdownLock: 10_000 }), trades, [], '2026-03-02');
    expect(intra.threshold).toBe(48_996);
    const stat = accountState(acc({ drawdownType: 'static' }), trades, [], '2026-03-02');
    expect(stat.threshold).toBe(48_000);
  });
  it('daily loss limit, today P&L, payouts', () => {
    const trades = enrichAll([day('2026-03-02', -30), day('2026-03-02', -25)], S);
    const cf: Cashflow[] = [{ id: 'c', accountId: 'a', date: '2026-03-01', type: 'payout', amount: 500, createdAt: '' }];
    const st = accountState(acc({ dailyLossLimit: 1_000, phase: 'funded', profitTarget: undefined }), trades, cf, '2026-03-02');
    expect(st.todayPnl).toBe(-1108);
    expect(st.dailyViolations).toEqual(['2026-03-02']);
    expect(st.dailyLeft).toBe(-108);
    expect(st.payouts).toBe(500);
    expect(st.balance).toBe(50_000 - 500 - 1108);
  });
  it('max contracts in mini equivalents', () => {
    const trades = enrichAll([day('2026-03-02', 5, { symbol: 'MNQ', contracts: 30 }), day('2026-03-02', 5, { contracts: 5 })], S);
    expect(accountState(acc({ maxContracts: 4 }), trades, [], '2026-03-02').contractViolations).toBe(1);
  });
  it('prop economy', () => {
    const e = propEconomy([acc({ status: 'passed' }), acc({ id: 'b', status: 'failed' })], [
      { id: '1', date: '', type: 'fee', amount: 150, createdAt: '' },
      { id: '2', date: '', type: 'reset', amount: 80, createdAt: '' },
      { id: '3', date: '', type: 'payout', amount: 1000, createdAt: '' },
    ]);
    expect(e).toMatchObject({ spent: 230, payouts: 1000, net: 770, passed: 1, failed: 1, passRate: 50 });
  });
});

describe('stats', () => {
  const ts = enrichAll([
    day('2026-03-02', 20, { stopPoints: 10 }),
    day('2026-03-02', -10, { stopPoints: 10, entryTime: ny('2026-03-02', 11) }),
    day('2026-03-02', -10, { stopPoints: 10, entryTime: ny('2026-03-02', 12) }),
    day('2026-03-02', -10, { stopPoints: 10, entryTime: ny('2026-03-02', 13) }),
    day('2026-03-03', 30, { stopPoints: 10 }),
    mk({ resultPoints: undefined, entryTime: ny('2026-03-04', 10) }),
  ], S);
  it('summarizes', () => {
    const s = summarize(ts);
    expect(s.trades).toBe(5);
    expect(s.open).toBe(1);
    expect(s.winRate).toBe(40);
    expect(s.net).toBe(396 - 204 * 3 + 596);
    expect(s.maxLossStreak).toBe(3);
    expect(s.bestDay?.day).toBe('2026-03-03');
    expect(s.worstDay?.day).toBe('2026-03-02');
  });
  it('trade number in day and losses-before (tilt)', () => {
    const rows = byTradeNumber(ts);
    expect(rows.map((r) => r.key)).toEqual(['1-я', '2-я', '3-я', '4+']);
    const lb = lossesBefore(ts);
    expect([...lb.values()].filter((v) => v >= 2).length).toBe(1);
    expect(equityCurve(ts).at(-1)!.equity).toBe(380);
    expect(insights(ts, S).length).toBeGreaterThan(0);
  });
  it('demo data tells a believable story', () => {
    const t0 = Date.now();
    const d = demoData(S);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(d.trades.length).toBeGreaterThan(40);
    const all = enrichAll(d.trades, S);
    expect(all.every((t) => t.net !== undefined)).toBe(true);
    const ev = accountState(d.accounts[0], all, d.cashflows);
    const fu = accountState(d.accounts[1], all, d.cashflows);
    expect(ev.breached).toBe(false);
    expect(fu.breached).toBe(false);
    expect(ev.profit).toBeGreaterThan(0);
  });
});

describe('importers', () => {
  const opts = { tz: { kind: 'zone' as const, zone: 'America/New_York' }, accountIds: ['a'], instruments: S.instruments };
  it('parses numbers and dates', () => {
    expect(parseNumber('$(25.00)')).toBe(-25);
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('1,250')).toBe(1250);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseDate('09/26/2024 09:31:10', opts.tz)).toBe('2024-09-26T13:31:10.000Z');
    expect(parseDate('12/2/2024 9:31:05 PM', opts.tz)).toBe('2024-12-03T02:31:05.000Z');
    expect(parseDate('2024-11-19T14:31:05-05:00', { kind: 'local' })).toBe('2024-11-19T19:31:05.000Z');
    expect(parseDate('11/19/2024 14:31:05 +00:00', opts.tz)).toBe('2024-11-19T14:31:05.000Z');
  });
  it('Tradovate performance CSV', () => {
    const csv = [
      'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration',
      'MNQZ4,-2,0,0.25,111,112,2,21000.25,21010.25,$40.00,11/19/2024 09:31:10,11/19/2024 09:40:00,8min',
      'NQZ4,-2,0,0.25,113,114,1,21020.00,21010.00,$(200.00),11/19/2024 10:05:00,11/19/2024 10:01:00,4min',
    ].join('\n');
    const r = importText(csv, opts);
    expect(r.format).toContain('Tradovate');
    expect(r.trades).toHaveLength(2);
    const [a, b] = enrichAll(r.trades, S);
    expect(a.symbol).toBe('MNQ');
    expect(a.direction).toBe('long');
    expect(a.net).toBe(37);
    const short = [a, b].find((t) => t.direction === 'short')!;
    expect(short.entryPrice).toBe(21010);
    expect(short.exitPrice).toBe(21020);
    expect(short.net).toBe(-204);
    // re-import keeps the same ids
    expect(importText(csv, opts).trades.map((t) => t.externalId)).toEqual(r.trades.map((t) => t.externalId));
  });
  it('NinjaTrader trades CSV', () => {
    const csv = [
      'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,MAE,MFE,ETD,Bars',
      '1,NQ 12-24,APEX-1,,Short,1,21050.25,21040.25,11/19/2024 9:35:00 AM,11/19/2024 9:50:00 AM,Sell,Buy,$200.00,$200.00,$4.12,$50.00,$250.00,$50.00,3',
    ].join('\n');
    const r = importText(csv, opts);
    expect(r.format).toContain('NinjaTrader');
    const t = enrichAll(r.trades, S)[0];
    expect(t.symbol).toBe('NQ');
    expect(t.direction).toBe('short');
    expect(t.net).toBeCloseTo(195.88);
  });
  it('ProjectX trades CSV', () => {
    const csv = [
      'Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration',
      '9001,MESZ4,11/19/2024 14:31:05 +00:00,11/19/2024 14:45:00 +00:00,5900.25,5905.25,2.80,50.00,2,Long,11/19/2024,00:13:55',
    ].join('\n');
    const r = importText(csv, opts);
    expect(r.format).toContain('ProjectX');
    const t = enrichAll(r.trades, S)[0];
    expect(t.symbol).toBe('MES');
    expect(t.entryTime).toBe('2024-11-19T14:31:05.000Z');
    expect(t.net).toBeCloseTo(47.2);
  });
});

describe('tradingview links', () => {
  it('derives snapshot image', () => {
    expect(chartImageUrl('https://www.tradingview.com/x/AbCd1234/')).toBe('https://s3.tradingview.com/snapshots/a/AbCd1234.png');
    expect(chartImageUrl('https://www.tradingview.com/chart/abc/')).toBeUndefined();
  });
});

import { parseRecognition, tvSymbol, tvTimeframe, tvTimeZone, visionPrompt } from '../vision';

describe('screenshot recognition', () => {
  const now = new Date('2026-11-20T16:00:00Z'); // 11:00 in New York
  const I = S.instruments;
  it('fills a long position that hit its target', () => {
    const r = parseRecognition({
      found: true, symbol: 'CME_MINI:NQ1!', timeframe: '5', direction: 'long', entry: 21450.25, stop: 21430, target: 21490,
      exit: null, result: 'target', quantity: 2, pnl: 1600, date: null, entryTime: '09:42', timezone: '(UTC-5) New York', confidence: 0.9, note: '',
    }, I, now);
    expect(r).toMatchObject({ found: true, symbol: 'NQ', timeframe: '5m', direction: 'long', entry: 21450.25, stop: 21430, target: 21490, exit: 21490, exitSource: 'target', quantity: 2 });
    expect(r.entryTime).toBe('2026-11-20T14:42:00.000Z');
    expect(r.warnings).toEqual([]);
  });
  it('fixes swapped stop/target labels and trusts geometry over a wrong direction', () => {
    const swapped = parseRecognition({ found: true, direction: 'long', entry: 100, stop: 110, target: 95, result: 'stop' }, I, now);
    expect(swapped).toMatchObject({ direction: 'long', stop: 95, target: 110, exit: 95, exitSource: 'stop' });
    expect(swapped.warnings.length).toBe(1);
    const wrongDir = parseRecognition({ found: true, direction: 'long', entry: 100, stop: 105 }, I, now);
    expect(wrongDir.direction).toBe('short');
    expect(wrongDir.warnings.length).toBe(1);
  });
  it('reads numbers written as text and rejects junk', () => {
    const r = parseRecognition({ found: true, symbol: 'MNQZ2025', entry: '21,450.25', stop: '21 430', target: 'n/a', quantity: '3', exit: 21470 }, I, now);
    expect(r).toMatchObject({ symbol: 'MNQ', entry: 21450.25, stop: 21430, target: undefined, quantity: 3, exit: 21470, exitSource: 'shown', direction: 'long' });
    expect(parseRecognition({ found: false, note: 'нет позиции' }, I, now)).toMatchObject({ found: false, note: 'нет позиции' });
    expect(parseRecognition('oops', I, now).found).toBe(false);
    expect(parseRecognition({ found: true, entry: -5 }, I, now).found).toBe(false);
  });
  it('drops a time that would be in the future when no date is shown', () => {
    expect(parseRecognition({ found: true, entry: 1, stop: 0.5, entryTime: '15:30', timezone: 'New York' }, I, now).entryTime).toBeUndefined();
    expect(parseRecognition({ found: true, entry: 1, stop: 0.5, date: '2026-11-19', entryTime: '15:30', exitTime: '15:10', timezone: 'New York' }, I, now))
      .toMatchObject({ entryTime: '2026-11-19T20:30:00.000Z', exitTime: '2026-11-20T20:10:00.000Z' });
  });
  it('maps TradingView labels', () => {
    expect(tvSymbol('ES1!', I)).toBe('ES');
    expect(tvSymbol('COMEX:MGC1!', I)).toBe('MGC');
    expect(['1', '15', '1h', '60', '4h', 'D', 'W', 'M', '30'].map(tvTimeframe)).toEqual(['1m', '15m', '1H', '1H', '4H', '1D', '1W', '1M', undefined]);
    expect(tvTimeZone('(UTC+3) Moscow')).toBe('Europe/Moscow');
    expect(tvTimeZone('UTC+5')).toBe('Etc/GMT-5');
    expect(tvTimeZone('Exchange')).toBe('America/Chicago');
    expect(tvTimeZone('(UTC+5:30) Kolkata')).toBeUndefined();
    expect(visionPrompt(true)).toContain('Image 1');
  });
});
