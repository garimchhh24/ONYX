'use client';

import { ArrowLeft, ImagePlus, Save, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addAttachment, saveTrade, useAccounts, useInstruments, useSettings } from '@/lib/data/repo';
import { prepareImage, type PreparedImage } from '@/lib/data/images';
import { validateTrade } from '@/lib/domain/validate';
import type { Trade } from '@/lib/types';
import { PageHeader } from '../shell/AppShell';
import { Button, Card, IconButton, Notice } from '../ui/core';
import { useToast } from '../ui/overlay';
import { ScreenshotGallery } from './Screenshots';
import { TradeForm } from './TradeForm';

/** Manual entry and editing. New trades continue straight into the journal check-in. */
export function TradeEditor({ initial, mode }: { initial: Trade; mode: 'new' | 'edit' }) {
  const router = useRouter();
  const toast = useToast();
  const accounts = useAccounts() ?? [];
  const instruments = useInstruments();
  const settings = useSettings();
  const [t, setT] = useState<Trade>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<(PreparedImage & { url: string })[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const v = useMemo(() => validateTrade(t, instruments), [t, instruments]);

  // Apply the default account once for new trades; the user can still pick "No account".
  const defaultApplied = useRef(mode !== 'new');
  useEffect(() => {
    if (defaultApplied.current || !settings.default_account_id || !accounts.some((a) => a.id === settings.default_account_id)) return;
    defaultApplied.current = true;
    setT((x) => (x.account_id ? x : { ...x, account_id: settings.default_account_id }));
  }, [settings.default_account_id, accounts]);
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), [pending]);

  const save = async () => {
    setShowErrors(true);
    if (Object.keys(v.errors).length) {
      toast({ tone: 'error', title: 'Check the highlighted fields' });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTrade(t);
      for (const p of pending) await addAttachment(saved.id, p.blob, { width: p.width, height: p.height });
      if (mode === 'new') {
        router.replace(`/trade?id=${saved.id}&journal=1`);
      } else {
        toast({ tone: 'success', title: 'Trade updated' });
        router.replace(`/trade?id=${saved.id}`);
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', body: e instanceof Error ? e.message : undefined });
      setSaving(false);
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      try {
        const img = await prepareImage(f);
        setPending((p) => [...p, { ...img, url: URL.createObjectURL(img.blob) }]);
      } catch (e) {
        toast({ tone: 'error', title: 'Could not read image', body: e instanceof Error ? e.message : undefined });
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <>
      <Link href={mode === 'edit' ? `/trade?id=${t.id}` : '/journal'} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-fg">
        <ArrowLeft className="size-4" /> {mode === 'edit' ? 'Trade' : 'Journal'}
      </Link>
      <PageHeader
        title={mode === 'new' ? 'New trade' : `Edit ${t.symbol} trade`}
        subtitle={mode === 'new' ? 'Enter the execution — P&L, R and session are calculated from contract specs.' : undefined}
        action={
          <Button variant="primary" onClick={save} loading={saving} icon={<Save className="size-4" />} className="hidden md:inline-flex">
            {mode === 'new' ? 'Save & journal' : 'Save changes'}
          </Button>
        }
      />
      <TradeForm value={t} onChange={setT} accounts={accounts} instruments={instruments} setups={settings.setups} showErrors={showErrors} meta={t.extraction?.fields} onMetaChange={(fields) => t.extraction && setT((x) => ({ ...x, extraction: x.extraction ? { ...x.extraction, fields } : null }))} />
      <Card className="mt-5 p-5">
        <h3 className="eyebrow mb-4">Screenshots</h3>
        {mode === 'edit' ? (
          <ScreenshotGallery tradeId={t.id} />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {pending.map((p, i) => (
              <div key={p.url} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/[0.07]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Screenshot ${i + 1}`} className="size-full object-cover" />
                <IconButton label="Remove" className="absolute right-1.5 top-1.5 size-7 bg-black/60 text-white" onClick={() => setPending((xs) => xs.filter((x) => x !== p))}>
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))}
            <button type="button" onClick={() => fileInput.current?.click()} className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-white/[0.12] text-[12px] text-faint transition hover:border-violet/40 hover:text-violet">
              <span className="flex flex-col items-center gap-1.5">
                <ImagePlus className="size-5" /> Attach
              </span>
            </button>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>
        )}
      </Card>
      {showErrors && Object.keys(v.errors).length > 0 && (
        <Notice tone="neg" className="mt-4" title="Some fields need attention">
          {Object.values(v.errors).join(' ')}
        </Notice>
      )}
      <div className="sticky bottom-[calc(76px+var(--safe-bottom))] z-20 mt-5 md:hidden">
        <Button variant="primary" size="lg" full onClick={save} loading={saving} icon={<Save className="size-4" />}>
          {mode === 'new' ? 'Save & journal' : 'Save changes'}
        </Button>
      </div>
    </>
  );
}
