import type Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_SYSTEM, EXTRACTION_USER } from '@/lib/ai/prompts';
import { AnalyzeRequest, ExtractionSchema } from '@/lib/ai/schema';
import { callJson, errorResponse, guard, mapAnthropicError } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Screenshot → structured trade extraction.
 * Streams NDJSON events so the client can show real progress:
 *   {type:"stage", stage}, {type:"progress", phase, chars}, {type:"result", extraction, model}, {type:"error", error, code}
 */
export async function POST(req: Request) {
  try {
    await guard(req, 'analyze');
  } catch (e) {
    return errorResponse(e);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body.', code: 'bad_request' }, { status: 400 });
  }
  const parsed = AnalyzeRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Send 1–6 PNG, JPEG or WebP screenshots (max ~5 MB each).', code: 'bad_request' }, { status: 400 });
  const { images, timezone, symbols } = parsed.data;

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Screenshot ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  });
  content.push({ type: 'text', text: EXTRACTION_USER(images.length, timezone, symbols ?? []) });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      send({ type: 'stage', stage: 'received', images: images.length });
      try {
        send({ type: 'stage', stage: 'analyzing' });
        let writing = false;
        const { data, model } = await callJson({
          schema: ExtractionSchema,
          system: EXTRACTION_SYSTEM,
          content,
          effort: 'high',
          onProgress: (p) => {
            if (p.phase === 'writing' && !writing) {
              writing = true;
              send({ type: 'stage', stage: 'extracting' });
            }
            send({ type: 'progress', ...p });
          },
        });
        send({ type: 'stage', stage: 'validating' });
        send({ type: 'result', extraction: data, model });
      } catch (e) {
        const err = mapAnthropicError(e);
        send({ type: 'error', error: err.message, code: err.code });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
