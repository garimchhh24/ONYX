'use client';

/**
 * AI for the claude.ai preview: the same prompts and validation as the server routes, run
 * through the page's `sample` capability on the viewer's own Claude account (Claude asks the
 * viewer for permission on first use). Structured outputs aren't available there, so replies
 * are coerced field by field into the shared schemas — anything missing becomes "missing".
 */

import { MIN_GROUP, MIN_TRADES, coachPayload } from '../domain/coach';
import type { ETrade } from '../domain/calc';
import { useCapability } from '../runtime';
import type { AiReview, CoachReport } from '../types';
import { COACH_JSON_SHAPE, COACH_SYSTEM, EXTRACTION_JSON_SHAPE, EXTRACTION_SYSTEM, EXTRACTION_USER, REVIEW_JSON_SHAPE, REVIEW_SYSTEM } from './prompts';
import { CONCEPT_KEYS, ExtractionSchema, type ExtractionResult, type ReviewRequestBody } from './schema';

interface SampleError {
  code: string;
  message?: string;
  reason?: string;
}

interface SampleOptions {
  images?: Blob[];
  modelTier?: 'quick' | 'default' | 'complex';
  cache?: boolean;
  signal?: AbortSignal;
  onText?: (u: { text: string; delta: string }) => void;
}

type SampleFn = ((input: string, opts?: SampleOptions) => Promise<{ text: string; truncated: boolean }>) & {
  json<T = unknown>(input: string, opts?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
};

let samplePromise: Promise<SampleFn | null> | null = null;
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) samplePromise = useCapability<SampleFn>('sample');
  return samplePromise;
}

export class SampleCallError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function toError(e: unknown): Error {
  const err = e as SampleError;
  if (err?.code === 'cancelled') {
    const a = new Error('Cancelled');
    a.name = 'AbortError';
    return a;
  }
  const map: Record<string, string> = {
    not_granted: 'Claude access wasn’t allowed for this page. Reload the page to be asked again.',
    sampling_disabled: 'Claude isn’t available for your account.',
    rate_limited: err?.reason === 'usage_limit' ? 'You’ve reached your Claude usage limit for now.' : 'Too many requests. Wait a minute and try again.',
    session_expired: 'Sign in to Claude again, then retry.',
    image_rejected: 'Claude couldn’t use one of these images. Try a PNG or JPEG screenshot under 20 MB.',
    images_unavailable: 'This view can’t send images to Claude. Open the page on claude.ai in a browser or the Claude app.',
    refused: 'Claude declined to analyze this content.',
    invalid_json: 'Claude’s answer couldn’t be read. Try again.',
    empty_completion: 'Claude returned an empty answer. Try again.',
    prompt_too_large: 'That was too much data for one request.',
  };
  return new SampleCallError(map[err?.code] ?? 'Claude is temporarily unavailable. Try again.', err?.code ?? 'upstream_error');
}

// ───────── coercion helpers ─────────

const clamp01 = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};
const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');
const strArr = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x) => String(x).slice(0, 400)) : []);

const NUMERIC = new Set(['entry_price', 'exit_price', 'stop_loss', 'take_profit', 'contracts', 'gross_pnl', 'net_pnl', 'commission', 'risk_amount', 'realized_r']);
const FIELDS = [
  'instrument', 'contract', 'direction', 'entry_price', 'exit_price', 'stop_loss', 'take_profit', 'contracts', 'entry_time', 'exit_time',
  'chart_timezone', 'gross_pnl', 'net_pnl', 'commission', 'risk_amount', 'realized_r', 'trading_session', 'setup_type', 'timeframe',
  'market_bias', 'market_structure',
] as const;

