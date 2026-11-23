'use client';

import { Bell, BellRing, Bot, ChevronRight, Cloud, Database, Download, FileJson, FileSpreadsheet, Layers, LogIn, LogOut, Palette, Plus, RefreshCw, Share, Smartphone, Trash2, Upload, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppIcon } from '@/components/brand/Logo';
import { PageHeader, SyncBadge } from '@/components/shell/AppShell';
import { Badge, Button, Card, Chip, cn, Field, Input, Notice, NumberInput, Select, Switch } from '@/components/ui/core';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { useAuth } from '@/lib/auth/AuthProvider';
import { downloadBlob, exportBackup, restoreBackup } from '@/lib/data/backup';
import { saveSettings, useAccounts, useInstruments, useSettings, useTrades } from '@/lib/data/repo';
import { sync } from '@/lib/data/sync';
import { tradesToCsv } from '@/lib/domain/csv';
import { money } from '@/lib/domain/format';
import { CORE_SYMBOLS } from '@/lib/domain/instruments';
import { isValidTimeZone, localTimeZone } from '@/lib/domain/time';
import { useServerConfig } from '@/lib/hooks/useServerConfig';
import { isArtifactRuntime } from '@/lib/runtime';
import { useSyncState } from '@/lib/hooks/useSync';
import { currentSubscription, pushSupport, requestPermission, sendTestPush, showLocalNotification, subscribePush, unsubscribePush, type PushSupport } from '@/lib/push/client';
import type { Instrument } from '@/lib/types';

function Section({ id, icon, title, description, children }: { id?: string; icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section" id={id} className="p-5 md:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet">{icon}</span>
        <div>
          <h2 className="font-display text-[16px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-mute">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <AccountsLink />
          <ReminderSection />
          <InstallSection />
          <AiSection />
        </div>
        <div className="space-y-5">
          <SyncSection />
          <InstrumentSection />
          <SetupSection />
          <DataSection />
          <BrandLink />
        </div>
      </div>
    </>
  );
}

