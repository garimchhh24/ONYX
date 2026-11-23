/** CADENCE domain types — shared by the client store, Supabase sync and server routes. */

export type Direction = 'long' | 'short';

export interface BaseRecord {
  id: string;
  /** null while the record only exists on this device (no account / signed out). */
  user_id: string | null;
  created_at: string;
  /** Client edit time — last-write-wins for sync conflicts. */
  updated_at: string;
  /** Soft delete tombstone (synced so deletes propagate across devices). */
  deleted_at: string | null;
}

export interface Instrument {
  symbol: string;
  name: string;
  /** Minimum price increment */
  tick_size: number;
  /** $ value of one tick for one contract */
  tick_value: number;
  exchange?: string;
  micro?: boolean;
  /**
   * Round-turn commission + fees per contract in $, entered by the user.
   * null = not configured. CADENCE never assumes commissions.
   */
  commission_rt?: number | null;
  /** Built-in CME spec (user may only change commission) */
  builtin?: boolean;
}

// ───────── Smart journaling ─────────

export type RuleCompliance = 'complete' | 'mostly' | 'partial' | 'none';
export type EntryQuality = 'A+' | 'A' | 'B' | 'C' | 'poor';
export type SetupQuality = 'valid' | 'imperfect' | 'questionable' | 'invalid';

export interface JournalAnswers {
  before: string[];
  during: string[];
  after: string[];
  rule_compliance: RuleCompliance | null;
  entry_quality: EntryQuality | null;
  exit_quality: string[];
  mistakes: string[];
  mistake_other: string | null;
  setup_quality: SetupQuality | null;
  lessons: string[];
  note: string | null;
}

// ───────── AI ─────────

export type FieldSource = 'visible' | 'inferred' | 'calculated' | 'user';

export interface FieldMeta {
  /** 0..1 */
  confidence: number;
  source: FieldSource;
  evidence?: string;
  /** Screenshot index (0-based) the value was read from */
  image?: number | null;
  needs_review?: boolean;
}

export interface Extraction {
  model: string;
  analyzed_at: string;
  screenshots: number;
  fields: Record<string, FieldMeta>;
  warnings: string[];
  observations: string[];
  summary: string | null;
}

export interface AiReview {
  generated_at: string;
  model: string;
  headline: string;
  /** 0..100 execution score, null when there is not enough information */
  score: number | null;
  went_well: string[];
  improve: string[];
  psychology: string;
  rules: string;
  lesson: string;
  next_action: string;
}

// ───────── Records ─────────

export type TradeSource = 'manual' | 'ai' | 'import';
export type Bias = 'bullish' | 'bearish' | 'neutral';

export interface Trade extends BaseRecord {
  account_id: string | null;
  /** Contract root: NQ, MNQ, ES … */
  symbol: string;
  /** Specific contract, e.g. NQZ6 */
  contract: string | null;
  direction: Direction;
  contracts: number;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  entry_time: string | null;
  exit_time: string | null;
  /** Total commission + fees in $ for the whole trade, when known (screenshot or manual). */
  commission: number | null;
  /** Gross P&L shown by the platform — used only when prices can't produce it. */
  gross_pnl: number | null;
  /** Net P&L shown by the platform — used only when it can't be calculated. */
  net_pnl: number | null;
  /** Planned $ risk — overrides stop-based risk. */
  risk_amount: number | null;
  /** Derived and stored for server-side queries (reminders). */
  session: string | null;
  trading_day: string | null;
  timeframe: string | null;
  setup: string | null;
  bias: Bias | null;
  market_structure: string | null;
  /** ICT concepts present: liquidity_sweep, fvg, order_block … */
  concepts: string[];
  tags: string[];
  notes: string | null;
  journal: JournalAnswers | null;
  journal_completed_at: string | null;
  ai_review: AiReview | null;
  extraction: Extraction | null;
  source: TradeSource;
}

export type AccountPhase = 'evaluation' | 'funded' | 'live' | 'other';
export type AccountStatus = 'active' | 'passed' | 'payout' | 'breached' | 'inactive';
export type DrawdownType = 'static' | 'trailing_eod' | 'trailing_intraday';

export interface Account extends BaseRecord {
  name: string;
  firm: string;
  /** Account type / plan name as the user knows it, e.g. "LucidFlex 50K" */
  plan: string | null;
  phase: AccountPhase;
  size: number | null;
  starting_balance: number;
  /** Payouts, resets and corrections not represented by journaled trades (+/−). */
  balance_adjustment: number;
  status: AccountStatus;
  daily_loss_limit: number | null;
  max_drawdown: number | null;
  drawdown_type: DrawdownType;
  /** Balance at which a trailing drawdown stops trailing (absolute). */
  drawdown_lock: number | null;
  profit_target: number | null;
  /** Profit (above starting balance) required before a payout can be requested. */
  payout_target: number | null;
  min_trading_days: number | null;
  /** Best day must be ≤ this % of total profit (when the plan has a consistency rule). */
  consistency_pct: number | null;
  personal_daily_risk: number | null;
  personal_trade_risk: number | null;
  /** user = typed in by the user; verified = user checked them against official firm docs. */
  rules_source: 'user' | 'verified';
  rules_verified_at: string | null;
  rules_reference: string | null;
  notes: string | null;
}

export interface Attachment extends BaseRecord {
  trade_id: string;
  /** Supabase Storage object path (user_id/trade_id/id.jpg) once uploaded */
  storage_path: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  caption: string | null;
}

export interface DayReview extends BaseRecord {
  /** id = local calendar date YYYY-MM-DD */
  status: 'no_trades' | 'complete';
  note: string | null;
}

export interface AiReport extends BaseRecord {
  kind: 'coach';
  period_from: string | null;
  period_to: string | null;
  trade_count: number;
  model: string;
  content: CoachReport;
}

export interface CoachPattern {
  title: string;
  evidence: string;
  sample_size: number;
  confidence: 'low' | 'medium' | 'high';
  impact: 'positive' | 'negative';
  suggestion: string;
}

export interface CoachReport {
  summary: string;
  strengths: CoachPattern[];
  weaknesses: CoachPattern[];
  focus: string[];
  data_gaps: string[];
}

export interface ReminderSettings {
  enabled: boolean;
  /** "HH:MM" local time */
  time: string;
  timezone: string;
}

export interface UserSettings extends BaseRecord {
  /** Custom instruments and per-instrument commission overrides */
  instruments: Instrument[];
  setups: string[];
  reminder: ReminderSettings;
  default_account_id: string | null;
  onboarded: boolean;
}

export type SyncedTable = 'trades' | 'accounts' | 'attachments' | 'day_reviews' | 'ai_reports' | 'user_settings';
