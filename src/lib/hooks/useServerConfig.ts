'use client';

import { useEffect, useState } from 'react';

export interface ServerConfig {
  ai: boolean;
  /** 'user' = requires a signed-in Supabase user, 'anonymous' = open (single-user deployment) */
  aiAccess: 'user' | 'anonymous' | 'disabled';
  model: string | null;
  supabase: boolean;
  push: boolean;
  vapidPublicKey: string | null;
}

let cache: Promise<ServerConfig> | null = null;

const FALLBACK: ServerConfig = { ai: false, aiAccess: 'disabled', model: null, supabase: false, push: false, vapidPublicKey: null };

export function loadServerConfig(): Promise<ServerConfig> {
  if (!cache) {
    cache = fetch('/api/config', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ServerConfig>) : FALLBACK))
      .catch(() => {
        cache = null; // offline: retry next time
        return FALLBACK;
      });
  }
  return cache;
}

export function useServerConfig(): ServerConfig | null {
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void loadServerConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
