import { useState } from 'react';
import type { SessionDef, Settings } from '../types';
import { db, DEFAULT_SETTINGS } from '../db';
import { DEFAULT_SESSIONS } from '../lib/sessions';
import { uid } from '../lib/calc';

const ZONES = ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Moscow', 'Europe/Kyiv', 'Asia/Almaty', 'Asia/Tashkent', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Hong_Kong', 'Asia/Singapore', 'Australia/Sydney', 'America/New_York', 'America/Chicago'];

export function SettingsPage({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [s, setS] = useState<Settings>(settings);
  const [lists, setLists] = useState({ setups: settings.setups.join('\n'), mistakes: settings.mistakes.join('\n'), emotions: settings.emotions.join('\n') });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const setSession = (id: string, patch: Partial<SessionDef>) => set('sessions', s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const zones = [...new Set([...ZONES, s.displayTimeZone, ...s.sessions.map((x) => x.timeZone)])];
  const split = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    await db.settings.put({ ...s, setups: split(lists.setups), mistakes: split(lists.mistakes), emotions: split(lists.emotions) });
    onSaved();
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><h2>Счёт и риск</h2></div>
        <div className="form-grid">
          <label className="field"><span>Валюта счёта</span>
            <select value={s.currency} onChange={(e) => set('currency', e.target.value)}>
              {['USD', 'EUR', 'GBP', 'USDT', 'RUB', 'KZT', 'UAH'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field"><span>Стартовый депозит</span>
            <input type="number" value={s.startingBalance} onChange={(e) => set('startingBalance', Number(e.target.value) || 0)} />
          </label>
          <label className="field"><span>Макс. риск на сделку, %</span>
            <input type="number" step="0.1" value={s.maxRiskPercent} onChange={(e) => set('maxRiskPercent', Number(e.target.value) || 0)} />
          </label>
          <label className="field"><span>Часовой пояс для статистики по дням и часам</span>
            <select value={s.displayTimeZone} onChange={(e) => set('displayTimeZone', e.target.value)}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Торговые сессии</h2>
          <span className="muted small">определяются автоматически по времени входа, с учётом перехода на летнее время</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Название</th><th>Часовой пояс</th><th>Начало</th><th>Конец</th><th /></tr></thead>
            <tbody>
              {s.sessions.map((x) => (
                <tr key={x.id}>
                  <td><input value={x.name} onChange={(e) => setSession(x.id, { name: e.target.value })} /></td>
                  <td>
                    <select value={x.timeZone} onChange={(e) => setSession(x.id, { timeZone: e.target.value })}>
                      {zones.map((z) => <option key={z}>{z}</option>)}
                    </select>
                  </td>
                  <td><input type="time" value={x.start} onChange={(e) => setSession(x.id, { start: e.target.value })} /></td>
                  <td><input type="time" value={x.end} onChange={(e) => setSession(x.id, { end: e.target.value })} /></td>
                  <td><button className="btn small danger" onClick={() => set('sessions', s.sessions.filter((y) => y.id !== x.id))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => set('sessions', [...s.sessions, { id: uid(), name: 'Новая', timeZone: 'America/New_York', start: '09:30', end: '11:00' }])}>+ Добавить (например, Killzone)</button>
          <button className="btn small" onClick={() => set('sessions', DEFAULT_SESSIONS)}>Сбросить по умолчанию</button>
        </div>
      </div>

      <div className="grid cols-3">
        {(['setups', 'mistakes', 'emotions'] as const).map((k) => (
          <div className="card" key={k}>
            <div className="card-head"><h2>{k === 'setups' ? 'Сетапы' : k === 'mistakes' ? 'Ошибки' : 'Эмоции'}</h2><span className="muted small">по одному в строке</span></div>
            <textarea rows={9} value={lists[k]} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <div className="row">
        <button className="btn primary" onClick={save}>Сохранить настройки</button>
        <button className="btn" onClick={() => { setS({ ...DEFAULT_SETTINGS }); setLists({ setups: DEFAULT_SETTINGS.setups.join('\n'), mistakes: DEFAULT_SETTINGS.mistakes.join('\n'), emotions: DEFAULT_SETTINGS.emotions.join('\n') }); }}>Значения по умолчанию</button>
      </div>
    </div>
  );
}
