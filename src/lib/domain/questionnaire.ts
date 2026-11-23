import type { EntryQuality, JournalAnswers, RuleCompliance, SetupQuality } from '../types';

export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** lucide icon name, resolved in the UI */
  icon?: string;
  tone?: 'pos' | 'neg' | 'neutral' | 'warn';
}

export const BEFORE: Option[] = [
  { value: 'calm', label: 'Calm', icon: 'Waves', tone: 'pos' },
  { value: 'confident', label: 'Confident', icon: 'ShieldCheck', tone: 'pos' },
  { value: 'focused', label: 'Focused', icon: 'Crosshair', tone: 'pos' },
  { value: 'excited', label: 'Excited', icon: 'Zap', tone: 'warn' },
  { value: 'anxious', label: 'Anxious', icon: 'Activity', tone: 'neg' },
  { value: 'frustrated', label: 'Frustrated', icon: 'Frown', tone: 'neg' },
  { value: 'impatient', label: 'Impatient', icon: 'Timer', tone: 'neg' },
  { value: 'fearful', label: 'Fearful', icon: 'ShieldAlert', tone: 'neg' },
  { value: 'overconfident', label: 'Overconfident', icon: 'Flame', tone: 'warn' },
  { value: 'tired', label: 'Tired', icon: 'BatteryLow', tone: 'neg' },
];

export const DURING: Option[] = [
  { value: 'calm', label: 'Calm', icon: 'Waves', tone: 'pos' },
  { value: 'confident', label: 'Confident', icon: 'ShieldCheck', tone: 'pos' },
  { value: 'disciplined', label: 'Disciplined', icon: 'Target', tone: 'pos' },
  { value: 'nervous', label: 'Nervous', icon: 'Activity', tone: 'neg' },
  { value: 'fearful', label: 'Fearful', icon: 'ShieldAlert', tone: 'neg' },
  { value: 'greedy', label: 'Greedy', icon: 'Coins', tone: 'neg' },
  { value: 'impatient', label: 'Impatient', icon: 'Timer', tone: 'neg' },
  { value: 'emotional', label: 'Emotional', icon: 'HeartPulse', tone: 'neg' },
];

export const AFTER: Option[] = [
  { value: 'satisfied', label: 'Satisfied', icon: 'Smile', tone: 'pos' },
  { value: 'neutral', label: 'Neutral', icon: 'Meh', tone: 'neutral' },
  { value: 'relieved', label: 'Relieved', icon: 'Wind', tone: 'neutral' },
  { value: 'excited', label: 'Excited', icon: 'Zap', tone: 'warn' },
  { value: 'frustrated', label: 'Frustrated', icon: 'Frown', tone: 'neg' },
  { value: 'disappointed', label: 'Disappointed', icon: 'CloudRain', tone: 'neg' },
  { value: 'angry', label: 'Angry', icon: 'Angry', tone: 'neg' },
];

export const RULES: Option<RuleCompliance>[] = [
  { value: 'complete', label: 'Completely followed', icon: 'CircleCheckBig', tone: 'pos' },
  { value: 'mostly', label: 'Mostly followed', icon: 'CircleCheck', tone: 'pos' },
  { value: 'partial', label: 'Partially followed', icon: 'CircleDashed', tone: 'warn' },
  { value: 'none', label: 'Did not follow', icon: 'CircleX', tone: 'neg' },
];

export const ENTRY: Option<EntryQuality>[] = [
  { value: 'A+', label: 'A+', tone: 'pos' },
  { value: 'A', label: 'A', tone: 'pos' },
  { value: 'B', label: 'B', tone: 'neutral' },
  { value: 'C', label: 'C', tone: 'warn' },
  { value: 'poor', label: 'Poor', tone: 'neg' },
];

export const EXIT: Option[] = [
  { value: 'perfect', label: 'Perfect', icon: 'Sparkles', tone: 'pos' },
  { value: 'good', label: 'Good', icon: 'ThumbsUp', tone: 'pos' },
  { value: 'followed_plan', label: 'Followed plan', icon: 'ListChecks', tone: 'pos' },
  { value: 'too_early', label: 'Too early', icon: 'Rewind', tone: 'warn' },
  { value: 'too_late', label: 'Too late', icon: 'FastForward', tone: 'warn' },
  { value: 'emotional', label: 'Emotional', icon: 'HeartPulse', tone: 'neg' },
];

export const MISTAKES: Option[] = [
  { value: 'none', label: 'No mistakes', icon: 'BadgeCheck', tone: 'pos' },
  { value: 'early_entry', label: 'Early entry', icon: 'StepBack', tone: 'neg' },
  { value: 'late_entry', label: 'Late entry', icon: 'StepForward', tone: 'neg' },
  { value: 'moved_stop', label: 'Moved stop loss', icon: 'MoveVertical', tone: 'neg' },
  { value: 'oversized', label: 'Oversized position', icon: 'Scaling', tone: 'neg' },
  { value: 'missed_confirmation', label: 'Missed confirmation', icon: 'EyeOff', tone: 'neg' },
  { value: 'revenge', label: 'Revenge trading', icon: 'Swords', tone: 'neg' },
  { value: 'emotional_exit', label: 'Emotional exit', icon: 'DoorOpen', tone: 'neg' },
  { value: 'other', label: 'Other', icon: 'Ellipsis', tone: 'neutral' },
];

