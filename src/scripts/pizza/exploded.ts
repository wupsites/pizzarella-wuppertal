/**
 * Speisekarte: Belag in die Pizza-Bilder legen – erst wenn eine Karte in die
 * Nähe des Bildschirms kommt (kleiner Atlas, einmal geladen). Das Auseinander-
 * ziehen selbst ist reines CSS (components.css, „Pizza-Bild mit Ebenen“).
 */
import { coverSprite, look, loadAtlas, spots, tileCss } from './toppings.ts';

export function initExploded() {
  const vizs = Array.from(document.querySelectorAll<HTMLElement>('.dish-viz[data-viz]'));
  if (!vizs.length || !('IntersectionObserver' in window)) return;
  const fill = async (el: HTMLElement) => {
    const ids = (el.dataset.viz ?? '').split(' ').filter(Boolean);
    const host = el.querySelector<HTMLElement>('.viz-tops');
    if (!host || !ids.length) return;
    const atlas = await loadAtlas('/pizza/', 'toppings-sm.webp');
    const frag = document.createDocumentFragment();
    for (const [k, id] of ids.entries()) {
      const L = look(id);
      if (L.cover) {
        const img = document.createElement('img');
        img.className = 'viz-pc';
        img.alt = '';
        img.src = await coverSprite(id, 220);
        img.style.cssText = `left:50%;top:50%;width:94%;transform:translate(-50%,-50%);z-index:${(L.z + 1) * 10 + k}`;
        frag.appendChild(img);
        continue;
      }
      // im kleinen Bild etwas weniger Stücke, sonst wirkt es unruhig
      const n = Math.max(1, Math.round(L.n[0] * 0.8));
      for (const s of spots(id, n)) {
        const i = document.createElement('i');
        i.className = 'viz-pc';
        i.style.cssText = `${tileCss(atlas, id, s.v)};left:${50 + s.x * 47}%;top:${50 + s.y * 47}%;width:${((47 * L.size * 2) / 0.68).toFixed(2)}%;transform:translate(-50%,-50%) rotate(${s.rot}deg) scale(${s.scale});z-index:${(L.z + 1) * 10 + k}`;
        frag.appendChild(i);
      }
    }
    host.appendChild(frag);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        void fill(e.target as HTMLElement);
      }
    },
    { rootMargin: '400px 0px' },
  );
  vizs.forEach((v) => io.observe(v));
}
