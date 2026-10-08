/**
 * „Erstelle deine eigene Pizza“ – Verhalten. Wird erst beim ersten Öffnen
 * geladen (siehe menu.ts). Bedienung zuerst: jede Zutat ist ein großer
 * Knopf (Klick/Tipp), Ziehen auf die Pizza ist nur ein Extra für Maus.
 *
 * Bewegung nur über transform/opacity (Web Animations), keine Schleife im
 * Leerlauf. Bei reduzierter Bewegung erscheint alles sofort.
 */
import { cart } from '../store.ts';
import { closeDialog, enhanceDialog, openDialog } from '../ui/dialog.ts';
import { announce, reducedMotion } from '../ui/util.ts';
import { toast } from '../ui/toast.ts';
import { formatEuro } from '../../lib/pricing.ts';
import { coverSprite, look, loadAtlas, spots, tileCss, type Atlas } from './toppings.ts';
import { flyToCart } from './peel.ts';

interface Data {
  base: { id: string; name: string };
  group: string;
  max: number;
  size: string;
  sizes: { id: string; label: string; detail: string; price: number }[];
  choices: Record<string, { label: string; prices: Record<string, number>; z: number }>;
  classics: { id: string; name: string; choices: string[]; prices: Record<string, number> }[];
}

type Change = { kind: 'remove'; id: string; at: number } | { kind: 'reset'; items: string[]; size: string };

const dialog = document.getElementById('pizza-builder') as HTMLDialogElement | null;
const D: Data | null = (() => {
  const el = document.getElementById('pb-data');
  return el ? (JSON.parse(el.textContent || 'null') as Data) : null;
})();

const SIZE_SCALE: Record<string, number> = { klein: 0.86, gross: 1 };
const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';

let ready = false;
let atlas: Atlas | null = null;
let size = D?.size ?? 'gross';
let items: string[] = [];
let last: Change | null = null;
let noteTimer = 0;

const $ = <T extends Element = HTMLElement>(s: string) => dialog!.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(dialog!.querySelectorAll<T>(s));

function priceOf(id: string, v = size) {
  return D!.choices[id]?.prices[v] ?? 0;
}
function basePrice(v = size) {
  return D!.sizes.find((s) => s.id === v)?.price ?? 0;
}
function total() {
  return basePrice() + items.reduce((n, id) => n + priceOf(id), 0);
}
function sizeIndex() {
  return size === 'klein' ? 0 : 1;
}

// ---------------------------------------------------------------- Pizza-Ansicht
const pieces = new Map<string, HTMLElement[]>();

