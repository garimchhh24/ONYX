export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number; // 0..23
  minute: number;
  /** 0 = Monday ... 6 = Sunday */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in the given IANA timezone (DST-aware). */
export function zonedParts(date: Date | string, timeZone: string): ZonedParts {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(d)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** "YYYY-MM-DD" of the instant in the given timezone. */
export function dayKey(date: Date | string, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} ч`;
  return `${(minutes / 60 / 24).toFixed(1)} д`;
}

/** Value for <input type="datetime-local"> in the browser's local timezone. */
export function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export const EXCHANGE_TZ = 'America/New_York';

/**
 * CME trading day: the Globex session opens at 18:00 New York time,
 * so anything after 18:00 ET belongs to the next calendar day.
 */
export function tradingDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dayKey(new Date(d.getTime() + 6 * 3600_000), EXCHANGE_TZ);
}

export function todayTradingDay(): string {
  return tradingDay(new Date());
}

const DAY_FMT = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "пн, 18 нояб." for a YYYY-MM-DD key */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const s = DAY_FMT.format(new Date(Date.UTC(y, m - 1, d)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Offset (minutes east of UTC) of a timezone at a given UTC instant. */
function zoneOffset(zone: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Wall-clock time in an IANA zone → ISO (handles DST). */
export function zonedToIso(y: number, mo: number, d: number, hh: number, mm: number, ss: number, zone: string): string {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, ss);
  let off = zoneOffset(zone, guess);
  let ms = guess - off * 60000;
  const off2 = zoneOffset(zone, ms);
  if (off2 !== off) {
    off = off2;
    ms = guess - off * 60000;
  }
  return new Date(ms).toISOString();
}