function field(raw: unknown, numeric: boolean) {
  const missing = { value: null, confidence: 0, source: 'missing' as const, evidence: '', image: null };
  if (!raw || typeof raw !== 'object') return missing;
  const r = raw as Record<string, unknown>;
  let value: string | number | null = null;
  if (numeric) {
    const n = typeof r.value === 'number' ? r.value : typeof r.value === 'string' ? Number(r.value.replace(/[\s,$]/g, '').replace(/[−–]/g, '-')) : NaN;
    value = Number.isFinite(n) ? n : null;
  } else if (typeof r.value === 'string' && r.value.trim()) value = r.value.trim().slice(0, 500);
  else if (typeof r.value === 'number') value = String(r.value);
  if (value === null) return missing;
  const source = r.source === 'visible' || r.source === 'inferred' ? r.source : 'inferred';
  const img = Number(r.image);
  return { value, confidence: clamp01(r.confidence), source, evidence: str(r.evidence, 300), image: Number.isFinite(img) && img >= 1 ? img : null };
}

/** Coerce any JSON reply into a valid ExtractionResult (unknown/missing parts become "missing"). */
export function coerceExtraction(raw: unknown): ExtractionResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const platforms = ['tradingview', 'tradovate', 'ninjatrader', 'rithmic', 'projectx', 'lucid', 'other', 'unknown'];
  const out: Record<string, unknown> = {
    is_trade_screenshot: r.is_trade_screenshot !== false,
    platform: platforms.includes(String(r.platform)) ? r.platform : 'unknown',
    concepts: (Array.isArray(r.concepts) ? r.concepts : [])
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && (CONCEPT_KEYS as readonly string[]).includes(String((c as Record<string, unknown>).concept)))
      .slice(0, 14)
      .map((c) => ({ concept: c.concept, confidence: clamp01(c.confidence), evidence: str(c.evidence, 240), image: Number.isFinite(Number(c.image)) ? Number(c.image) : null })),
    other_concepts: strArr(r.other_concepts),
    observations: strArr(r.observations, 20),
    assumptions: strArr(r.assumptions, 20),
    conflicts: strArr(r.conflicts),
    summary: str(r.summary, 800),
  };
  for (const f of FIELDS) out[f] = field(r[f], NUMERIC.has(f));
  return ExtractionSchema.parse(out);
}

// ───────── image tiles: keep small chart labels legible after the platform downsizes ─────────

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function crop(img: HTMLImageElement, x: number, y: number, w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92));
}

/** Two overlapping halves of a large screenshot (left/right or top/bottom). */
async function halves(blob: Blob): Promise<Blob[]> {
  const img = await decode(blob);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (W * H < 1_400_000) return [];
  const portrait = H > W;
  const part = Math.round((portrait ? H : W) * 0.56);
  return portrait ? [await crop(img, 0, 0, W, part), await crop(img, 0, H - part, W, part)] : [await crop(img, 0, 0, part, H), await crop(img, W - part, 0, part, H)];
}

// ───────── public calls ─────────

export async function analyzeViaSample(
  images: Blob[],
  opts: { timezone: string; symbols: string[]; signal?: AbortSignal },
  onStage: (stage: 'preparing' | 'uploading' | 'analyzing' | 'extracting' | 'validating', chars?: number) => void,
): Promise<{ extraction: ExtractionResult; model: string }> {
  onStage('preparing');
  const sample = await getSample();
  if (!sample) throw new SampleCallError('AI isn’t available in this view. Open the page on claude.ai while signed in.', 'unavailable');
  const limits = await sample.limits().catch(() => null);
  if (!limits?.images) throw new SampleCallError('This view can’t send images to Claude. Open the page on claude.ai in a browser or the Claude app.', 'images_unavailable');
  const max = limits.images.maxCount;
  if (images.length > max) throw new SampleCallError(`Claude accepts up to ${max} screenshot${max === 1 ? '' : 's'} per analysis here. Remove some and try again.`, 'too_many_images');

  // Add enlarged halves of big screenshots when there is room for them.
  const extra: { of: number; blobs: Blob[] }[] = [];
  let count = images.length;
  for (let i = 0; i < images.length; i++) {
    if (count + 2 > max) break;
    const h = await halves(images[i]).catch(() => []);
    if (h.length) {
      extra.push({ of: i + 1, blobs: h });
      count += h.length;
    }
  }
  const all = [...images, ...extra.flatMap((e) => e.blobs)];
  let n = images.length;
  const tileNote = extra
    .map((e) => {
      const a = ++n;
      const b = ++n;
      return `Images ${a} and ${b} are enlarged, overlapping halves of screenshot ${e.of} — use them to read small labels; always cite the ORIGINAL screenshot number (${e.of}) in "image".`;
    })
    .join(' ');

  const prompt = [
    EXTRACTION_SYSTEM,
    '',
    `The first ${images.length} image${images.length === 1 ? ' is a screenshot' : 's are screenshots'} of the same trade, numbered in order.${tileNote ? ' ' + tileNote : ''}`,
    EXTRACTION_USER(images.length, opts.timezone, opts.symbols),
    '',
    EXTRACTION_JSON_SHAPE,
  ].join('\n');

  onStage('uploading');
  onStage('analyzing');
  let streamed = false;
  let raw: unknown;
  try {
    raw = await sample.json(prompt, {
      images: all,
      modelTier: 'complex',
      cache: false,
      signal: opts.signal,
      onText: ({ text }) => {
        if (!streamed) {
          streamed = true;
          onStage('extracting', text.length);
        } else onStage('extracting', text.length);
      },
    });
  } catch (e) {
    throw toError(e);
  }
  onStage('validating');
  return { extraction: coerceExtraction(raw), model: 'Claude (your account)' };
}

