'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import {
  P,
  SYMBOL_ASPECT,
  SYMBOL_VIEWBOX,
  WORDMARK_ASPECT,
  WORDMARK_VIEWBOX,
  symbolMarkup,
  wordmarkMarkup,
  type SymbolVariant,
  type WordmarkVariant,
} from '@/lib/brand/geometry';
import { cn } from '../ui/core';

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

/** The standalone CADENCE "C" symbol. */
export function Symbol({ size = 28, variant = 'dark', className, glow, title = 'CADENCE' }: { size?: number; variant?: SymbolVariant; className?: string; glow?: boolean; title?: string }) {
  const id = safeId(useId());
  return (
    <svg
      viewBox={SYMBOL_VIEWBOX}
      width={size}
      height={size / SYMBOL_ASPECT}
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
      dangerouslySetInnerHTML={{ __html: symbolMarkup(variant, { id: `s${id}`, glow }) }}
    />
  );
}

/** Custom CADENCE wordmark (Λ-style A, open-left D). */
export function Wordmark({ height = 14, variant = 'chrome', className }: { height?: number; variant?: WordmarkVariant; className?: string }) {
  const id = safeId(useId());
  return (
    <svg
      viewBox={WORDMARK_VIEWBOX}
      height={height}
      width={height * WORDMARK_ASPECT}
      role="img"
      aria-label="CADENCE"
      className={cn('shrink-0', className)}
      dangerouslySetInnerHTML={{ __html: wordmarkMarkup(variant, `w${id}`) }}
    />
  );
}

/** Symbol + wordmark (+ optional tagline) lockup. */
export function Lockup({ size = 'md', tagline, className, stacked }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean; className?: string; stacked?: boolean }) {
  const s = { sm: { sym: 26, word: 11 }, md: { sym: 34, word: 14 }, lg: { sym: 64, word: 24 } }[size];
  if (stacked) {
    return (
      <div className={cn('flex flex-col items-center gap-5', className)}>
        <Symbol size={s.sym * 1.6} glow />
        <Wordmark height={s.word * 1.2} />
        {tagline && <Tagline />}
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Symbol size={s.sym} />
      <span className="h-6 w-px bg-white/10" aria-hidden />
      <div className="flex flex-col gap-1.5">
        <Wordmark height={s.word} />
        {tagline && <Tagline small />}
      </div>
    </div>
  );
}

export function Tagline({ small }: { small?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 font-display font-medium uppercase text-chrome/80', small ? 'whitespace-nowrap text-[7.5px] tracking-[0.27em]' : 'text-[11px] tracking-[0.42em]')}>
      {!small && <span className="h-px w-6 bg-electric" />}
      Trade with intention
      {!small && <span className="h-px w-6 bg-electric" />}
    </div>
  );
}

/** Rounded glass app-icon tile, as on the brand board. */
export function AppIcon({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('relative grid place-items-center overflow-hidden', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: 'radial-gradient(120% 120% at 25% 15%, #2a1450 0%, #120c1c 50%, #0b0b0f 100%)',
        boxShadow: '0 0 0 1px rgba(180,106,255,0.35), inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 40px -10px rgba(138,43,226,0.6)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
      <Symbol size={size * 0.64} />
    </div>
  );
}

/** Branded loading indicator: the ribbon outline draws itself while the symbol glows. */
export function LogoLoader({ size = 56, label = 'Loading' }: { size?: number; label?: string }) {
  const id = safeId(useId());
  return (
    <div role="status" aria-label={label} className="relative grid place-items-center" style={{ width: size, height: size / SYMBOL_ASPECT }}>
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 0 14px rgba(138,43,226,0.6))' }}
      >
        <Symbol size={size} />
      </motion.div>
      <svg viewBox={SYMBOL_VIEWBOX} width={size} height={size / SYMBOL_ASPECT} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id={`ll${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#B46AFF" />
            <stop offset="1" stopColor="#FFFFFF" />
          </linearGradient>
        </defs>
        <motion.path
          d={P.outline}
          fill="none"
          stroke={`url(#ll${id})`}
          strokeWidth={10}
          strokeLinejoin="round"
          initial={{ pathLength: 0.05, pathOffset: 0 }}
          animate={{ pathLength: [0.05, 0.35, 0.05], pathOffset: [0, 0.65, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  );
}

export function FullScreenLoader({ label = 'Loading CADENCE' }: { label?: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <div className="flex flex-col items-center gap-5">
        <LogoLoader size={64} label={label} />
        <div className="eyebrow">{label}</div>
      </div>
    </div>
  );
}
