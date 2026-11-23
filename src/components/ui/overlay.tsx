'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, cn, IconButton } from './core';

// ───────── Sheet: bottom sheet on phones, centered panel on desktop ─────────

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus({ preventScroll: true }), 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!mounted) return null;
  const width = { sm: 'md:max-w-md', md: 'md:max-w-xl', lg: 'md:max-w-3xl' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={cn(
              'panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none border-white/10 bg-ink-850/95 md:rounded-3xl',
              'rounded-t-[26px]',
              width,
            )}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 md:hidden" aria-hidden />
            {(title || description) && (
              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                <div>
                  {title && <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>}
                  {description && <p className="mt-0.5 text-[13px] text-mute">{description}</p>}
                </div>
                <IconButton label="Close" onClick={onClose} data-close>
                  <X className="size-4" />
                </IconButton>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="border-t border-white/[0.06] px-5 py-3.5 pb-[max(0.875rem,var(--safe-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────── Confirm dialog ─────────

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div className="text-sm leading-relaxed text-mute">{body}</div>}
    </Sheet>
  );
}

// ───────── Toasts ─────────

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

const ToastCtx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.action ? 6500 : 4200);
  }, []);
  const icon = { success: <CircleCheck className="size-4 text-pos" />, error: <CircleAlert className="size-4 text-neg" />, info: <Info className="size-4 text-violet" /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,var(--safe-top))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:top-auto md:items-end">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              role="status"
              className="panel pointer-events-auto flex w-full max-w-sm items-start gap-3 border-white/10 bg-ink-800/95 px-4 py-3"
            >
              <div className="mt-0.5">{icon[t.tone]}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{t.title}</div>
                {t.body && <div className="mt-0.5 text-[12.5px] text-mute">{t.body}</div>}
              </div>
              {t.action && (
                <button
                  type="button"
                  className="text-[13px] font-medium text-violet hover:text-violet-soft"
                  onClick={() => {
                    t.action!.onClick();
                    setItems((xs) => xs.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
