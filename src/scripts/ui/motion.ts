/** Scroll-Reveals („Aufgehen“) und Kopfzeilen-Zustand. Nur transform/opacity. */
import { reducedMotion } from './util.ts';

export function initReveals() {
  const els = document.querySelectorAll<HTMLElement>('.reveal');
  if (!els.length) return;
  if (reducedMotion() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}

export function initHeader() {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  // Startseite: solange der Hero (auch gepinnt) unter der Kopfzeile liegt, bleibt
  // sie durchsichtig – kein Weichzeichner über der animierten Pizza, der in
  // jedem Bild neu berechnet werden müsste
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (hero && header.classList.contains('is-overlay') && 'IntersectionObserver' in window) {
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io?.disconnect();
      const h = header.offsetHeight || 72;
      io = new IntersectionObserver(([e]) => header.classList.toggle('is-scrolled', !e.isIntersecting), {
        rootMargin: `0px 0px ${-(window.innerHeight - h)}px 0px`,
      });
      io.observe(hero);
    };
    watch();
    let rt = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(rt);
      rt = window.setTimeout(watch, 200);
    });
    return;
  }
  let ticking = false;
  const update = () => {
    ticking = false;
    header.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}
