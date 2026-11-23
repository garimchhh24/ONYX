'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type Variants } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './core';

/** Number that counts to its new value (respects reduced motion). */
export function AnimatedNumber({ value, format, className, duration = 0.9 }: { value: number; format: (v: number) => string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  const first = useRef(true);
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: first.current ? duration : duration * 0.6, ease: [0.16, 1, 0.3, 1] });
    first.current = false;
    return () => controls.stop();
  }, [value, reduce, mv, duration]);
  return <motion.span className={cn('num', className)}>{text}</motion.span>;
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}

/** Animated success check with a violet burst — used after saving a trade. */
export function SuccessBurst({ size = 88 }: { size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.8, height: size * 1.8 }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full bg-violet"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: Math.cos(a) * size * 0.8, y: Math.sin(a) * size * 0.8, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
            transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
          />
        );
      })}
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="grid place-items-center rounded-full bg-[linear-gradient(135deg,#9b45f0,#6a1fc4)] shadow-[0_0_0_8px_rgba(138,43,226,0.15),0_0_60px_rgba(138,43,226,0.6)]"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.46} height={size * 0.46} fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.2 }} />
        </svg>
      </motion.div>
    </div>
  );
}
