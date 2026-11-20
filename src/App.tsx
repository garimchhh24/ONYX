import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, saveTrade } from './db';
import type { Settings, Trade } from './types';
import { Dashboard } from './components/Dashboard';
import { Journal } from './components/Journal';
import { TradeForm } from './components/TradeForm';
import { ImportPage } from './components/ImportPage';
import { SettingsPage } from './components/SettingsPage';
import { applyFilters, EMPTY_FILTERS, FilterBar, type Filters } from './components/common';

type View = 'dashboard' | 'journal' | 'trade' | 'import' | 'settings';

export default function App() {
  const stored = useLiveQuery(() => db.settings.get('settings'), []);
  const trades = useLiveQuery(() => db.trades.toArray(), []) ?? [];
  const settings: Settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(stored ?? {}) }), [stored]);
  const [view, setView] = useState<View>('dashboard');
  const [editing, setEditing] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [settingsKey, setSettingsKey] = useState(0);

  const filtered = useMemo(() => applyFilters(trades, filters, settings), [trades, filters, settings]);
  const accounts = useMemo(() => [...new Set(trades.map((t) => t.account).filter((a): a is string => !!a))], [trades]);
  const editTrade = editing ? trades.find((t) => t.id === editing) : undefined;

  const go = (v: View) => {
    if (v === 'trade') setEditing(null);
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const open = (id: string) => {
    setEditing(id);
    setView('trade');
    window.scrollTo({ top: 0 });
  };

  const nav: [View, string][] = [
    ['dashboard', 'Статистика'],
    ['journal', 'Журнал'],
    ['trade', '+ Сделка'],
    ['import', 'Импорт'],
    ['settings', 'Настройки'],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden />ONYX</div>
        <nav className="nav">
          {nav.map(([v, label]) => (
            <button key={v} className={view === v && !(v === 'trade' && editing) ? 'active' : ''} onClick={() => go(v)}>{label}</button>
          ))}
        </nav>
      </header>

      {(view === 'dashboard' || view === 'journal') && trades.length > 0 && (
        <FilterBar trades={trades} settings={settings} value={filters} onChange={setFilters} />
      )}

      {view === 'dashboard' && <Dashboard trades={filtered} settings={settings} />}
      {view === 'journal' && <Journal trades={filtered} settings={settings} onOpen={open} />}
      {view === 'trade' && (
        <TradeForm
          key={editing ?? 'new'}
          trade={editTrade}
          settings={settings}
          accounts={accounts}
          onSave={async (t: Trade) => { await saveTrade(t); go('journal'); }}
          onDelete={editTrade ? async () => { await db.trades.delete(editTrade.id); go('journal'); } : undefined}
          onCancel={() => go(editing ? 'journal' : 'dashboard')}
        />
      )}
      {view === 'import' && <ImportPage settings={settings} trades={trades} />}
      {view === 'settings' && (
        <SettingsPage key={`${settingsKey}-${stored ? 's' : 'd'}`} settings={settings} onSaved={() => { setSettingsKey((k) => k + 1); go('dashboard'); }} />
      )}
    </div>
  );
}
