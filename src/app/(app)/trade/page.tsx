'use client';

import { ArrowLeft, Copy, Eye, Lightbulb, NotebookPen, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { FullScreenLoader } from '@/components/brand/Logo';
import { Questionnaire } from '@/components/journal/Questionnaire';
import { ReviewCard } from '@/components/journal/ReviewCard';
import { ConfidenceBadge } from '@/components/trades/TradeForm';
import { DirectionBadge, EmptyState, OutcomeBadge, PnlText } from '@/components/trades/parts';
import { ScreenshotGallery } from '@/components/trades/Screenshots';
import { Badge, Button, Card, cn, IconButton } from '@/components/ui/core';
import { SuccessBurst } from '@/components/ui/motion';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { deleteTrade, duplicateTrade, patchTrade, restoreTrade, useAccounts, useInstruments, useTrade } from '@/lib/data/repo';
import { enrichTrade } from '@/lib/domain/calc';
import { fmtNum, fmtPrice, fmtR, money } from '@/lib/domain/format';
import { conceptLabel, isJournalComplete, labelOf } from '@/lib/domain/questionnaire';
import { formatDateTime, formatDayKey, formatDuration } from '@/lib/domain/time';
import type { JournalAnswers } from '@/lib/types';

export default function TradeDetailPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <TradeDetail />
    </Suspense>
  );
}

