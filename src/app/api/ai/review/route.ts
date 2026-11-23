import { REVIEW_SYSTEM } from '@/lib/ai/prompts';
import { ReviewRequest, ReviewSchema } from '@/lib/ai/schema';
import { callJson, errorResponse, guard } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Trade + questionnaire → structured AI review. */
export async function POST(req: Request) {
  try {
    await guard(req, 'review');
    const parsed = ReviewRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Invalid review request.', code: 'bad_request' }, { status: 400 });
    const { data, model } = await callJson({
      schema: ReviewSchema,
      system: REVIEW_SYSTEM,
      effort: 'medium',
      maxTokens: 16000,
      content: [{ type: 'text', text: `Review this trade.\n\n${JSON.stringify(parsed.data, null, 2)}` }],
    });
    const score = data.score === null ? null : Math.max(0, Math.min(100, Math.round(data.score)));
    return Response.json({ review: { ...data, score }, model });
  } catch (e) {
    return errorResponse(e);
  }
}
