import { useEffect, useState } from 'react';
import type { Instrument } from '../types';
import { parseRecognition, visionPrompt, type Recognition } from './vision';

/*
 * Talks to Claude through the artifact runtime's `sample` capability: the screenshot is read on the
 * viewer's own Claude account (the first use asks the viewer for permission). Outside Claude the
 * capability is absent and the feature stays hidden.
 */

interface SampleLimits {
  images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] };
}
interface SampleFn {
  json(input: string, options?: Record<string, unknown>): Promise<unknown>;
  limits(): Promise<SampleLimits>;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}
export interface VisionError {
  code: string;
  message: string;
}

let ready: Promise<{ sample: SampleFn; maxImages: number } | null> | null = null;
let blocked = false;
const listeners = new Set<() => void>();

function getVision() {
  if (!ready) {
    const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
    ready = !claude?.use
      ? Promise.resolve(null)
      : claude
          .use('sample')
          .then(async (s) => {
            const sample = s as SampleFn | null;
            if (!sample) return null;
            const limits = await sample.limits().catch(() => null);
            return limits?.images ? { sample, maxImages: limits.images.maxCount } : null;
          })
          .catch(() => null);
  }
  return ready;
}

/** true / false once known; null while the runtime answers. */
export function useVisionAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(blocked ? false : null);
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (blocked) return setOk(false);
      void getVision().then((v) => alive && setOk(!!v && !blocked));
    };
    check();
    listeners.add(check);
    return () => {
      alive = false;
      listeners.delete(check);
    };
  }, []);
  return ok;
}

/** Codes after which the feature is hidden for the rest of the visit (never re-asked). */
const HIDE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable']);

export function visionErrorText(code: string): string {
  switch (code) {
    case 'cancelled':
      return '';
    case 'not_granted':
      return 'Доступ к Claude не разрешён — заполните сделку вручную.';
    case 'sampling_disabled':
      return 'Claude недоступен для этого аккаунта.';
    case 'rate_limited':
      return 'Слишком много запросов. Попробуйте через минуту.';
    case 'session_expired':
      return 'Войдите в Claude заново и повторите.';
    case 'image_rejected':
      return 'Этот файл не подошёл. Попробуйте другой скриншот (PNG или JPG).';
    case 'refused':
      return 'Claude не стал обрабатывать это изображение.';
    case 'invalid_json':
    case 'empty_completion':
      return 'Не получилось прочитать ответ. Попробуйте ещё раз.';
    case 'unavailable':
    case 'images_unavailable':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Распознавание скриншотов здесь недоступно.';
    default:
      return 'Сбой связи. Попробуйте ещё раз.';
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject({ code: 'image_rejected', message: 'cannot decode image' } satisfies VisionError);
    };
    img.src = url;
  });
}

function crop(img: HTMLImageElement, x: number, y: number, w: number, h: number, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject({ code: 'image_rejected', message: 'encode failed' })), 'image/jpeg', 0.92),
  );
}

/**
 * The platform shrinks each image to about 1.2 MP, which can make small chart labels unreadable.
 * For a large screenshot we also send two overlapping halves, so the labels stay legible.
 */
export async function prepareImages(file: Blob, maxImages: number): Promise<Blob[]> {
  const img = await loadImage(file);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const full = await crop(img, 0, 0, W, H, 2400);
  if (maxImages < 3 || W * H < 1_500_000) return [full];
  const portrait = H >= W;
  const L = portrait ? H : W;
  const part = Math.round(L * 0.56);
  const a = portrait ? crop(img, 0, 0, W, part, 2000) : crop(img, 0, 0, part, H, 2000);
  const b = portrait ? crop(img, 0, H - part, W, part, 2000) : crop(img, W - part, 0, part, H, 2000);
  return [full, ...(await Promise.all([a, b]))];
}

/** Reads a TradingView position screenshot. Rejects with a VisionError. */
export async function recognizeScreenshot(file: Blob, instruments: Instrument[], opts: { signal?: AbortSignal; refresh?: boolean } = {}): Promise<Recognition> {
  const v = await getVision();
  if (!v || blocked) throw { code: 'unavailable', message: 'sample capability is not available' } satisfies VisionError;
  const images = await prepareImages(file, v.maxImages);
  if (opts.signal?.aborted) throw { code: 'cancelled', message: 'aborted' } satisfies VisionError;
  try {
    const raw = await v.sample.json(visionPrompt(images.length > 1), {
      images,
      modelTier: 'default',
      signal: opts.signal,
      cache: opts.refresh ? { gcTime: 300_000, refresh: true } : { gcTime: 300_000 },
    });
    return parseRecognition(raw, instruments);
  } catch (e) {
    const code = (e as { code?: string })?.code ?? 'upstream_error';
    if (HIDE.has(code)) {
      blocked = true;
      listeners.forEach((l) => l());
    }
    throw { code, message: (e as { message?: string })?.message ?? '' } satisfies VisionError;
  }
}
