'use client';

import { ChevronDown, CircleAlert, Eye, Lightbulb, PenLine, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { enrichTrade } from '@/lib/domain/calc';
import { fmtNum, fmtPrice, fmtR, money } from '@/lib/domain/format';
import { CONCEPTS, TIMEFRAMES } from '@/lib/domain/questionnaire';
import { formatDuration, fromLocalInput, toLocalInput } from '@/lib/domain/time';
import { validateTrade } from '@/lib/domain/validate';
import type { Account, FieldMeta, Instrument, Trade } from '@/lib/types';
import { Card, Chip, cn, Field, Input, NumberInput, Segmented, Select, Textarea } from '../ui/core';
import { PnlText } from './parts';

export type MetaMap = Record<string, FieldMeta>;

export function confidenceLevel(m: FieldMeta): 'high' | 'medium' | 'low' {
  return m.confidence >= 0.85 ? 'high' : m.confidence >= 0.6 ? 'medium' : 'low';
}

export function ConfidenceBadge({ meta }: { meta?: FieldMeta }) {
  if (!meta) return null;
  if (meta.source === 'user') {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-mute" title="Edited by you">
        <PenLine className="size-3" /> Edited
      </span>
    );
  }
  const lvl = confidenceLevel(meta);
  const color = { high: 'text-pos', medium: 'text-warn', low: 'text-neg' }[lvl];
  const icon = meta.source === 'visible' ? <Eye className="size-3" /> : meta.source === 'calculated' ? <span className="text-[10px]">ƒ</span> : <Lightbulb className="size-3" />;
  const sourceLabel = meta.source === 'visible' ? 'Visible' : meta.source === 'calculated' ? 'Calculated' : 'Inferred';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10.5px] font-medium', color)} title={meta.evidence ? `${sourceLabel}: ${meta.evidence}` : sourceLabel}>
      {icon}
      {sourceLabel} · {Math.round(meta.confidence * 100)}%
    </span>
  );
}

interface Props {
  value: Trade;
  /** Receives functional updates so rapid edits never overwrite each other. */
  onChange: (update: (prev: Trade) => Trade) => void;
  accounts: Account[];
  instruments: Instrument[];
  setups: string[];
  meta?: MetaMap;
  onMetaChange?: (m: MetaMap) => void;
  showErrors?: boolean;
}

