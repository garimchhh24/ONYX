import { useEffect, useRef, useState } from 'react';
import type { Instrument } from '../types';
import { fmtPrice } from '../lib/calc';
import type { Recognition } from '../lib/vision';
import { recognizeScreenshot, useVisionAvailable, visionErrorText, type VisionError } from '../lib/vision-client';
import { Icon } from '../ui';

type Phase = 'idle' | 'working' | 'done' | 'error';

/**
 * "Fill from a screenshot": the trader picks a TradingView screenshot of the position,
 * Claude reads it, and the trade form is filled in. Hidden where Claude can't read images.
 */
export function ScreenshotFill({
  instruments,
  initialFile,
  onFilled,
  onAttach,
}: {
  instruments: Instrument[];
  initialFile?: File;
  onFilled: (r: Recognition) => void;
  onAttach: (file: File) => void;
}) {
  const available = useVisionAvailable();
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [rec, setRec] = useState<Recognition | null>(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = useRef<File | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const run = async (file: File, refresh = false) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    if (current.current !== file) {
      current.current = file;
      setPreview(URL.createObjectURL(file));
      onAttach(file);
    }
    setPhase('working');
    setError('');
    try {
      const r = await recognizeScreenshot(file, instruments, { signal: c.signal, refresh });
      if (c.signal.aborted) return;
      setRec(r);
      if (!r.found) {
        setPhase('error');
        setError(r.note || 'Позицию на скриншоте найти не удалось. Нужен график с инструментом Long/Short Position или открытой сделкой.');
        return;
      }
      onFilled(r);
      setPhase('done');
    } catch (e) {
      if (c.signal.aborted && (e as VisionError).code === 'cancelled') return;
      const text = visionErrorText((e as VisionError).code);
      if (!text) {
        setPhase('idle');
        return;
      }
      setPhase('error');
      setError(text);
    }
  };

  // a screenshot picked on the home screen arrives with the editor
  const started = useRef(false);
  useEffect(() => {
    if (!initialFile || started.current || available !== true) return;
    started.current = true;
    void run(initialFile);
    return () => {
      started.current = false; // a remount (React dev mode) starts it again
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile, available]);

  if (available !== true) return null;

  const pick = (files: FileList | null | undefined) => {
    const f = files && Array.from(files).find((x) => x.type.startsWith('image/'));
    if (f) void run(f);
  };

  return (
    <section
      className={`card shotfill${drag ? ' drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        const f = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
        if (f) {
          e.preventDefault();
          void run(f);
        }
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />

      {phase === 'idle' && (
        <button type="button" className="shotfill-cta" onClick={() => fileRef.current?.click()}>
          <span className="shotfill-icon"><Icon name="camera" size={24} /></span>
          <span className="grow">
            <b>Заполнить по скриншоту</b>
            <span>Скриншот позиции из TradingView — инструмент, вход, стоп, тейк и объём заполнятся сами</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      {phase !== 'idle' && (
        <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          <div className={`shot-thumb${phase === 'working' ? ' scanning' : ''}`}>{preview && <img src={preview} alt="Скриншот позиции" />}</div>
          <div className="grow stack" style={{ gap: 6 }}>
            {phase === 'working' && (
              <>
                <b>Читаю скриншот…</b>
                <span className="small dim">Обычно 10–40 секунд. При первом запуске Claude попросит разрешение.</span>
                <div><button type="button" className="btn sm" onClick={() => { ctl.current?.abort(); setPhase('idle'); }}>Отмена</button></div>
              </>
            )}
            {phase === 'done' && rec && <Summary r={rec} />}
            {phase === 'error' && <span className="small" style={{ color: '#ffd16e' }}>{error}</span>}
            {(phase === 'done' || phase === 'error') && (
              <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                {current.current && (
                  <button type="button" className="btn sm" onClick={() => void run(current.current!, true)}>
                    Распознать заново
                  </button>
                )}
                <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>
                  Другой скриншот
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ r }: { r: Recognition }) {
  const parts = [
    r.entry !== undefined && `вход ${fmtPrice(r.entry)}`,
    r.stop !== undefined && `стоп ${fmtPrice(r.stop)}`,
    r.target !== undefined && `тейк ${fmtPrice(r.target)}`,
  ].filter(Boolean);
  const exit =
    r.exit === undefined
      ? r.pnl !== undefined
        ? `результат со скриншота ${r.pnl > 0 ? '+' : ''}${r.pnl}`
        : 'выход не виден — укажите его'
      : `выход ${fmtPrice(r.exit)}${r.exitSource === 'target' ? ' (тейк)' : r.exitSource === 'stop' ? ' (стоп)' : ''}`;
  return (
    <>
      <b>
        <span className="pos" style={{ marginRight: 6 }}><Icon name="check" size={16} stroke={2.6} /></span>
        {[r.symbol ?? 'инструмент?', r.direction === 'long' ? 'Long' : r.direction === 'short' ? 'Short' : null, r.quantity ? `×${r.quantity}` : null].filter(Boolean).join(' · ')}
      </b>
      {parts.length > 0 && <span className="small dim num">{parts.join(' · ')}</span>}
      <span className="small dim">{exit}</span>
      {r.confidence < 0.6 && <span className="small" style={{ color: '#ffd16e' }}>Claude не уверен в значениях — сверьте их со скриншотом.</span>}
      {r.warnings.map((w) => (
        <span key={w} className="small" style={{ color: '#ffd16e' }}>{w}</span>
      ))}
      {r.note && <span className="tiny muted">{r.note}</span>}
      <span className="tiny muted">Проверьте поля ниже перед сохранением.</span>
    </>
  );
}
