'use client';

import { useEffect, useState } from 'react';
import { tradingDay } from '../domain/time';

/** Current CME trading day; re-evaluated every minute so it rolls at 18:00 ET. */
export function useToday(): string {
  const [d, setD] = useState(() => tradingDay(new Date()));
  useEffect(() => {
    const t = setInterval(() => setD(tradingDay(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  return d;
}
