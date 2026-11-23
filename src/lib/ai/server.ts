import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { userFromRequest } from '../supabase/server';
import { supabaseEnabled } from '../supabase/env';
import { aiConfigured, aiModel, anonymousAiAllowed } from './config';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 180_000 });
  return client;
}

export class AiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ───────── Access control & rate limiting ─────────

const buckets = new Map<string, number[]>();

/** Sliding-window limiter (per server instance). */
function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) throw new AiError(429, 'rate_limited', 'Too many AI requests. Please wait a minute and try again.');
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

/** Resolves who is calling and enforces configuration, auth and limits. */
export async function guard(req: Request, kind: 'analyze' | 'review' | 'coach'): Promise<{ userId: string | null }> {
  if (!aiConfigured()) throw new AiError(503, 'ai_not_configured', 'AI is not configured on this server (missing ANTHROPIC_API_KEY).');
  let userId: string | null = null;
  if (supabaseEnabled) {
    const user = await userFromRequest(req);
    if (!user) throw new AiError(401, 'unauthorized', 'Sign in to use AI features.');
    userId = user.id;
  } else if (!anonymousAiAllowed()) {
    throw new AiError(403, 'ai_requires_account', 'AI features need cloud accounts (Supabase) or CADENCE_AI_ALLOW_ANONYMOUS=true for a private deployment.');
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = `${kind}:${userId ?? ip}`;
  const limits = { analyze: [20, 10 * 60_000], review: [40, 10 * 60_000], coach: [6, 60 * 60_000] } as const;
  rateLimit(key, limits[kind][0], limits[kind][1]);
  return { userId };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AiError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  const mapped = mapAnthropicError(e);
  return Response.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
}

export function mapAnthropicError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError(502, 'ai_auth', 'The server’s AI key was rejected. Check ANTHROPIC_API_KEY.');
  if (e instanceof Anthropic.RateLimitError) return new AiError(429, 'ai_rate_limited', 'The AI service is busy. Try again in a minute.');
  if (e instanceof Anthropic.BadRequestError) return new AiError(400, 'ai_bad_request', 'The AI service could not process these images. Try clearer PNG or JPEG screenshots.');
  if (e instanceof Anthropic.APIConnectionError) return new AiError(504, 'ai_unreachable', 'Could not reach the AI service. Check your connection and retry.');
  if (e instanceof Anthropic.APIError) return new AiError(502, 'ai_error', `AI service error (${e.status ?? 'unknown'}). Please retry.`);
  console.error('[ai] unexpected', e);
  return new AiError(500, 'internal', 'Unexpected error while analyzing.');
}

// ───────── Structured call helper ─────────

export interface JsonCallOptions<S extends z.ZodType> {
  schema: S;
  system: string;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  effort: 'low' | 'medium' | 'high';
  maxTokens?: number;
  /** Called with a rough progress signal while the answer streams */
  onProgress?: (p: { phase: 'thinking' | 'writing'; chars: number }) => void;
}

/**
 * Streams a structured-output request (with server-side refusal fallbacks) and validates the
 * JSON against the zod schema. Streaming avoids HTTP timeouts on large vision requests.
 */
export async function callJson<S extends z.ZodType>(opts: JsonCallOptions<S>): Promise<{ data: z.infer<S>; model: string }> {
  const stream = anthropic().beta.messages.stream({
    model: aiModel(),
    max_tokens: opts.maxTokens ?? 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: opts.system,
    output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
    messages: [{ role: 'user', content: opts.content }],
  });
  let chars = 0;
  let lastEmit = 0;
  for await (const event of stream) {
    if (!opts.onProgress) continue;
    if (event.type === 'content_block_start' && event.content_block.type === 'thinking') opts.onProgress({ phase: 'thinking', chars });
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      chars += event.delta.text.length;
      if (chars - lastEmit > 120) {
        lastEmit = chars;
        opts.onProgress({ phase: 'writing', chars });
      }
    }
  }
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new AiError(422, 'refused', 'The AI declined to analyze this content.');
  if (msg.stop_reason === 'max_tokens') throw new AiError(502, 'truncated', 'The AI response was cut off. Try fewer screenshots.');
  const text = msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError(502, 'invalid_json', 'The AI returned an unreadable answer. Please retry.');
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new AiError(502, 'invalid_shape', 'The AI answer did not match the expected format. Please retry.');
  return { data: parsed.data, model: msg.model };
}
