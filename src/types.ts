export type Direction = 'long' | 'short';

/** How the trade result was entered on the phone. */
export type EntryMode = 'points' | 'prices' | 'money';

export const TIMEFRAMES = ['1M', '1W', '1D', '4H', '1H', '15m', '5m', '3m', '1m'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1M': 'Monthly',
  '1W': 'Weekly',
  '1D': 'Daily',
  '4H': '4H',
  '1H': '1H',
  '15m': '15m',
  '5m': '5m',
  '3m': '3m',
  '1m': '1m',
};

/** One chart analysis attached to a trade for a given timeframe. */
export interface Analysis {
  id: string;
  timeframe: Timeframe;
  /** TradingView snapshot / idea link */
  url?: string;
  /** Direct image URL derived from a TradingView snapshot link */
  imageUrl?: string;
  /** Screenshot stored inline (device-only storage) */
  imageData?: string;
  /** Screenshot stored in the Claude artifact asset store (synced) */
  assetId?: string;
  note?: string;
  createdAt: string;
}

export interface Trade {
  id: string;
  /** Prop accounts the trade was taken on (copy-trading = several). */
  accountIds: string[];
  /** Contract root: NQ, MNQ, ES … */
  symbol: string;
  direction: Direction;
  contracts: number;
  entryTime: string;
  exitTime?: string;
  mode: EntryMode;
  // prices mode
  entryPrice?: number;
  exitPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  // points mode (distances, always positive; result sign via resultPoints)
  stopPoints?: number;
  targetPoints?: number;
  resultPoints?: number;
  /** Net $ per account. Overrides every calculation (money mode). */
  pnl?: number;
  /** Gross $ from a platform export; commissions are subtracted. */
  gross?: number;
  /** $ at risk per account (money mode / manual). */
  riskUsd?: number;
  /** Commissions override; otherwise instrument commission × contracts. */
  fees?: number;
  setup?: string;
  mistakes: string[];
  emotion?: string;
  rating?: number;
  followedPlan?: boolean;
  notes?: string;
  analyses: Analysis[];
  source: 'manual' | 'import' | 'demo';
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Instrument {
  symbol: string;
  name: string;
  tickSize: number;
  tickValue: number;
  /** Round-turn commission per contract, $ */
  commission: number;
  micro?: boolean;
  favorite?: boolean;
}

export type Phase = 'eval' | 'funded' | 'live';
export type AccountStatus = 'active' | 'passed' | 'failed' | 'archived';
export type DrawdownType = 'eod' | 'intraday' | 'static';

export interface Account {
  id: string;
  firm: string;
  name: string;
  size: number;
  phase: Phase;
  status: AccountStatus;
  startBalance: number;
  /** YYYY-MM-DD */
  startDate: string;
  profitTarget?: number;
  maxDrawdown: number;
  drawdownType: DrawdownType;
  /** Trailing threshold stops at startBalance + lock */
  drawdownLock: number;
  dailyLossLimit?: number;
  /** Best day must be ≤ this % of total profit */
  consistencyPct?: number;
  minDays?: number;
  /** Max position in mini-contract equivalents (10 micros = 1 mini) */
  maxContracts?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type CashflowType = 'fee' | 'activation' | 'reset' | 'payout' | 'adjust';

export interface Cashflow {
  id: string;
  accountId?: string;
  /** YYYY-MM-DD */
  date: string;
  type: CashflowType;
  /** Always positive; adjust may be negative */
  amount: number;
  note?: string;
  createdAt: string;
}

export interface SessionDef {
  id: string;
  name: string;
  /** IANA timezone in which start/end are defined (DST-aware) */
  timeZone: string;
  /** "HH:MM" */
  start: string;
  end: string;
}

export interface Discipline {
  maxTradesPerDay?: number;
  maxLossesPerDay?: number;
  dailyLossLimit?: number;
}

export interface Settings {
  id: 'settings';
  instruments: Instrument[];
  sessions: SessionDef[];
  /** Timezone for hour-of-day stats (exchange time by default) */
  statsTimeZone: string;
  setups: string[];
  mistakes: string[];
  emotions: string[];
  discipline: Discipline;
}

export interface JournalData {
  trades: Trade[];
  accounts: Account[];
  cashflows: Cashflow[];
  settings: Settings;
}
