/**
 * Hero „Eine Pizza“ – Ablauf:
 *  1. Bild ist sofort da (LCP). Danach übernimmt eine WebGL-Ebene mit
 *     Tiefen-Parallaxe dasselbe Bild, ohne sichtbaren Wechsel.
 *  2. GSAP ScrollTrigger (nachgeladen) koppelt die Kamera an den Scroll:
 *     Desktop gepinnt wie in der Referenz, Handy ohne Pin und einfacher.
 *  3. Desktop mit Maus: minimaler Tilt und Callouts beim Überfahren.
 *  Reduzierte Bewegung: kein WebGL, kein Scroll-Effekt, keine Idle-Bewegung.
 *
 * Pro Frame wird nur geschrieben (transform, CSS-Variablen, ein Draw-Call);
 * Layout wird ausschließlich bei Größenänderung gemessen.
 */
import { reducedMotion } from '../ui/util.ts';
import { createPizzaGL, type PizzaGL } from './gl.ts';

interface Geo {
  farRim: number;
  nearEdge: number;
  aspect: number;
}
type Zone = 'rand' | 'kaese' | 'sauce' | 'spaet' | 'ort';

const SHIFT = { x: 0.024, y: 0.05 }; // muss zu gl.ts passen
const ORIGIN_Y = 0.62; // transform-origin der Pizza (siehe Hero.astro)
const CART_KEY = 'pizzarella.cart.v1';

const hero = document.querySelector<HTMLElement>('[data-hero]');
if (hero) init(hero);

