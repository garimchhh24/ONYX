'use client';

import { BadgeCheck, CircleUserRound, Info, Pencil, Plus, Scale, ShieldAlert, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, PnlText } from '@/components/trades/parts';
import { Badge, Button, Card, cn, Field, IconButton, Input, Notice, NumberInput, ProgressBar, Select, Skeleton, Textarea } from '@/components/ui/core';
import { Item, Stagger } from '@/components/ui/motion';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlay';
import { blankAccount, deleteAccount, saveAccount, saveSettings, useAccounts, useSettings, useTrades } from '@/lib/data/repo';
import { accountMetrics, DRAWDOWN_LABEL, PHASE_LABEL, reconcileAdjustment, STATUS_LABEL, type AccountMetrics } from '@/lib/domain/accounts';
import { fmtPct, money } from '@/lib/domain/format';
import { useToday } from '@/lib/hooks/useToday';
import type { Account } from '@/lib/types';

export default function AccountsPage() {
  const accounts = useAccounts();
  const trades = useTrades();
  const settings = useSettings();
  const today = useToday();
  const toast = useToast();
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [reconciling, setReconciling] = useState<Account | null>(null);

  const metrics = useMemo(() => (accounts && trades ? accounts.map((a) => accountMetrics(a, trades, today)) : []), [accounts, trades, today]);

  if (!accounts || !trades) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Accounts"
        subtitle="Your Lucid Trading accounts and the rules you trade them under."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blankAccount({ name: `Lucid ${accounts.length + 1}` }))}>
            Add account
          </Button>
        }
      />
      <Notice tone="neutral" icon={<Info className="size-4 text-violet" />} className="mb-5">
        CADENCE does not connect to Lucid Trading or your broker — there is no supported public API. Balances are calculated from the trades you journal; use <span className="text-fg">Reconcile</span> to match your platform balance. Rules are entered by you and labelled as user-provided until you mark them verified against Lucid’s official documentation.
      </Notice>
      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            title="No accounts yet"
            body="Add your Lucid evaluation or funded account to track drawdown, daily loss limits, targets and remaining risk."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blankAccount({ name: 'Lucid 50K' }))}>
                Add your first account
              </Button>
            }
          />
        </Card>
      ) : (
        <Stagger className="grid gap-5 lg:grid-cols-2">
          {metrics.map((m) => (
            <Item key={m.account.id}>
              <AccountCard
                m={m}
                isDefault={settings.default_account_id === m.account.id}
                onEdit={() => setEditing(m.account)}
                onDelete={() => setDeleting(m.account)}
                onReconcile={() => setReconciling(m.account)}
                onDefault={() => saveSettings({ default_account_id: settings.default_account_id === m.account.id ? null : m.account.id })}
              />
            </Item>
          ))}
        </Stagger>
      )}

      {editing && (
        <AccountForm
          account={editing}
          isNew={!accounts.some((x) => x.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (a) => {
            await saveAccount(a);
            setEditing(null);
            toast({ tone: 'success', title: 'Account saved' });
          }}
        />
      )}
      {reconciling && (
        <ReconcileSheet
          account={reconciling}
          onClose={() => setReconciling(null)}
          onApply={async (adj) => {
            await saveAccount({ ...reconciling, balance_adjustment: adj });
            setReconciling(null);
            toast({ tone: 'success', title: 'Balance reconciled' });
          }}
          trades={trades}
          today={today}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        body="Trades stay in your journal but will no longer be linked to this account."
        confirmLabel="Delete account"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteAccount(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] text-faint">{label}</div>
      <div className="num mt-0.5 text-[15px] font-medium">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function AccountCard({ m, isDefault, onEdit, onDelete, onReconcile, onDefault }: { m: AccountMetrics; isDefault: boolean; onEdit: () => void; onDelete: () => void; onReconcile: () => void; onDefault: () => void }) {
  const a = m.account;
  const levelColor = { ok: 'bg-pos', warn: 'bg-warn', danger: 'bg-neg', done: 'bg-violet' }[m.level];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', levelColor)} />
            <h3 className="truncate font-display text-[17px] font-semibold tracking-tight">{a.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-mute">
            <span>{a.firm}</span>
            {a.plan && <span>· {a.plan}</span>}
            <Badge>{PHASE_LABEL[a.phase]}</Badge>
            <Badge tone={a.status === 'breached' ? 'neg' : a.status === 'active' ? 'neutral' : 'violet'}>{STATUS_LABEL[a.status]}</Badge>
            {isDefault && <Badge tone="violet">Default</Badge>}
          </div>
        </div>
        <div className="flex">
          <IconButton label="Edit account" onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="Delete account" className="hover:text-neg" onClick={onDelete}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="eyebrow text-[9.5px]">Account equity</div>
          <div className="num mt-1 text-[28px] font-semibold leading-none">{money(m.balance)}</div>
        </div>
        <div className="text-right text-[12.5px]">
          <div className="text-faint">Today</div>
          <PnlText value={m.todayPnl} className="text-[15px] font-medium" />
        </div>
      </div>
      <p className={cn('mt-2 text-[12.5px]', m.level === 'danger' ? 'text-neg' : m.level === 'warn' ? 'text-warn' : 'text-mute')}>{m.headline}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.05] pt-4">
        <Metric label="Realized P&L" value={<PnlText value={m.realized} />} sub={`${m.trades} trades`} />
        <Metric label="Remaining risk today" value={m.riskAllowance !== null ? money(m.riskAllowance) : '—'} sub={m.riskAllowance === null ? 'set limits' : 'smallest limit'} />
        <Metric label="Threshold" value={m.threshold !== null ? money(m.threshold, { cents: false }) : '—'} sub={m.thresholdLocked ? 'locked' : a.max_drawdown ? DRAWDOWN_LABEL[a.drawdown_type].split(' ')[0] : 'no max DD'} />
      </div>

      <div className="mt-4 space-y-3">
        {m.drawdownUsed !== null && (
          <Bar label="Drawdown utilization" right={`${Math.round(m.drawdownUsed * 100)}% · ${money(m.drawdownRoom, { cents: false })} left`} value={m.drawdownUsed} tone={m.drawdownUsed >= 0.75 ? 'neg' : m.drawdownUsed >= 0.5 ? 'warn' : 'violet'} />
        )}
        {m.dailyRoom !== null && a.daily_loss_limit && (
          <Bar label="Daily loss limit" right={`${money(Math.max(0, m.dailyRoom), { cents: false })} of ${money(a.daily_loss_limit, { cents: false })} left`} value={1 - Math.max(0, m.dailyRoom) / a.daily_loss_limit} tone={m.dailyRoom <= 0 ? 'neg' : 'warn'} />
        )}
        {m.targetProgress !== null && <Bar label="Profit target" right={`${fmtPct(m.targetProgress * 100, 0)} · ${money(m.targetLeft, { cents: false })} to go`} value={m.targetProgress} tone="pos" />}
        {m.payoutProgress !== null && <Bar label="Payout target" right={`${fmtPct(m.payoutProgress * 100, 0)} · ${money(m.payoutLeft, { cents: false })} to go`} value={m.payoutProgress} tone="violet" />}
        {m.consistency !== null && a.consistency_pct && (
          <div className="flex justify-between text-[12px]">
            <span className="text-mute">Consistency (best day ÷ profit)</span>
            <span className={cn('num', m.consistencyOk ? 'text-pos' : 'text-warn')}>
              {m.consistency.toFixed(0)}% / max {a.consistency_pct}%
            </span>
          </div>
        )}
        {a.min_trading_days && (
          <div className="flex justify-between text-[12px]">
            <span className="text-mute">Trading days</span>
            <span className={cn('num', m.tradingDays >= a.min_trading_days ? 'text-pos' : 'text-fg')}>
              {m.tradingDays} / {a.min_trading_days}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
        {a.rules_source === 'verified' ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-pos" title={a.rules_reference ?? undefined}>
            <BadgeCheck className="size-3.5" /> Rules checked against official docs{a.rules_verified_at ? ` · ${a.rules_verified_at}` : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-warn">
            <CircleUserRound className="size-3.5" /> User-provided rules — verify with Lucid
          </span>
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDefault}>
            {isDefault ? 'Unset default' : 'Make default'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Scale className="size-3.5" />} onClick={onReconcile}>
            Reconcile
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Bar({ label, right, value, tone }: { label: string; right: string; value: number; tone: 'violet' | 'pos' | 'neg' | 'warn' }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-3 text-[12px]">
        <span className="text-mute">{label}</span>
        <span className="num text-right text-chrome/90">{right}</span>
      </div>
      <ProgressBar value={value} tone={tone} label={label} />
    </div>
  );
}

function AccountForm({ account, isNew, onClose, onSave }: { account: Account; isNew: boolean; onClose: () => void; onSave: (a: Account) => Promise<void> }) {
  const [a, setA] = useState<Account>(account);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Account>(k: K, v: Account[K]) => setA((x) => ({ ...x, [k]: v }));
  const num = (k: keyof Account, label: string, hint?: string) => (
    <Field label={label} hint={hint} htmlFor={`a-${String(k)}`}>
      <NumberInput id={`a-${String(k)}`} value={a[k] as number | null} onChange={(v) => set(k, v as never)} min={0} placeholder="Not set" />
    </Field>
  );
  const submit = async () => {
    if (!a.name.trim()) return setErr('Give the account a name.');
    if (!Number.isFinite(a.starting_balance) || a.starting_balance <= 0) return setErr('Starting balance must be positive.');
    if (a.rules_source === 'verified' && !a.rules_verified_at) return setErr('Add the date you verified the rules.');
    setBusy(true);
    try {
      await onSave({ ...a, name: a.name.trim() });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'New account' : `Edit ${account.name}`}
      description="All rules are optional and come from you — CADENCE never hardcodes prop firm rules."
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-neg">{err}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={busy}>
              Save account
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account name" className="col-span-2 md:col-span-1" htmlFor="a-name">
            <Input id="a-name" value={a.name} onChange={(e) => set('name', e.target.value)} placeholder="Lucid 50K #1" />
          </Field>
          <Field label="Firm" className="col-span-2 md:col-span-1" htmlFor="a-firm">
            <Input id="a-firm" value={a.firm} onChange={(e) => set('firm', e.target.value)} />
          </Field>
          <Field label="Account type / plan" hint="As named by your firm" htmlFor="a-plan">
            <Input id="a-plan" value={a.plan ?? ''} onChange={(e) => set('plan', e.target.value || null)} placeholder="e.g. 50K evaluation" />
          </Field>
          <Field label="Phase" htmlFor="a-phase">
            <Select id="a-phase" value={a.phase} onChange={(e) => set('phase', e.target.value as Account['phase'])}>
              {Object.entries(PHASE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          {num('size', 'Account size ($)')}
          <Field label="Starting balance ($)" htmlFor="a-start">
            <NumberInput id="a-start" value={a.starting_balance} onChange={(v) => set('starting_balance', v ?? 0)} min={0} />
          </Field>
          <Field label="Status" htmlFor="a-status">
            <Select id="a-status" value={a.status} onChange={(e) => set('status', e.target.value as Account['status'])}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Balance adjustment ($)" hint="Payouts, resets, corrections (+/−)" htmlFor="a-adj">
            <NumberInput id="a-adj" value={a.balance_adjustment} onChange={(v) => set('balance_adjustment', v ?? 0)} />
          </Field>
        </div>

        <div>
          <h4 className="eyebrow mb-3 flex items-center gap-2">
            <ShieldAlert className="size-3.5" /> Risk rules
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {num('max_drawdown', 'Maximum drawdown ($)')}
            <Field label="Drawdown type" htmlFor="a-ddt">
              <Select id="a-ddt" value={a.drawdown_type} onChange={(e) => set('drawdown_type', e.target.value as Account['drawdown_type'])}>
                {Object.entries(DRAWDOWN_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            {num('drawdown_lock', 'Trailing stops at balance ($)', 'Leave empty if it never locks')}
            {num('daily_loss_limit', 'Daily loss limit ($)')}
            {num('profit_target', 'Profit target ($)')}
            {num('payout_target', 'Payout target — profit ($)')}
            {num('min_trading_days', 'Minimum trading days')}
            {num('consistency_pct', 'Consistency — best day ≤ % of profit')}
          </div>
        </div>

        <div>
          <h4 className="eyebrow mb-3">Personal limits</h4>
          <div className="grid grid-cols-2 gap-3">
            {num('personal_daily_risk', 'Max loss per day ($)', 'Your own stop for the day')}
            {num('personal_trade_risk', 'Max risk per trade ($)')}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] p-4">
          <h4 className="eyebrow mb-3">Rule source</h4>
          <div className="grid grid-cols-2 gap-2">
            {(['user', 'verified'] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => set('rules_source', src)}
                className={cn('rounded-xl border p-3 text-left text-[13px] transition', a.rules_source === src ? 'border-violet/50 bg-electric/15' : 'border-white/[0.08] hover:border-white/[0.15]')}
              >
                <div className="font-medium">{src === 'user' ? 'User-provided' : 'Verified against official rules'}</div>
                <div className="mt-0.5 text-[12px] text-mute">{src === 'user' ? 'Typed in from memory or a summary' : 'You checked Lucid’s current official documentation'}</div>
              </button>
            ))}
          </div>
          {a.rules_source === 'verified' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Verified on" htmlFor="a-vdate">
                <Input id="a-vdate" type="date" value={a.rules_verified_at ?? ''} onChange={(e) => set('rules_verified_at', e.target.value || null)} />
              </Field>
              <Field label="Source (URL or document)" htmlFor="a-vref">
                <Input id="a-vref" value={a.rules_reference ?? ''} onChange={(e) => set('rules_reference', e.target.value || null)} placeholder="https://…" />
              </Field>
            </div>
          )}
        </div>

        <Field label="Notes" htmlFor="a-notes">
          <Textarea id="a-notes" value={a.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
        </Field>
      </div>
    </Sheet>
  );
}

function ReconcileSheet({ account, onClose, onApply, trades, today }: { account: Account; onClose: () => void; onApply: (adj: number) => Promise<void>; trades: ReturnType<typeof useTrades>; today: string }) {
  const [platform, setPlatform] = useState<number | null>(null);
  const adj = platform !== null && trades ? reconcileAdjustment(account, trades, platform, today) : null;
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title="Reconcile balance"
      description={`Match ${account.name} with the balance shown on your platform.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={adj === null} onClick={() => adj !== null && onApply(adj)}>
            Apply adjustment
          </Button>
        </div>
      }
    >
      <Field label="Current platform balance ($)" htmlFor="rec-bal">
        <NumberInput id="rec-bal" value={platform} onChange={setPlatform} min={0} />
      </Field>
      {adj !== null && (
        <p className="mt-3 text-[13px] text-mute">
          Adjustment of <span className={cn('num', adj >= 0 ? 'text-pos' : 'text-neg')}>{money(adj, { signed: true })}</span> covers fees, payouts or trades not in your journal.
        </p>
      )}
      <p className="mt-4 text-[12px] text-faint">
        Prefer journaling every trade — <Link href="/journal" className="text-violet">see your journal</Link>.
      </p>
    </Sheet>
  );
}
