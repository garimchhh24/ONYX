'use client';

import { useEffect, useState } from 'react';
import { sync, type SyncState } from '../data/sync';

export function useSyncState(): SyncState {
  const [s, setS] = useState<SyncState>(sync.snapshot);
  useEffect(() => sync.subscribe(setS), []);
  return s;
}