function init(hero: HTMLElement) {
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]')!;
  const object = hero.querySelector<HTMLElement>('[data-hero-object]')!;
  const shadow = hero.querySelector<HTMLElement>('[data-hero-shadow]');
  const img = hero.querySelector<HTMLImageElement>('img.hp-img');
  const ghost = hero.querySelector<HTMLElement>('[data-hero-ghost]');
  const lines = [...hero.querySelectorAll<HTMLElement>('[data-hero-line]')];
  const foot = hero.querySelector<HTMLElement>('.hero-foot');
  const geo = JSON.parse(hero.dataset.geo ?? '{}') as Geo;
  const reduced = reducedMotion();
  const mqDesktop = window.matchMedia('(min-width: 1024px)');
  const mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  orderLink(hero);

  // Einstiegsanimation abschließen, damit JS-Transforms nicht kollidieren
  window.setTimeout(() => hero.classList.add('intro-done'), reduced ? 0 : 1500);

  // ---------- Zustand ----------
  const desk = () => mqDesktop.matches;
  const base = () => (desk() ? { roll: -2.6, scale: 0.97 } : { roll: -2, scale: 1 });
  /** scroll-gesteuert (GSAP schreibt hier hinein) */
  const S = { ...base(), tx: 0, ty: 0, yaw: 0, pitch: 0, out: 0, ghost: 0 };
  /** Zeiger, geglättet */
  const P = { x: 0, y: 0, tx: 0, ty: 0, inside: false, px: 0, py: 0, moved: false };
  let hot = { zone: null as Zone | null, s: 0, u: 0.5, v: 0.5 };

  // ---------- Geometrie (nur bei Resize messen) ----------
  const G = { w: 0, h: 0, sx: 0, sy: 0, sw: 0, sh: 0, gutter: 16 };
  let gl: PizzaGL | null = null;
  const measure = () => {
    const hr = hero.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    G.w = hr.width;
    G.h = hr.height;
    G.sw = stage.offsetWidth;
    G.sh = stage.offsetHeight;
    // Mittelpunkt der Bühne relativ zum Hero (Bühne selbst wird nicht animiert)
    G.sx = sr.left - hr.left + (sr.width - G.sw) / 2;
    G.sy = sr.top - hr.top + (sr.height - G.sh) / 2;
    const pad = parseFloat(getComputedStyle(desk() && foot ? foot : hero).paddingLeft);
    G.gutter = Number.isFinite(pad) && pad > 0 ? pad : 16;
    // Lichtabfall hinter die Pizza legen (Handy: Pizza sitzt im oberen Drittel)
    hero.style.setProperty('--light-y', `${(((G.sy + G.sh * 0.5) / G.h) * 100).toFixed(1)}%`);
    gl?.resize(G.sw, G.sh);
    dirty = true;
  };

  // ---------- Callouts ----------
  const callouts = new Map<Zone, HTMLElement>();
  hero.querySelectorAll<HTMLElement>('[data-spot]').forEach((el) => callouts.set(el.dataset.spot as Zone, el));
  const spotUV = (z: Zone) => {
    const el = callouts.get(z)!;
    return { u: Number(el.dataset.u), v: Number(el.dataset.v), side: el.dataset.side as 'left' | 'right' };
  };
  const leaving = new Set<HTMLElement>();
  const setHot = (z: Zone | null) => {
    if (z === hot.zone) return;
    if (hot.zone) {
      const prev = callouts.get(hot.zone)!;
      prev.classList.remove('is-on');
      prev.classList.add('is-leaving');
      leaving.add(prev);
      window.setTimeout(() => {
        prev.classList.remove('is-leaving');
        leaving.delete(prev);
      }, 450);
    }
    hot.zone = z;
    if (z) {
      const { u, v } = spotUV(z);
      hot.u = u;
      hot.v = v;
      const el = callouts.get(z)!;
      place(el, z);
      // ein Frame Abstand, damit die Übergänge vom Startzustand aus laufen
      requestAnimationFrame(() => el.classList.add('is-on'));
    }
    dirty = true;
  };

  /** Punkt auf dem Foto → Position im Hero (gleiche Rechnung wie der Shader) */
  const project = (u: number, v: number) => {
    const t = (v - geo.farRim) / (geo.nearEdge - geo.farRim);
    const k = smoothstep(0, 0.8, t) - 0.5;
    const bow = 1 - 0.35 * Math.pow(Math.abs(u - 0.5) * 2, 2);
    const yaw = view.yaw;
    const pitch = view.pitch;
    const px = (u + yaw * SHIFT.x * k * bow) * G.sw;
    const py = (v + pitch * SHIFT.y * k) * G.sh;
    const ox = G.sw * 0.5;
    const oy = G.sh * ORIGIN_Y;
    const dx = px - ox;
    const dy = py - oy;
    const a = (view.roll * Math.PI) / 180;
    const s = view.scale;
    return {
      x: G.sx + ox + view.tx + s * (dx * Math.cos(a) - dy * Math.sin(a)),
      y: G.sy + oy + view.ty + s * (dx * Math.sin(a) + dy * Math.cos(a)),
    };
  };
  /** Zeiger im Hero → Punkt auf dem Foto */
  const unproject = (x: number, y: number) => {
    const ox = G.sw * 0.5;
    const oy = G.sh * ORIGIN_Y;
    const dx = (x - (G.sx + ox + view.tx)) / view.scale;
    const dy = (y - (G.sy + oy + view.ty)) / view.scale;
    const a = (-view.roll * Math.PI) / 180;
    return {
      u: (dx * Math.cos(a) - dy * Math.sin(a) + ox) / G.sw,
      v: (dx * Math.sin(a) + dy * Math.cos(a) + oy) / G.sh,
    };
  };
  const place = (el: HTMLElement, z: Zone) => {
    const { u, v, side } = spotUV(z);
    const p = project(u, v);
    const edge = side === 'left' ? G.gutter : G.w - G.gutter;
    const len = Math.max(Math.abs(p.x - edge), 0);
    el.style.setProperty('--ax', `${p.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${p.y.toFixed(1)}px`);
    el.style.setProperty('--lx', `${p.x.toFixed(1)}px`);
    el.style.setProperty('--len', len.toFixed(1));
    el.style.setProperty('--tx', `${edge.toFixed(1)}px`);
  };

  // Deckkraft-Raster zum Treffen der Pizza (statt Rechteck)
  let mask: { w: number; h: number; data: Uint8ClampedArray } | null = null;
  const buildMask = () => {
    if (!img || !img.naturalWidth) return;
    try {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = Math.round(120 / geo.aspect);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      mask = { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
    } catch {
      mask = null;
    }
  };
  const onPizza = (u: number, v: number) => {
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    if (!mask) return true;
    const x = Math.min(mask.w - 1, Math.floor(u * mask.w));
    const y = Math.min(mask.h - 1, Math.floor(v * mask.h));
    return mask.data[(y * mask.w + x) * 4 + 3] > 140;
  };
  const zoneAt = (u: number, v: number): Zone | null => {
    if (!onPizza(u, v)) return null;
    if (v > 0.6) return 'rand';
    if (v < 0.17) return 'ort';
    if (u > 0.88) return 'spaet';
    return u < 0.52 ? 'kaese' : 'sauce';
  };

  // ---------- Darstellung pro Frame ----------
  const view = { roll: S.roll, scale: S.scale, tx: 0, ty: 0, yaw: 0, pitch: 0, tiltX: 0, tiltY: 0 };
  const typeState = { out: -1, ghost: -1 };
  let dirty = true;
  let visible = true;
  let pointerOn = false; // Tilt + Hover: Desktop mit Maus
  let idle = false; // Dauerbewegung: zusätzlich echte GPU
  let idleSince = 0;
  let zoneTimer = 0;
  let pendingZone: Zone | null = null;

  let lastDraw = 0;
  const frame = (now: number) => {
    raf = 0;
    // reine Idle-Bewegung reicht mit ~30 fps; Scroll/Maus/Hover bekommen jeden Frame
    if (idle && !dirty && !P.moved && now - lastDraw < 30 && Math.abs(P.tx - P.x) < 0.001 && Math.abs(P.ty - P.y) < 0.001 && Math.abs((hot.zone ? 1 : 0) - hot.s) < 0.002) {
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
      return;
    }
    lastDraw = now;
    const t = now / 1000;
    // Zeiger auswerten (Lesen vor Schreiben)
    if (pointerOn && P.moved) {
      P.moved = false;
      const r = hero.getBoundingClientRect();
      const x = P.px - r.left;
      const y = P.py - r.top;
      P.tx = P.inside ? Math.max(-1, Math.min(1, (x / G.w - 0.5) * 2)) : 0;
      P.ty = P.inside ? Math.max(-1, Math.min(1, (y / G.h - 0.5) * 2)) : 0;
      if (P.inside && S.out < 0.15) {
        const { u, v } = unproject(x, y);
        const z = zoneAt(u, v);
        if (z !== pendingZone) {
          pendingZone = z;
          window.clearTimeout(zoneTimer);
          zoneTimer = window.setTimeout(() => setHot(pendingZone), z ? 70 : 220);
        }
      } else if (pendingZone !== null || hot.zone) {
        pendingZone = null;
        window.clearTimeout(zoneTimer);
        zoneTimer = window.setTimeout(() => setHot(null), 160);
      }
    }
    let moving = false;
    if (pointerOn) {
      P.x += (P.tx - P.x) * 0.06;
      P.y += (P.ty - P.y) * 0.06;
      moving = Math.abs(P.tx - P.x) > 0.001 || Math.abs(P.ty - P.y) > 0.001;
    }
    const hs = hot.zone ? 1 : 0;
    hot.s += (hs - hot.s) * 0.12;

    // Szene zusammensetzen: Scroll hat Vorrang, Maus und Idle sind Beiwerk
    // Idle sanft einblenden, damit der Übergang vom Standbild unsichtbar bleibt
    const iw = idle ? Math.min(1, (now - idleSince) / 1600) : 0;
    view.roll = S.roll + iw * Math.sin(t * 0.45) * 0.16;
    view.scale = S.scale;
    view.tx = S.tx * G.w + P.x * 6;
    view.ty = S.ty * G.h + iw * Math.sin(t * 0.9) * 2.2 + P.y * 4;
    view.yaw = S.yaw + P.x * 0.22 + iw * Math.sin(t * 0.31) * 0.06;
    view.pitch = S.pitch - P.y * 0.12 + iw * Math.sin(t * 0.23 + 1) * 0.05;
    view.tiltX = -P.y * 1.5;
    view.tiltY = P.x * 2.5;

    object.style.transform =
      `translate3d(${view.tx.toFixed(2)}px, ${view.ty.toFixed(2)}px, 0) ` +
      `rotateX(${view.tiltX.toFixed(3)}deg) rotateY(${view.tiltY.toFixed(3)}deg) ` +
      `rotate(${view.roll.toFixed(3)}deg) scale(${view.scale.toFixed(4)})`;
    if (shadow) {
      const sc = view.scale * (1 + view.pitch * 0.04);
      shadow.style.transform = `translate3d(${(view.tx * 0.55 - view.yaw * 6).toFixed(2)}px, ${(view.ty * 0.35).toFixed(2)}px, 0) scale(${sc.toFixed(4)}, ${(sc * (1 + view.pitch * 0.1)).toFixed(4)})`;
    }
    gl?.draw({
      yaw: view.yaw,
      pitch: view.pitch,
      light: 0.5 + view.yaw * 0.18 + iw * Math.sin(t * 0.2) * 0.16,
      spec: desk() ? 1 : 0,
      hot: [hot.u, hot.v, hot.s],
    });
    // Callouts folgen ihrem Punkt
    if (hot.zone) place(callouts.get(hot.zone)!, hot.zone);
    leaving.forEach((el) => place(el, el.dataset.spot as Zone));

    if (desk() && (S.out !== typeState.out || S.ghost !== typeState.ghost)) {
      const o = S.out;
      typeState.out = o;
      typeState.ghost = S.ghost;
      const vw = G.w / 100;
      if (lines[1]) lines[1].style.translate = `${(-o * 7 * vw).toFixed(1)}px 0`;
      if (lines[2]) lines[2].style.translate = `${(o * 7 * vw).toFixed(1)}px 0`;
      for (const l of lines) l.style.opacity = o ? String(1 - o) : '';
      if (ghost) {
        ghost.style.translate = `0 ${(-S.ghost * 0.06 * G.h).toFixed(1)}px`;
        ghost.style.opacity = o ? String(1 - o * 0.7) : '';
      }
      if (o > 0.15 && hot.zone) setHot(null);
    }

    const settling = Math.abs(hs - hot.s) > 0.002;
    if (visible && !document.hidden && (idle || moving || settling || dirty)) {
      dirty = false;
      if (idle || moving || settling) raf = requestAnimationFrame(frame);
    }
  };
  let raf = 0;
  const request = () => {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // ---------- Start ----------
  const start = () => {
    buildMask();
    if (!reduced) {
      gl = createPizzaGL(img!, geo, { maxDpr: desk() ? 2 : 1.5 });
      if (gl) {
        object.appendChild(gl.canvas);
        gl.canvas.addEventListener('webglcontextlost', () => {
          object.classList.remove('gl-on');
          gl = null;
        });
      }
    }
    measure();
    if (gl) {
      gl.draw({ yaw: 0, pitch: 0, light: 0.5, spec: 0, hot: [0.5, 0.5, 0] });
      // erst zeigen, wenn das erste Bild sicher steht
      requestAnimationFrame(() => object.classList.add('gl-on'));
    }
    new ResizeObserver(() => {
      measure();
      request();
    }).observe(hero);
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) request();
    }).observe(hero);
    document.addEventListener('visibilitychange', () => !document.hidden && request());

    const setupPointer = () => {
      pointerOn = !reduced && desk() && mqHover.matches;
      const was = idle;
      idle = pointerOn && !!gl && !gl.slow;
      if (idle && !was) idleSince = performance.now();
      request();
    };
    setupPointer();
    mqDesktop.addEventListener('change', setupPointer);
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !desk()) return;
      P.px = e.clientX;
      P.py = e.clientY;
      P.inside = true;
      P.moved = true;
      if (!reduced) request();
      if (reduced) {
        // ohne Animation trotzdem Callouts per Hover
        const r = hero.getBoundingClientRect();
        const { u, v } = unproject(e.clientX - r.left, e.clientY - r.top);
        setHot(zoneAt(u, v));
        request();
      }
    });
    hero.addEventListener('pointerleave', () => {
      P.inside = false;
      P.moved = true;
      if (reduced) setHot(null);
      request();
    });

    if (!reduced) {
      // Handy/Tablet: ein kurzer Hinweis, dann Ruhe
      if (!(desk() && mqHover.matches)) {
        window.setTimeout(() => {
          mobileSpot();
          window.setTimeout(() => setHot(null), 3200);
        }, 1600);
      }
      loadScroll();
    }
    request();
  };

  /** Mobil: Rand-Hotspot an einer sichtbaren Stelle, Label rechts */
  const mobileSpot = () => {
    const el = callouts.get('rand');
    if (!el || desk()) {
      setHot('rand');
      return;
    }
    el.dataset.u = el.dataset.mu ?? '0.6';
    el.dataset.v = el.dataset.mv ?? '0.68';
    el.dataset.side = 'right';
    el.classList.remove('co--left');
    el.classList.add('co--right');
    setHot('rand');
  };

  // ---------- Scroll (GSAP, nachgeladen) ----------
  const loadScroll = async () => {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add('(min-width: 1024px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, pitch: 0, out: 0, ghost: 0 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=85%',
          pin: true,
          scrub: 1.2,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: request,
          onRefresh: () => {
            measure();
            request();
          },
        },
      });
      // wie in der Referenz: erst ruhig aufrichten und drehen …
      tl.to(S, { roll: 0, scale: 1, yaw: 0.55, pitch: 0.4, duration: 0.42, ease: 'sine.inOut' }, 0)
        // … dann weiter um die Pizza herum, minimal näher …
        .to(S, { roll: 1.1, scale: 1.035, yaw: 1, pitch: 0.2, ty: -0.012, duration: 0.33, ease: 'sine.inOut' }, 0.42)
        // … zum Schluss gibt die Typo den Blick frei, die Pizza sinkt in den Übergang
        .to(S, { out: 1, duration: 0.25, ease: 'power2.in' }, 0.75)
        .to(S, { ty: 0.045, scale: 1.06, duration: 0.25, ease: 'power1.inOut' }, 0.75)
        .to(S, { ghost: 1, duration: 1 }, 0);
      return () => request();
    });

    mm.add('(max-width: 1023.98px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, pitch: 0, out: 0, ghost: 0 });
      gsap.to(S, {
        roll: 1.4,
        scale: 1.06,
        yaw: 0.9,
        pitch: 0.3,
        ty: 0.06,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6, onUpdate: request },
      });
      return () => request();
    });
  };

  if (img && !img.complete) img.addEventListener('load', start, { once: true });
  else if (img) start();
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** „Jetzt bestellen“: mit Warenkorb direkt zur Kasse, sonst zur Karte */
function orderLink(hero: HTMLElement) {
  const a = hero.querySelector<HTMLAnchorElement>('[data-hero-order]');
  if (!a) return;
  const update = () => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      const lines = raw ? (JSON.parse(raw) as { lines?: unknown[] }).lines : null;
      a.href = Array.isArray(lines) && lines.length ? '/kasse/' : '/speisekarte/';
    } catch {
      a.href = '/speisekarte/';
    }
  };
  update();
  window.addEventListener('pageshow', update);
  window.addEventListener('storage', (e) => e.key === CART_KEY && update());
}
