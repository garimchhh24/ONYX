import { z } from 'zod';

/**
 * Schemas for Claude's structured outputs. Shared by the server (request/response
 * validation) and the client (typed results). Numeric bounds are enforced in
 * post-processing because structured outputs don't support min/max keywords.
 */

export const SOURCE = z.enum(['visible', 'inferred', 'missing']);

const meta = {
  confidence: z.number().describe('0..1 calibrated certainty for this value'),
  source: SOURCE.describe('visible = literally readable on a screenshot; inferred = derived from chart geometry or context; missing = not available'),
  evidence: z.string().describe('Short note on where/how the value was read, e.g. "Order fills table, row 2" or "price scale label at zone top"'),
  image: z.number().nullable().describe('1-based screenshot number the value came from, or null'),
};

export const NumField = z.object({ value: z.number().nullable(), ...meta });
export const StrField = z.object({ value: z.string().nullable(), ...meta });

export const CONCEPT_KEYS = [
  'liquidity_sweep',
  'fvg',
  'order_block',
  'displacement',
  'bos',
  'choch',
  'premium',
  'discount',
  'ote',
  'breaker',
  'smt',
  'ifvg',
  'killzone',
  'equal_highs_lows',
] as const;

export const ExtractionSchema = z.object({
  is_trade_screenshot: z.boolean().describe('false if no trade, position, order or fill is visible on any screenshot'),
  platform: z.enum(['tradingview', 'tradovate', 'ninjatrader', 'rithmic', 'projectx', 'lucid', 'other', 'unknown']),
  instrument: StrField.describe('Ticker exactly as shown, e.g. "NQ1!", "MNQZ2026", "CME_MINI:ES1!"'),
  contract: StrField.describe('Specific contract month code if shown, e.g. "NQZ6"'),
  direction: StrField.describe('"long" or "short"'),
  entry_price: NumField,
  exit_price: NumField,
  stop_loss: NumField,
  take_profit: NumField,
  contracts: NumField.describe('Position size in contracts'),
  entry_time: StrField.describe('"YYYY-MM-DD HH:MM" or "HH:MM" (24h) in the chart/platform time zone, exactly as readable'),
  exit_time: StrField.describe('"YYYY-MM-DD HH:MM" or "HH:MM" (24h)'),
  chart_timezone: StrField.describe('Time zone label shown on the chart/platform, e.g. "(UTC-5) New York"'),
  gross_pnl: NumField.describe('Gross P&L in USD as displayed'),
  net_pnl: NumField.describe('Net P&L in USD as displayed'),
  commission: NumField.describe('Commissions + fees in USD, ONLY if explicitly displayed'),
  risk_amount: NumField.describe('Dollar risk if explicitly displayed (e.g. TradingView stop "Amount")'),
  realized_r: NumField.describe('Realized R multiple if explicitly displayed'),
  trading_session: StrField.describe('Asia, London, NY AM, NY Lunch, NY PM, etc. only if determinable'),
  setup_type: StrField.describe('Short name of the setup, e.g. "Liquidity sweep into 5m FVG"'),
  timeframe: StrField.describe('Chart interval as shown, e.g. "1", "5", "15", "1h", "4h", "D"'),
  market_bias: StrField.describe('"bullish", "bearish" or "neutral"'),
  market_structure: StrField.describe('One sentence describing visible structure'),
  concepts: z
    .array(
      z.object({
        concept: z.enum(CONCEPT_KEYS),
        confidence: z.number(),
        evidence: z.string(),
        image: z.number().nullable(),
      }),
    )
    .describe('ICT concepts that are actually identifiable on the charts'),
  other_concepts: z.array(z.string()),
  observations: z.array(z.string()).describe('Facts directly visible on the screenshots'),
  assumptions: z.array(z.string()).describe('Anything inferred rather than read'),
  conflicts: z.array(z.string()).describe('Contradictions between screenshots or labels'),
  summary: z.string().describe('Two sentences: what the trade was and how it played out'),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;

export const ReviewSchema = z.object({
  headline: z.string().describe('One-sentence verdict on the trade'),
  score: z.number().nullable().describe('0-100 execution score, null if there is not enough information'),
  went_well: z.array(z.string()),
  improve: z.array(z.string()),
  psychology: z.string(),
  rules: z.string(),
  lesson: z.string(),
  next_action: z.string().describe('One concrete action for the next session'),
});

export type ReviewResult = z.infer<typeof ReviewSchema>;

const Pattern = z.object({
  title: z.string(),
  evidence: z.string().describe('Numbers from the data that support the pattern'),
  sample_size: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
  impact: z.enum(['positive', 'negative']),
  suggestion: z.string(),
});

export const CoachSchema = z.object({
  summary: z.string(),
  strengths: z.array(Pattern),
  weaknesses: z.array(Pattern),
  focus: z.array(z.string()).describe('Up to three concrete focus points for the next sessions'),
  data_gaps: z.array(z.string()),
});

export type CoachResult = z.infer<typeof CoachSchema>;

// ───────── Request bodies (validated on the server) ─────────

export const AnalyzeRequest = z.object({
  images: z
    .array(
      z.object({
        media_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
        data: z.string().min(100).max(7_000_000),
      }),
    )
    .min(1)
    .max(6),
  timezone: z.string().max(64).optional(),
  symbols: z.array(z.string().max(16)).max(100).optional(),
});

const nullableNum = z.number().finite().nullable();

export const ReviewRequest = z.object({
  trade: z.object({
    symbol: z.string().max(16),
    direction: z.enum(['long', 'short']),
    contracts: z.number().positive(),
    entry_price: nullableNum,
    exit_price: nullableNum,
    stop_loss: nullableNum,
    take_profit: nullableNum,
    entry_time: z.string().nullable(),
    exit_time: z.string().nullable(),
    duration_minutes: nullableNum,
    session: z.string().nullable(),
    gross_pnl: nullableNum,
    net_pnl: nullableNum,
    fees: z.string(),
    risk: nullableNum,
    r_multiple: nullableNum,
    planned_rr: nullableNum,
    setup: z.string().nullable(),
    timeframe: z.string().nullable(),
    bias: z.string().nullable(),
    market_structure: z.string().nullable(),
    concepts: z.array(z.string()).max(30),
    notes: z.string().max(4000).nullable(),
  }),
  journal: z.object({
    before: z.array(z.string()).max(12),
    during: z.array(z.string()).max(12),
    after: z.array(z.string()).max(12),
    rule_compliance: z.string().nullable(),
    entry_quality: z.string().nullable(),
    exit_quality: z.array(z.string()).max(8),
    mistakes: z.array(z.string()).max(10),
    mistake_other: z.string().max(500).nullable(),
    setup_quality: z.string().nullable(),
    lessons: z.array(z.string()).max(8),
    note: z.string().max(2000).nullable(),
  }),
});

export type ReviewRequestBody = z.infer<typeof ReviewRequest>;

export const CoachRequest = z.object({
  payload: z.record(z.string(), z.unknown()),
});
