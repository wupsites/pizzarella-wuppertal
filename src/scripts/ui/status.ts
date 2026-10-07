/** Live-Öffnungsstatus (Europe/Berlin) für alle Stellen der Seite. */
import { getStatus, DAY_KEYS, DAY_SHORT, type OpenStatus } from '../../lib/hours.ts';
import { data } from '../data.ts';
import { $$ } from './util.ts';

type Listener = (s: OpenStatus) => void;
const listeners = new Set<Listener>();
let current: OpenStatus | null = null;

export function status(): OpenStatus {
  if (!current) current = getStatus(data().hours);
  return current;
}
export function onStatus(fn: Listener) {
  listeners.add(fn);
  fn(status());
}

function relDay(s: OpenStatus): string {
  if (!s.next) return '';
  if (s.opensDay === 'heute') return 'heute';
  if (s.opensDay === 'morgen') return 'morgen';
  return DAY_SHORT[s.next.weekday];
}

export function chipText(s: OpenStatus): string {
  if (s.open) return `Offen bis ${s.closesAt}`;
  if (!s.next) return 'Geschlossen';
  const d = relDay(s);
  return d === 'heute' ? `Öffnet ${s.opensAt}` : `${d === 'morgen' ? 'Morgen' : d} ab ${s.opensAt}`;
}

export function lineText(s: OpenStatus): string {
  if (s.open) {
    const soon = s.minutesToClose !== null && s.minutesToClose <= 45;
    return soon ? `Noch geöffnet – bis ${s.closesAt} Uhr` : `Jetzt geöffnet – bis ${s.closesAt} Uhr`;
  }
  if (!s.next) return 'Gerade geschlossen';
  if (s.opensDay === 'heute') return `Gerade geschlossen – wir öffnen heute um ${s.opensAt} Uhr`;
  const when = s.opensDay === 'morgen' ? 'morgen' : `am ${s.opensDay}`;
  const todayKey = DAY_KEYS[s.now.weekday];
  const restDay = (data().hours.weekly[todayKey] ?? []).length === 0;
  if (restDay) return `Heute Ruhetag – ${when} ab ${s.opensAt} Uhr wieder da`;
  return `Gerade geschlossen – ${when} ab ${s.opensAt} Uhr wieder da`;
}

function paint() {
  current = getStatus(data().hours);
  const s = current;
  document.documentElement.dataset.open = String(s.open);
  for (const el of $$('[data-status-chip]')) el.textContent = chipText(s);
  for (const el of $$('[data-status-line]')) el.textContent = lineText(s);
  for (const el of $$('[data-status-close]')) el.textContent = s.open ? (s.closesAt ?? '') : (s.opensAt ?? '');
  for (const row of $$('[data-weekday]')) {
    const active = Number(row.dataset.weekday) === s.activeWeekday;
    row.classList.toggle('is-today', active);
    if (active) row.setAttribute('aria-current', 'date');
    else row.removeAttribute('aria-current');
  }
  for (const fn of listeners) fn(s);
}

export function initStatus() {
  paint();
  // zur nächsten vollen Minute, dann minütlich
  const delay = (60 - new Date().getSeconds()) * 1000 + 50;
  window.setTimeout(() => {
    paint();
    window.setInterval(paint, 60_000);
  }, delay);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') paint();
  });
}
