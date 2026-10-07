/**
 * Öffnungszeiten-Logik. Rechnet immer in Europe/Berlin – egal, in welcher
 * Zeitzone das Gerät der Besucher:innen steht. Schichten über Mitternacht
 * (z. B. 16:00–01:00) gehören zum Tag, an dem sie beginnen.
 */
import type { DayKey } from '../data/schema.ts';

export type Interval = [string, string];
export interface HoursConfig {
  weekly: Partial<Record<DayKey, Interval[]>>;
  lastOrderMinutesBeforeClose: number;
  exceptions: { date: string; intervals: Interval[]; note?: string }[];
}

export const DAY_KEYS: DayKey[] = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const TZ = 'Europe/Berlin';
const MIN_PER_DAY = 1440;

export interface LocalNow {
  /** Tage seit 1970-01-01 (lokales Datum) */
  day: number;
  /** 0 = Montag … 6 = Sonntag */
  weekday: number;
  /** Minuten seit lokaler Mitternacht */
  minutes: number;
  iso: string;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function berlinNow(date: Date = new Date()): LocalNow {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  // 1970-01-01 war ein Donnerstag (Index 3 bei Montag = 0)
  const weekday = (((day + 3) % 7) + 7) % 7;
  return { day, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute), iso: `${parts.year}-${parts.month}-${parts.day}` };
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function formatClock(absMinutes: number): string {
  const m = ((absMinutes % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  if (m === 0 && absMinutes > 0) return '24:00';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function isoOfDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export interface Shift {
  /** absolute Minuten (Tag * 1440 + Minuten) */
  start: number;
  end: number;
  /** Tag, an dem die Schicht beginnt */
  day: number;
  weekday: number;
}

export function shiftsForDay(cfg: HoursConfig, day: number): Shift[] {
  const weekday = (((day + 3) % 7) + 7) % 7;
  const exception = cfg.exceptions.find((e) => e.date === isoOfDay(day));
  const intervals = exception ? exception.intervals : (cfg.weekly[DAY_KEYS[weekday]] ?? []);
  return intervals.map(([open, close]) => {
    const s = toMinutes(open);
    let e = toMinutes(close);
    if (e <= s) e += MIN_PER_DAY;
    return { start: day * MIN_PER_DAY + s, end: day * MIN_PER_DAY + e, day, weekday };
  });
}

export interface OpenStatus {
  open: boolean;
  /** Bestellungen werden noch angenommen (vor Annahmeschluss) */
  accepting: boolean;
  current: Shift | null;
  next: Shift | null;
  closesAt: string | null;
  minutesToClose: number | null;
  opensAt: string | null;
  /** "heute", "morgen" oder Wochentag */
  opensDay: string | null;
  minutesToOpen: number | null;
  /** Wochentag-Index des Tages, dessen Schicht gerade läuft bzw. heute */
  activeWeekday: number;
  now: LocalNow;
}

export function getStatus(cfg: HoursConfig, date: Date = new Date()): OpenStatus {
  const now = berlinNow(date);
  const nowAbs = now.day * MIN_PER_DAY + now.minutes;
  const shifts: Shift[] = [];
  for (let d = now.day - 1; d <= now.day + 8; d++) shifts.push(...shiftsForDay(cfg, d));
  shifts.sort((a, b) => a.start - b.start);

  const current = shifts.find((s) => s.start <= nowAbs && nowAbs < s.end) ?? null;
  const next = shifts.find((s) => s.start > nowAbs) ?? null;
  const lastOrder = current ? current.end - cfg.lastOrderMinutesBeforeClose : null;

  let opensDay: string | null = null;
  if (next) {
    const diff = next.day - now.day;
    opensDay = diff === 0 ? 'heute' : diff === 1 ? 'morgen' : DAY_NAMES[next.weekday];
  }

  return {
    open: Boolean(current),
    accepting: Boolean(current && lastOrder !== null && nowAbs < lastOrder),
    current,
    next,
    closesAt: current ? formatClock(current.end) : null,
    minutesToClose: current ? current.end - nowAbs : null,
    opensAt: next ? formatClock(next.start) : null,
    opensDay,
    minutesToOpen: next ? next.start - nowAbs : null,
    activeWeekday: current ? current.weekday : now.weekday,
    now,
  };
}

export interface Slot {
  /** lokale Zeit "YYYY-MM-DDTHH:MM" (Europe/Berlin) */
  value: string;
  label: string;
}

/** Wunschzeiten für Vorbestellungen: im laufenden oder nächsten Zeitfenster (max. 24 h voraus). */
export function preorderSlots(cfg: HoursConfig, date: Date, stepMinutes: number, leadMinutes = 30): Slot[] {
  const status = getStatus(cfg, date);
  const nowAbs = status.now.day * MIN_PER_DAY + status.now.minutes;
  const shift = status.current ?? (status.next && status.next.start - nowAbs <= MIN_PER_DAY ? status.next : null);
  if (!shift) return [];
  const last = shift.end - cfg.lastOrderMinutesBeforeClose;
  let t = Math.max(shift.start + leadMinutes, nowAbs + leadMinutes);
  t = Math.ceil(t / stepMinutes) * stepMinutes;
  const slots: Slot[] = [];
  for (; t <= last && slots.length < 64; t += stepMinutes) {
    const day = Math.floor(t / MIN_PER_DAY);
    const m = t - day * MIN_PER_DAY;
    const clock = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    // Zeiten nach Mitternacht innerhalb der laufenden Schicht ohne Tagesangabe
    const dayLabel =
      shift === status.current || shift.day === status.now.day
        ? ''
        : shift.day === status.now.day + 1
          ? 'morgen '
          : `${DAY_SHORT[shift.weekday]} `;
    slots.push({ value: `${isoOfDay(day)}T${clock}`, label: `${dayLabel}${clock} Uhr` });
  }
  return slots;
}

/** Für Anzeige: "16:00–01:00" bzw. "Ruhetag" je Wochentag. */
export function weeklyRows(cfg: HoursConfig): { key: DayKey; name: string; short: string; intervals: Interval[]; label: string }[] {
  return DAY_KEYS.map((key, i) => {
    const intervals = cfg.weekly[key] ?? [];
    return {
      key,
      name: DAY_NAMES[i],
      short: DAY_SHORT[i],
      intervals,
      label: intervals.length ? intervals.map(([a, b]) => `${a}–${b}`).join(', ') : 'Ruhetag',
    };
  });
}

/** schema.org openingHoursSpecification */
export function openingHoursSpec(cfg: HoursConfig) {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return DAY_KEYS.flatMap((key, i) =>
    (cfg.weekly[key] ?? []).map(([opens, closes]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${names[i]}`,
      opens,
      closes: closes === '24:00' ? '23:59' : closes,
    })),
  );
}

/** „Freitag und Samstag bis 2 Uhr, … Mittwoch ist Ruhetag.“ – aus den Daten erzeugt */
export function closingSentence(cfg: HoursConfig): string {
  const groups = new Map<string, string[]>();
  const closed: string[] = [];
  DAY_KEYS.forEach((key, i) => {
    const iv = cfg.weekly[key] ?? [];
    if (!iv.length) return closed.push(DAY_NAMES[i]);
    const close = iv[iv.length - 1][1];
    const list = groups.get(close) ?? [];
    list.push(DAY_NAMES[i]);
    groups.set(close, list);
  });
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}` : xs[0]);
  const clock = (t: string) => {
    if (t === '24:00' || t === '00:00') return 'Mitternacht';
    const [h, m] = t.split(':').map(Number);
    return m ? `${h}:${String(m).padStart(2, '0')} Uhr` : `${h} Uhr`;
  };
  const order = [...groups.entries()].sort((a, b) => {
    const v = (t: string) => {
      const n = toMinutes(t);
      return n < 720 ? n + 1440 : n;
    };
    return v(b[0]) - v(a[0]);
  });
  const parts = order.map(([close, days]) => `${join(days)} bis ${clock(close)}`);
  let s = parts.join(', ') + '.';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (closed.length) s += ` ${join(closed)} ${closed.length > 1 ? 'sind' : 'ist'} Ruhetag.`;
  return s;
}

/** Balken für die Wochen-Zeitleiste (Achse 12:00 → 03:00) */
export const TIMELINE_START = 12 * 60;
export const TIMELINE_END = 27 * 60;
export function timelineBars(cfg: HoursConfig) {
  const span = TIMELINE_END - TIMELINE_START;
  return DAY_KEYS.map((key, i) => ({
    key,
    weekday: i,
    name: DAY_NAMES[i],
    short: DAY_SHORT[i],
    bars: (cfg.weekly[key] ?? []).map(([open, close]) => {
      const s = toMinutes(open);
      let e = toMinutes(close);
      if (e <= s) e += 1440;
      return {
        open,
        close,
        left: Math.max(0, ((s - TIMELINE_START) / span) * 100),
        width: ((Math.min(e, TIMELINE_END) - Math.max(s, TIMELINE_START)) / span) * 100,
      };
    }),
  }));
}