function pieceBase(x: number, y: number, rot: number, scale: number) {
  return { left: `${50 + x * 47}%`, top: `${50 + y * 47}%`, t: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})` };
}

async function placeIngredient(id: string, opts: { from?: { x: number; y: number }; animate?: boolean; startIndex?: number } = {}) {
  const L = look(id);
  const host = $('[data-pb-tops]');
  const list = pieces.get(id) ?? [];
  pieces.set(id, list);
  const want = L.cover ? 1 : L.n[sizeIndex()];
  const all = spots(id, Math.max(L.n[0], L.n[1]));
  const anim = opts.animate !== false && !reducedMotion();
  const z = (L.z + 1) * 100 + items.indexOf(id);
  const created: HTMLElement[] = [];
  for (let i = list.length; i < want; i++) {
    let el: HTMLElement;
    if (L.cover) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      const px = Math.round(host.clientWidth * 0.94 * Math.min(window.devicePixelRatio || 1, 2));
      img.src = await coverSprite(id, Math.max(256, px));
      img.className = 'pb-pc';
      img.style.cssText = `left:50%;top:50%;width:94%;transform:translate(-50%,-50%);z-index:${z}`;
      el = img;
    } else {
      const s = all[i];
      const b = pieceBase(s.x, s.y, s.rot, s.scale);
      el = document.createElement('i');
      el.className = 'pb-pc';
      el.style.cssText = `${atlas ? tileCss(atlas, id, s.v) : ''};left:${b.left};top:${b.top};width:${((47 * L.size * 2) / 0.68).toFixed(2)}%;transform:${b.t};z-index:${z}`;
      el.dataset.t = b.t;
    }
    // nur noch aktuell? (schnelles Hin und Her)
    if (!items.includes(id)) return;
    host.appendChild(el);
    list.push(el);
    created.push(el);
  }
  if (!anim) return;
  created.forEach((el, k) => {
    const t = el.dataset.t ?? 'translate(-50%, -50%)';
    const delay = k * (L.cover ? 0 : 22);
    if (opts.from && !L.cover) {
      // vom Ablegepunkt auf den echten Platz: kurzer Bogen, leichtes Stauchen
      const r = host.getBoundingClientRect();
      const ex = el.offsetLeft;
      const ey = el.offsetTop;
      const dx = opts.from.x - r.left - ex;
      const dy = opts.from.y - r.top - ey;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) ${t} scale(1.18)`, opacity: 0.0, offset: 0 },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 26}px) ${t} scale(1.12)`, opacity: 1, offset: 0.45 },
          { transform: `${t} scaleY(0.9) scaleX(1.05)`, offset: 0.78 },
          { transform: t, offset: 1 },
        ],
        { duration: 520, delay, easing: ease, fill: 'backwards' },
      );
    } else if (L.cover) {
      el.animate([{ opacity: 0, transform: `${t} scale(0.96)` }, { opacity: 1, transform: t }], { duration: 420, easing: ease });
    } else {
      // kurzer Fall, leichtes Stauchen, weiches Setzen
      el.animate(
        [
          { transform: `translateY(-34px) ${t} scale(1.12)`, opacity: 0, offset: 0 },
          { transform: `translateY(0) ${t} scale(1.02)`, opacity: 1, offset: 0.62 },
          { transform: `${t} scaleY(0.92) scaleX(1.04)`, offset: 0.8 },
          { transform: t, offset: 1 },
        ],
        { duration: 440, delay, easing: ease, fill: 'backwards' },
      );
    }
  });
}

function liftOff(els: HTMLElement[], stagger = 10) {
  if (reducedMotion()) {
    els.forEach((el) => el.remove());
    return;
  }
  els.forEach((el, k) => {
    const t = el.dataset.t ?? el.style.transform;
    const a = el.animate(
      [
        { transform: t, opacity: 1 },
        { transform: `translateY(-12px) ${t} scale(1.06)`, opacity: 0 },
      ],
      { duration: 240, delay: k * stagger, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    a.onfinish = () => el.remove();
  });
}

function removePieces(id: string) {
  const list = pieces.get(id) ?? [];
  pieces.delete(id);
  liftOff(list);
}

/** Stückzahl an die Größe anpassen (groß = mehr Belag) */
function syncCounts() {
  for (const id of items) {
    const L = look(id);
    if (L.cover) continue;
    const list = pieces.get(id) ?? [];
    const want = L.n[sizeIndex()];
    if (list.length > want) liftOff(list.splice(want));
    else if (list.length < want) placeIngredient(id);
  }
}

// ---------------------------------------------------------------- Zustand → Oberfläche
let shownTotal = -1;
function paint() {
  const max = D!.max;
  const full = items.length >= max;
  for (const b of $$<HTMLButtonElement>('[data-ing]')) {
    const on = items.includes(b.dataset.ing!);
    b.setAttribute('aria-pressed', String(on));
    const off = full && !on;
    b.setAttribute('aria-disabled', String(off));
    b.title = off ? `Maximal ${max} Extras` : '';
  }
  $('[data-pb-count]').textContent = `${items.length} von ${max} Extras${full ? ' – mehr geht nicht' : ''}`;
  // Zusammenfassung
  const s = D!.sizes.find((x) => x.id === size)!;
  $('[data-pb-size-label]').textContent = `${s.label} ${s.detail}`.trim();
  $('[data-pb-base-price]').textContent = formatEuro(s.price);
  const lines = $('[data-pb-lines]');
  lines.querySelectorAll('.pb-line--x').forEach((n) => n.remove());
  for (const id of items) {
    const li = document.createElement('li');
    li.className = 'pb-line pb-line--x';
    const p = priceOf(id);
    li.innerHTML = `<span>+ ${escapeHtml(D!.choices[id].label)}</span><span class="num">${p ? formatEuro(p) : 'inklusive'}</span>`;
    lines.appendChild(li);
  }
  ($('[data-pb-last]') as HTMLButtonElement).disabled = items.length === 0;
  ($('[data-pb-reset]') as HTMLButtonElement).disabled = items.length === 0 && size === D!.size;
  setTotal(total());
  tip();
}

function setTotal(v: number) {
  const bar = $('[data-pb-total-bar]');
  bar.textContent = formatEuro(v);
  const out = $('[data-pb-total]');
  if (v === shownTotal) return;
  const up = v > shownTotal;
  shownTotal = v;
  // schnelle Folge: nur der zuletzt sichtbare Preis gleitet weg
  const spans = Array.from(out.querySelectorAll('span'));
  spans.slice(0, -1).forEach((sp) => sp.remove());
  const old = spans[spans.length - 1];
  const next = document.createElement('span');
  next.textContent = formatEuro(v);
  if (!old || reducedMotion()) {
    out.replaceChildren(next);
    return;
  }
  // alter Preis gleitet weg, neuer kommt nach – 200 ms
  old.style.position = 'absolute';
  old.style.right = '0';
  out.appendChild(next);
  const d = up ? 1 : -1;
  old.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${-60 * d}%)`, opacity: 0 }], { duration: 200, easing: ease, fill: 'forwards' }).onfinish = () => old.remove();
  next.animate([{ transform: `translateY(${60 * d}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: ease });
  bar.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 220 });
}

function tip() {
  const el = $('[data-pb-tip]');
  const key = [...items].sort().join('+');
  const c = D!.classics.find((x) => x.choices.join('+') === key && x.prices[size] !== undefined && x.prices[size] < total());
  if (!c) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `Gibt’s fertig: <strong>${escapeHtml(c.name)}</strong> für ${formatEuro(c.prices[size])} statt ${formatEuro(total())}.<button type="button" data-pb-classic="${c.id}">Die nehmen</button>`;
  el.hidden = false;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ---------------------------------------------------------------- Aktionen
function add(id: string, from?: { x: number; y: number }) {
  if (items.includes(id)) return;
  if (items.length >= D!.max) {
    note(`Maximal ${D!.max} Extras pro Pizza.`);
    return;
  }
  items.push(id);
  paint();
  placeIngredient(id, { from });
  const p = priceOf(id);
  announce(`${D!.choices[id].label} hinzugefügt${p ? `, plus ${formatEuro(p)}` : ''}. Gesamt ${formatEuro(total())}.`);
}

function remove(id: string, quiet = false) {
  const at = items.indexOf(id);
  if (at < 0) return;
  items.splice(at, 1);
  removePieces(id);
  paint();
  if (quiet) return;
  last = { kind: 'remove', id, at };
  note(`${D!.choices[id].label} entfernt`, true);
  announce(`${D!.choices[id].label} entfernt. Gesamt ${formatEuro(total())}.`);
}

function setSize(v: string, user = true) {
  if (v === size) return;
  size = v;
  $('[data-pb-pizza]').style.setProperty('--sz', String(SIZE_SCALE[v] ?? 1));
  for (const b of $$<HTMLElement>('[data-ing]')) {
    const p = priceOf(b.dataset.ing!);
    b.querySelector('[data-pb-price]')!.textContent = p > 0 ? `+${formatEuro(p)}` : 'inklusive';
  }
  for (const r of $$<HTMLInputElement>('[data-pb-size]')) r.checked = r.value === v;
  syncCounts();
  paint();
  if (user) announce(`Größe ${D!.sizes.find((s) => s.id === v)?.label}. Gesamt ${formatEuro(total())}.`);
}

function reset() {
  if (!items.length && size === D!.size) return;
  last = { kind: 'reset', items: [...items], size };
  const all = [...pieces.values()].flat();
  pieces.clear();
  items = [];
  // alles zusammen, kurz – nicht Stück für Stück
  liftOff(all, 0);
  setSize(D!.size, false);
  paint();
  note('Pizza zurückgesetzt', true);
  announce('Pizza zurückgesetzt.');
}

function undo() {
  const c = last;
  last = null;
  hideNote();
  if (!c) return;
  if (c.kind === 'remove') {
    items.splice(Math.min(c.at, items.length), 0, c.id);
    paint();
    placeIngredient(c.id);
    announce(`${D!.choices[c.id].label} wieder drauf.`);
  } else {
    setSize(c.size, false);
    items = [...c.items];
    paint();
    items.forEach((id) => placeIngredient(id));
    announce('Wiederhergestellt.');
  }
}

function note(text: string, undoable = false) {
  const n = $('[data-pb-note]');
  $('[data-pb-note-text]').textContent = text;
  (n.querySelector('[data-pb-undo]') as HTMLElement).hidden = !undoable;
  n.hidden = false;
  if (!reducedMotion()) n.animate([{ opacity: 0, transform: 'translateX(-50%) translateY(8px)' }, { opacity: 1, transform: 'translateX(-50%)' }], { duration: 220, easing: ease });
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(hideNote, 4500);
}
function hideNote() {
  window.clearTimeout(noteTimer);
  $('[data-pb-note]').hidden = true;
}

function addToCart(btn: HTMLElement) {
  const v = size;
  let key: string;
  try {
    key = cart.add({ productId: D!.base.id, variantId: v, qty: 1, options: items.length ? { [D!.group]: [...items] } : {} });
  } catch {
    note('Das hat nicht geklappt – bitte nochmal.');
    return;
  }
  const label = items.length ? `Deine Pizza (${items.length} ${items.length === 1 ? 'Extra' : 'Extras'})` : `${D!.base.name}`;
  const from = $('[data-pb-pizza]').getBoundingClientRect();
  const snapshot = $('[data-pb-pizza]').cloneNode(true) as HTMLElement;
  btn.classList.add('is-busy');
  closeDialog(dialog!);
  flyToCart(from, snapshot);
  announce(`${label} im Warenkorb. ${formatEuro(cart.get().totals.total)} insgesamt.`);
  toast(`${label} ist im Warenkorb.`, {
    action: {
      label: 'Rückgängig',
      run: () => {
        const line = cart.get().lines.find((l) => l.key === key);
        if (!line) return;
        if (line.qty > 1) cart.setQty(key, line.qty - 1);
        else cart.remove(key);
        announce('Pizza wieder entfernt');
      },
    },
  });
  // für die nächste Pizza frisch anfangen
  window.setTimeout(() => {
    btn.classList.remove('is-busy');
    const all = [...pieces.values()].flat();
    all.forEach((el) => el.remove());
    pieces.clear();
    items = [];
    last = null;
    setSize(D!.size, false);
    paint();
  }, 400);
}

function takeClassic(id: string, btn: HTMLElement) {
  try {
    cart.add({ productId: id, variantId: size, qty: 1, options: {} });
  } catch {
    return;
  }
  const c = D!.classics.find((x) => x.id === id);
  const from = $('[data-pb-pizza]').getBoundingClientRect();
  const snapshot = $('[data-pb-pizza]').cloneNode(true) as HTMLElement;
  closeDialog(dialog!);
  flyToCart(from, snapshot);
  toast(`${c?.name ?? 'Pizza'} ist im Warenkorb.`);
  btn.blur();
}

// ---------------------------------------------------------------- Ziehen (nur Maus)
function initDrag() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const plate = $('[data-pb-plate]');
  let drag: { id: string; btn: HTMLElement; ghost: HTMLElement; x0: number; y0: number; on: boolean } | null = null;
  let suppress = false;
  let raf = 0;
  let px = 0;
  let py = 0;

  const overPlate = () => {
    const r = plate.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.hypot(px - cx, py - cy) < r.width * 0.5;
  };
  const frame = () => {
    raf = 0;
    if (!drag?.on) return;
    drag.ghost.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) rotate(-4deg) scale(1.06)`;
    plate.classList.toggle('is-over', overPlate());
  };

  dialog!.addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ing]');
    if (!btn || e.button !== 0 || btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('aria-disabled') === 'true') return;
    drag = { id: btn.dataset.ing!, btn, ghost: document.createElement('div'), x0: e.clientX, y0: e.clientY, on: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    px = e.clientX;
    py = e.clientY;
    if (!drag.on) {
      if (Math.hypot(px - drag.x0, py - drag.y0) < 7) return;
      drag.on = true;
      const g = drag.ghost;
      g.className = 'pb-ghost';
      const pic = drag.btn.querySelector<HTMLElement>('.pb-pic-in');
      g.innerHTML = `<span class="pb-ghost-pic"><span style="${pic?.getAttribute('style') ?? ''}"></span></span><span>${escapeHtml(D!.choices[drag.id].label)}</span>`;
      dialog!.appendChild(g);
      drag.btn.classList.add('is-dragging');
      plate.classList.add('is-target');
      document.documentElement.style.cursor = 'grabbing';
    }
    if (!raf) raf = requestAnimationFrame(frame);
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    suppress = true;
    window.setTimeout(() => (suppress = false), 0);
    document.documentElement.style.cursor = '';
    d.btn.classList.remove('is-dragging');
    plate.classList.remove('is-target');
    const hit = overPlate() && e.type === 'pointerup';
    plate.classList.remove('is-over');
    if (hit) {
      d.ghost.remove();
      add(d.id, { x: px, y: py });
    } else {
      const r = d.btn.getBoundingClientRect();
      const a = d.ghost.animate(
        [{ transform: d.ghost.style.transform, opacity: 1 }, { transform: `translate(${r.left + 40}px, ${r.top + r.height / 2}px) translate(-50%, -50%) scale(0.8)`, opacity: 0 }],
        { duration: 260, easing: ease, fill: 'forwards' },
      );
      a.onfinish = () => d.ghost.remove();
    }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // Klick nach dem Ziehen nicht zusätzlich auslösen
  dialog!.addEventListener('click', (e) => {
    if (suppress && (e.target as HTMLElement).closest('[data-ing]')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

// ---------------------------------------------------------------- Start
function init() {
  if (ready || !dialog || !D) return;
  ready = true;
  enhanceDialog(dialog);
  dialog.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const ing = t.closest<HTMLElement>('[data-ing]');
    if (ing) {
      if (ing.getAttribute('aria-disabled') === 'true') {
        note(`Maximal ${D.max} Extras pro Pizza.`);
        return;
      }
      const id = ing.dataset.ing!;
      if (items.includes(id)) remove(id);
      else add(id);
      return;
    }
    const jump = t.closest<HTMLAnchorElement>('.pb-jump a');
    if (jump) {
      e.preventDefault();
      dialog.querySelector(jump.getAttribute('href')!)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (t.closest('[data-pb-last]')) {
      const id = items[items.length - 1];
      if (id) remove(id);
      return;
    }
    if (t.closest('[data-pb-reset]')) return reset();
    if (t.closest('[data-pb-undo]')) return undo();
    const addBtn = t.closest<HTMLElement>('[data-pb-add]');
    if (addBtn) return addToCart(addBtn);
    const cl = t.closest<HTMLElement>('[data-pb-classic]');
    if (cl) return takeClassic(cl.dataset.pbClassic!, cl);
  });
  dialog.addEventListener('change', (e) => {
    const r = e.target as HTMLInputElement;
    if (r.matches('[data-pb-size]')) setSize(r.value);
  });
  initDrag();
  shownTotal = total();
  paint();
}

export async function openBuilder(opener?: HTMLElement | null) {
  if (!dialog || !D) return;
  init();
  openDialog(dialog, opener);
  // Atlas laden (einmal); Zutaten erst danach mit Bild
  if (!atlas) {
    atlas = await loadAtlas();
    for (const [id, list] of pieces) {
      if (look(id).cover) continue;
      const all = spots(id, Math.max(...look(id).n));
      list.forEach((el, i) => (el.style.cssText += `;${tileCss(atlas!, id, all[i].v)}`));
    }
  }
}