export const SETUP_QUALITY: Option<SetupQuality>[] = [
  { value: 'valid', label: 'Fully valid', icon: 'CircleCheckBig', tone: 'pos' },
  { value: 'imperfect', label: 'Valid but imperfect', icon: 'CircleCheck', tone: 'neutral' },
  { value: 'questionable', label: 'Questionable', icon: 'CircleHelp', tone: 'warn' },
  { value: 'invalid', label: 'Invalid', icon: 'CircleX', tone: 'neg' },
];

export const LESSONS: Option[] = [
  { value: 'patience', label: 'Better patience', icon: 'Hourglass' },
  { value: 'entry_timing', label: 'Better entry timing', icon: 'Clock' },
  { value: 'risk', label: 'Better risk management', icon: 'Shield' },
  { value: 'emotions', label: 'Better emotional control', icon: 'Brain' },
  { value: 'exits', label: 'Better exit execution', icon: 'LogOut' },
  { value: 'overtrading', label: 'Avoid overtrading', icon: 'Ban' },
  { value: 'strategy', label: 'Follow my strategy', icon: 'Route' },
];

export type StepKey = 'before' | 'during' | 'after' | 'rule_compliance' | 'entry_quality' | 'exit_quality' | 'mistakes' | 'setup_quality' | 'lessons';

export interface Step {
  key: StepKey;
  group: string;
  title: string;
  options: Option[];
  multi: boolean;
  required: boolean;
  /** For multi-select: option that clears the others */
  exclusive?: string;
}

export const STEPS: Step[] = [
  { key: 'before', group: 'Before the trade', title: 'How did you feel before entering?', options: BEFORE, multi: true, required: false },
  { key: 'during', group: 'During the trade', title: 'How did you feel while in the position?', options: DURING, multi: true, required: false },
  { key: 'after', group: 'After the trade', title: 'How do you feel now?', options: AFTER, multi: true, required: false },
  { key: 'rule_compliance', group: 'Rule compliance', title: 'Did you follow your trading rules?', options: RULES, multi: false, required: true },
  { key: 'entry_quality', group: 'Entry quality', title: 'Grade your entry', options: ENTRY, multi: false, required: true },
  { key: 'exit_quality', group: 'Exit quality', title: 'How was your exit?', options: EXIT, multi: true, required: true },
  { key: 'mistakes', group: 'Execution', title: 'Any execution mistakes?', options: MISTAKES, multi: true, required: true, exclusive: 'none' },
  { key: 'setup_quality', group: 'Setup quality', title: 'Was the setup valid?', options: SETUP_QUALITY, multi: false, required: false },
  { key: 'lessons', group: 'Main lesson', title: 'What is the main lesson?', options: LESSONS, multi: true, required: false },
];

export function emptyAnswers(): JournalAnswers {
  return {
    before: [],
    during: [],
    after: [],
    rule_compliance: null,
    entry_quality: null,
    exit_quality: [],
    mistakes: [],
    mistake_other: null,
    setup_quality: null,
    lessons: [],
    note: null,
  };
}

export function isStepAnswered(a: JournalAnswers, s: Step): boolean {
  const v = a[s.key];
  return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
}

export function isJournalComplete(a: JournalAnswers | null | undefined): boolean {
  if (!a) return false;
  return STEPS.filter((s) => s.required).every((s) => isStepAnswered(a, s));
}

const ALL: Record<string, Option[]> = {
  before: BEFORE,
  during: DURING,
  after: AFTER,
  rule_compliance: RULES,
  entry_quality: ENTRY,
  exit_quality: EXIT,
  mistakes: MISTAKES,
  setup_quality: SETUP_QUALITY,
  lessons: LESSONS,
};

export function labelOf(key: StepKey | string, value: string | null | undefined): string {
  if (!value) return '—';
  return ALL[key]?.find((o) => o.value === value)?.label ?? value;
}

// ───────── Strategy vocabulary (AI extraction + manual tagging) ─────────

export const CONCEPTS: Option[] = [
  { value: 'liquidity_sweep', label: 'Liquidity sweep' },
  { value: 'fvg', label: 'Fair Value Gap' },
  { value: 'order_block', label: 'Order Block' },
  { value: 'displacement', label: 'Displacement' },
  { value: 'bos', label: 'Break of Structure' },
  { value: 'choch', label: 'Change of Character' },
  { value: 'premium', label: 'Premium' },
  { value: 'discount', label: 'Discount' },
  { value: 'ote', label: 'Optimal Trade Entry' },
  { value: 'breaker', label: 'Breaker Block' },
  { value: 'smt', label: 'SMT Divergence' },
  { value: 'ifvg', label: 'Inverse FVG' },
  { value: 'killzone', label: 'Killzone timing' },
  { value: 'equal_highs_lows', label: 'Equal highs / lows' },
];

export const conceptLabel = (v: string) => CONCEPTS.find((c) => c.value === v)?.label ?? v.replace(/_/g, ' ');

export const DEFAULT_SETUPS = [
  'Liquidity sweep + FVG',
  'Order block retest',
  'Break & retest',
  'Silver Bullet',
  'Opening range breakout',
  'Trend continuation',
  'Reversal',
];

export const TIMEFRAMES = ['1m', '2m', '3m', '5m', '15m', '30m', '1H', '4H', '1D'];
