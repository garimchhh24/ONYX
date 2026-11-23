'use client';

import { ImagePlus, ImageOff, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addAttachment, deleteAttachment, useAttachments, useBlobUrl } from '@/lib/data/repo';
import { prepareImage } from '@/lib/data/images';
import type { Attachment } from '@/lib/types';
import { cn, IconButton } from '../ui/core';
import { useToast } from '../ui/overlay';

function Thumb({ a, onOpen }: { a: Attachment; onOpen: (url: string) => void }) {
  const { url, missing } = useBlobUrl(a);
  return (
    <button
      type="button"
      onClick={() => url && onOpen(url)}
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/[0.07] bg-black/40"
      aria-label="Open screenshot"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Trade screenshot" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      ) : missing ? (
        <div className="grid size-full place-items-center text-faint">
          <ImageOff className="size-5" />
        </div>
      ) : (
        <div className="skeleton size-full rounded-none" />
      )}
    </button>
  );
}

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!url) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [url, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {url && (
        <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/90 p-3 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img src={url} alt="Screenshot" className="max-h-[92dvh] max-w-full rounded-xl object-contain shadow-2xl" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} />
          <IconButton label="Close" onClick={onClose} className="absolute right-4 top-[max(1rem,var(--safe-top))] bg-white/10 text-white">
            <X className="size-5" />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Screenshots attached to a saved trade: view, add, delete. */
export function ScreenshotGallery({ tradeId, editable = true }: { tradeId: string; editable?: boolean }) {
  const shots = useAttachments(tradeId);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const img = await prepareImage(f);
        await addAttachment(tradeId, img.blob, { width: img.width, height: img.height });
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Could not add screenshot', body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {shots.map((a) => (
          <div key={a.id} className="relative">
            <Thumb a={a} onOpen={setOpen} />
            {editable && (
              <IconButton
                label="Delete screenshot"
                className="absolute right-1.5 top-1.5 size-7 bg-black/60 text-white/80 backdrop-blur hover:bg-neg/80 hover:text-white"
                onClick={() => deleteAttachment(a.id)}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            )}
          </div>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={cn(
              'grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-white/[0.12] text-faint transition hover:border-violet/40 hover:text-violet',
              busy && 'animate-pulse',
            )}
          >
            <span className="flex flex-col items-center gap-1.5 text-[12px]">
              <ImagePlus className="size-5" />
              {busy ? 'Adding…' : 'Add screenshot'}
            </span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      <Lightbox url={open} onClose={() => setOpen(null)} />
    </>
  );
}