function TradeDetail() {
  const params = useSearchParams();
  const id = params.get('id') ?? undefined;
  const router = useRouter();
  const toast = useToast();
  const { trade, loading } = useTrade(id);
  const instruments = useInstruments();
  const accounts = useAccounts();
  const [journaling, setJournaling] = useState(params.get('journal') === '1');
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const t = useMemo(() => (trade ? enrichTrade(trade, instruments) : undefined), [trade, instruments]);

  if (loading) return <FullScreenLoader label="Loading trade" />;
  if (!t) {
    return (
      <Card>
        <EmptyState title="Trade not found" body="It may have been deleted on another device." action={<Link href="/journal"><Button>Back to journal</Button></Link>} />
      </Card>
    );
  }
  const account = accounts?.find((a) => a.id === t.account_id);

  const saveJournal = async (answers: JournalAnswers) => {
    setSaving(true);
    try {
      await patchTrade(t.id, { journal: answers, journal_completed_at: isJournalComplete(answers) ? new Date().toISOString() : null, ai_review: null });
      setJournaling(false);
      setJustSaved(true);
      router.replace(`/trade?id=${t.id}`, { scroll: false });
      setTimeout(() => setJustSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  if (journaling) {
    return (
      <div className="pt-2">
        <div className="mb-6 flex items-center gap-3 text-[13px] text-mute">
          <span className="font-display font-semibold text-fg">{t.symbol}</span>
          <DirectionBadge direction={t.direction} />
          {t.net !== undefined && <PnlText value={t.net} className="font-medium" />}
        </div>
        <Questionnaire initial={t.journal} onCancel={() => setJournaling(false)} onComplete={saveJournal} busy={saving} />
      </div>
    );
  }

  const ex = t.extraction;
  const meta = ex?.fields ?? {};
  const row = (label: string, value: ReactNode, key?: string) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-[13px] text-mute">{label}</dt>
      <dd className="flex items-center gap-2 text-right text-[13.5px]">
        {key && meta[key] && <ConfidenceBadge meta={meta[key]} />}
        <span className="num">{value}</span>
      </dd>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {justSaved && (
          <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex flex-col items-center">
              <SuccessBurst />
              <div className="mt-2 font-display text-lg font-semibold">Journal saved</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-5 flex items-center justify-between gap-2">
        <Link href="/journal" className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-fg">
          <ArrowLeft className="size-4" /> Journal
        </Link>
        <div className="flex items-center gap-1">
          <IconButton
            label="Duplicate"
            onClick={async () => {
              const copy = await duplicateTrade(t.id);
              toast({ tone: 'success', title: 'Trade duplicated', body: 'Opened the copy for editing.' });
              router.push(`/trade/edit?id=${copy.id}`);
            }}
          >
            <Copy className="size-4" />
          </IconButton>
          <Link href={`/trade/edit?id=${t.id}`}>
            <IconButton label="Edit">
              <Pencil className="size-4" />
            </IconButton>
          </Link>
          <IconButton label="Delete" className="hover:text-neg" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <Card glow className="mb-5 overflow-hidden p-5 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-electric/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[28px] font-semibold tracking-tight">{t.symbol}</h1>
              {t.contract && <span className="text-[13px] text-faint">{t.contract}</span>}
              <DirectionBadge direction={t.direction} />
              <OutcomeBadge t={t} />
              {t.source === 'ai' && (
                <Badge tone="violet" icon={<Sparkles className="size-3" />}>
                  AI captured
                </Badge>
              )}
            </div>
            <div className="mt-1.5 text-[13px] text-mute">
              {formatDayKey(t.day, true)} · {t.contracts} contract{t.contracts === 1 ? '' : 's'}
              {t.sessionName && ` · ${t.sessionName}`}
              {account && ` · ${account.name}`}
            </div>
          </div>
          <div className="text-right">
            {t.net !== undefined ? <PnlText value={t.net} animate className="text-[36px] font-semibold leading-none" /> : <div className="text-lg text-warn">Incomplete</div>}
            <div className="num mt-1.5 text-[14px] text-mute">{t.r !== undefined ? fmtR(t.r) : 'No stop — R unavailable'}</div>
          </div>
        </div>
      </Card>

      {!t.journal_completed_at && (
        <button
          type="button"
          onClick={() => setJournaling(true)}
          className="panel mb-5 flex w-full items-center gap-3 border-electric/30 p-4 text-left transition hover:border-electric/50"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-electric/20 text-violet">
            <NotebookPen className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[14.5px] font-medium">{t.journal ? 'Finish the journal check-in' : 'Journal this trade'}</span>
            <span className="block text-[12.5px] text-mute">Nine quick taps · about 30 seconds</span>
          </span>
          <span className="text-[13px] text-violet">Start →</span>
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="eyebrow mb-1">Execution</h3>
            <dl className="divide-y divide-white/[0.05]">
              {row('Entry', fmtPrice(t.entry_price), 'entry_price')}
              {row('Exit', fmtPrice(t.exit_price), 'exit_price')}
              {row('Stop loss', fmtPrice(t.stop_loss), 'stop_loss')}
              {row('Take profit', fmtPrice(t.take_profit), 'take_profit')}
              {row('Entry time', formatDateTime(t.entry_time), 'entry_time')}
              {row('Exit time', formatDateTime(t.exit_time), 'exit_time')}
              {row('Duration', formatDuration(t.durationMin), 'duration')}
              {row('Points / ticks', t.points !== undefined ? `${fmtNum(t.points, 2, true)} / ${fmtNum(t.ticks, 0, true)}` : '—')}
              {row('Gross P&L', <PnlText value={t.gross} />, 'gross_pnl')}
              {row('Commission & fees', t.feeSource === 'unknown' ? <span className="text-warn">Not recorded</span> : `${money(t.fees)}${t.feeSource === 'settings' ? ' (your rate)' : ''}`, 'commission')}
              {row('Risk', t.risk !== undefined ? money(t.risk) : '—', 'risk_amount')}
              {row('Planned R:R', t.plannedRR !== undefined ? `1 : ${fmtNum(t.plannedRR)}` : '—')}
            </dl>
            {t.pnlMismatch !== undefined && <p className="mt-3 text-[12px] text-warn">Platform gross differs from the contract-spec calculation by {money(t.pnlMismatch, { signed: true })}.</p>}
          </Card>

          <Card className="p-5">
            <h3 className="eyebrow mb-1">Strategy</h3>
            <dl className="divide-y divide-white/[0.05]">
              {row('Setup', t.setup ?? '—', 'setup')}
              {row('Timeframe', t.timeframe ?? '—', 'timeframe')}
              {row('Market bias', t.bias ? t.bias[0].toUpperCase() + t.bias.slice(1) : '—', 'bias')}
            </dl>
            {t.market_structure && <p className="mt-2 text-[13.5px] leading-relaxed text-chrome/90">{t.market_structure}</p>}
            {t.concepts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {t.concepts.map((c) => (
                  <Badge key={c} tone="violet">
                    {conceptLabel(c)}
                  </Badge>
                ))}
              </div>
            )}
            {t.notes && <p className="mt-4 whitespace-pre-wrap border-t border-white/[0.05] pt-4 text-[13.5px] leading-relaxed text-chrome/90">{t.notes}</p>}
            {t.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.tags.map((tag) => (
                  <Badge key={tag}>#{tag}</Badge>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="eyebrow mb-4">Screenshots</h3>
            <ScreenshotGallery tradeId={t.id} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="eyebrow">Psychology & execution</h3>
              {t.journal && (
                <button className="text-[12.5px] text-violet hover:text-violet-soft" onClick={() => setJournaling(true)}>
                  Edit
                </button>
              )}
            </div>
            {t.journal ? <JournalSummary j={t.journal} /> : <p className="text-[13.5px] text-mute">No journal yet.</p>}
          </Card>

          <ReviewCard trade={t} autoGenerate={params.get('review') === '1'} />

          {ex && (
            <Card className="p-5">
              <h3 className="eyebrow mb-3 flex items-center gap-2">
                <Eye className="size-3.5" /> AI extraction
              </h3>
              {ex.summary && <p className="mb-3 text-[13.5px] leading-relaxed text-chrome/90">{ex.summary}</p>}
              {ex.observations.length > 0 && (
                <ul className="space-y-1.5 text-[12.5px] text-mute">
                  {ex.observations.slice(0, 8).map((o) => (
                    <li key={o} className="flex gap-2">
                      <Eye className="mt-0.5 size-3 shrink-0 text-pos" />
                      {o}
                    </li>
                  ))}
                </ul>
              )}
              {ex.warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[12.5px] text-mute">
                  {ex.warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <Lightbulb className="mt-0.5 size-3 shrink-0 text-warn" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-[11px] text-faint">
                {ex.screenshots} screenshot{ex.screenshots === 1 ? '' : 's'} · analyzed {new Date(ex.analyzed_at).toLocaleString()}
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this trade?"
        body="The trade, its journal and screenshots will be removed from your journal and statistics on all devices."
        confirmLabel="Delete trade"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteTrade(t.id);
          setConfirmDelete(false);
          router.push('/journal');
          toast({ tone: 'info', title: 'Trade deleted', action: { label: 'Undo', onClick: () => void restoreTrade(t.id) } });
        }}
      />
    </>
  );
}

function JournalSummary({ j }: { j: JournalAnswers }) {
  const chips = (key: string, xs: string[], tone: 'violet' | 'neutral' | 'neg' = 'neutral') =>
    xs.length ? (
      <div className="flex flex-wrap gap-1.5">
        {xs.map((v) => (
          <Badge key={v} tone={tone}>
            {labelOf(key, v)}
          </Badge>
        ))}
      </div>
    ) : (
      <span className="text-faint">—</span>
    );
  const line = (label: string, content: ReactNode) => (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 py-2 text-[13px]">
      <span className="text-mute">{label}</span>
      <div>{content}</div>
    </div>
  );
  const mistakeTone = j.mistakes.includes('none') ? 'violet' : 'neg';
  return (
    <div className="divide-y divide-white/[0.05]">
      {line('Before', chips('before', j.before))}
      {line('During', chips('during', j.during))}
      {line('After', chips('after', j.after))}
      {line('Rules', j.rule_compliance ? <Badge tone={j.rule_compliance === 'complete' || j.rule_compliance === 'mostly' ? 'pos' : j.rule_compliance === 'partial' ? 'warn' : 'neg'}>{labelOf('rule_compliance', j.rule_compliance)}</Badge> : '—')}
      {line('Entry', j.entry_quality ? <span className={cn('num font-semibold', j.entry_quality.startsWith('A') ? 'text-pos' : j.entry_quality === 'poor' ? 'text-neg' : 'text-fg')}>{labelOf('entry_quality', j.entry_quality)}</span> : '—')}
      {line('Exit', chips('exit_quality', j.exit_quality))}
      {line('Mistakes', chips('mistakes', j.mistakes, mistakeTone))}
      {j.mistake_other && line('Other mistake', j.mistake_other)}
      {line('Setup', j.setup_quality ? labelOf('setup_quality', j.setup_quality) : '—')}
      {line('Lesson', chips('lessons', j.lessons, 'violet'))}
      {j.note && line('Note', <span className="text-chrome/90">{j.note}</span>)}
    </div>
  );
}
