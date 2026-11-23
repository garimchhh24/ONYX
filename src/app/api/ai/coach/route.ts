import { COACH_SYSTEM } from '@/lib/ai/prompts';
import { CoachRequest, CoachSchema } from '@/lib/ai/schema';
import { callJson, errorResponse, guard } from '@/lib/ai/server';
import { MIN_GROUP, MIN_TRADES } from '@/lib/domain/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/** Aggregated statistics → AI coaching report (refuses to run on insufficient data). */
export async function POST(req: Request) {
  try {
    await guard(req, 'coach');
    const parsed = CoachRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Invalid coach request.', code: 'bad_request' }, { status: 400 });
    const payload = parsed.data.payload as { summary?: { trades?: number } };
    const trades = Number(payload.summary?.trades ?? 0);
    if (!Number.isFinite(trades) || trades < MIN_TRADES) {
      return Response.json({ error: `The coach needs at least ${MIN_TRADES} closed trades to find reliable patterns.`, code: 'insufficient_data' }, { status: 422 });
    }
    const body = JSON.stringify(payload);
    if (body.length > 120_000) return Response.json({ error: 'Statistics payload too large.', code: 'bad_request' }, { status: 413 });
    const { data, model } = await callJson({
      schema: CoachSchema,
      system: COACH_SYSTEM,
      effort: 'high',
      maxTokens: 24000,
      content: [{ type: 'text', text: `Here are my aggregated trading statistics. Identify recurring patterns and suggest improvements.\n\n${body}` }],
    });
    // Enforce the sample-size rule regardless of what the model wrote.
    const keep = (p: { sample_size: number }) => Number.isFinite(p.sample_size) && p.sample_size >= MIN_GROUP;
    const tidy = <T extends { sample_size: number }>(xs: T[]) => xs.filter(keep).map((p) => ({ ...p, sample_size: Math.round(p.sample_size) }));
    return Response.json({ report: { ...data, strengths: tidy(data.strengths), weaknesses: tidy(data.weaknesses) }, model, trades });
  } catch (e) {
    return errorResponse(e);
  }
}
