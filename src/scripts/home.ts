/**
 * Startseite: Hero (eigenes Modul) und „jetzt“ in der Öffnungszeiten-Zeitleiste.
 */
import './hero/index.ts';
import { onStatus } from './ui/status.ts';
import { TIMELINE_END, TIMELINE_START } from '../lib/hours.ts';

// --- Zeitleiste: „jetzt“ ----------------------------------------------------
const now = document.querySelector<HTMLElement>('[data-tl-now]');
if (now) {
  onStatus((s) => {
    let m = s.now.minutes;
    if (m < TIMELINE_START) m += 1440;
    if (m < TIMELINE_START || m > TIMELINE_END) {
      now.hidden = true;
      return;
    }
    const pct = (m - TIMELINE_START) / (TIMELINE_END - TIMELINE_START);
    now.style.left = `calc(var(--day-w) + (100% - var(--day-w)) * ${pct.toFixed(4)})`;
    now.hidden = false;
  });
}
