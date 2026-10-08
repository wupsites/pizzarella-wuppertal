/**
 * Ofenschieber: der kleine Pizzarella-Moment beim In-den-Warenkorb-Legen
 * einer Pizza. Ein Holzschieber gleitet unter eine Mini-Pizza, hebt sie an
 * und bringt sie in einem Bogen zum Warenkorb – unter 800 ms.
 *
 * Der Warenkorb ist längst aktualisiert, bevor die Animation endet; sie
 * blockiert nichts. Mehrere schnelle Klicks: höchstens zwei Flüge
 * gleichzeitig, danach reagiert nur noch der Warenkorb selbst.
 */
import { pulse, reducedMotion } from '../ui/util.ts';

const PEEL_SVG = `<svg viewBox="0 0 140 64" aria-hidden="true"><defs><linearGradient id="pz-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a566"/><stop offset=".55" stop-color="#b9824a"/><stop offset="1" stop-color="#8e5c2e"/></linearGradient></defs><rect x="0" y="27" width="60" height="10" rx="5" fill="url(#pz-wood)"/><path d="M56 12h52a24 24 0 0 1 24 24v0a24 24 0 0 1-24 24H56z" transform="translate(0 -4)" fill="url(#pz-wood)"/><path d="M60 14h46" stroke="#f1cf9b" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></svg>`;

let active = 0;

/** sichtbaren Warenkorb-Knopf finden (Kopfzeile oder Leiste unten) */
function cartTarget(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-button]'));
  return (
    all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    }) ?? null
  );
}

function cartResponse(target: HTMLElement | null) {
  if (!target) return;
  pulse(target, 'is-receiving', 650);
  pulse(target.querySelector('[data-cart-count]'));
}

/**
 * from: Startfläche (Pizza bzw. Knopf); node: optionale Vorschau (z. B. die
 * fertige Pizza aus dem Konfigurator), sonst ein schlichter Pizzaboden.
 */
export function flyToCart(from: DOMRect, node?: HTMLElement | null) {
  const target = cartTarget();
  if (reducedMotion() || !target || active >= 2 || !('animate' in Element.prototype)) {
    cartResponse(target);
    return;
  }
  active++;
  const S = 64;
  const to = target.getBoundingClientRect();
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;

  const fly = document.createElement('div');
  fly.className = 'pz-fly';
  fly.style.cssText = `position:fixed;left:0;top:0;width:${S}px;height:${S}px;z-index:2147483000;pointer-events:none;transform:translate(${sx - S / 2}px, ${sy - S / 2}px)`;
  const pizza = document.createElement('div');
  pizza.style.cssText = 'position:absolute;inset:0;border-radius:50%;filter:drop-shadow(0 6px 8px rgb(60 30 4 / .35))';
  if (node) {
    node.style.cssText += ';position:absolute;inset:0;transform:none;width:100%;height:100%';
    pizza.appendChild(node);
  } else {
    pizza.innerHTML = '<img src="/pizza/base-320.webp" alt="" style="width:100%;height:100%;display:block">';
  }
  const peel = document.createElement('div');
  peel.innerHTML = PEEL_SVG;
  peel.style.cssText = `position:absolute;left:${-S * 0.62}px;top:${S * 0.42}px;width:${S * 1.75}px;height:${S * 0.8}px;opacity:0`;
  fly.append(peel, pizza);
  document.body.appendChild(fly);

  // Start: Mini-Pizza erscheint dort, wo bestellt wurde (aus der großen Ansicht geschrumpft)
  const k0 = Math.min(3, Math.max(from.width, 40) / S);
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
  pizza.animate(
    [
      { transform: `scale(${k0})`, opacity: node ? 1 : 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.35 },
      { transform: 'translateY(-6px) scale(1.04)', offset: 0.55 },
      { transform: 'translateY(-6px) scale(1.04)' },
    ],
    { duration: 420, easing: ease, fill: 'forwards' },
  );
  // Schieber gleitet unter die Pizza (100–400 ms)
  peel.animate(
    [
      { transform: 'translateX(-40px)', opacity: 0 },
      { transform: 'translateX(-40px)', opacity: 0, offset: 0.25 },
      { transform: 'translateX(0)', opacity: 1, offset: 1 },
    ],
    { duration: 400, easing: ease, fill: 'forwards' },
  );
  // Übergabe: Bogen zum Warenkorb, kleiner werdend (380–720 ms)
  const mx = (sx + tx) / 2;
  const my = Math.min(sy, ty) - Math.min(140, Math.abs(tx - sx) * 0.25 + 40);
  const path = fly.animate(
    [
      { transform: `translate(${sx - S / 2}px, ${sy - S / 2}px) scale(1)`, opacity: 1 },
      { transform: `translate(${mx - S / 2}px, ${my - S / 2}px) scale(0.7)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx - S / 2}px, ${ty - S / 2}px) scale(0.22)`, opacity: 0.2 },
    ],
    { duration: 340, delay: 380, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
  );
  window.setTimeout(() => cartResponse(target), 660);
  path.onfinish = () => {
    fly.remove();
    active--;
  };
  // Sicherheitsnetz (Tab im Hintergrund o. Ä.)
  window.setTimeout(() => {
    if (fly.isConnected) {
      fly.remove();
      active = Math.max(0, active - 1);
    }
  }, 1500);
}