function AccountsLink() {
  const accounts = useAccounts() ?? [];
  return (
    <Link href="/accounts" className="panel flex items-center gap-4 p-5 transition hover:border-white/[0.12]">
      <span className="grid size-11 place-items-center rounded-xl bg-electric/15 text-violet">
        <Wallet className="size-5" />
      </span>
      <span className="flex-1">
        <span className="block font-display text-[16px] font-semibold">Lucid Trading accounts</span>
        <span className="block text-[13px] text-mute">{accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} · drawdown, limits, targets` : 'Add accounts and their rules'}</span>
      </span>
      <ChevronRight className="size-5 text-faint" />
    </Link>
  );
}

function ReminderSection() {
  const s = useSettings();
  const cfg = useServerConfig();
  const { user } = useAuth();
  const toast = useToast();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = s.reminder;
  const zones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    setSupport(pushSupport());
    void currentSubscription().then((sub) => setSubscribed(!!sub));
  }, []);

  const enableNotifications = async () => {
    setBusy(true);
    try {
      const perm = await requestPermission();
      setSupport(pushSupport());
      if (perm !== 'granted') {
        toast({ tone: 'error', title: 'Notifications are blocked', body: 'Allow them for CADENCE in your browser or iOS settings.' });
        return;
      }
      if (cfg?.push && cfg.vapidPublicKey && user) {
        await subscribePush(cfg.vapidPublicKey);
        setSubscribed(true);
        toast({ tone: 'success', title: 'Evening reminders enabled', body: 'Delivered by push even when CADENCE is closed.' });
      } else {
        toast({ tone: 'success', title: 'Notifications enabled', body: 'Reminders will show while CADENCE is open or in the background.' });
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Could not enable reminders', body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const pushPossible = !!(cfg?.push && user && support?.push && support.serviceWorker && !support.needsInstall);

  if (isArtifactRuntime) {
    return (
      <Section id="reminders" icon={<Bell className="size-4" />} title="Evening reminder" description="A nudge to journal at 8:30 PM — only when today’s journal is incomplete.">
        <Notice tone="neutral">Reminders need the installed CADENCE app, so they’re off in this claude.ai preview. Your reminder time is still saved: {r.time}.</Notice>
      </Section>
    );
  }

  return (
    <Section id="reminders" icon={<Bell className="size-4" />} title="Evening reminder" description="A nudge to journal — only when today’s journal is incomplete.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-medium">Daily journaling reminder</div>
            <div className="text-[12.5px] text-mute">Skipped automatically when every trade is journaled or the day is marked “no trades”.</div>
          </div>
          <Switch checked={r.enabled} onChange={(enabled) => saveSettings({ reminder: { ...r, enabled } })} label="Daily journaling reminder" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time" htmlFor="rem-time">
            <Input id="rem-time" type="time" value={r.time} onChange={(e) => e.target.value && saveSettings({ reminder: { ...r, time: e.target.value } })} disabled={!r.enabled} />
          </Field>
          <Field label="Time zone" htmlFor="rem-tz" aside={r.timezone !== localTimeZone() ? <button className="text-[11px] text-violet" onClick={() => saveSettings({ reminder: { ...r, timezone: localTimeZone() } })}>Use device</button> : undefined}>
            {zones.length ? (
              <Select id="rem-tz" value={r.timezone} onChange={(e) => saveSettings({ reminder: { ...r, timezone: e.target.value } })} disabled={!r.enabled}>
                {[...new Set([r.timezone, ...zones])].map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id="rem-tz" defaultValue={r.timezone} onBlur={(e) => isValidTimeZone(e.target.value) && saveSettings({ reminder: { ...r, timezone: e.target.value } })} />
            )}
          </Field>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13px]">
              <div className="font-medium">Notifications on this device</div>
              <div className="mt-0.5 text-mute">
                {support?.permission === 'granted'
                  ? subscribed
                    ? 'Push enabled — reminders arrive even when the app is closed.'
                    : 'Allowed — reminders appear while CADENCE is open or in the background.'
                  : support?.permission === 'denied'
                    ? 'Blocked — enable notifications for CADENCE in system settings.'
                    : support?.permission === 'unsupported'
                      ? 'This browser does not support notifications.'
                      : 'Not enabled yet.'}
              </div>
            </div>
            <div className="flex gap-2">
              {support?.permission !== 'granted' || (pushPossible && !subscribed) ? (
                <Button size="sm" variant="primary" icon={<BellRing className="size-3.5" />} loading={busy} disabled={support?.permission === 'denied' || support?.permission === 'unsupported' || (support?.needsInstall ?? false)} onClick={enableNotifications}>
                  Enable
                </Button>
              ) : null}
              {support?.permission === 'granted' && (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      if (subscribed) await sendTestPush();
                      else await showLocalNotification('CADENCE test reminder', 'Notifications are working. Trade with intention.', '/');
                      toast({ tone: 'success', title: 'Test notification sent' });
                    } catch (e) {
                      toast({ tone: 'error', title: 'Test failed', body: e instanceof Error ? e.message : undefined });
                    }
                  }}
                >
                  Send test
                </Button>
              )}
              {subscribed && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await unsubscribePush();
                    setSubscribed(false);
                  }}
                >
                  Disable push
                </Button>
              )}
            </div>
          </div>
          {support?.needsInstall && (
            <Notice tone="violet" icon={<Smartphone className="size-4 text-violet" />} className="mt-3" title="On iPhone, install CADENCE first">
              iOS only delivers web notifications to apps added to the Home Screen (iOS 16.4+). Tap <Share className="inline size-3.5" /> Share → “Add to Home Screen”, open CADENCE from the icon, then enable reminders here.
            </Notice>
          )}
          {!cfg?.push && support?.permission === 'granted' && (
            <p className="mt-3 text-[12px] text-faint">Server push isn’t configured on this deployment (VAPID keys + Supabase). Reminders run in-app while CADENCE is open or backgrounded.</p>
          )}
          {cfg?.push && !user && <p className="mt-3 text-[12px] text-faint">Sign in to receive reminders when the app is closed.</p>}
        </div>
      </div>
    </Section>
  );
}

function InstallSection() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  useEffect(() => {
    setSupport(pushSupport());
    const h = (e: Event) => {
      e.preventDefault();
      setPrompt(e as never);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  return (
    <Section icon={<Smartphone className="size-4" />} title="Install the app" description="Full-screen, offline-ready, with the CADENCE icon on your Home Screen.">
      <div className="flex items-center gap-5">
        <AppIcon size={72} />
        <div className="text-[13px] text-mute">
          {isArtifactRuntime ? (
            <span>This is a preview hosted on claude.ai. Deploy CADENCE (see the README) to install it on your Home Screen.</span>
          ) : support?.standalone ? (
            <span className="text-pos">Installed — you’re running CADENCE as an app.</span>
          ) : support?.ios ? (
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Open this page in <span className="text-fg">Safari</span>.
              </li>
              <li>
                Tap <Share className="inline size-3.5" /> <span className="text-fg">Share</span> → <span className="text-fg">Add to Home Screen</span>.
              </li>
              <li>Launch CADENCE from the new icon.</li>
            </ol>
          ) : prompt ? (
            <Button
              variant="primary"
              icon={<Download className="size-4" />}
              onClick={async () => {
                await prompt.prompt();
                await prompt.userChoice;
                setPrompt(null);
              }}
            >
              Install CADENCE
            </Button>
          ) : (
            <span>Use your browser’s menu → “Install app” / “Add to Home screen”.</span>
          )}
        </div>
      </div>
      <p className="mt-4 text-[12px] text-faint">CADENCE is a Progressive Web App. A native iOS build for the App Store is planned; it is not published yet.</p>
    </Section>
  );
}

function AiSection() {
  const cfg = useServerConfig();
  return (
    <Section icon={<Bot className="size-4" />} title="AI" description="Screenshot analysis, trade reviews and the performance coach.">
      {!cfg ? (
        <div className="skeleton h-12" />
      ) : cfg.ai && isArtifactRuntime ? (
        <div className="space-y-2 text-[13px]">
          <Badge tone="pos">Available</Badge>
          <p className="text-mute">In this preview, AI runs on your own Claude account. Claude asks for your permission the first time a feature uses it.</p>
        </div>
      ) : cfg.ai ? (
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center gap-2">
            <Badge tone="pos">Connected</Badge>
            <span className="text-mute">Model</span>
            <span className="num text-fg">{cfg.model}</span>
          </div>
          <p className="text-mute">Requests run on the CADENCE server; the API key is never sent to your device. Coach reports use aggregated statistics only.</p>
        </div>
      ) : isArtifactRuntime ? (
        <Notice tone="warn" title="Not available in this view">Open the page on claude.ai while signed in to use AI features.</Notice>
      ) : (
        <Notice tone="warn" title="Not configured">
          {cfg.aiAccess === 'disabled' && !cfg.supabase ? 'Set ANTHROPIC_API_KEY plus Supabase sign-in, or CADENCE_AI_ALLOW_ANONYMOUS=true for a private single-user deployment.' : 'Set ANTHROPIC_API_KEY on the server to enable AI features.'}
        </Notice>
      )}
    </Section>
  );
}

function SyncSection() {
  const auth = useAuth();
  const s = useSyncState();
  const toast = useToast();
  const [confirmOut, setConfirmOut] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section icon={<Cloud className="size-4" />} title="Account & sync" description={auth.enabled ? 'Your journal syncs privately across devices.' : 'Cloud sync is not configured for this deployment.'}>
      {auth.enabled && auth.user ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <div>
              <div className="text-mute">Signed in as</div>
              <div className="font-medium">{auth.user.email}</div>
            </div>
            <SyncBadge />
          </div>
          {s.error && <Notice tone="neg">{s.error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={async () => (await sync.syncNow()) && toast({ tone: 'success', title: 'Synced' })} loading={s.status === 'syncing'}>
              Sync now
            </Button>
            <Button size="sm" variant="ghost" icon={<LogOut className="size-3.5" />} onClick={() => setConfirmOut(true)}>
              Sign out
            </Button>
          </div>
          {s.lastSyncedAt && <div className="text-[12px] text-faint">Last synced {new Date(s.lastSyncedAt).toLocaleString()}</div>}
          <ConfirmDialog
            open={confirmOut}
            title="Sign out of CADENCE?"
            body={s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} haven’t synced yet. CADENCE will try to sync before signing out; local data on this device is then cleared.` : 'Your journal stays in your account. Local data on this device is cleared for privacy.'}
            confirmLabel="Sign out"
            loading={busy}
            onClose={() => setConfirmOut(false)}
            onConfirm={async () => {
              setBusy(true);
              await auth.signOut();
              setBusy(false);
              location.href = '/login';
            }}
          />
        </div>
      ) : auth.enabled ? (
        <div className="space-y-3 text-[13px] text-mute">
          <p>You’re using CADENCE on this device only. Sign in to back up and sync — trades recorded here will be added to your account.</p>
          <Link href="/login">
            <Button size="sm" variant="primary" icon={<LogIn className="size-3.5" />}>
              Sign in or create account
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2 text-[13px] text-mute">
          <p>
            {isArtifactRuntime
              ? 'Preview: your entries are stored in this browser only. Use Backup below to keep a copy you can restore into your own CADENCE deployment.'
              : 'Data is stored in this browser (IndexedDB) and works offline. Use Backup below to keep a copy. To enable accounts and sync, configure Supabase (see README).'}
          </p>
        </div>
      )}
    </Section>
  );
}

