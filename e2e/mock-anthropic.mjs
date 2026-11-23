/**
 * Minimal stand-in for the Anthropic Messages API used by the e2e suite.
 * Speaks the real SSE streaming protocol so the SDK, the API routes and the
 * client run unmodified. Responses are canned per request type (test data only).
 */
import http from 'node:http';

export const EXTRACTION = {
  is_trade_screenshot: true,
  platform: 'tradingview',
  instrument: { value: 'NQZ2026', confidence: 0.97, source: 'visible', evidence: 'Chart header', image: 1 },
  contract: { value: null, confidence: 0, source: 'missing', evidence: '', image: null },
  direction: { value: 'long', confidence: 0.92, source: 'visible', evidence: 'Long Position tool, profit zone above entry', image: 1 },
  entry_price: { value: 21450.25, confidence: 0.95, source: 'visible', evidence: 'Blue price-scale label', image: 1 },
  exit_price: { value: 21482.5, confidence: 0.88, source: 'inferred', evidence: 'Closed P&L 1290 on 2 contracts implies +32.25 pts', image: 1 },
  stop_loss: { value: 21430, confidence: 0.94, source: 'visible', evidence: 'Red price-scale label', image: 1 },
  take_profit: { value: 21490, confidence: 0.62, source: 'visible', evidence: 'Green label partly overlapped', image: 1 },
  contracts: { value: 2, confidence: 0.95, source: 'visible', evidence: 'Qty: 2', image: 1 },
  entry_time: { value: '2026-11-20 09:42', confidence: 0.86, source: 'visible', evidence: 'Time axis note', image: 1 },
  exit_time: { value: '2026-11-20 10:05', confidence: 0.84, source: 'visible', evidence: 'Time axis note', image: 1 },
  chart_timezone: { value: '(UTC-5) New York', confidence: 0.9, source: 'visible', evidence: 'Bottom right', image: 1 },
  gross_pnl: { value: 1290, confidence: 0.93, source: 'visible', evidence: 'Closed P&L: 1290', image: 1 },
  net_pnl: { value: null, confidence: 0, source: 'missing', evidence: '', image: null },
  commission: { value: null, confidence: 0, source: 'missing', evidence: '', image: null },
  risk_amount: { value: 810, confidence: 0.9, source: 'visible', evidence: 'Stop … Amount: 810', image: 1 },
  realized_r: { value: null, confidence: 0, source: 'missing', evidence: '', image: null },
  trading_session: { value: 'NY AM', confidence: 0.8, source: 'inferred', evidence: '09:42 New York', image: 1 },
  setup_type: { value: 'Pullback long into 5m demand', confidence: 0.66, source: 'inferred', evidence: 'Entry after retrace from the low', image: 1 },
  timeframe: { value: '5', confidence: 0.96, source: 'visible', evidence: 'Header interval', image: 1 },
  market_bias: { value: 'bullish', confidence: 0.7, source: 'inferred', evidence: 'Higher lows into entry', image: 1 },
  market_structure: { value: 'Higher low after a sweep of the prior swing low, then bullish break of structure', confidence: 0.65, source: 'inferred', evidence: 'Price action', image: 1 },
  concepts: [
    { concept: 'liquidity_sweep', confidence: 0.72, evidence: 'Wick below prior low before entry', image: 1 },
    { concept: 'bos', confidence: 0.68, evidence: 'Break above 21480 swing high', image: 1 },
  ],
  other_concepts: [],
  observations: ['Long Position tool with entry 21450.25, stop 21430, target 21490', 'Closed P&L 1290 with Qty 2'],
  assumptions: ['Exit derived from closed P&L'],
  conflicts: [],
  summary: 'A 2-contract NQ long from 21450.25 with a 20-point stop that closed for +$1,290. Price pulled back into the entry zone and continued higher.',
};

export const REVIEW = {
  headline: 'Patient, rule-based long that paid 1.6R — exit left a little on the table.',
  score: 82,
  went_well: ['Waited for the pullback instead of chasing', 'Risk defined before entry'],
  improve: ['Plan the exit: price reached within 8 points of target'],
  psychology: 'You reported calm and focused states, consistent with the clean execution.',
  rules: 'Rules fully followed; risk of $810 was within plan.',
  lesson: 'Patience at the entry created the edge.',
  next_action: 'Pre-define a scale-out level before entering.',
};

export const COACH = {
  summary: 'NY AM is your edge; trades taken while anxious underperform.',
  strengths: [{ title: 'NY AM session edge', evidence: '12 trades averaging +$180', sample_size: 12, confidence: 'medium', impact: 'positive', suggestion: 'Concentrate risk in the first two hours.' }],
  weaknesses: [{ title: 'Friday afternoons', evidence: '3 trades', sample_size: 3, confidence: 'low', impact: 'negative', suggestion: 'Skip Friday PM.' }],
  focus: ['Trade only NY AM for two weeks'],
  data_gaps: ['Fees not recorded on most trades'],
};

export function startMock(port = 4010) {
  const requests = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(requests));
    }
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404);
      return res.end();
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system);
      const images = (body.messages?.[0]?.content ?? []).filter((b) => b.type === 'image').length;
      const kind = system.includes('trade-screenshot analyst') ? 'extraction' : system.includes('performance coach for a futures day trader') ? 'coach' : 'review';
      requests.push({ kind, images, beta: req.headers['anthropic-beta'] ?? null, fallbacks: body.fallbacks ?? null, model: body.model, effort: body.output_config?.effort, hasFormat: !!body.output_config?.format, stream: !!body.stream });
      const text = JSON.stringify(kind === 'extraction' ? EXTRACTION : kind === 'coach' ? COACH : REVIEW);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } });
      ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
      ev('content_block_stop', { index: 0 });
      ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
      let i = 0;
      const tick = setInterval(() => {
        if (i >= text.length) {
          clearInterval(tick);
          ev('content_block_stop', { index: 1 });
          ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.ceil(text.length / 4) } });
          ev('message_stop', {});
          return res.end();
        }
        ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: text.slice(i, i + 180) } });
        i += 180;
      }, 15);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, requests })));
}
