import { createContext, useContext } from 'react';
import type { Account } from './types';
import type { ETrade } from './lib/calc';
import type { AccountState } from './lib/prop';
import type { StoreState } from './store';

export type Tab = 'home' | 'journal' | 'stats' | 'accounts';
export type Layer =
  | { kind: 'trade-edit'; id?: string; shot?: File }
  | { kind: 'trade-view'; id: string }
  | { kind: 'account-edit'; id?: string; template?: Partial<Account> }
  | { kind: 'account-view'; id: string }
  | { kind: 'settings' };

export interface Journal {
  s: StoreState;
  trades: ETrade[];
  byId: Map<string, ETrade>;
  states: Map<string, AccountState>;
  accountName: (id: string) => string;
}

export interface Nav {
  tab: Tab;
  setTab: (t: Tab) => void;
  push: (l: Layer) => void;
  pop: () => void;
  replace: (l: Layer) => void;
}

export const JournalCtx = createContext<Journal | null>(null);
export const NavCtx = createContext<Nav | null>(null);

export const useJournal = () => useContext(JournalCtx)!;
export const useNav = () => useContext(NavCtx)!;
