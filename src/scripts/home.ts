/**
 * Startseite: Hero-Pizza dreht sich beim Scrollen (nur transform), Stücke
 * lassen sich am Desktop „herausziehen“, Zeitleiste zeigt „jetzt“.
 */
import { onStatus } from './ui/status.ts';
import { reducedMotion } from './ui/util.ts';
import { TIMELINE_END, TIMELINE_START } from '../lib/hours.ts';

const hero = document.querySelector<HTMLElement>('[data-hero]');
const pizza = document.querySelector<HTMLElement>('[data-hero-pizza]');
const caption = document.querySelector<HTMLElement>('[data-slice-caption]');
let rotation = 0;

// --- Drehen beim Scrollen -------------------------------------------------
if (hero && pizza && !reducedMotion()) {
  let ticking = false;
  let visible = true;
  const update = () => {
    ticking = false;
    const max = hero.offsetHeight;
    const y = Math.min(window.scrollY, max);
    rotation = (y / max) * 50;
    pizza.style.transform = `rotate(${rotation.toFixed(2)}deg)`;
  };
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);
  window.addEventListener(
    'scroll',
    () => {
      if (!visible || ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  // Einstiegsanimation nicht überschreiben
  pizza.addEventListener('animationend', update, { once: true });
}

// --- Stücke herausziehen (nur Maus/Trackpad, ab Desktop) -------------------
const fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
function buildSlices() {
  if (!pizza || pizza.classList.contains('has-slices')) return;
  const img = pizza.querySelector('img');
  if (!img) return;
  const src = img.currentSrc || img.src;
  if (!src) return;
  const data = JSON.parse(pizza.dataset.slices ?? '[]') as { id: string; name: string; from: string }[];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 8; i++) {
    const a0 = -90 + i * 45;
    const pts = ['50% 50%'];
    for (let a = a0; a <= a0 + 45; a += 5) {
      const r = (a * Math.PI) / 180;
      pts.push(`${(50 + Math.cos(r) * 50).toFixed(2)}% ${(50 + Math.sin(r) * 50).toFixed(2)}%`);
    }
    const mid = ((a0 + 22.5) * Math.PI) / 180;
    const el = document.createElement('div');
    el.className = 'slice';
    el.style.clipPath = `polygon(${pts.join(',')})`;
    el.style.setProperty('--dx', Math.cos(mid).toFixed(3));
    el.style.setProperty('--dy', Math.sin(mid).toFixed(3));
    el.dataset.product = data[i]?.id ?? '';
    const im = document.createElement('img');
    im.src = src;
    im.alt = '';
    im.decoding = 'async';
    el.appendChild(im);
    frag.appendChild(el);
  }
  pizza.appendChild(frag);
  pizza.classList.add('has-slices');

  let current = -1;
  const setActive = (i: number) => {
    if (i === current) return;
    current = i;
    pizza.querySelectorAll('.slice').forEach((s, k) => s.classList.toggle('is-active', k === i));
    pizza.classList.toggle('is-hovering', i >= 0);
    if (caption) {
      if (i >= 0 && data[i]) {
        caption.textContent = `${data[i].name} · ab ${data[i].from}`;
        caption.classList.add('is-visible');
      } else caption.classList.remove('is-visible');
    }
  };
  pizza.addEventListener('pointermove', (e) => {
    const rect = pizza.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy) / (rect.width / 2);
    if (dist > 0.93 || dist < 0.08) return setActive(-1);
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI - rotation;
    ang = (((ang + 90) % 360) + 360) % 360;
    setActive(Math.floor(ang / 45));
  });
  pizza.addEventListener('pointerleave', () => setActive(-1));
  pizza.addEventListener('click', () => {
    if (current < 0 || !data[current]) return;
    document.dispatchEvent(new CustomEvent('product:open', { detail: { id: data[current].id, variant: 'gross' } }));
  });
}
if (pizza && fine.matches) {
  const img = pizza.querySelector('img');
  if (img?.complete) buildSlices();
  else img?.addEventListener('load', buildSlices, { once: true });
}

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
