'use client';

import { ArrowLeft, Camera, Check, CircleAlert, ClipboardPaste, Eye, ImagePlus, Lightbulb, LoaderCircle, PenLine, RotateCcw, ScanLine, Sparkles, TriangleAlert, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Symbol } from '@/components/brand/Logo';
import { Questionnaire } from '@/components/journal/Questionnaire';
import { PageHeader } from '@/components/shell/AppShell';
import { TradeForm, type MetaMap } from '@/components/trades/TradeForm';
import { Button, Card, cn, IconButton, Notice, ProgressBar, Select } from '@/components/ui/core';
import { SuccessBurst } from '@/components/ui/motion';
import { useToast } from '@/components/ui/overlay';
import { AiClientError, analyzeScreenshots, type AnalyzeStage } from '@/lib/ai/client';
import { processExtraction, type ProcessedExtraction } from '@/lib/ai/postprocess';
import { prepareImage, type PreparedImage } from '@/lib/data/images';
import { addAttachment, blankTrade, saveTrade, useAccounts, useInstruments, useSettings } from '@/lib/data/repo';
import { isJournalComplete } from '@/lib/domain/questionnaire';
import { localTimeZone } from '@/lib/domain/time';
import { validateTrade } from '@/lib/domain/validate';
import { useServerConfig } from '@/lib/hooks/useServerConfig';
import type { JournalAnswers, Trade } from '@/lib/types';

type Step = 'upload' | 'analyzing' | 'confirm' | 'journal' | 'saved';
type Shot = PreparedImage & { url: string; name: string };

const MAX_SHOTS = 6;

const STAGES: { key: AnalyzeStage; label: string; detail: string }[] = [
  { key: 'preparing', label: 'Optimizing screenshots', detail: 'Resizing for maximum label legibility' },
  { key: 'uploading', label: 'Secure upload', detail: 'Encrypted transfer to the CADENCE server' },
  { key: 'analyzing', label: 'Reading the charts', detail: 'Price scales, labels, fills and annotations' },
  { key: 'extracting', label: 'Extracting trade details', detail: 'Prices, size, times, P&L and ICT concepts' },
  { key: 'validating', label: 'Validating', detail: 'Geometry, tick grid, contract specs and time zones' },
];
const ORDER: AnalyzeStage[] = ['preparing', 'uploading', 'received', 'analyzing', 'extracting', 'validating', 'done'];

