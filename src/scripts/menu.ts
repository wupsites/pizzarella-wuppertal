/** Speisekarte: Live-Suche, aktive Kategorie in der Sticky-Leiste. */
import { announce } from './ui/util.ts';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ');

const input = document.getElementById('menu-q') as HTMLInputElement | null;
const form = input?.closest('form');
const dishes = Array.from(document.querySelectorAll<HTMLElement>('[data-dish]'));
const index = dishes.map((el) => ({ el, text: norm(el.dataset.search ?? '') }));
const cats = Array.from(document.querySelectorAll<HTMLElement>('[data-cat]'));
const links = new Map(Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-cat-link]')).map((a) => [a.dataset.catLink ?? '', a]));
const status = document.querySelector<HTMLElement>('[data-search-status]');
const empty = document.querySelector<HTMLElement>('[data-search-empty]');
const term = document.querySelector<HTMLElement>('[data-search-term]');
const menuBar = document.querySelector<HTMLElement>('[data-menu-bar]');

// Höhe der Sticky-Leiste für Anker-Sprünge
const setBarHeight = () => {
  if (menuBar) document.documentElement.style.setProperty('--menubar-h', `${menuBar.offsetHeight}px`);
};
setBarHeight();
window.addEventListener('resize', setBarHeight, { passive: true });

let timer = 0;
function runSearch() {
  const q = norm(input?.value ?? '').trim();
  form?.classList.toggle('has-value', q.length > 0);
  document.querySelectorAll<HTMLElement>('[data-search-clear]').forEach((b) => {
    if (b.closest('form')) b.hidden = q.length === 0;
  });
  const tokens = q.split(/\s+/).filter(Boolean);
  let hits = 0;
  for (const { el, text } of index) {
    const ok = tokens.every((t) => text.includes(t));
    el.classList.toggle('is-hidden', !ok);
    if (ok) hits++;
  }
  for (const c of cats) {
    const any = c.querySelector('[data-dish]:not(.is-hidden)');
    c.classList.toggle('is-hidden', !any);
    links.get(c.dataset.cat ?? '')?.classList.toggle('is-empty', !any);
  }
  if (empty) empty.hidden = !(tokens.length && hits === 0);
  if (term) term.textContent = input?.value ?? '';
  if (status) status.textContent = tokens.length ? (hits ? `${hits} ${hits === 1 ? 'Treffer' : 'Treffer'} für „${input?.value}“` : '') : '';
  window.clearTimeout(timer);
  if (tokens.length) timer = window.setTimeout(() => announce(hits ? `${hits} Treffer` : 'Keine Treffer'), 450);
}

input?.addEventListener('input', () => {
  runSearch();
  if (input.value && window.scrollY > (document.querySelector('.menu-layout') as HTMLElement).offsetTop) {
    window.scrollTo({ top: (document.querySelector('.menu-layout') as HTMLElement).offsetTop - 140, behavior: 'auto' });
  }
});
input?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && input.value) {
    input.value = '';
    runSearch();
  }
});
document.querySelectorAll<HTMLElement>('[data-search-clear]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!input) return;
    input.value = '';
    runSearch();
    input.focus();
  }),
);

// ?suche → Suchfeld fokussieren (Bottom-Bar auf dem Handy)
const params = new URLSearchParams(location.search);
if (params.has('suche') && input) {
  const q = params.get('suche');
  if (q) input.value = q;
  requestAnimationFrame(() => {
    input.focus();
    runSearch();
  });
}
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-search-open]');
  if (!t || !input) return;
  e.preventDefault();
  input.scrollIntoView({ block: 'nearest' });
  input.focus();
});

// Aktive Kategorie hervorheben
const nav = document.querySelector<HTMLElement>('.cat-nav');
let active = '';
function setActive(id: string) {
  if (id === active) return;
  active = id;
  for (const [cid, a] of links) {
    if (cid === id) {
      a.setAttribute('aria-current', 'true');
      if (nav) {
        const left = a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2;
        nav.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    } else a.removeAttribute('aria-current');
  }
}
if ('IntersectionObserver' in window) {
  const visible = new Map<string, number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) visible.set((en.target as HTMLElement).dataset.cat ?? '', en.isIntersecting ? en.boundingClientRect.top : Infinity);
      let best = '';
      let bestTop = Infinity;
      for (const [id, top] of visible) if (top !== Infinity && Math.abs(top) < bestTop) ((bestTop = Math.abs(top)), (best = id));
      // ganz oben: erste Kategorie
      const first = cats.find((c) => !c.classList.contains('is-hidden'));
      if (first && first.getBoundingClientRect().top > window.innerHeight * 0.35) best = first.dataset.cat ?? best;
      if (best) setActive(best);
    },
    { rootMargin: '-35% 0px -55% 0px' },
  );
  cats.forEach((c) => io.observe(c));
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY < 80 && cats[0]) setActive(cats[0].dataset.cat ?? '');
    },
    { passive: true },
  );
}
for (const [id, a] of links) a.addEventListener('click', () => setActive(id));
