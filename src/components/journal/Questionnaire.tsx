'use client';

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Activity,
  Angry,
  BadgeCheck,
  Ban,
  BatteryLow,
  Brain,
  CircleCheck,
  CircleCheckBig,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock,
  CloudRain,
  Coins,
  Crosshair,
  DoorOpen,
  Ellipsis,
  EyeOff,
  FastForward,
  Flame,
  Frown,
  HeartPulse,
  Hourglass,
  ListChecks,
  LogOut,
  Meh,
  MoveVertical,
  Rewind,
  Route,
  Scaling,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Sparkles,
  StepBack,
  StepForward,
  Swords,
  Target,
  ThumbsUp,
  Timer,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyAnswers, isStepAnswered, STEPS, type Option, type Step } from '@/lib/domain/questionnaire';
import type { JournalAnswers } from '@/lib/types';
import { Button, cn, Input, ProgressBar } from '../ui/core';

const ICONS: Record<string, LucideIcon> = { Activity, Angry, BadgeCheck, Ban, BatteryLow, Brain, CircleCheck, CircleCheckBig, CircleDashed, CircleHelp, CircleX, Clock, CloudRain, Coins, Crosshair, DoorOpen, Ellipsis, EyeOff, FastForward, Flame, Frown, HeartPulse, Hourglass, ListChecks, LogOut, Meh, MoveVertical, Rewind, Route, Scaling, Shield, ShieldAlert, ShieldCheck, Smile, Sparkles, StepBack, StepForward, Swords, Target, ThumbsUp, Timer, Waves, Wind, Zap };

function OptionIcon({ name }: { name?: string }) {
  if (!name) return null;
  const I = ICONS[name];
  return I ? <I className="size-[18px]" strokeWidth={1.8} /> : null;
}

const toneRing: Record<NonNullable<Option['tone']>, string> = {
  pos: 'group-aria-pressed:text-pos',
  neg: 'group-aria-pressed:text-neg',
  warn: 'group-aria-pressed:text-warn',
  neutral: 'group-aria-pressed:text-chrome',
};

export function ChoiceCard({ option, selected, onClick, index, large }: { option: Option; selected: boolean; onClick: () => void; index: number; large?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl border px-4 text-left transition-[border-color,background,box-shadow] duration-200',
        large ? 'h-16 justify-center text-xl font-semibold' : 'min-h-[54px] py-3',
        selected
          ? 'border-violet/60 bg-[linear-gradient(135deg,rgba(138,43,226,0.28),rgba(106,31,196,0.12))] shadow-[0_0_0_3px_rgba(138,43,226,0.15),0_10px_30px_-12px_rgba(138,43,226,0.7)]'
          : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.045]',
      )}
    >
      {option.icon && <span className={cn('text-faint transition-colors', option.tone && toneRing[option.tone], selected && 'text-violet-soft')}>{<OptionIcon name={option.icon} />}</span>}
      <span className={cn('text-[14.5px] font-medium', large && 'font-display text-xl', selected ? 'text-fg' : 'text-chrome/85')}>{option.label}</span>
      <AnimatePresence>
        {selected && !large && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="ml-auto grid size-5 place-items-center rounded-full bg-electric text-white">
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
      <span aria-hidden className="absolute right-2 top-1.5 hidden font-mono text-[9px] text-faint/60 md:block">{index < 9 ? index + 1 : ''}</span>
    </motion.button>
  );
}

/**
 * Smart journaling: one question per screen, tap-only answers, auto-advance on single choice.
 * Required steps can't be skipped; optional ones can. Target: 30–60 seconds.
 */
