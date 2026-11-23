'use client';

import { Bot, CircleCheck, Lightbulb, RefreshCw, Sparkles, Target, TrendingUp, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { AiClientError, requestReview } from '@/lib/ai/client';
import { patchTrade } from '@/lib/data/repo';
import type { ETrade } from '@/lib/domain/calc';
import { useServerConfig } from '@/lib/hooks/useServerConfig';
import { isArtifactRuntime } from '@/lib/runtime';
import type { AiReview } from '@/lib/types';
import { Button, Card, cn, Notice } from '../ui/core';
import { LogoLoader } from '../brand/Logo';

function ScoreRing({ score }: { score: number | null }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  const color = score === null ? '#636171' : score >= 75 ? '#3DDC97' : score >= 50 ? '#B46AFF' : score >= 30 ? '#F7B955' : '#FF5C7A';
  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <motion.circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-lg font-semibold leading-none">{score ?? '—'}</div>
          <div className="mt-0.5 text-[8.5px] uppercase tracking-[0.16em] text-faint">Score</div>
        </div>
      </div>
    </div>
  );
}

export function ReviewView({ review }: { review: AiReview }) {
  const block = (icon: React.ReactNode, title: string, body: React.ReactNode, cls?: string) => (
    <div className={cn('rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4', cls)}>
      <div className="eyebrow mb-2 flex items-center gap-2">
        {icon}
        {title}
      </div>
      <div className="text-[13.5px] leading-relaxed text-chrome/90">{body}</div>
    </div>
  );
  const list = (xs: string[]) => (
    <ul className="space-y-1.5">
      {xs.map((x) => (
        <li key={x} className="flex gap-2">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-violet" />
          {x}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <ScoreRing score={review.score} />
        <p className="font-display text-[16px] font-medium leading-snug tracking-tight">{review.headline}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {review.went_well.length > 0 && block(<CircleCheck className="size-3.5 text-pos" />, 'What went well', list(review.went_well))}
        {review.improve.length > 0 && block(<TrendingUp className="size-3.5 text-warn" />, 'Improve', list(review.improve))}
        {block(<Bot className="size-3.5 text-violet" />, 'Psychology', review.psychology)}
        {block(<Target className="size-3.5 text-violet" />, 'Rules & risk', review.rules)}
      </div>
      {block(<Lightbulb className="size-3.5 text-violet" />, 'Lesson', review.lesson)}
      <div className="rounded-2xl border border-electric/30 bg-electric/[0.08] p-4">
        <div className="eyebrow mb-1.5 text-violet-soft">Next session</div>
        <div className="text-[14px] font-medium">{review.next_action}</div>
      </div>
      <div className="text-[11px] text-faint">
        Generated {new Date(review.generated_at).toLocaleString()} · based only on this trade’s data and your answers
      </div>
    </div>
  );
}

/** AI review panel with generate / regenerate. */
export function ReviewCard({ trade, autoGenerate }: { trade: ETrade; autoGenerate?: boolean }) {
  const cfg = useServerConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  const generate = async () => {
    if (!trade.journal) return;
    setBusy(true);
    setError(null);
    try {
      const review = await requestReview(trade, trade.journal);
      await patchTrade(trade.id, { ai_review: review });
    } catch (e) {
      setError(e instanceof AiClientError || e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoGenerate && !triggered.current && cfg?.ai && trade.journal && !trade.ai_review) {
      triggered.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, cfg?.ai, trade.journal, trade.ai_review]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet" />
          <h3 className="font-display text-[15px] font-semibold">AI trade review</h3>
        </div>
        {trade.ai_review && cfg?.ai && trade.journal && (
          <Button size="sm" variant="ghost" onClick={generate} loading={busy} icon={<RefreshCw className="size-3.5" />}>
            Regenerate
          </Button>
        )}
      </div>
      {busy && !trade.ai_review ? (
        <div className="flex items-center gap-4 py-6">
          <LogoLoader size={44} label="Writing your review" />
          <div>
            <div className="text-[14px] font-medium">Reviewing your execution…</div>
            <div className="text-[12.5px] text-mute">Weighing your rules, entry, exit and state of mind.</div>
          </div>
        </div>
      ) : trade.ai_review ? (
        <ReviewView review={trade.ai_review} />
      ) : !trade.journal ? (
        <p className="text-[13.5px] text-mute">Complete the journal check-in first — the review is built from your answers and the trade data.</p>
      ) : cfg && !cfg.ai ? (
        <Notice tone="neutral" icon={<TriangleAlert className="size-4 text-warn" />} title={isArtifactRuntime ? 'AI isn’t available in this view' : 'AI is not available on this deployment'}>
          {isArtifactRuntime
            ? 'Open this page on claude.ai while signed in to get AI reviews.'
            : cfg.aiAccess === 'disabled' && cfg.supabase === false
              ? 'Add ANTHROPIC_API_KEY and sign-in (Supabase) — or set CADENCE_AI_ALLOW_ANONYMOUS=true for a private deployment.'
              : 'Add ANTHROPIC_API_KEY to the server environment to enable AI reviews.'}
        </Notice>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-mute">Get a coach’s read on this trade: what went well, what to fix, and one action for next session.</p>
          <Button variant="primary" onClick={generate} loading={busy} icon={<Sparkles className="size-4" />}>
            Generate review
          </Button>
        </div>
      )}
      {error && (
        <Notice tone="neg" className="mt-3">
          {error}
        </Notice>
      )}
    </Card>
  );
}
