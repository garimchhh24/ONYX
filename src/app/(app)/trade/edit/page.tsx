'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FullScreenLoader } from '@/components/brand/Logo';
import { TradeEditor } from '@/components/trades/TradeEditor';
import { EmptyState } from '@/components/trades/parts';
import { Button, Card } from '@/components/ui/core';
import { useTrade } from '@/lib/data/repo';

export default function EditTradePage() {
  return (
    <Suspense fallback={<FullScreenLoader label="Loading trade" />}>
      <EditTrade />
    </Suspense>
  );
}

function EditTrade() {
  const id = useSearchParams().get('id') ?? undefined;
  const { trade, loading } = useTrade(id);
  if (loading) return <FullScreenLoader label="Loading trade" />;
  if (!trade)
    return (
      <Card>
        <EmptyState title="Trade not found" action={<Link href="/journal"><Button>Back to journal</Button></Link>} />
      </Card>
    );
  return <TradeEditor key={trade.id} initial={trade} mode="edit" />;
}
