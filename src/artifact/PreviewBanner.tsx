import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Badge } from '@/components/ui/core';
import { useToast } from '@/components/ui/overlay';
import { db } from '@/lib/data/db';
import { EXAMPLE_TAG, removeExamples } from './examples';

let memoryOnly = false;
export const setMemoryOnly = (v: boolean) => {
  memoryOnly = v;
};

/** Shown on every screen of the claude.ai preview: what this is, and the example data. */
export function PreviewBanner() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const examples = useLiveQuery(() => db().trades.filter((t) => !t.deleted_at && (t.tags ?? []).includes(EXAMPLE_TAG)).count(), []);
  return (
    <div className="panel mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-electric/25 px-4 py-3 text-[13px]">
      <span className="flex min-w-0 items-center gap-2">
        <Badge tone="violet">Preview</Badge>
        <span className="text-mute">
          {memoryOnly ? 'This view can’t save data, so changes disappear when you close it.' : 'Running on claude.ai. Your entries stay in this browser.'}
        </span>
      </span>
      {examples ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-mute">
          <span>
            Showing <span className="num text-fg">{examples}</span> example trades so every screen has data.
          </span>
          <button
            type="button"
            disabled={busy}
            className="font-medium text-violet transition hover:text-violet-soft disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              try {
                const n = await removeExamples();
                toast({ tone: 'success', title: `Removed ${n} example trades`, body: 'Your own entries were kept.' });
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove examples
          </button>
        </span>
      ) : null}
    </div>
  );
}
