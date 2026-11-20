import { demoData } from '../lib/demo';
import { bulkDelete, bulkSave, getState, toast } from '../store';

export async function loadDemo() {
  const s = getState();
  const d = demoData(s.settings);
  toast('Загружаю демо-данные…');
  await bulkSave('accounts', d.accounts);
  await bulkSave('cashflows', d.cashflows);
  await bulkSave('trades', d.trades);
  toast(`Демо: ${d.trades.length} сделок на 3 счетах`);
}

export async function removeDemo() {
  const s = getState();
  await bulkDelete('trades', s.trades.filter((t) => t.source === 'demo').map((t) => t.id));
  await bulkDelete('cashflows', s.cashflows.filter((c) => c.id.startsWith('demo-')).map((c) => c.id));
  await bulkDelete('accounts', s.accounts.filter((a) => a.id.startsWith('demo-')).map((a) => a.id));
  toast('Демо-данные удалены');
}

export const hasDemo = () => getState().trades.some((t) => t.source === 'demo') || getState().accounts.some((a) => a.id.startsWith('demo-'));
