/** Timezone-aware helpers (DST handled by Intl). */

export const EXCHANGE_TZ = 'America/New_York';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

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
    weekday: WD[parts.weekday] ?? 0,
  };
}

export function dayKey(date: Date | string, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * CME trading day: Globex opens at 18:00 New York time, so anything after
 * 18:00 ET belongs to the next day's session.
 */
export function tradingDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dayKey(new Date(d.getTime() + 6 * 3600_000), EXCHANGE_TZ);
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday of the ISO week containing the key */
export function weekStartKey(key: string): string {
  return addDaysKey(key, -weekdayOfKey(key));
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Offset (minutes east of UTC) of a zone at a UTC instant. */
function zoneOffset(zone: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Wall-clock time in an IANA zone → ISO string (DST-safe). */
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

/** Value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatDuration(minutes: number | undefined | null): string {
  if (minutes === undefined || minutes === null || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${(minutes / 60 / 24).toFixed(1)}d`;
}

const DAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatDayKey(key: string, long = false): string {
  const [y, m, d] = key.split('-').map(Number);
  return (long ? DAY_LONG : DAY_FMT).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
