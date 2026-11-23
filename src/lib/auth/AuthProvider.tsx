'use client';

import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setRepoUser } from '../data/repo';
import { clearLocalData, prepareForUser, sync } from '../data/sync';
import { getSupabase } from '../supabase/browser';
import { supabaseEnabled } from '../supabase/env';

const MODE_KEY = 'cadence-mode';

interface AuthState {
  /** Supabase configured for this deployment */
  enabled: boolean;
  ready: boolean;
  user: User | null;
  /** User chose to keep data on this device without an account */
  localMode: boolean;
  continueLocally: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

function readMode(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === 'local';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled);
  const [localMode, setLocalMode] = useState(false);

  useEffect(() => {
    setLocalMode(readMode());
    // Ask the browser to keep the journal even under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    const sb = getSupabase();
    if (!sb) return;
    let current: string | null = null;
    const apply = async (u: User | null) => {
      setUser(u);
      if (u && u.id !== current) {
        current = u.id;
        setRepoUser(u.id);
        await prepareForUser(u.id);
        void sync.start(sb, u.id);
      } else if (!u && current) {
        current = null;
        setRepoUser(null);
        sync.stop();
      }
      setReady(true);
    };
    sb.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      void apply(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const continueLocally = useCallback(() => {
    try {
      localStorage.setItem(MODE_KEY, 'local');
    } catch {
      /* private mode */
    }
    setLocalMode(true);
  }, []);

  const value = useMemo<AuthState>(() => {
    const sb = getSupabase();
    const need = () => {
      if (!sb) throw new Error('Cloud accounts are not configured for this deployment.');
      return sb;
    };
    return {
      enabled: supabaseEnabled,
      ready,
      user,
      localMode,
      continueLocally,
      async signInWithPassword(email, password) {
        const { error } = await need().auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      async signUp(email, password) {
        const { data, error } = await need().auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/login` } });
        if (error) throw new Error(error.message);
        return { needsConfirmation: !data.session };
      },
      async sendCode(email) {
        const { error } = await need().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw new Error(error.message);
      },
      async verifyCode(email, code) {
        const { error } = await need().auth.verifyOtp({ email, token: code.trim(), type: 'email' });
        if (error) throw new Error(error.message);
      },
      async signOut() {
        if (sb && user) {
          await sync.syncNow();
          sync.stop();
          await clearLocalData();
          await sb.auth.signOut();
        }
        try {
          localStorage.removeItem(MODE_KEY);
        } catch {
          /* ignore */
        }
        setLocalMode(false);
      },
    };
  }, [ready, user, localMode, continueLocally]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
