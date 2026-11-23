'use client';

import clsx, { type ClassValue } from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const cn = (...v: ClassValue[]) => clsx(v);

// ───────── Button ─────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'chrome';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,box-shadow,color,border-color,opacity] duration-200 disabled:pointer-events-none disabled:opacity-45';
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-[10px] px-3 text-[13px]',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-[14px] px-5 text-[15px]',
};
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'text-white bg-[linear-gradient(135deg,#9b45f0_0%,#8a2be2_45%,#6a1fc4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_24px_-8px_rgba(138,43,226,0.7)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_32px_-6px_rgba(138,43,226,0.85)]',
  secondary:
    'text-fg bg-white/[0.045] border border-white/[0.09] hover:bg-white/[0.08] hover:border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  ghost: 'text-mute hover:text-fg hover:bg-white/[0.05]',
  danger: 'text-neg bg-neg/10 border border-neg/25 hover:bg-neg/15',
  chrome:
    'text-obsidian bg-[linear-gradient(180deg,#ffffff,#d9d9e2_60%,#b9b7c8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_20px_-8px_rgba(217,217,226,0.5)] hover:brightness-105',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, full, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className={cn(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], full && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </motion.button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-xl text-mute transition hover:bg-white/[0.06] hover:text-fg active:scale-95 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ───────── Surfaces ─────────

export function Card({ className, children, glow, as: As = 'div', ...rest }: { className?: string; children: ReactNode; glow?: boolean; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('panel', glow && 'panel-glow', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, eyebrow, action, className }: { title?: ReactNode; eyebrow?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        {title && <h3 className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{title}</h3>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

// ───────── Badges & chips ─────────

type BadgeTone = 'neutral' | 'violet' | 'pos' | 'neg' | 'warn' | 'chrome';
const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] text-mute border-white/[0.08]',
  violet: 'bg-electric/15 text-violet-soft border-electric/30',
  pos: 'bg-pos/10 text-pos border-pos/25',
  neg: 'bg-neg/10 text-neg border-neg/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  chrome: 'bg-chrome/10 text-chrome border-chrome/20',
};

export function Badge({ tone = 'neutral', className, children, icon }: { tone?: BadgeTone; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4', BADGE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  className,
  icon,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition active:scale-[0.97]',
        selected
          ? 'border-violet/50 bg-electric/20 text-fg shadow-[0_0_0_3px_rgba(138,43,226,0.12)]'
          : 'border-white/[0.09] bg-white/[0.03] text-mute hover:border-white/[0.16] hover:text-fg',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ───────── Segmented control (animated pill) ─────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  layoutKey,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
  layoutKey?: string;
}) {
  const auto = useId();
  const key = layoutKey ?? auto;
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl border border-white/[0.07] bg-black/40 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 whitespace-nowrap rounded-[9px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]',
              active ? 'text-fg' : 'text-faint hover:text-mute',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${key}`}
                className="absolute inset-0 rounded-[9px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(138,43,226,0.35),rgba(106,31,196,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ───────── Form fields ─────────

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  aside,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-mute">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? <p className="text-[12px] text-neg">{error}</p> : hint ? <p className="text-[12px] text-faint">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { attention?: boolean }>(function Input(
  { className, attention, ...rest },
  ref,
) {
  return <input ref={ref} className={cn('field', attention && 'field-attention', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn('field min-h-[88px] resize-y leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { attention?: boolean }>(function Select(
  { className, children, attention, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'field appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239a98aa%27%20stroke-width%3D%272.5%27%3E%3Cpath%20d%3D%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_0.85rem_center] bg-no-repeat pr-9',
        attention && 'field-attention',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Number input that keeps the user's text while typing and reports a number | null. */
export function NumberInput({
  value,
  onChange,
  className,
  step,
  min,
  placeholder,
  attention,
  id,
  inputMode = 'decimal',
  ...rest
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  className?: string;
  step?: number | string;
  min?: number;
  placeholder?: string;
  attention?: boolean;
  id?: string;
  inputMode?: 'decimal' | 'numeric';
  'aria-label'?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode={inputMode}
      step={step ?? 'any'}
      min={min}
      placeholder={placeholder}
      attention={attention}
      className={cn('num', className)}
      value={value === null || value === undefined || Number.isNaN(value) ? '' : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') return onChange(null);
        const n = Number(v);
        onChange(Number.isFinite(n) ? n : null);
      }}
      {...rest}
    />
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full border transition-colors disabled:opacity-40',
        checked ? 'border-violet/40 bg-electric' : 'border-white/10 bg-white/[0.08]',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 35 }}
        className={cn('block size-5 rounded-full bg-white shadow', checked ? 'ml-[20px]' : 'ml-[2px]')}
      />
    </button>
  );
}

// ───────── Feedback ─────────

export function ProgressBar({ value, tone = 'violet', className, label }: { value: number; tone?: 'violet' | 'pos' | 'neg' | 'warn'; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = {
    violet: 'bg-[linear-gradient(90deg,#6a1fc4,#b46aff)] shadow-[0_0_12px_rgba(180,106,255,0.5)]',
    pos: 'bg-[linear-gradient(90deg,#1f9e6d,#3ddc97)]',
    neg: 'bg-[linear-gradient(90deg,#c43a55,#ff5c7a)]',
    warn: 'bg-[linear-gradient(90deg,#c98a2a,#f7b955)]',
  }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className={cn('h-full rounded-full', fill)} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('hairline', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-mute">{children}</kbd>;
}

export function Notice({ tone = 'neutral', icon, title, children, className, action }: { tone?: BadgeTone; icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const ring = {
    neutral: 'border-white/[0.08] bg-white/[0.03]',
    violet: 'border-electric/30 bg-electric/[0.08]',
    pos: 'border-pos/25 bg-pos/[0.06]',
    neg: 'border-neg/25 bg-neg/[0.06]',
    warn: 'border-warn/25 bg-warn/[0.06]',
    chrome: 'border-chrome/15 bg-chrome/[0.04]',
  }[tone];
  return (
    <div className={cn('flex gap-3 rounded-2xl border p-3.5 text-[13px] leading-relaxed', ring, className)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        {title && <div className="mb-0.5 font-medium text-fg">{title}</div>}
        {children && <div className="text-mute">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
