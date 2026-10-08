/**
 * Öffnungszeiten-Zeitleiste („Lange wach.“): Tage anklickbar mit Details,
 * „jetzt“ fährt live mit, mit der Maus lässt sich über die Uhrzeit fahren.
 * Alles nur transform/opacity bzw. Klassen – keine Dauer-Schleife.
 */
import { onStatus } from './status.ts';
import { data } from '../data.ts';
import { DAY_NAMES, TIMELINE_END, TIMELINE_START, formatClock, shiftsForDay, type OpenStatus, type Shift } from '../../lib/hours.ts';
import { $$, announce } from './util.ts';

const SPAN = TIMELINE_END - TIMELINE_START;
const DAY = 1440;

/** 125 → „2 Std. 5 Min.“ */
function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} Min.`;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Nächste (oder laufende) Schicht dieses Wochentags ab jetzt */
function nextShiftOf(weekday: number, s: OpenStatus): Shift | null {
  const nowAbs = s.now.day * DAY + s.now.minutes;
  const hours = data().hours;
  for (let d = s.now.day - 1; d <= s.now.day + 7; d++) {
    for (const sh of shiftsForDay(hours, d)) if (sh.weekday === weekday && sh.end > nowAbs) return sh;
  }
  return null;
}

/** Erster geöffneter Wochentag nach einem Ruhetag */
function reopensAfter(weekday: number): { name: string; open: string } | null {
  const weekly = data().hours.weekly;
  const keys = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const;
  for (let k = 1; k <= 7; k++) {
    const w = (weekday + k) % 7;
    const iv = weekly[keys[w]] ?? [];
    if (iv.length) return { name: DAY_NAMES[w], open: iv[0][0] };
  }
  return null;
}

function detailHtml(weekday: number, s: OpenStatus): string {
  const name = DAY_NAMES[weekday];
  const sh = nextShiftOf(weekday, s);
  if (!sh) {
    const back = reopensAfter(weekday);
    return `<div class="td-in">
      <div class="td-head"><span class="td-day">${name}</span><span class="td-badge">Ruhetag</span></div>
      <p class="td-note">An diesem Tag bleibt der Ofen aus.${back ? ` <strong>${back.name} ab ${back.open} Uhr</strong> sind wir wieder da.` : ''}</p>
    </div>`;
  }
  const nowAbs = s.now.day * DAY + s.now.minutes;
  const lastOrder = sh.end - data().hours.lastOrderMinutesBeforeClose;
  const live = sh.start <= nowAbs;
  const diff = sh.day - s.now.day;
  const badge = live ? 'Jetzt geöffnet' : diff <= 0 ? 'Heute' : diff === 1 ? 'Morgen' : `in ${diff} Tagen`;
  let extra = '';
  if (live) {
    const p = Math.min(1, Math.max(0, (nowAbs - sh.start) / (sh.end - sh.start)));
    const left = sh.end - nowAbs;
    const accepting = nowAbs < lastOrder;
    extra = `<div class="td-live">
      <div class="td-progress" role="presentation"><span style="transform:scaleX(${p.toFixed(3)})"></span></div>
      <div class="td-foot">
        <p class="td-note">${accepting ? `Noch <strong>${duration(left)}</strong> geöffnet – Bestellungen bis ${formatClock(lastOrder)} Uhr.` : `Bestellannahme für heute beendet, wir schließen um ${formatClock(sh.end)} Uhr.`}</p>
        ${accepting ? '<a class="btn btn--primary btn--sm" href="/speisekarte/">Jetzt bestellen</a>' : ''}
      </div>
    </div>`;
  } else if (diff <= 0) {
    extra = `<p class="td-note">Wir öffnen in <strong>${duration(sh.start - nowAbs)}</strong>.</p>`;
  }
  return `<div class="td-in">
    <div class="td-head"><span class="td-day">${name}</span><span class="td-badge${live ? ' is-live' : ''}">${badge}</span></div>
    <div class="td-stats">
      <p><span class="td-cap">Geöffnet</span><span class="td-val">${formatClock(sh.start)} – ${formatClock(sh.end)}</span></p>
      <p><span class="td-cap">Bestellen bis</span><span class="td-val">${formatClock(lastOrder)} Uhr</span></p>
      <p><span class="td-cap">Dauer</span><span class="td-val">${duration(sh.end - sh.start)}</span></p>
    </div>
    ${extra}
  </div>`;
}

export function initTimeline() {
  const fig = document.querySelector<HTMLElement>('[data-timeline]');
  if (!fig) return;
  const body = fig.querySelector<HTMLElement>('[data-tl-body]')!;
  const lane = fig.querySelector<HTMLElement>('.tl-lane')!;
  const now = fig.querySelector<HTMLElement>('[data-tl-now]')!;
  const nowTime = fig.querySelector<HTMLElement>('[data-tl-now-time]')!;
  const cursor = fig.querySelector<HTMLElement>('[data-tl-cursor]')!;
  const cursorTime = fig.querySelector<HTMLElement>('[data-tl-cursor-time]')!;
  const detail = fig.querySelector<HTMLElement>('[data-tl-detail]')!;
  const hint = fig.querySelector<HTMLElement>('[data-tl-hint]');
  const rows = $$<HTMLButtonElement>('.tl-row', fig);
  const ranges = rows.map((r) =>
    (r.dataset.ranges || '')
      .split(',')
      .filter(Boolean)
      .map((x) => x.split('-').map(Number) as [number, number]),
  );

  let selected = -1;
  let userPicked = false;
  let last: OpenStatus | null = null;
  let shown = '';

  /** user: von Hand gewählt (mit Einblendung + Ansage); sonst still
      aktualisieren – die Minuten-Aktualisierung soll nicht flackern */
  const select = (weekday: number, user = false, focus = false) => {
    selected = weekday;
    for (const r of rows) {
      const on = Number(r.dataset.weekday) === weekday;
      r.setAttribute('aria-pressed', String(on));
      if (on && focus) r.focus();
    }
    if (!last) return;
    const html = detailHtml(weekday, last);
    if (html === shown) return;
    shown = html;
    detail.classList.toggle('is-quiet', !user);
    detail.innerHTML = html;
    if (user) announce(detail.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  };

  // Ohne JS sind die Zeilen deaktiviert (nichts zu klicken); jetzt freischalten
  for (const r of rows) {
    r.disabled = false;
    r.addEventListener('click', () => {
      userPicked = true;
      select(Number(r.dataset.weekday), true);
    });
    r.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const i = rows.indexOf(r);
      const n = rows[(i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length];
      userPicked = true;
      select(Number(n.dataset.weekday), true, true);
    });
  }
  detail.hidden = false;
  if (hint) hint.hidden = false;

  onStatus((s) => {
    last = s;
    // Standard: der Tag, dessen Schicht gerade läuft bzw. heute – bis jemand selbst wählt
    if (!userPicked) select(s.activeWeekday);
    else select(selected);
    let m = s.now.minutes;
    if (m < TIMELINE_START) m += DAY;
    if (m < TIMELINE_START || m > TIMELINE_END) {
      now.hidden = true;
      return;
    }
    now.style.setProperty('--x', ((m - TIMELINE_START) / SPAN).toFixed(4));
    nowTime.textContent = formatClock(s.now.minutes);
    now.hidden = false;
  });

  // „jetzt“ fährt erst ein, wenn die Zeitleiste sichtbar ist (nach den Balken)
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      window.setTimeout(() => fig.classList.add('is-live'), 650);
    },
    { threshold: 0.35 },
  );
  io.observe(fig);

  // ---- Uhrzeit überfahren (nur feine Zeiger) -------------------------------
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let px = 0;
  let raf = 0;
  let bucket = -1;
  const paint = () => {
    raf = 0;
    const r = lane.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (px - r.left) / r.width));
    cursor.style.setProperty('--x', p.toFixed(4));
    // Anzeige in 15-Minuten-Schritten; Klassen nur bei Wechsel anfassen
    const t = Math.round((TIMELINE_START + p * SPAN) / 15) * 15;
    if (t === bucket) return;
    bucket = t;
    cursorTime.textContent = formatClock(t);
    rows.forEach((row, i) => row.classList.toggle('is-off', !ranges[i].some(([a, b]) => a <= t && t < b)));
  };
  body.addEventListener('pointermove', (e) => {
    px = e.clientX;
    if (!raf) raf = requestAnimationFrame(paint);
  });
  body.addEventListener('pointerenter', (e) => {
    px = e.clientX;
    fig.classList.add('is-scrub');
    if (!raf) raf = requestAnimationFrame(paint);
  });
  body.addEventListener('pointerleave', () => {
    fig.classList.remove('is-scrub');
    bucket = -1;
    for (const row of rows) row.classList.remove('is-off');
  });
}