export function Questionnaire({ initial, onComplete, onCancel, submitLabel = 'Save journal', busy }: { initial?: JournalAnswers | null; onComplete: (a: JournalAnswers) => void; onCancel?: () => void; submitLabel?: string; busy?: boolean }) {
  const [a, setA] = useState<JournalAnswers>(() => ({ ...emptyAnswers(), ...(initial ?? {}) }));
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const total = STEPS.length + 1; // + final note step
  const step: Step | undefined = STEPS[i];
  const started = useMemo(() => Date.now(), []);

  const go = useCallback((n: number) => {
    setDir(n > 0 ? 1 : -1);
    setI((x) => Math.max(0, Math.min(total - 1, x + n)));
  }, [total]);

  const toggle = useCallback(
    (s: Step, value: string) => {
      setA((prev) => {
        const cur = prev[s.key];
        if (!s.multi) return { ...prev, [s.key]: cur === value ? null : value };
        const arr = (cur as string[]) ?? [];
        let next: string[];
        if (arr.includes(value)) next = arr.filter((x) => x !== value);
        else if (s.exclusive && value === s.exclusive) next = [value];
        else next = [...arr.filter((x) => x !== s.exclusive), value];
        return { ...prev, [s.key]: next };
      });
      if (!s.multi) setTimeout(() => go(1), 220);
    },
    [go],
  );

  // Keyboard: 1-9 to pick, Enter to continue, Backspace to go back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (!step) return;
      const n = Number(e.key);
      if (n >= 1 && n <= step.options.length) toggle(step, step.options[n - 1].value);
      if (e.key === 'Enter' && (!step.required || isStepAnswered(a, step))) go(1);
      if (e.key === 'Backspace' && i > 0) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, a, toggle, go, i]);

  const answered = step ? isStepAnswered(a, step) : true;
  const canNext = !step || !step.required || answered;
  const isEntry = step?.key === 'entry_quality';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => (i === 0 ? onCancel?.() : go(-1))} className="grid size-9 place-items-center rounded-xl text-mute transition hover:bg-white/5 hover:text-fg" aria-label="Back">
          <ArrowLeft className="size-4" />
        </button>
        <ProgressBar value={(i + (answered ? 1 : 0.4)) / total} className="flex-1" label="Journal progress" />
        <span className="num w-12 text-right text-[12px] text-faint">
          {Math.min(i + 1, total)}/{total}
        </span>
      </div>

      <div className="relative min-h-[420px]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={i}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {step ? (
              <>
                <div className="eyebrow mb-2 flex items-center gap-2">
                  {step.group}
                  {!step.required && <span className="rounded-full border border-white/10 px-1.5 py-px text-[9px] tracking-[0.14em] text-faint">Optional</span>}
                  {step.multi && <span className="text-[9px] tracking-[0.14em] text-faint">· Select all that apply</span>}
                </div>
                <h2 className="mb-6 font-display text-[24px] font-semibold leading-tight tracking-tight md:text-[28px]">{step.title}</h2>
                <div className={cn('grid gap-2.5', isEntry ? 'grid-cols-5' : 'grid-cols-2 md:grid-cols-3')}>
                  {step.options.map((o, idx) => {
                    const cur = a[step.key];
                    const selected = Array.isArray(cur) ? cur.includes(o.value) : cur === o.value;
                    return <ChoiceCard key={o.value} option={o} index={idx} selected={selected} large={isEntry} onClick={() => toggle(step, o.value)} />;
                  })}
                </div>
                {step.key === 'mistakes' && a.mistakes.includes('other') && (
                  <Input className="mt-3" placeholder="Describe the mistake (optional)" value={a.mistake_other ?? ''} onChange={(e) => setA({ ...a, mistake_other: e.target.value || null })} aria-label="Other mistake" />
                )}
              </>
            ) : (
              <>
                <div className="eyebrow mb-2">Final thought</div>
                <h2 className="mb-6 font-display text-[24px] font-semibold leading-tight tracking-tight md:text-[28px]">Anything else worth remembering?</h2>
                <textarea
                  className="field min-h-[120px] resize-none"
                  placeholder="One line is plenty (optional)"
                  value={a.note ?? ''}
                  onChange={(e) => setA({ ...a, note: e.target.value || null })}
                  aria-label="Journal note"
                />
                <p className="mt-3 text-[12px] text-faint">Journaled in {Math.max(1, Math.round((Date.now() - started) / 1000))}s</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-[calc(76px+var(--safe-bottom))] mt-6 flex items-center justify-between gap-3 md:bottom-0">
        <div className="text-[12px] text-faint">{step?.required && !answered ? 'Required' : step ? '' : ''}</div>
        <div className="flex gap-2">
          {step && !step.required && !answered && (
            <Button variant="ghost" onClick={() => go(1)}>
              Skip
            </Button>
          )}
          {step ? (
            (step.multi || answered) && (
              <Button variant="primary" onClick={() => go(1)} disabled={!canNext} icon={<ChevronRight className="size-4" />}>
                Next
              </Button>
            )
          ) : (
            <Button variant="primary" size="lg" loading={busy} onClick={() => onComplete({ ...a, mistake_other: a.mistakes.includes('other') ? a.mistake_other : null })} icon={<Check className="size-4" />}>
              {submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
