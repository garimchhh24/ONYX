'use client';

import { Download } from 'lucide-react';
import { AppIcon, Lockup, Symbol, Tagline, Wordmark } from '@/components/brand/Logo';
import { PageHeader } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/core';
import { Item, Stagger } from '@/components/ui/motion';

const PALETTE = [
  { name: 'Obsidian Black', hex: '#0B0B0F' },
  { name: 'Deep Purple', hex: '#1A1028' },
  { name: 'Electric Purple', hex: '#8A2BE2' },
  { name: 'Bright Violet', hex: '#B46AFF' },
  { name: 'Chrome Silver', hex: '#D9D9E2' },
  { name: 'White', hex: '#FFFFFF' },
];

const ICONS = [
  { file: 'cadence-app-icon.svg', label: 'Dark (primary)' },
  { file: 'cadence-app-icon-light.svg', label: 'Light' },
  { file: 'cadence-app-icon-mono.svg', label: 'Monochrome' },
  { file: 'cadence-app-icon-violet.svg', label: 'Violet' },
  { file: 'cadence-app-icon-outline.svg', label: 'Outline' },
];

const FILES = [
  'cadence-logo.svg',
  'cadence-logo-light.svg',
  'cadence-symbol.svg',
  'cadence-symbol-light.svg',
  'cadence-symbol-mono.svg',
  'cadence-symbol-mono-black.svg',
  'cadence-symbol-small.svg',
  'cadence-wordmark.svg',
  'cadence-wordmark-dark.svg',
];

export default function BrandPage() {
  return (
    <>
      <PageHeader eyebrow="Identity" title="CADENCE brand" subtitle="Discipline · Precision · Consistency · Performance" />
      <Stagger className="space-y-5">
        <Item>
          <Card glow className="grid place-items-center overflow-hidden px-6 py-14">
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-electric/20 blur-[100px]" />
            <div className="relative flex flex-col items-center gap-6 md:flex-row md:gap-8">
              <Symbol size={120} glow />
              <span className="hidden h-24 w-px bg-white/10 md:block" />
              <div className="flex flex-col items-center gap-4 md:items-start">
                <Wordmark height={34} />
                <Tagline />
              </div>
            </div>
          </Card>
        </Item>
        <Item>
          <div className="grid gap-5 md:grid-cols-3">
            <Card className="grid place-items-center p-8">
              <div className="eyebrow mb-6 self-start">Symbol</div>
              <Symbol size={110} />
            </Card>
            <Card className="grid place-items-center p-8">
              <div className="eyebrow mb-6 self-start">Wordmark</div>
              <Wordmark height={22} />
            </Card>
            <Card className="grid place-items-center bg-white p-8">
              <div className="eyebrow mb-6 self-start text-[#2a2735]">Light background</div>
              <div className="flex items-center gap-3">
                <Symbol size={64} variant="light" />
                <Wordmark height={16} variant="dark" />
              </div>
            </Card>
          </div>
        </Item>
        <Item>
          <Card className="p-6">
            <div className="eyebrow mb-5">App icons</div>
            <div className="flex flex-wrap gap-6">
              {ICONS.map((i) => (
                <div key={i.file} className="flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/brand/${i.file}`} alt={i.label} className="size-24 rounded-[22px] shadow-[0_10px_30px_-10px_rgba(138,43,226,0.5)]" />
                  <span className="text-[12px] text-mute">{i.label}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <AppIcon size={96} />
                <span className="text-[12px] text-mute">Glass tile</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="grid size-24 place-items-center gap-2 rounded-[22px] border border-white/10">
                  <div className="flex items-end gap-3">
                    <Symbol size={16} variant="flat" />
                    <Symbol size={24} variant="flat" />
                    <Symbol size={32} variant="flat" />
                  </div>
                </div>
                <span className="text-[12px] text-mute">Small sizes</span>
              </div>
            </div>
          </Card>
        </Item>
        <Item>
          <Card className="p-6">
            <div className="eyebrow mb-5">Color palette</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {PALETTE.map((c) => (
                <div key={c.hex}>
                  <div className="h-20 rounded-2xl border border-white/10" style={{ background: c.hex }} />
                  <div className="mt-2 text-[13px] font-medium">{c.name}</div>
                  <div className="num text-[12px] text-faint">{c.hex}</div>
                </div>
              ))}
            </div>
          </Card>
        </Item>
        <Item>
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-6">
              <div className="eyebrow mb-4">Typography</div>
              <div className="font-display text-3xl font-semibold tracking-tight">Sora — display</div>
              <div className="mt-2 text-[15px] text-mute">Inter — interface and body text</div>
              <div className="num mt-2 text-[15px] text-chrome">JetBrains Mono — +$1,284.50 · 2.35R</div>
            </Card>
            <Card className="p-6">
              <div className="eyebrow mb-4">Lockup sizes</div>
              <div className="space-y-5">
                <Lockup size="md" tagline />
                <Lockup size="sm" />
              </div>
            </Card>
          </div>
        </Item>
        <Item>
          <Card className="p-6">
            <div className="eyebrow mb-4">Download vector assets</div>
            <div className="flex flex-wrap gap-2">
              {[...FILES, ...ICONS.map((i) => i.file)].map((f) => (
                <a key={f} href={`/brand/${f}`} download className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-mute transition hover:border-violet/40 hover:text-fg">
                  <Download className="size-3" /> {f}
                </a>
              ))}
            </div>
          </Card>
        </Item>
      </Stagger>
    </>
  );
}
