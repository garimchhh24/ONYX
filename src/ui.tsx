import { useEffect, useState, type ReactNode } from 'react';
import mark from './assets/onyx-mark.png';

export const LOGO = mark;

const PATHS: Record<string, string> = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  journal: 'M7 4h11a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM5 18a2 2 0 0 1 2-2h12M9 8h6M9 11.5h6',
  plus: 'M12 5v14M5 12h14',
  stats: 'M4 20h16M7 16V10M12 16V5M17 16v-4',
  accounts: 'M12 3 4 7v5c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V7zM9 12l2 2 4-4',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 5l7 7-7 7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  x: 'M7 7l10 10M17 7 7 17',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  cloud: 'M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1zM4 7l11-3v3M16 13h.01',
};

export function Icon({ name, size = 22, stroke = 1.8, fill }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function TopBar({ title, left, right }: { title?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      {left}
      <div className="grow">{typeof title === 'string' ? <h1>{title}</h1> : title}</div>
      {right}
    </header>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <img src={LOGO} alt="" />
      <b className="chrome">ONYX</b>
    </div>
  );
}

/** Full-screen layer (trade editor, details) — locks the page behind it. */
export function Overlay({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="overlay" role="dialog">
      <div className="app">{children}</div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="inner">
          <div className="grab" />
          {title && <h3>{title}</h3>}
          {children}
        </div>
      </div>
    </>
  );
}

export function Seg<T extends string>({ value, options, onChange, small }: { value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={`seg${small ? ' sm' : ''}`} role="tablist">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="tiny muted">{hint}</span>}
    </label>
  );
}

const toNum = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.').replace(/\s/g, ''));
  return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
};

/** Decimal input that keeps the raw text while typing (so "21450." survives). */
export function NumInput({ value, onChange, placeholder, big, id, autoFocus }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; big?: boolean; id?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (toNum(text) !== value) setText(value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      className={`input${big ? ' big' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      placeholder={placeholder}
      value={text}
      autoFocus={autoFocus}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d.,]/g, '');
        setText(v);
        onChange(toNum(v));
      }}
    />
  );
}

export function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Меньше">−</button>
      <input inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value.replace(/\D/g, '')) || min))} aria-label="Контракты" />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Больше">+</button>
    </div>
  );
}

export function Bar({ pct, tone }: { pct: number; tone: 'chrome' | 'good' | 'warn' | 'bad' | 'pos' | 'neg' }) {
  return (
    <div className={`bar ${tone}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function StatusPill({ level, text }: { level: 'ok' | 'warn' | 'bad' | 'done'; text: string }) {
  const icon = level === 'bad' ? 'x' : level === 'warn' ? 'alert' : level === 'done' ? 'check' : 'check';
  return (
    <span className={`pill ${level === 'ok' ? '' : level}`}>
      <Icon name={icon} size={13} stroke={2.4} />
      {text}
    </span>
  );
}

/** Two-tap destructive button (native confirm() is blocked in some viewers). */
export function ConfirmButton({ label, confirmLabel = 'Точно удалить?', onConfirm, small }: { label: string; confirmLabel?: string; onConfirm: () => void; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`btn danger${armed ? ' armed' : ''}${small ? ' sm' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      <Icon name="trash" size={18} />
      {armed ? confirmLabel : label}
    </button>
  );
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog">
      <img src={src} alt="Скриншот графика" />
    </div>
  );
}

/** Per-device convenience memory (last account, instrument…). Never critical. */
export function remember<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('onyx:' + key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function memorize(key: string, value: unknown) {
  try {
    localStorage.setItem('onyx:' + key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

/** Saves a generated file: Claude viewer download, phone share sheet, or a plain download. */
export async function saveFile(filename: string, content: string, mime: string): Promise<boolean> {
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (claude?.use) {
    const dl = (await claude.use('downloads').catch(() => null)) as { save(r: { filename: string; data: string }): Promise<unknown> } | null;
    if (dl) {
      try {
        await dl.save({ filename, data: content });
        return true;
      } catch {
        return false;
      }
    }
  }
  const file = new File([content], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch {
      return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}
