'use client';

import { useState } from 'react';
import { TradeEditor } from '@/components/trades/TradeEditor';
import { blankTrade } from '@/lib/data/repo';

export default function NewTradePage() {
  const [initial] = useState(() => blankTrade({ entry_time: null }));
  return <TradeEditor initial={initial} mode="new" />;
}