function InstrumentSection() {
  const s = useSettings();
  const instruments = useInstruments();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Instrument>({ symbol: '', name: '', tick_size: 0.25, tick_value: 1.25, commission_rt: null });
  const [err, setErr] = useState<string | null>(null);
  const shown = [...instruments].sort((a, b) => {
    const ai = CORE_SYMBOLS.indexOf(a.symbol);
    const bi = CORE_SYMBOLS.indexOf(b.symbol);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.symbol.localeCompare(b.symbol);
  });
  const setCommission = (symbol: string, value: number | null) => {
    const rest = s.instruments.filter((i) => i.symbol !== symbol);
    const base = instruments.find((i) => i.symbol === symbol)!;
    const existing = s.instruments.find((i) => i.symbol === symbol);
    saveSettings({ instruments: [...rest, { ...(existing ?? { symbol, name: base.name, tick_size: base.tick_size, tick_value: base.tick_value }), commission_rt: value }] });
  };
  return (
    <Section icon={<Layers className="size-4" />} title="Instruments & commissions" description="CME specifications are built in. Commissions are never assumed — enter your round-turn cost per contract.">
      <div className="-mx-2 max-h-[380px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-ink-800/95 text-left text-[11px] uppercase tracking-wider text-faint backdrop-blur">
            <tr>
              <th className="px-2 py-2 font-medium">Symbol</th>
              <th className="px-2 py-2 font-medium">Tick</th>
              <th className="px-2 py-2 font-medium">$/pt</th>
              <th className="px-2 py-2 font-medium">Fees RT / contract</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.symbol} className="border-t border-white/[0.04]">
                <td className="px-2 py-2">
                  <div className="font-medium">{i.symbol}</div>
                  <div className="text-[11px] text-faint">{i.name}</div>
                </td>
                <td className="num px-2 py-2 text-mute">
                  {i.tick_size} = {money(i.tick_value)}
                </td>
                <td className="num px-2 py-2 text-mute">{money(i.tick_value / i.tick_size)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <NumberInput value={i.commission_rt ?? null} onChange={(v) => setCommission(i.symbol, v)} min={0} placeholder="Not set" className="h-9 w-24 py-0 text-sm" aria-label={`${i.symbol} commission`} />
                    {!i.builtin && (
                      <button className="p-1 text-faint hover:text-neg" aria-label={`Remove ${i.symbol}`} onClick={() => saveSettings({ instruments: s.instruments.filter((x) => x.symbol !== i.symbol) })}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding ? (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] p-4 md:grid-cols-4">
          <Field label="Symbol" htmlFor="ni-s">
            <Input id="ni-s" value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase().slice(0, 12) })} placeholder="MBT" />
          </Field>
          <Field label="Name" htmlFor="ni-n">
            <Input id="ni-n" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Micro Bitcoin" />
          </Field>
          <Field label="Tick size" htmlFor="ni-ts">
            <NumberInput id="ni-ts" value={draft.tick_size} onChange={(v) => setDraft({ ...draft, tick_size: v ?? 0 })} min={0} />
          </Field>
          <Field label="Tick value ($)" htmlFor="ni-tv">
            <NumberInput id="ni-tv" value={draft.tick_value} onChange={(v) => setDraft({ ...draft, tick_value: v ?? 0 })} min={0} />
          </Field>
          <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-4">
            <span className="text-[12px] text-neg">{err}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} icon={<X className="size-3.5" />}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  if (!/^[A-Z0-9]{1,12}$/.test(draft.symbol)) return setErr('Symbol: letters and digits only.');
                  if (instruments.some((i) => i.symbol === draft.symbol)) return setErr('That symbol already exists.');
                  if (!(draft.tick_size > 0) || !(draft.tick_value > 0)) return setErr('Tick size and value must be positive.');
                  saveSettings({ instruments: [...s.instruments, { ...draft, name: draft.name || draft.symbol, builtin: false }] });
                  setAdding(false);
                  setErr(null);
                  setDraft({ symbol: '', name: '', tick_size: 0.25, tick_value: 1.25, commission_rt: null });
                }}
              >
                Add instrument
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button size="sm" className="mt-4" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
          Add futures instrument
        </Button>
      )}
    </Section>
  );
}