export default function AnalyzePage() {
  const router = useRouter();
  const toast = useToast();
  const cfg = useServerConfig();
  const accounts = useAccounts() ?? [];
  const instruments = useInstruments();
  const settings = useSettings();
  const [step, setStep] = useState<Step>('upload');
  const [shots, setShots] = useState<Shot[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [stage, setStage] = useState<AnalyzeStage>('preparing');
  const [chars, setChars] = useState(0);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [result, setResult] = useState<ProcessedExtraction | null>(null);
  const [model, setModel] = useState<string>('');
  const [trade, setTrade] = useState<Trade>(() => blankTrade({ source: 'ai' }));
  const [meta, setMeta] = useState<MetaMap>({});
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || !settings.default_account_id) return;
    defaultApplied.current = true;
    setAccountId((cur) => cur || settings.default_account_id || '');
  }, [settings.default_account_id]);
  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), [shots]);

  const addFiles = useCallback(
    async (files: File[] | FileList) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!list.length) return;
      const room = MAX_SHOTS - shots.length;
      if (room <= 0) return toast({ tone: 'info', title: `Up to ${MAX_SHOTS} screenshots per trade` });
      for (const f of list.slice(0, room)) {
        try {
          const img = await prepareImage(f, 2000, 0.9);
          setShots((xs) => [...xs, { ...img, url: URL.createObjectURL(img.blob), name: f.name || 'Pasted screenshot' }]);
        } catch (e) {
          toast({ tone: 'error', title: 'Could not read image', body: e instanceof Error ? e.message : undefined });
        }
      }
    },
    [shots.length, toast],
  );

  // Paste from clipboard (desktop)
  useEffect(() => {
    if (step !== 'upload') return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [step, addFiles]);

  const run = async () => {
    setError(null);
    setStep('analyzing');
    setStage('preparing');
    setChars(0);
    abort.current = new AbortController();
    try {
      const { extraction, model: m } = await analyzeScreenshots(
        shots.map((s) => s.blob),
        { timezone: settings.reminder.timezone || localTimeZone(), symbols: instruments.map((i) => i.symbol), signal: abort.current.signal },
        (ev) => {
          if (ev.type === 'stage') setStage(ev.stage);
          else setChars(ev.chars);
        },
      );
      const processed = processExtraction(extraction, { instruments, timezone: settings.reminder.timezone || localTimeZone() });
      setResult(processed);
      setModel(m);
      setTrade(
        blankTrade({
          source: 'ai',
          account_id: accountId || null,
          symbol: processed.fields.symbol ?? 'NQ',
          ...processed.fields,
        }),
      );
      setMeta(processed.meta);
      setStep('confirm');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setStep('upload');
        return;
      }
      const err = e instanceof AiClientError ? { message: e.message, code: e.code } : { message: e instanceof Error ? e.message : 'Analysis failed.', code: 'unknown' };
      setError(err);
      setStep('upload');
    }
  };

  const v = useMemo(() => validateTrade(trade, instruments), [trade, instruments]);
  const reviewKeys = Object.entries(meta).filter(([, m]) => m.needs_review && m.source !== 'user');

  const confirm = () => {
    setShowErrors(true);
    if (Object.keys(v.errors).length) {
      toast({ tone: 'error', title: 'A few fields need fixing first' });
      return;
    }
    setStep('journal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finish = async (journal: JournalAnswers | null) => {
    setSaving(true);
    try {
      const saved = await saveTrade({
        ...trade,
        source: 'ai',
        journal,
        journal_completed_at: journal && isJournalComplete(journal) ? new Date().toISOString() : null,
        extraction: {
          model,
          analyzed_at: new Date().toISOString(),
          screenshots: shots.length,
          fields: meta,
          warnings: result?.warnings ?? [],
          observations: [...(result?.observations ?? []), ...(result?.assumptions ?? []).map((a) => `Assumption: ${a}`)],
          summary: result?.summary || null,
        },
      });
      for (const s of shots) await addAttachment(saved.id, s.blob, { width: s.width, height: s.height });
      setSavedId(saved.id);
      setStep('saved');
      setTimeout(() => router.replace(`/trade?id=${saved.id}${journal ? '&review=1' : ''}`), 1700);
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save the trade', body: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  };

  const manualWithShots = async () => {
    const t = blankTrade({ account_id: accountId || null });
    const saved = await saveTrade({ ...t, source: 'manual' });
    for (const s of shots) await addAttachment(saved.id, s.blob, { width: s.width, height: s.height });
    router.push(`/trade/edit?id=${saved.id}`);
  };

  // ───────── render ─────────

  if (step === 'saved') {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <motion.div className="flex flex-col items-center text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <SuccessBurst size={96} />
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">Trade saved</h2>
          <p className="mt-1 text-[14px] text-mute">{savedId ? 'Preparing your AI review…' : ''}</p>
        </motion.div>
      </div>
    );
  }

  if (step === 'journal') {
    return (
      <div className="pt-2">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] text-mute">
            <span className="grid size-6 place-items-center rounded-full bg-pos/15 text-pos">
              <Check className="size-3.5" />
            </span>
            Trade details confirmed · now 30 seconds on the psychology
          </div>
          <button className="text-[12.5px] text-faint hover:text-mute" onClick={() => finish(null)} disabled={saving}>
            Skip journal for now
          </button>
        </div>
        <Questionnaire onCancel={() => setStep('confirm')} onComplete={(a) => finish(a)} busy={saving} submitLabel="Save trade" />
      </div>
    );
  }

  if (step === 'confirm' && result) {
    if (!result.isTrade) {
      return (
        <Card className="mx-auto max-w-lg p-8 text-center">
          <TriangleAlert className="mx-auto size-8 text-warn" />
          <h2 className="mt-3 font-display text-xl font-semibold">No trade found on these screenshots</h2>
          <p className="mt-2 text-[13.5px] text-mute">{result.summary || 'CADENCE couldn’t see a position, order or fill. Try a screenshot that shows the position tool or your fills.'}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => setStep('upload')} icon={<RotateCcw className="size-4" />}>
              Try other screenshots
            </Button>
            <Button variant="primary" onClick={manualWithShots} icon={<PenLine className="size-4" />}>
              Enter manually
            </Button>
          </div>
        </Card>
      );
    }
    const readCount = Object.values(meta).filter((m) => m.source === 'visible' || m.source === 'inferred').length;
    return (
      <>
        <button onClick={() => setStep('upload')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-fg">
          <ArrowLeft className="size-4" /> Screenshots
        </button>
        <PageHeader
          eyebrow="Step 2 of 3 · Confirm"
          title="Review what CADENCE read"
          subtitle={`${readCount} fields extracted from ${shots.length} screenshot${shots.length === 1 ? '' : 's'}${reviewKeys.length ? ` · ${reviewKeys.length} need your confirmation` : ' · all high confidence'}`}
          action={
            <Button variant="primary" onClick={confirm} icon={<Check className="size-4" />} className="hidden md:inline-flex">
              Confirm & journal
            </Button>
          }
        />
        <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-5">
            <div className="flex gap-4">
              <div className="scroll-x flex shrink-0 gap-2">
                {shots.slice(0, 3).map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.url} src={s.url} alt={`Screenshot ${i + 1}`} className="h-20 w-28 rounded-lg border border-white/10 object-cover" />
                ))}
              </div>
              <div className="min-w-0">
                <div className="eyebrow mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="size-3 text-violet" /> AI summary
                </div>
                <p className="text-[13.5px] leading-relaxed text-chrome/90">{result.summary || 'No summary provided.'}</p>
              </div>
            </div>
            {(result.warnings.length > 0 || result.assumptions.length > 0) && (
              <div className="mt-4 grid gap-2 border-t border-white/[0.05] pt-4 md:grid-cols-2">
                {result.warnings.map((w) => (
                  <div key={w} className="flex gap-2 text-[12.5px] text-mute">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                    {w}
                  </div>
                ))}
                {result.assumptions.map((a) => (
                  <div key={a} className="flex gap-2 text-[12.5px] text-mute">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-violet" />
                    {a}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <div className="eyebrow mb-3">Confidence legend</div>
            <ul className="space-y-2 text-[12.5px] text-mute">
              <li className="flex items-center gap-2">
                <Eye className="size-3.5 text-pos" /> Visible — read directly, high confidence
              </li>
              <li className="flex items-center gap-2">
                <Eye className="size-3.5 text-warn" /> Medium confidence — check it
              </li>
              <li className="flex items-center gap-2">
                <Lightbulb className="size-3.5 text-warn" /> Inferred — derived, not read
              </li>
              <li className="flex items-center gap-2">
                <CircleAlert className="size-3.5 text-warn" /> Highlighted fields need confirmation
              </li>
            </ul>
            {result.observations.length > 0 && (
              <details className="mt-4 text-[12.5px] text-mute">
                <summary className="cursor-pointer text-chrome/80">Visible facts ({result.observations.length})</summary>
                <ul className="mt-2 space-y-1">
                  {result.observations.map((o) => (
                    <li key={o}>· {o}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </div>
        {reviewKeys.length > 0 && (
          <Notice tone="warn" icon={<CircleAlert className="size-4 text-warn" />} className="mb-5" title="Please confirm the highlighted fields">
            Editing a field marks it as confirmed. Missing values stay empty — CADENCE never fills them in.
          </Notice>
        )}
        <TradeForm value={trade} onChange={setTrade} accounts={accounts} instruments={instruments} setups={settings.setups} meta={meta} onMetaChange={setMeta} showErrors={showErrors} />
        <div className="sticky bottom-[calc(76px+var(--safe-bottom))] z-20 mt-5 flex justify-end md:static">
          <Button variant="primary" size="lg" onClick={confirm} icon={<Check className="size-4" />} className="w-full md:w-auto">
            Confirm & journal
          </Button>
        </div>
      </>
    );
  }

  const busy = step === 'analyzing';
  const stageIdx = ORDER.indexOf(stage);
  const progress = Math.min(0.98, (stageIdx <= 2 ? stageIdx * 0.08 : stage === 'analyzing' ? 0.3 : stage === 'extracting' ? 0.45 + Math.min(0.4, chars / 6000) : stage === 'validating' ? 0.92 : 1) + 0.02);

  return (
    <>
      <PageHeader eyebrow="Step 1 of 3 · Capture" title="AI screenshot analysis" subtitle="TradingView, Lucid or your trading platform — up to 6 screenshots of one trade." />
      {cfg && !cfg.ai && (
        <Notice tone="warn" icon={<TriangleAlert className="size-4 text-warn" />} className="mb-5" title="AI analysis isn’t available on this deployment" action={<Link href="/journal/new"><Button size="sm">Manual entry</Button></Link>}>
          {cfg.supabase ? 'The server has no ANTHROPIC_API_KEY.' : 'AI requires sign-in (Supabase) plus ANTHROPIC_API_KEY, or CADENCE_AI_ALLOW_ANONYMOUS=true on a private deployment.'} You can still attach screenshots and enter the trade manually.
        </Notice>
      )}
      {error && (
        <Notice tone="neg" icon={<CircleAlert className="size-4 text-neg" />} className="mb-5" title="Analysis failed" action={<Button size="sm" onClick={run} icon={<RotateCcw className="size-3.5" />}>Retry</Button>}>
          {error.message}
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <motion.div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) void addFiles(e.dataTransfer.files);
            }}
            animate={{ scale: dragging ? 1.01 : 1 }}
            className={cn(
              'panel relative overflow-hidden border-dashed p-6 transition-colors md:p-8',
              dragging ? 'border-violet/60 bg-electric/[0.08]' : 'border-white/[0.12]',
              busy && 'pointer-events-none',
            )}
          >
            <div className="pointer-events-none absolute inset-0 opacity-60">
              <motion.div className="absolute -left-1/4 top-0 h-full w-1/2 bg-[linear-gradient(90deg,transparent,rgba(180,106,255,0.10),transparent)]" animate={{ x: ['0%', '300%'] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} />
            </div>
            {shots.length === 0 ? (
              <button type="button" onClick={() => input.current?.click()} className="relative flex w-full flex-col items-center py-10 text-center">
                <div className="relative mb-6">
                  <motion.div className="absolute inset-0 rounded-full bg-electric/40 blur-2xl" animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 3, repeat: Infinity }} />
                  <div className="relative grid size-20 place-items-center rounded-3xl border border-violet/30 bg-[linear-gradient(135deg,rgba(138,43,226,0.35),rgba(26,16,40,0.8))]">
                    <Upload className="size-8 text-violet-soft" strokeWidth={1.6} />
                  </div>
                </div>
                <div className="font-display text-lg font-semibold">Drop screenshots here</div>
                <div className="mt-1.5 text-[13.5px] text-mute">or tap to choose · paste with ⌘/Ctrl + V</div>
                <div className="mt-5 flex flex-wrap justify-center gap-2 text-[12px] text-faint">
                  <span className="rounded-full border border-white/10 px-2.5 py-1">TradingView position tool</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1">Order fills</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1">Account P&L</span>
                </div>
              </button>
            ) : (
              <div className="relative">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <AnimatePresence>
                    {shots.map((s, i) => (
                      <motion.div key={s.url} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={`Screenshot ${i + 1}`} className={cn('size-full object-cover transition', busy && 'opacity-60')} />
                        <span className="absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-md bg-black/70 font-mono text-[10px]">{i + 1}</span>
                        {busy && (
                          <motion.div className="absolute inset-x-0 h-12 bg-[linear-gradient(180deg,transparent,rgba(180,106,255,0.45),transparent)]" animate={{ top: ['-20%', '100%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }} />
                        )}
                        {!busy && (
                          <IconButton label="Remove screenshot" onClick={() => setShots((xs) => xs.filter((x) => x !== s))} className="absolute right-1.5 top-1.5 size-7 bg-black/60 text-white">
                            <X className="size-3.5" />
                          </IconButton>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {!busy && shots.length < MAX_SHOTS && (
                    <button type="button" onClick={() => input.current?.click()} className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-white/[0.14] text-[12px] text-faint transition hover:border-violet/40 hover:text-violet">
                      <span className="flex flex-col items-center gap-1.5">
                        <ImagePlus className="size-5" /> Add more
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files).then(() => (e.target.value = ''))} />
          </motion.div>
          {!busy && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-faint md:hidden">
              <Camera className="size-3.5" /> On iPhone you can pick from Photos or take a picture of your screen.
            </div>
          )}
        </div>

        <Card className="p-5">
          {busy ? (
            <div>
              <div className="mb-5 flex items-center gap-3">
                <div className="relative">
                  <motion.div className="absolute inset-0 rounded-full bg-electric/40 blur-xl" animate={{ opacity: [0.3, 0.9, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
                  <Symbol size={40} className="relative" />
                </div>
                <div>
                  <div className="font-display text-[15px] font-semibold">Analyzing your trade</div>
                  <div className="text-[12.5px] text-mute">Usually 20–60 seconds</div>
                </div>
              </div>
              <ProgressBar value={progress} label="Analysis progress" />
              <ol className="mt-5 space-y-3.5">
                {STAGES.map((s) => {
                  const idx = ORDER.indexOf(s.key);
                  const done = stageIdx > idx || (s.key === 'uploading' && stageIdx >= ORDER.indexOf('received'));
                  const active = !done && (stage === s.key || (s.key === 'uploading' && stage === 'received'));
                  return (
                    <li key={s.key} className={cn('flex gap-3 transition-opacity', !done && !active && 'opacity-40')}>
                      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', done ? 'border-pos/40 bg-pos/15 text-pos' : active ? 'border-violet/50 text-violet' : 'border-white/15')}>
                        {done ? <Check className="size-3" /> : active ? <LoaderCircle className="size-3 animate-spin" /> : null}
                      </span>
                      <span>
                        <span className="block text-[13.5px] font-medium">{s.label}</span>
                        <span className="block text-[12px] text-faint">
                          {s.detail}
                          {active && s.key === 'extracting' && chars > 0 && <span className="num"> · {chars.toLocaleString()} chars</span>}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <Button variant="ghost" size="sm" className="mt-5" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="eyebrow mb-3 flex items-center gap-2">
                <ScanLine className="size-3.5 text-violet" /> What CADENCE extracts
              </div>
              <ul className="space-y-2 text-[13px] text-mute">
                <li>• Instrument, contract, direction and size</li>
                <li>• Entry, exit, stop and target prices</li>
                <li>• Entry/exit times, duration and session</li>
                <li>• Gross/net P&L and fees — only if shown</li>
                <li>• Setup, timeframe, bias and structure</li>
                <li>• Liquidity sweeps, FVGs, order blocks, BOS/CHoCH…</li>
              </ul>
              <p className="mt-4 text-[12px] leading-relaxed text-faint">Every value gets a confidence level. Anything uncertain is flagged for you to confirm — nothing missing is ever invented.</p>
              {accounts.length > 0 && (
                <div className="mt-5">
                  <label className="mb-1.5 block text-[12.5px] font-medium text-mute" htmlFor="an-account">
                    Account
                  </label>
                  <Select id="an-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">No account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="mt-auto space-y-2 pt-6">
                <Button variant="primary" size="lg" full disabled={!shots.length || (cfg !== null && !cfg.ai)} onClick={run} icon={<Sparkles className="size-4" />}>
                  {shots.length ? `Analyze ${shots.length} screenshot${shots.length === 1 ? '' : 's'}` : 'Add a screenshot to start'}
                </Button>
                {shots.length > 0 && (
                  <Button variant="ghost" full onClick={manualWithShots} icon={<PenLine className="size-4" />}>
                    Enter manually with these screenshots
                  </Button>
                )}
                {shots.length === 0 && (
                  <button type="button" onClick={async () => {
                    try {
                      const items = await navigator.clipboard.read();
                      const files: File[] = [];
                      for (const it of items) for (const type of it.types) if (type.startsWith('image/')) files.push(new File([await it.getType(type)], 'clipboard.png', { type }));
                      if (files.length) void addFiles(files);
                      else toast({ tone: 'info', title: 'No image on the clipboard' });
                    } catch {
                      toast({ tone: 'info', title: 'Clipboard access was blocked', body: 'Use ⌘/Ctrl + V or choose a file instead.' });
                    }
                  }} className="mx-auto flex items-center gap-1.5 text-[12.5px] text-faint hover:text-mute">
                    <ClipboardPaste className="size-3.5" /> Paste from clipboard
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
