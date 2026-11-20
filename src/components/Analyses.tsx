import { useRef, useState } from 'react';
import { TIMEFRAMES, TIMEFRAME_LABELS, type Analysis, type Timeframe } from '../types';
import { uid } from '../lib/calc';
import { chartImageUrl, imageToDataUrl } from '../lib/tradingview';
import { Lightbox } from './common';

/**
 * One slot per timeframe. Each slot accepts:
 *  - a TradingView snapshot link (Alt+S → "Copy link") — image is shown automatically
 *  - any chart/idea link
 *  - Ctrl+V of a screenshot, drag & drop, or a file upload
 */
export function Analyses({ value, onChange }: { value: Analysis[]; onChange: (a: Analysis[]) => void }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const used = new Set(value.map((a) => a.timeframe));
  const visible = showAll ? TIMEFRAMES : TIMEFRAMES.filter((tf) => used.has(tf) || ['1D', '4H', '1H', '15m'].includes(tf));

  const add = (a: Omit<Analysis, 'id' | 'createdAt'>) => onChange([...value, { ...a, id: uid(), createdAt: new Date().toISOString() }]);
  const update = (id: string, patch: Partial<Analysis>) => onChange(value.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const remove = (id: string) => onChange(value.filter((a) => a.id !== id));

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="notice">
        На TradingView нажмите <b>Alt + S</b> (или кнопку камеры → «Копировать ссылку») и вставьте ссылку в нужный таймфрейм — скриншот подтянется автоматически.
        Также можно вставить картинку через <b>Ctrl + V</b>, перетащить файл или загрузить его.
      </div>
      <div className="tf-grid">
        {visible.map((tf) => (
          <TfSlot key={tf} tf={tf} items={value.filter((a) => a.timeframe === tf)} onAdd={add} onUpdate={update} onRemove={remove} onZoom={setZoom} />
        ))}
      </div>
      {!showAll && (
        <div>
          <button type="button" className="btn small" onClick={() => setShowAll(true)}>Показать все таймфреймы (Monthly … 1min)</button>
        </div>
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function TfSlot({
  tf, items, onAdd, onUpdate, onRemove, onZoom,
}: {
  tf: Timeframe;
  items: Analysis[];
  onAdd: (a: Omit<Analysis, 'id' | 'createdAt'>) => void;
  onUpdate: (id: string, p: Partial<Analysis>) => void;
  onRemove: (id: string) => void;
  onZoom: (src: string) => void;
}) {
  const [link, setLink] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addLink = (raw: string) => {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) return false;
    onAdd({ timeframe: tf, url, imageUrl: chartImageUrl(url) });
    setLink('');
    return true;
  };
  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      onAdd({ timeframe: tf, imageData: await imageToDataUrl(f) });
    }
  };

  return (
    <div
      className={`tf${drag ? ' drag' : ''}`}
      tabIndex={0}
      onPaste={(e) => {
        const files = [...e.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
        if (files.length) {
          e.preventDefault();
          void addFiles(files);
        } else if ((e.target as HTMLElement).tagName !== 'INPUT') {
          const text = e.clipboardData.getData('text');
          if (addLink(text)) e.preventDefault();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
    >
      <div className="tf-head">
        <b>{TIMEFRAME_LABELS[tf]}</b>
        <span className="muted small">{items.length ? `${items.length} шт.` : ''}</span>
      </div>
      {items.map((a) => {
        const src = a.imageData ?? a.imageUrl;
        return (
          <div className="shot" key={a.id}>
            {src && <img src={src} alt={`Анализ ${TIMEFRAME_LABELS[tf]}`} loading="lazy" onClick={() => onZoom(src)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
            <button type="button" className="btn small x" onClick={() => onRemove(a.id)} aria-label="Удалить">✕</button>
            <div className="meta">
              {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.url}</a>}
              <input placeholder="Комментарий к анализу" value={a.note ?? ''} onChange={(e) => onUpdate(a.id, { note: e.target.value })} />
            </div>
          </div>
        );
      })}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          placeholder="Ссылка TradingView…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(link); } }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/^https?:\/\//i.test(text.trim())) { e.preventDefault(); e.stopPropagation(); addLink(text); }
          }}
        />
        <button type="button" className="btn small" onClick={() => addLink(link)} disabled={!link.trim()}>+</button>
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()} title="Загрузить скриншот">📷</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
  );
}
