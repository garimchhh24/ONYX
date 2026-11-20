import { useJournal } from '../context';

export function SyncBadge() {
  const { s } = useJournal();
  if (s.backend === 'cloud') {
    return (
      <span className={`sync${s.stale || s.error ? ' stale' : ''}`} title={s.error ?? 'Синхронизируется между вашими устройствами через Claude'}>
        <i />{s.stale || s.error ? 'нет связи' : 'синхр.'}
      </span>
    );
  }
  return (
    <span className="sync local" title="Данные хранятся только на этом устройстве">
      <i />на устройстве
    </span>
  );
}