export function TradeForm({ value: t, onChange, accounts, instruments, setups, meta, onMetaChange, showErrors }: Props) {
  const [advanced, setAdvanced] = useState(Boolean(t.gross_pnl !== null || t.net_pnl !== null || t.risk_amount !== null));
  const v = useMemo(() => validateTrade(t, instruments), [t, instruments]);
  const err = (k: string) => (showErrors ? v.errors[k] : undefined);

  const set = <K extends keyof Trade>(k: K, val: Trade[K]) => {
    onChange((prev) => ({ ...prev, [k]: val }));
    if (meta?.[k as string] && meta[k as string].source !== 'user') onMetaChange?.({ ...meta, [k]: { ...meta[k as string], source: 'user', confidence: 1, needs_review: false } });
  };
  const attention = (k: string) => Boolean(meta?.[k]?.needs_review && meta[k].source !== 'user');
  const label = (text: string, k: string): ReactNode => (
    <span className="flex items-center gap-2">
      {text}
      {attention(k) && <CircleAlert className="size-3.5 text-warn" aria-label="Please confirm" />}
    </span>
  );
  const aside = (k: string) => <ConfidenceBadge meta={meta?.[k]} />;

  const symbols = useMemo(() => {
    const list = [...instruments].sort((a, b) => Number(!!b.builtin) - Number(!!a.builtin));
    if (t.symbol && !list.some((i) => i.symbol === t.symbol)) list.unshift({ symbol: t.symbol, name: 'Unknown — add in Settings', tick_size: 1, tick_value: 0 });
    return list;
  }, [instruments, t.symbol]);
  const setupOptions = useMemo(() => [...new Set([...setups, ...(t.setup ? [t.setup] : [])])], [setups, t.setup]);
  const [customSetup, setCustomSetup] = useState(false);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Section title="Trade">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Account" className="col-span-2" htmlFor="f-account">
              <Select id="f-account" value={t.account_id ?? ''} onChange={(e) => set('account_id', e.target.value || null)}>
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.firm}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={label('Instrument', 'symbol')} aside={aside('symbol')} error={err('symbol')} htmlFor="f-symbol">
              <Select id="f-symbol" value={t.symbol} onChange={(e) => set('symbol', e.target.value)} attention={attention('symbol')} aria-invalid={!!err('symbol')}>
                {symbols.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} — {i.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={label('Contract', 'contract')} aside={aside('contract')} htmlFor="f-contract">
              <Input id="f-contract" value={t.contract ?? ''} onChange={(e) => set('contract', e.target.value.toUpperCase() || null)} placeholder={`${t.symbol}Z6`} attention={attention('contract')} />
            </Field>
            <Field label={label('Direction', 'direction')} aside={aside('direction')} className="col-span-2">
              <Segmented
                className="w-full"
                value={t.direction}
                onChange={(d) => set('direction', d)}
                options={[
                  { value: 'long', label: 'Long' },
                  { value: 'short', label: 'Short' },
                ]}
              />
            </Field>
            <Field label={label('Contracts', 'contracts')} aside={aside('contracts')} error={err('contracts')} className="col-span-2 md:col-span-1" htmlFor="f-qty">
              <NumberInput id="f-qty" value={t.contracts} onChange={(n) => set('contracts', n ?? 0)} min={0} step={1} inputMode="numeric" attention={attention('contracts')} />
            </Field>
          </div>
        </Section>

        <Section title="Execution">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                ['entry_price', 'Entry price'],
                ['exit_price', 'Exit price'],
                ['stop_loss', 'Stop loss'],
                ['take_profit', 'Take profit'],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={label(l, k)} aside={aside(k)} error={err(k)} htmlFor={`f-${k}`}>
                <NumberInput id={`f-${k}`} value={t[k]} onChange={(n) => set(k, n)} step={t.symbol ? instruments.find((i) => i.symbol === t.symbol)?.tick_size : undefined} attention={attention(k)} />
              </Field>
            ))}
            <Field label={label('Entry time', 'entry_time')} aside={aside('entry_time')} error={err('entry_time')} className="col-span-2" htmlFor="f-entry-time">
              <Input id="f-entry-time" type="datetime-local" value={toLocalInput(t.entry_time)} onChange={(e) => set('entry_time', fromLocalInput(e.target.value))} attention={attention('entry_time')} />
            </Field>
            <Field label={label('Exit time', 'exit_time')} aside={aside('exit_time')} error={err('exit_time')} className="col-span-2" htmlFor="f-exit-time">
              <Input id="f-exit-time" type="datetime-local" value={toLocalInput(t.exit_time)} onChange={(e) => set('exit_time', fromLocalInput(e.target.value))} attention={attention('exit_time')} />
            </Field>
          </div>
        </Section>

        <Section title="Costs & platform values">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field
              label={label('Commission & fees ($)', 'commission')}
              aside={aside('commission')}
              error={err('commission')}
              hint={t.commission === null ? commissionHint(t, instruments) : 'Total for this trade'}
              className="col-span-2"
              htmlFor="f-commission"
            >
              <NumberInput id="f-commission" value={t.commission} onChange={(n) => set('commission', n)} min={0} placeholder="Not set" attention={attention('commission')} />
            </Field>
            <button type="button" onClick={() => setAdvanced((a) => !a)} className="col-span-2 flex items-center gap-1.5 self-end pb-3 text-[12.5px] text-mute hover:text-fg">
              <ChevronDown className={cn('size-4 transition', advanced && 'rotate-180')} /> Platform P&L & risk override
            </button>
            <AnimatePresence initial={false}>
              {advanced && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="col-span-2 grid grid-cols-2 gap-3 overflow-hidden md:col-span-4 md:grid-cols-3">
                  <Field label={label('Gross P&L shown ($)', 'gross_pnl')} aside={aside('gross_pnl')} hint="Used only if prices are missing" htmlFor="f-gross">
                    <NumberInput id="f-gross" value={t.gross_pnl} onChange={(n) => set('gross_pnl', n)} attention={attention('gross_pnl')} />
                  </Field>
                  <Field label={label('Net P&L shown ($)', 'net_pnl')} aside={aside('net_pnl')} hint="Used only if it can’t be calculated" htmlFor="f-net">
                    <NumberInput id="f-net" value={t.net_pnl} onChange={(n) => set('net_pnl', n)} attention={attention('net_pnl')} />
                  </Field>
                  <Field label={label('Planned risk ($)', 'risk_amount')} aside={aside('risk_amount')} error={err('risk_amount')} hint="Overrides stop-based risk" className="col-span-2 md:col-span-1" htmlFor="f-risk">
                    <NumberInput id="f-risk" value={t.risk_amount} onChange={(n) => set('risk_amount', n)} min={0} attention={attention('risk_amount')} />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>

        <Section title="Strategy">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label={label('Setup', 'setup')} aside={aside('setup')} className="col-span-2" htmlFor="f-setup">
              {customSetup ? (
                <Input id="f-setup" autoFocus value={t.setup ?? ''} onChange={(e) => set('setup', e.target.value || null)} onBlur={() => setCustomSetup(false)} placeholder="Name this setup" />
              ) : (
                <Select
                  id="f-setup"
                  value={t.setup ?? ''}
                  attention={attention('setup')}
                  onChange={(e) => {
                    if (e.target.value === '__custom') setCustomSetup(true);
                    else set('setup', e.target.value || null);
                  }}
                >
                  <option value="">No setup</option>
                  {setupOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="__custom">+ Custom…</option>
                </Select>
              )}
            </Field>
            <Field label={label('Timeframe', 'timeframe')} aside={aside('timeframe')} htmlFor="f-tf">
              <Select id="f-tf" value={t.timeframe ?? ''} onChange={(e) => set('timeframe', e.target.value || null)} attention={attention('timeframe')}>
                <option value="">—</option>
                {[...new Set([...TIMEFRAMES, ...(t.timeframe ? [t.timeframe] : [])])].map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={label('Market bias', 'bias')} aside={aside('bias')} htmlFor="f-bias">
              <Select id="f-bias" value={t.bias ?? ''} onChange={(e) => set('bias', (e.target.value || null) as Trade['bias'])} attention={attention('bias')}>
                <option value="">—</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral</option>
              </Select>
            </Field>
            <Field label={label('Market structure', 'market_structure')} aside={aside('market_structure')} className="col-span-2 md:col-span-4" htmlFor="f-structure">
              <Input id="f-structure" value={t.market_structure ?? ''} onChange={(e) => set('market_structure', e.target.value || null)} placeholder="e.g. Higher highs on 15m, bullish BOS after London low sweep" attention={attention('market_structure')} />
            </Field>
            <div className="col-span-2 md:col-span-4">
              <div className="mb-2 flex items-center justify-between text-[12.5px] font-medium text-mute">
                <span>ICT concepts</span>
                <ConfidenceBadge meta={meta?.concepts} />
              </div>
              <div className="flex flex-wrap gap-2">
                {CONCEPTS.map((c) => {
                  const on = t.concepts.includes(c.value);
                  return (
                    <Chip key={c.value} selected={on} onClick={() => set('concepts', on ? t.concepts.filter((x) => x !== c.value) : [...t.concepts, c.value])}>
                      {c.label}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Notes">
          <div className="grid gap-3">
            <Textarea value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="Context, management, anything worth remembering…" aria-label="Notes" />
            <Field label="Tags" hint="Comma separated" htmlFor="f-tags">
              <Input
                id="f-tags"
                defaultValue={t.tags.join(', ')}
                onBlur={(e) =>
                  set(
                    'tags',
                    e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="news day, A+ only, FOMC"
              />
            </Field>
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <TradePreview t={t} instruments={instruments} warnings={v.warnings} />
      </div>
    </div>
  );
}

function commissionHint(t: Trade, instruments: Instrument[]): string {
  const inst = instruments.find((i) => i.symbol === t.symbol);
  if (inst?.commission_rt !== null && inst?.commission_rt !== undefined) return `Using your rate: ${money(inst.commission_rt)} × ${t.contracts} contracts`;
  return 'Not set — CADENCE never assumes fees. Set rates in Settings.';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="eyebrow mb-4">{title}</h3>
      {children}
    </Card>
  );
}

export function TradePreview({ t, instruments, warnings }: { t: Trade; instruments: Instrument[]; warnings: string[] }) {
  const e = useMemo(() => enrichTrade(t, instruments), [t, instruments]);
  const rows: [string, ReactNode][] = [
    ['Points', e.points !== undefined ? fmtNum(e.points, 2, true) : '—'],
    ['Ticks', e.ticks !== undefined ? fmtNum(e.ticks, 0, true) : '—'],
    ['Gross P&L', <PnlText key="g" value={e.gross} />],
    ['Fees', e.feeSource === 'unknown' ? <span key="f" className="text-warn">Not set</span> : `${money(e.fees)}${e.feeSource === 'settings' ? ' (your rate)' : ''}`],
    ['Risk', e.risk !== undefined ? money(e.risk) : '—'],
    ['Planned R:R', e.plannedRR !== undefined ? `1 : ${fmtNum(e.plannedRR)}` : '—'],
    ['Duration', formatDuration(e.durationMin)],
    ['Session', e.sessionName ?? '—'],
  ];
  return (
    <Card glow className="p-5">
      <div className="eyebrow">Live calculation</div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[12px] text-faint">Net P&L</div>
          {e.net !== undefined ? <PnlText value={e.net} animate className="text-[30px] font-semibold leading-tight" /> : <div className="text-[15px] text-warn">Needs exit or P&L</div>}
        </div>
        <div className="text-right">
          <div className="text-[12px] text-faint">R multiple</div>
          <div className={cn('num text-[20px] font-semibold', e.r === undefined ? 'text-faint' : e.r >= 0 ? 'text-pos' : 'text-neg')}>{fmtR(e.r)}</div>
        </div>
      </div>
      {e.inst && (
        <div className="mt-2 text-[11.5px] text-faint">
          {e.inst.symbol}: tick {fmtPrice(e.inst.tick_size)} = {money(e.inst.tick_value)} · {money(e.pv)}/pt per contract
        </div>
      )}
      <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 text-[13px]">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-mute">{k}</dt>
            <dd className="num text-right">{val}</dd>
          </div>
        ))}
      </dl>
      {e.pnlMismatch !== undefined && (
        <div className="mt-3 flex gap-2 rounded-xl border border-warn/25 bg-warn/[0.06] p-2.5 text-[12px] text-warn">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Platform gross differs from the contract-spec calculation by {money(e.pnlMismatch, { signed: true })}. Check prices and contracts.
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2 text-[12px] leading-snug text-mute">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