export async function reviewViaSample(body: ReviewRequestBody): Promise<Omit<AiReview, 'generated_at'>> {
  const sample = await getSample();
  if (!sample) throw new SampleCallError('AI isn’t available in this view.', 'unavailable');
  let raw: unknown;
  try {
    raw = await sample.json(`${REVIEW_SYSTEM}\n\n${REVIEW_JSON_SHAPE}\n\nReview this trade:\n${JSON.stringify(body, null, 2)}`, { modelTier: 'default', cache: false });
  } catch (e) {
    throw toError(e);
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const score = Number(r.score);
  return {
    model: 'Claude (your account)',
    headline: str(r.headline, 300) || 'Review ready',
    score: r.score === null || !Number.isFinite(score) ? null : Math.max(0, Math.min(100, Math.round(score))),
    went_well: strArr(r.went_well, 5),
    improve: strArr(r.improve, 5),
    psychology: str(r.psychology),
    rules: str(r.rules),
    lesson: str(r.lesson),
    next_action: str(r.next_action, 300),
  };
}

export async function coachViaSample(trades: ETrade[]): Promise<{ report: CoachReport; model: string; payload: ReturnType<typeof coachPayload> }> {
  const payload = coachPayload(trades);
  if (payload.summary.trades < MIN_TRADES) throw new SampleCallError(`The coach needs at least ${MIN_TRADES} closed trades to find reliable patterns.`, 'insufficient_data');
  const sample = await getSample();
  if (!sample) throw new SampleCallError('AI isn’t available in this view.', 'unavailable');
  let raw: unknown;
  try {
    raw = await sample.json(
      `${COACH_SYSTEM}\n\n${COACH_JSON_SHAPE}\n\nHere are my aggregated trading statistics. Identify recurring patterns and suggest improvements.\n${JSON.stringify(payload)}`,
      { modelTier: 'default', cache: false },
    );
  } catch (e) {
    throw toError(e);
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const patterns = (v: unknown, impact: 'positive' | 'negative') =>
    (Array.isArray(v) ? v : [])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        title: str(p.title, 200),
        evidence: str(p.evidence, 400),
        sample_size: Math.round(Number(p.sample_size)) || 0,
        confidence: (['low', 'medium', 'high'].includes(String(p.confidence)) ? p.confidence : 'low') as 'low' | 'medium' | 'high',
        impact,
        suggestion: str(p.suggestion, 400),
      }))
      // The same sample-size rule the server enforces.
      .filter((p) => p.title && p.sample_size >= MIN_GROUP);
  return {
    report: { summary: str(r.summary, 800), strengths: patterns(r.strengths, 'positive'), weaknesses: patterns(r.weaknesses, 'negative'), focus: strArr(r.focus, 3), data_gaps: strArr(r.data_gaps, 6) },
    model: 'Claude (your account)',
    payload,
  };
}
