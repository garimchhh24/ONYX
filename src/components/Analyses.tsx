import { useRef, useState } from 'react';
import { TIMEFRAMES, TIMEFRAME_LABELS, type Analysis, type Timeframe } from '../types';
import { uid } from '../lib/calc';
import { chartImageUrl, imageToBlob, imageToDataUrl } from '../lib/tradingview';
import { toast, uploadImage, useStore } from '../store';
import { Icon, Lightbox, Sheet, memorize, remember } from '../ui';

/** Stores a picked screenshot: Claude's asset store when synced, otherwise inline on the device. */
export async function analysisFromFile(file: Blob, timeframe: Timeframe, backend: 'cloud' | 'local' | null): Promise<Analysis> {
  let assetId: string | undefined;
  if (backend === 'cloud') assetId = await uploadImage(await imageToBlob(file));
  const imageData = assetId ? undefined : await imageToDataUrl(file);
  return { id: uid(), createdAt: new Date().toISOString(), timeframe, assetId, imageData };
}

export function shotSrc(a: Analysis): string | undefined {
  if (a.assetId) return '/_blob/' + a.assetId;
  return a.imageData ?? a.imageUrl;
}

function Thumb({ a, onClick, onRemove }: { a: Analysis; onClick: () => void; onRemove?: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = shotSrc(a);
  return (
    <div className="shot">
      <button type="button" onClick={onClick} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }} aria-label={`Анализ ${TIMEFRAME_LABELS[a.timeframe]}`}>
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="ph">
            <span><Icon name="link" size={20} /><br />График TradingView</span>
          </div>
        )}
      </button>
      <span className="tf">{TIMEFRAME_LABELS[a.timeframe]}</span>
      {onRemove && (
        <button type="button" className="x" onClick={onRemove} aria-label="Удалить">
          <Icon name="x" size={16} stroke={2.2} />
        </button>
      )}
      {a.note && <div className="note">{a.note}</div>}
    </div>
  );
}

/** Read-only gallery for trade details, grouped by timeframe order. */
export function AnalysesView({ value }: { value: Analysis[] }) {
  const [open, setOpen] = useState<Analysis | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const sorted = [...value].sort((a, b) => TIMEFRAMES.indexOf(a.timeframe) - TIMEFRAMES.indexOf(b.timeframe));
  if (!value.length) return <span className="muted small">Скриншотов нет</span>;
  return (
    <>
      <div className="shots">
        {sorted.map((a) => (
          <Thumb key={a.id} a={a} onClick={() => setOpen(a)} />
        ))}
      </div>
      {open && (
        <Sheet title={`Анализ · ${TIMEFRAME_LABELS[open.timeframe]}`} onClose={() => setOpen(null)}>
          {shotSrc(open) && <img src={shotSrc(open)} alt="" style={{ borderRadius: 12, width: '100%' }} onClick={() => setZoom(shotSrc(open)!)} />}
          {open.note && <p className="dim" style={{ margin: 0 }}>{open.note}</p>}
          {open.url && <a className="btn block" href={open.url} target="_blank" rel="noreferrer"><Icon name="link" size={18} />Открыть на TradingView</a>}
        </Sheet>
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

/** Editor: pick a timeframe, then add a screenshot or a TradingView link. */
export function AnalysesEditor({ value, onChange }: { value: Analysis[]; onChange: (a: Analysis[]) => void }) {
  const { backend } = useStore();
  const [tf, setTf] = useState<Timeframe>(() => remember<Timeframe>('tf', '15m'));
  const [link, setLink] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Analysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickTf = (t: Timeframe) => {
    setTf(t);
    memorize('tf', t);
  };
  const add = (a: Omit<Analysis, 'id' | 'createdAt' | 'timeframe'>) => onChange([...value, { ...a, timeframe: tf, id: uid(), createdAt: new Date().toISOString() }]);

  const addLink = (raw: string) => {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast('Вставьте ссылку, начинающуюся с https://');
      return;
    }
    add({ url, imageUrl: chartImageUrl(url) });
    setLink('');
    setLinkOpen(false);
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);
    try {
      const added: Analysis[] = [];
      for (const f of list) added.push(await analysisFromFile(f, tf, backend));
      onChange([...value, ...added]);
    } catch {
      toast('Не удалось добавить изображение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="stack"
      onPaste={(e) => {
        const files = [...e.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
        if (files.length) {
          e.preventDefault();
          void addFiles(files);
        }
      }}
    >
      <div className="chips scroll">
        {TIMEFRAMES.map((t) => (
          <button key={t} type="button" className={`chip sym${tf === t ? ' on' : ''}`} onClick={() => pickTf(t)}>
            {TIMEFRAME_LABELS[t]}
            {value.some((a) => a.timeframe === t) && <small>●</small>}
          </button>
        ))}
      </div>
      <div className="grid2">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="camera" size={19} />
          {busy ? 'Загрузка…' : 'Скриншот'}
        </button>
        <button type="button" className="btn" onClick={() => setLinkOpen((v) => !v)}>
          <Icon name="link" size={19} />
          Ссылка TV
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      {linkOpen && (
        <div className="row">
          <input
            className="input grow"
            placeholder="https://www.tradingview.com/x/…"
            value={link}
            autoFocus
            inputMode="url"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(link); } }}
          />
          <button type="button" className="btn chrome-btn" onClick={() => addLink(link)}>OK</button>
        </div>
      )}
      <span className="tiny muted">TradingView: камера → «Скопировать ссылку» и вставьте сюда. Или сделайте скриншот графика и прикрепите фото — к выбранному таймфрейму.</span>
      {value.length > 0 && (
        <div className="shots">
          {[...value].sort((a, b) => TIMEFRAMES.indexOf(a.timeframe) - TIMEFRAMES.indexOf(b.timeframe)).map((a) => (
            <Thumb key={a.id} a={a} onClick={() => setEdit(a)} onRemove={() => onChange(value.filter((x) => x.id !== a.id))} />
          ))}
        </div>
      )}
      {edit && (
        <Sheet title="Анализ" onClose={() => setEdit(null)}>
          {shotSrc(edit) && <img src={shotSrc(edit)} alt="" style={{ borderRadius: 12, width: '100%' }} />}
          <div className="chips scroll">
            {TIMEFRAMES.map((t) => (
              <button key={t} type="button" className={`chip sym${edit.timeframe === t ? ' on' : ''}`} onClick={() => setEdit({ ...edit, timeframe: t })}>
                {TIMEFRAME_LABELS[t]}
              </button>
            ))}
          </div>
          <textarea className="input" placeholder="Что видите на этом таймфрейме?" value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          <button
            type="button"
            className="btn chrome-btn block"
            onClick={() => {
              onChange(value.map((x) => (x.id === edit.id ? { ...edit, note: edit.note?.trim() || undefined } : x)));
              setEdit(null);
            }}
          >
            Готово
          </button>
        </Sheet>
      )}
    </div>
  );
}
