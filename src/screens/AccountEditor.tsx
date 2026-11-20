import { useState } from 'react';
import type { Account, DrawdownType, Phase } from '../types';
import { useJournal, useNav } from '../context';
import { money, uid } from '../lib/calc';
import { FIRMS, SIZE_PRESETS } from '../lib/prop';
import { todayTradingDay } from '../lib/time';
import { saveAccount, saveCashflow, toast } from '../store';
import { Field, Icon, NumInput, Seg, TopBar } from '../ui';

const sizeLabel = (n: number) => `${n / 1000}K`;

function autoName(size: number, phase: Phase) {
  return `${sizeLabel(size)} ${phase === 'eval' ? 'Challenge' : phase === 'funded' ? 'Funded' : 'Live'}`;
}

export function AccountEditor({ id, template }: { id?: string; template?: Partial<Account> }) {
  const { s } = useJournal();
  const nav = useNav();
  const base = id ? s.accounts.find((a) => a.id === id) : undefined;
  const now = new Date().toISOString();
  const [a, setA] = useState<Account>(() => {
    if (base) return base;
    const p = SIZE_PRESETS[1];
    const phase = template?.phase ?? 'eval';
    const size = template?.size ?? p.size;
    return {
      id: uid(),
      firm: template?.firm ?? '',
      name: template?.name ?? autoName(size, phase),
      size,
      phase,
      status: 'active',
      startBalance: size,
      startDate: todayTradingDay(),
      profitTarget: phase === 'eval' ? p.target : undefined,
      maxDrawdown: template?.maxDrawdown ?? p.maxDrawdown,
      drawdownType: template?.drawdownType ?? 'eod',
      drawdownLock: phase === 'eval' ? 0 : 100,
      maxContracts: template?.maxContracts ?? p.maxContracts,
      createdAt: now,
      updatedAt: now,
    };
  });
  const [nameTouched, setNameTouched] = useState(!!base || !!template?.name);
  const [customFirm, setCustomFirm] = useState(!!a.firm && !FIRMS.includes(a.firm));
  const [cost, setCost] = useState<number | undefined>();
  const set = <K extends keyof Account>(k: K, v: Account[K]) => setA((p) => ({ ...p, [k]: v }));

  const applySize = (size: number) => {
    const p = SIZE_PRESETS.find((x) => x.size === size);
    setA((prev) => ({
      ...prev,
      size,
      startBalance: base ? prev.startBalance : size,
      ...(p ? { profitTarget: prev.phase === 'eval' ? p.target : undefined, maxDrawdown: p.maxDrawdown, maxContracts: p.maxContracts } : {}),
      name: nameTouched ? prev.name : autoName(size, prev.phase),
    }));
  };
  const applyPhase = (phase: Phase) => {
    setA((prev) => ({
      ...prev,
      phase,
      profitTarget: phase === 'eval' ? prev.profitTarget ?? SIZE_PRESETS.find((x) => x.size === prev.size)?.target : prev.profitTarget,
      name: nameTouched ? prev.name : autoName(prev.size, phase),
    }));
  };

  const valid = a.name.trim() && a.startBalance > 0 && a.maxDrawdown > 0;
  const save = async () => {
    if (!valid) return;
    const acc: Account = { ...a, name: a.name.trim(), firm: a.firm.trim() || 'Проп-фирма' };
    nav.pop();
    await saveAccount(acc);
    if (!base && cost) {
      await saveCashflow({ id: uid(), accountId: acc.id, date: acc.startDate, type: acc.phase === 'eval' ? 'fee' : 'activation', amount: cost, createdAt: now });
    }
    toast(base ? 'Счёт обновлён' : 'Счёт добавлен');
  };

  return (
    <>
      <TopBar left={<button className="icon-btn" onClick={nav.pop} aria-label="Закрыть"><Icon name="close" /></button>} title={base ? 'Правила счёта' : 'Новый счёт'} />
      <div className="stack-lg">
        <Field label="Проп-фирма">
          <div className="chips">
            {FIRMS.map((f) => (
              <button key={f} type="button" className={`chip${!customFirm && a.firm === f ? ' on' : ''}`} onClick={() => { setCustomFirm(false); set('firm', f); }}>{f}</button>
            ))}
            <button type="button" className={`chip${customFirm ? ' on' : ''}`} onClick={() => { setCustomFirm(true); set('firm', ''); }}>Другая</button>
          </div>
          {customFirm && <input className="input" placeholder="Название фирмы" value={a.firm} onChange={(e) => set('firm', e.target.value)} />}
        </Field>

        <Field label="Этап">
          <Seg value={a.phase} options={[['eval', 'Challenge'], ['funded', 'Funded'], ['live', 'Live']]} onChange={applyPhase} />
        </Field>

        <Field label="Размер счёта">
          <div className="chips">
            {SIZE_PRESETS.map((p) => (
              <button key={p.size} type="button" className={`chip sym${a.size === p.size ? ' on' : ''}`} onClick={() => applySize(p.size)}>{sizeLabel(p.size)}</button>
            ))}
          </div>
        </Field>

        <div className="grid2">
          <Field label="Название"><input className="input" value={a.name} onChange={(e) => { setNameTouched(true); set('name', e.target.value); }} /></Field>
          <Field label="Дата старта"><input className="input" type="date" value={a.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        </div>

        <div className="banner info">
          <Icon name="alert" size={18} />
          <span>Правила подставлены типичные для размера {sizeLabel(a.size)}. Сверьте их с условиями своей фирмы и плана — они отличаются.</span>
        </div>

        <div className="grid2">
          <Field label="Стартовый баланс, $"><NumInput value={a.startBalance} onChange={(v) => set('startBalance', v ?? 0)} /></Field>
          {a.phase === 'eval' ? (
            <Field label="Цель прибыли, $"><NumInput value={a.profitTarget} onChange={(v) => set('profitTarget', v)} /></Field>
          ) : (
            <Field label="Мин. дней до выплаты"><NumInput value={a.minDays} onChange={(v) => set('minDays', v)} placeholder="—" /></Field>
          )}
          <Field label="Макс. просадка, $"><NumInput value={a.maxDrawdown} onChange={(v) => set('maxDrawdown', v ?? 0)} /></Field>
          <Field label="Дневной лимит, $"><NumInput value={a.dailyLossLimit} onChange={(v) => set('dailyLossLimit', v)} placeholder="нет" /></Field>
        </div>

        <Field label="Тип просадки" hint={a.drawdownType === 'eod' ? 'Порог поднимается по балансу на закрытии дня.' : a.drawdownType === 'intraday' ? 'Порог тянется за максимумом баланса внутри дня.' : 'Порог не двигается: старт минус просадка.'}>
          <Seg<DrawdownType> value={a.drawdownType} options={[['eod', 'EOD'], ['intraday', 'Интрадей'], ['static', 'Статичная']]} onChange={(v) => set('drawdownType', v)} />
        </Field>

        {a.drawdownType !== 'static' && (
          <Field label="Порог перестаёт расти на уровне" hint={`Старт + ${money(a.drawdownLock, { cents: false })} = ${money(a.startBalance + a.drawdownLock, { cents: false })}`}>
            <Seg value={[0, 100].includes(a.drawdownLock) ? String(a.drawdownLock) : 'custom'} options={[['0', 'Старт'], ['100', 'Старт + $100'], ['custom', 'Другое']]} onChange={(v) => set('drawdownLock', v === 'custom' ? a.drawdownLock || 50 : Number(v))} />
            {![0, 100].includes(a.drawdownLock) && <NumInput value={a.drawdownLock} onChange={(v) => set('drawdownLock', v ?? 0)} />}
          </Field>
        )}

        <div className="grid2">
          <Field label="Консистентность, %" hint="лучший день ≤ % от прибыли"><NumInput value={a.consistencyPct} onChange={(v) => set('consistencyPct', v)} placeholder="нет" /></Field>
          <Field label="Макс. контрактов (мини)" hint="10 микро = 1 мини"><NumInput value={a.maxContracts} onChange={(v) => set('maxContracts', v)} placeholder="нет" /></Field>
          {a.phase === 'eval' && <Field label="Мин. торговых дней"><NumInput value={a.minDays} onChange={(v) => set('minDays', v)} placeholder="нет" /></Field>}
          {!base && <Field label={a.phase === 'eval' ? 'Стоимость челленджа, $' : 'Активация, $'}><NumInput value={cost} onChange={setCost} placeholder="для окупаемости" /></Field>}
        </div>

        <Field label="Заметки"><textarea className="input" value={a.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} placeholder="Правила выплат, особенности плана…" /></Field>
      </div>
      <div className="sticky-save">
        <div><button className="btn chrome-btn block" disabled={!valid} onClick={save}><Icon name="check" size={20} stroke={2.4} />Сохранить</button></div>
      </div>
    </>
  );
}
