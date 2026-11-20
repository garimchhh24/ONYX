import { useRef, useState } from 'react';
import type { Settings, Trade } from '../types';
import { addImported, db, exportBackup, importBackup } from '../db';
import { importFile, type ImportResult, type TimeZoneMode } from '../lib/importers';
import { fmtMoney, tradePnl, tradeR, tradeSession } from '../lib/calc';
import { demoTrades } from '../lib/demo';
import { download } from './common';

const TZ_OPTIONS: { label: string; value: string }[] = [
  { label: 'Как в браузере (локальное время)', value: 'local' },
  ...[-5, -4, 0, 1, 2, 3].map((h) => ({ label: `UTC${h >= 0 ? '+' : ''}${h}${h === 2 || h === 3 ? ' — обычно сервер MetaTrader' : h === 0 ? ' — TradingView, биржи' : ''}`, value: String(h * 60) })),
];

export function ImportPage({ settings, trades }: { settings: Settings; trades: Trade[] }) {
  const [tz, setTz] = useState('local');
  const [account, setAccount] = useState('');
  const [result, setResult] = useState<(ImportResult & { file: string }) | null>(null);
  const [msg, setMsg] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const tzMode = (): TimeZoneMode => (tz === 'local' ? { kind: 'local' } : { kind: 'offset', minutes: Number(tz) });

  const handle = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setMsg('');
    try {
      const r = await importFile(f, { tz: tzMode(), account: account.trim() || undefined });
      setResult({ ...r, file: f.name });
    } catch (e) {
      setMsg('Ошибка чтения файла: ' + (e as Error).message);
    }
  };

  const confirmImport = async () => {
    if (!result) return;
    const { added, duplicates } = await addImported(result.trades);
    setMsg(`Импортировано сделок: ${added}${duplicates ? `, пропущено дубликатов: ${duplicates}` : ''}.`);
    setResult(null);
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><h2>Автоимпорт сделок</h2><span className="muted small">без ручного ввода</span></div>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>Часовой пояс времени в файле</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              {TZ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Счёт (необязательно)</span>
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="например, FTMO 100k" />
          </label>
        </div>
        <div
          className={`drop${drag ? ' drag' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
        >
          <b>Перетащите файл сюда</b> или нажмите, чтобы выбрать
          <div className="small muted" style={{ marginTop: 6 }}>CSV, TSV, TXT, HTML (отчёт MetaTrader)</div>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.htm,.html" hidden onChange={(e) => { void handle(e.target.files); e.target.value = ''; }} />
        <details style={{ marginTop: 12 }}>
          <summary className="muted">Откуда взять файл</summary>
          <ul className="insights" style={{ marginTop: 8 }}>
            <li><b>MetaTrader 5:</b> вкладка «История» → правый клик → «Отчёт» → HTML. Или «Позиции» → экспорт.</li>
            <li><b>MetaTrader 4:</b> «История счёта» → правый клик → «Сохранить как подробный отчёт».</li>
            <li><b>TradingView (тестер стратегий):</b> «Список сделок» → кнопка экспорта CSV. Тикер берётся из имени файла.</li>
            <li><b>cTrader, Binance, Bybit, TradeLocker, NinjaTrader и др.:</b> экспорт истории позиций в CSV — колонки распознаются по названиям (Symbol, Side/Type, Open/Close time, Price, Volume, SL, TP, Commission, Profit).</li>
            <li>Стоимость пункта рассчитывается автоматически из прибыли брокера, поэтому риск и R считаются сами, если в файле есть стоп-лосс.</li>
            <li>Повторный импорт того же файла не создаёт дубликатов — можно просто регулярно загружать свежую историю.</li>
          </ul>
        </details>
        {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
      </div>

      {result && (
        <div className="card">
          <div className="card-head">
            <h2>Предпросмотр: {result.file}</h2>
            <span className="muted small">формат: {result.format} · найдено {result.trades.length} · пропущено строк {result.skipped}</span>
          </div>
          {result.warnings.map((w) => <div key={w} className="notice" style={{ marginBottom: 8 }}>{w}</div>)}
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Вход</th><th>Инструмент</th><th>Напр.</th><th>Сессия</th><th className="r">Объём</th><th className="r">Вход</th><th className="r">Выход</th><th className="r">SL</th><th className="r">R</th><th className="r">P&L</th></tr>
              </thead>
              <tbody>
                {result.trades.slice(0, 200).map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.entryTime).toLocaleString('ru-RU')}</td>
                    <td>{t.symbol}</td>
                    <td>{t.direction}</td>
                    <td>{tradeSession(t, settings)}</td>
                    <td className="r">{t.size}</td>
                    <td className="r">{t.entryPrice}</td>
                    <td className="r">{t.exitPrice ?? '—'}</td>
                    <td className="r">{t.stopLoss ?? '—'}</td>
                    <td className="r">{tradeR(t)?.toFixed(2) ?? '—'}</td>
                    <td className="r">{fmtMoney(tradePnl(t), settings.currency, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={confirmImport} disabled={!result.trades.length}>Импортировать {result.trades.length}</button>
            <button className="btn" onClick={() => setResult(null)}>Отмена</button>
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Резервная копия</h2></div>
          <p className="muted small" style={{ marginTop: 0 }}>Данные хранятся только в этом браузере. Регулярно сохраняйте копию (вместе со скриншотами) — её можно открыть на другом устройстве.</p>
          <div className="row">
            <button className="btn" onClick={async () => download(`onyx-journal-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup())}>Скачать копию</button>
            <button className="btn" onClick={() => backupRef.current?.click()}>Восстановить из файла</button>
            <input
              ref={backupRef}
              type="file"
              accept=".json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const n = await importBackup(await f.text());
                  setMsg(`Восстановлено сделок: ${n}.`);
                } catch (err) {
                  setMsg('Ошибка: ' + (err as Error).message);
                }
              }}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Демо-данные</h2></div>
          <p className="muted small" style={{ marginTop: 0 }}>140 случайных сделок, чтобы посмотреть, как работает статистика. Их можно удалить одной кнопкой.</p>
          <div className="row">
            <button className="btn" onClick={async () => { const r = await addImported(demoTrades(settings)); setMsg(`Добавлено демо-сделок: ${r.added}.`); }}>Загрузить демо</button>
            {trades.some((t) => t.source === 'demo') && (
              <button className="btn danger" onClick={async () => { await db.trades.where('externalId').startsWith('demo:').delete(); setMsg('Демо-сделки удалены.'); }}>Удалить демо</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
