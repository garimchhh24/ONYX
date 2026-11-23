'use client';

import { blobToBase64 } from '../data/images';
import { coachPayload } from '../domain/coach';
import type { ETrade } from '../domain/calc';
import { labelOf } from '../domain/questionnaire';
import { isArtifactRuntime } from '../runtime';
import { accessToken } from '../supabase/browser';
import { analyzeViaSample, coachViaSample, reviewViaSample, SampleCallError } from './sample-runtime';
import type { AiReview, CoachReport, JournalAnswers } from '../types';
import type { ExtractionResult, ReviewRequestBody } from './schema';

export type AnalyzeStage = 'preparing' | 'uploading' | 'received' | 'analyzing' | 'extracting' | 'validating' | 'done';

export type AnalyzeEvent =
  | { type: 'stage'; stage: AnalyzeStage }
  | { type: 'progress'; phase: 'thinking' | 'writing'; chars: number };

export class AiClientError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

async function headers(): Promise<Record<string, string>> {
  const token = await accessToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function failure(res: Response): Promise<AiClientError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  return new AiClientError(body.error ?? `Request failed (${res.status})`, body.code ?? `http_${res.status}`);
}

/** Uploads screenshots and streams real progress events until the extraction arrives. */
export async function analyzeScreenshots(
  images: Blob[],
  opts: { timezone: string; symbols: string[]; signal?: AbortSignal },
  onEvent: (e: AnalyzeEvent) => void,
): Promise<{ extraction: ExtractionResult; model: string }> {
  if (isArtifactRuntime) {
    try {
      const r = await analyzeViaSample(images, opts, (stage, chars) => {
        onEvent({ type: 'stage', stage });
        if (chars !== undefined) onEvent({ type: 'progress', phase: 'writing', chars });
      });
      onEvent({ type: 'stage', stage: 'done' });
      return r;
    } catch (e) {
      throw e instanceof SampleCallError ? new AiClientError(e.message, e.code) : e;
    }
  }
  onEvent({ type: 'stage', stage: 'preparing' });
  const payload = await Promise.all(images.map(async (b) => ({ media_type: (b.type || 'image/jpeg') as 'image/jpeg', data: await blobToBase64(b) })));
  onEvent({ type: 'stage', stage: 'uploading' });
  const res = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ images: payload, timezone: opts.timezone, symbols: opts.symbols }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as
        | AnalyzeEvent
        | { type: 'result'; extraction: ExtractionResult; model: string }
        | { type: 'error'; error: string; code: string };
      if (msg.type === 'result') {
        onEvent({ type: 'stage', stage: 'done' });
        return { extraction: msg.extraction, model: msg.model };
      }
      if (msg.type === 'error') throw new AiClientError(msg.error, msg.code);
      onEvent(msg);
    }
  }
  throw new AiClientError('The analysis ended unexpectedly. Please retry.', 'stream_ended');
}

export function reviewBody(t: ETrade, j: JournalAnswers): ReviewRequestBody {
  const lbl = (k: string, xs: string[]) => xs.map((v) => labelOf(k, v));
  return {
    trade: {
      symbol: t.symbol,
      direction: t.direction,
      contracts: t.contracts,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      stop_loss: t.stop_loss,
      take_profit: t.take_profit,
      entry_time: t.entry_time,
      exit_time: t.exit_time,
      duration_minutes: t.durationMin !== undefined ? Math.round(t.durationMin * 10) / 10 : null,
      session: t.sessionName,
      gross_pnl: t.gross ?? null,
      net_pnl: t.net ?? null,
      fees: t.feeSource === 'unknown' ? 'not recorded' : `$${t.fees.toFixed(2)} (${t.feeSource === 'trade' ? 'recorded on trade' : 'user-configured rate'})`,
      risk: t.risk ?? null,
      r_multiple: t.r !== undefined ? Math.round(t.r * 100) / 100 : null,
      planned_rr: t.plannedRR !== undefined ? Math.round(t.plannedRR * 100) / 100 : null,
      setup: t.setup,
      timeframe: t.timeframe,
      bias: t.bias,
      market_structure: t.market_structure,
      concepts: t.concepts,
      notes: t.notes,
    },
    journal: {
      before: lbl('before', j.before),
      during: lbl('during', j.during),
      after: lbl('after', j.after),
      rule_compliance: j.rule_compliance ? labelOf('rule_compliance', j.rule_compliance) : null,
      entry_quality: j.entry_quality,
      exit_quality: lbl('exit_quality', j.exit_quality),
      mistakes: lbl('mistakes', j.mistakes),
      mistake_other: j.mistake_other,
      setup_quality: j.setup_quality ? labelOf('setup_quality', j.setup_quality) : null,
      lessons: lbl('lessons', j.lessons),
      note: j.note,
    },
  };
}

export async function requestReview(t: ETrade, j: JournalAnswers): Promise<AiReview> {
  if (isArtifactRuntime) {
    try {
      return { ...(await reviewViaSample(reviewBody(t, j))), generated_at: new Date().toISOString() };
    } catch (e) {
      throw e instanceof SampleCallError ? new AiClientError(e.message, e.code) : e;
    }
  }
  const res = await fetch('/api/ai/review', { method: 'POST', headers: await headers(), body: JSON.stringify(reviewBody(t, j)) });
  if (!res.ok) throw await failure(res);
  const { review, model } = (await res.json()) as { review: Omit<AiReview, 'generated_at' | 'model'>; model: string };
  return { ...review, generated_at: new Date().toISOString(), model };
}

export async function requestCoach(trades: ETrade[]): Promise<{ report: CoachReport; model: string; payload: ReturnType<typeof coachPayload> }> {
  if (isArtifactRuntime) {
    try {
      return await coachViaSample(trades);
    } catch (e) {
      throw e instanceof SampleCallError ? new AiClientError(e.message, e.code) : e;
    }
  }
  const payload = coachPayload(trades);
  const res = await fetch('/api/ai/coach', { method: 'POST', headers: await headers(), body: JSON.stringify({ payload }) });
  if (!res.ok) throw await failure(res);
  const { report, model } = (await res.json()) as { report: CoachReport; model: string };
  return { report, model, payload };
}
