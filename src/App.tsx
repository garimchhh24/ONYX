import { useEffect, useMemo, useState } from 'react';
import { JournalCtx, NavCtx, type Journal, type Layer, type Nav, type Tab } from './context';
import { enrichAll } from './lib/calc';
import { accountState } from './lib/prop';
import { todayTradingDay } from './lib/time';
import { useStore } from './store';
import { Icon, LOGO, Overlay } from './ui';
import { Home } from './screens/Home';
import { Journal as JournalScreen } from './screens/Journal';
import { Stats } from './screens/Stats';
import { Accounts, AccountDetail } from './screens/Accounts';
import { AccountEditor } from './screens/AccountEditor';
import { TradeEditor } from './screens/TradeEditor';
import { TradeDetail } from './screens/TradeDetail';
import { Settings } from './screens/Settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'journal', label: 'Журнал', icon: 'journal' },
  { id: 'stats', label: 'Статистика', icon: 'stats' },
  { id: 'accounts', label: 'Счета', icon: 'accounts' },
];

function useTradingDay() {
  const [day, setDay] = useState(todayTradingDay);
  useEffect(() => {
    const t = setInterval(() => setDay(todayTradingDay()), 60_000);
    return () => clearInterval(t);
  }, []);
  return day;
}

export default function App() {
  const s = useStore();
  const [tab, setTabState] = useState<Tab>('home');
  const [layers, setLayers] = useState<Layer[]>([]);
  const today = useTradingDay();

  const trades = useMemo(() => enrichAll(s.trades, s.settings), [s.trades, s.settings]);
  const journal: Journal = useMemo(() => {
    const byId = new Map(trades.map((t) => [t.id, t]));
    const states = new Map(s.accounts.map((a) => [a.id, accountState(a, trades, s.cashflows, today)]));
    const names = new Map(s.accounts.map((a) => [a.id, a.name]));
    return { s, trades, byId, states, accountName: (id) => names.get(id) ?? 'удалённый счёт' };
  }, [s, trades, today]);

  const nav: Nav = useMemo(
    () => ({
      tab,
      setTab: (t) => {
        setLayers([]);
        setTabState(t);
        window.scrollTo({ top: 0 });
      },
      push: (l) => setLayers((ls) => [...ls, l]),
      pop: () => setLayers((ls) => ls.slice(0, -1)),
      replace: (l) => setLayers((ls) => [...ls.slice(0, -1), l]),
    }),
    [tab],
  );

  if (!s.ready) {
    return (
      <div className="splash">
        <div>
          <img src={LOGO} alt="" />
          <b className="chrome">ONYX</b>
        </div>
      </div>
    );
  }

  const top = layers.at(-1);
  return (
    <JournalCtx.Provider value={journal}>
      <NavCtx.Provider value={nav}>
        <main className="app" aria-hidden={!!top}>
          {tab === 'home' && <Home />}
          {tab === 'journal' && <JournalScreen />}
          {tab === 'stats' && <Stats />}
          {tab === 'accounts' && <Accounts />}
        </main>
        {!top && (
          <nav className="tabbar" aria-label="Разделы">
            <div className="tabbar-inner">
              {TABS.slice(0, 2).map((t) => (
                <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => nav.setTab(t.id)} aria-current={tab === t.id}>
                  <Icon name={t.icon} />
                  {t.label}
                </button>
              ))}
              <div className="fab-wrap">
                <button className="fab" onClick={() => nav.push({ kind: 'trade-edit' })} aria-label="Новая сделка">
                  <Icon name="plus" size={28} stroke={2.4} />
                </button>
              </div>
              {TABS.slice(2).map((t) => (
                <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => nav.setTab(t.id)} aria-current={tab === t.id}>
                  <Icon name={t.icon} />
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        )}
        {top && (
          <Overlay key={layers.length + top.kind}>
            {top.kind === 'trade-edit' && <TradeEditor key={top.id ?? 'new'} id={top.id} />}
            {top.kind === 'trade-view' && <TradeDetail id={top.id} />}
            {top.kind === 'account-edit' && <AccountEditor id={top.id} template={top.template} />}
            {top.kind === 'account-view' && <AccountDetail id={top.id} />}
            {top.kind === 'settings' && <Settings />}
          </Overlay>
        )}
        {s.toast && <div className="toast" role="status">{s.toast.text}</div>}
      </NavCtx.Provider>
    </JournalCtx.Provider>
  );
}
