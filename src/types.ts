export type Direction = 'long' | 'short';

export const TIMEFRAMES = ['1M', '1W', '1D', '4H', '1H', '15m', '5m', '3m', '1m'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1M': 'Monthly',
  '1W': 'Weekly',
  '1D': 'Daily',
  '4H': '4H',
  '1H': '1H',
  '15m': '15min',
  '5m': '5min',
  '3m': '3min',
  '1m': '1min',
};

/** One chart analysis attached to a trade for a given timeframe. */
export interface Analysis {
  id: string;
  timeframe: Timeframe;
  /** Link to a TradingView snapshot / idea / chart, if any. */
  url?: string;
  /** Direct image URL (auto-derived from TradingView snapshot links). */
  imageUrl?: string;
  /** Uploaded / pasted screenshot stored as a data URL. */
  imageData?: string;
  note?: string;
  createdAt: string;
}

export interface Trade {
  id: string;
  symbol: string;
  direction: Direction;
  /** ISO timestamps */
  entryTime: string;
  exitTime?: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** Lots / contracts / coins */
  size: number;
  /** Money value of a 1.0 price move for size = 1 (contract multiplier). */
  pointValue: number;
  fees: number;
  /** Net PnL reported by broker. If set it overrides the calculated value. */
  pnlOverride?: number;
  /** Money risked. If not set, it is calculated from stop loss. */
  riskOverride?: number;
  account?: string;
  setup?: string;
  tags: string[];
  mistakes: string[];
  emotion?: string;
  /** 1..5 self-rating of execution quality */
  rating?: number;
  followedPlan?: boolean;
  notes?: string;
  analyses: Analysis[];
  /** Where the trade came from: manual, csv, mt5 ... */
  source: string;
  /** External id from broker export, used to avoid duplicates on re-import */
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDef {
  id: string;
  name: string;
  /** IANA timezone in which start/end are defined (DST-aware). */
  timeZone: string;
  /** "HH:MM" local time */
  start: string;
  end: string;
  color?: string;
}

export interface Settings {
  id: 'settings';
  currency: string;
  /** Account balance used to express risk as % of account */
  startingBalance: number;
  /** Timezone used for day/hour statistics */
  displayTimeZone: string;
  sessions: SessionDef[];
  setups: string[];
  mistakes: string[];
  emotions: string[];
  /** Max risk per trade in % — trades above are flagged */
  maxRiskPercent: number;
}