function SetupSection() {
  const s = useSettings();
  const [v, setV] = useState('');
  const add = () => {
    const name = v.trim();
    if (!name || s.setups.includes(name)) return;
    saveSettings({ setups: [...s.setups, name] });
    setV('');
  };
  return (
    <Section icon={<Palette className="size-4" />} title="Setups" description="Your playbook — used for tagging and per-setup analytics.">
      <div className="flex flex-wrap gap-2">
        {s.setups.map((x) => (
          <Chip key={x} selected onClick={() => saveSettings({ setups: s.setups.filter((y) => y !== x) })} icon={<X className="size-3" />}>
            {x}
          </Chip>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a setup" aria-label="New setup" />
        <Button onClick={add} icon={<Plus className="size-4" />}>
          Add
        </Button>
      </div>
    </Section>
  );
}

function DataSection() {
  const trades = useTrades();
  const accounts = useAccounts();
  const auth = useAuth();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Section icon={<Database className="size-4" />} title="Data" description="Export, back up and restore your journal.">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          icon={<FileSpreadsheet className="size-4" />}
          disabled={!trades?.length}
          onClick={async () => {
            if (!trades || !accounts) return;
            try {
              await downloadBlob(new Blob([tradesToCsv(trades, accounts)], { type: 'text/csv;charset=utf-8' }), `cadence-trades-${stamp}.csv`);
            } catch (e) {
              toast({ tone: 'error', title: 'Export failed', body: e instanceof Error ? e.message : undefined });
            }
          }}
        >
          Export CSV
        </Button>
        <Button
          icon={<FileJson className="size-4" />}
          loading={busy === 'backup'}
          onClick={async () => {
            setBusy('backup');
            try {
              await downloadBlob(await exportBackup(true), `cadence-backup-${stamp}.json`);
            } catch (e) {
              toast({ tone: 'error', title: 'Backup failed', body: e instanceof Error ? e.message : undefined });
            } finally {
              setBusy(null);
            }
          }}
        >
          Full backup
        </Button>
        <Button icon={<Upload className="size-4" />} loading={busy === 'restore'} onClick={() => file.current?.click()}>
          Restore
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy('restore');
          try {
            const r = await restoreBackup(f, auth.user?.id ?? null);
            toast({ tone: 'success', title: 'Backup restored', body: `${r.added} added · ${r.updated} updated · ${r.skipped} unchanged · ${r.images} screenshots` });
          } catch (err) {
            toast({ tone: 'error', title: 'Restore failed', body: err instanceof Error ? err.message : undefined });
          } finally {
            setBusy(null);
            e.target.value = '';
          }
        }}
      />
      <p className="mt-3 text-[12px] text-faint">Backups include trades, journals, AI reviews, accounts, settings and screenshots. Restoring merges — newer edits win and nothing is deleted.</p>
    </Section>
  );
}

function BrandLink() {
  return (
    <Link href="/brand" className={cn('panel flex items-center gap-4 p-5 transition hover:border-white/[0.12]')}>
      <span className="grid size-11 place-items-center rounded-xl bg-white/[0.04] text-violet">
        <Palette className="size-5" />
      </span>
      <span className="flex-1">
        <span className="block font-display text-[15px] font-semibold">Brand & logo assets</span>
        <span className="block text-[13px] text-mute">Symbol, wordmark, app icons and palette</span>
      </span>
      <ChevronRight className="size-5 text-faint" />
    </Link>
  );
}
