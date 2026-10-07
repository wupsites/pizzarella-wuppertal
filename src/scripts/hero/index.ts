/**
 * Hero „Eine Pizza“ – Ablauf:
 *  1. Ein Standbild der 3D-Pizza ist sofort da (LCP, auch ohne JS).
 *  2. Danach lädt die Fototextur; WebGL übernimmt dieselbe Ansicht ohne
 *     sichtbaren Wechsel. Ab jetzt ist die Pizza ein echtes 3D-Objekt.
 *  3. GSAP ScrollTrigger (nachgeladen) dreht die Pizza beim Scrollen und
 *     führt die Kamera um sie herum: Desktop gepinnt wie in der Referenz,
 *     Handy ohne Pin und einfacher.
 *  4. Desktop mit Maus: minimale Kamerareaktion, Callouts beim Überfahren.
 *  Reduzierte Bewegung: Standbild, keine Scroll- oder Idle-Bewegung.
 *
 * Pro Frame wird nur geschrieben (transform, CSS-Variablen, ein Draw-Call);
 * Layout wird ausschließlich bei Größenänderung gemessen.
 */
import { reducedMotion } from '../ui/util.ts';
import { createPizza3D, type Pizza3D } from './gl3d.ts';
import { camera, project, unproject, uvToModel, E0, STAGE_AR, TEX_RADIUS } from './camera.ts';

interface Geo {
  profile: number[];
  tex: { hi: string; lo: string };
}
type Zone = 'rand' | 'kaese' | 'sauce' | 'spaet' | 'ort';

const ORIGIN_Y = 0.58; // transform-origin der Pizza (siehe Hero.astro)
const CART_KEY = 'pizzarella.cart.v1';
const DEG = Math.PI / 180;

const hero = document.querySelector<HTMLElement>('[data-hero]');
if (hero) init(hero);

function init(hero: HTMLElement) {
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]')!;
  const object = hero.querySelector<HTMLElement>('[data-hero-object]')!;
  const ghost = hero.querySelector<HTMLElement>('[data-hero-ghost]');
  const lines = [...hero.querySelectorAll<HTMLElement>('[data-hero-line]')];
  const foot = hero.querySelector<HTMLElement>('.hero-foot');
  const geo = JSON.parse(hero.dataset.geo ?? '{}') as Geo;
  const reduced = reducedMotion();
  const mqDesktop = window.matchMedia('(min-width: 1024px)');
  const mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  const desk = () => mqDesktop.matches;

  orderLink(hero);
  window.setTimeout(() => hero.classList.add('intro-done'), reduced ? 0 : 1500);

  // ---------- Zustand ----------
  const base = () => (desk() ? { roll: -3, scale: 0.96 } : { roll: -2, scale: 1 });
  /** scroll-gesteuert (GSAP schreibt hier hinein) */
  const S = { ...base(), tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1 };
  /** Zeiger, geglättet */
  const P = { x: 0, y: 0, tx: 0, ty: 0, inside: false, px: 0, py: 0, moved: false };
  const hot = { zone: null as Zone | null, s: 0, u: 0.5, v: 0.5 };
  const view = { roll: S.roll, scale: S.scale, tx: 0, ty: 0, yaw: 0, elev: E0 };

  // ---------- Geometrie (nur bei Resize messen) ----------
  const G = { w: 0, h: 0, sx: 0, sy: 0, sw: 0, sh: 0, gutter: 16 };
  let gl: Pizza3D | null = null;
  let dirty = true;
  const measure = () => {
    const hr = hero.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    G.w = hr.width;
    G.h = hr.height;
    G.sw = stage.offsetWidth;
    G.sh = stage.offsetHeight;
    G.sx = sr.left - hr.left + (sr.width - G.sw) / 2;
    G.sy = sr.top - hr.top + (sr.height - G.sh) / 2;
    const pad = parseFloat(getComputedStyle(desk() && foot ? foot : hero).paddingLeft);
    G.gutter = Number.isFinite(pad) && pad > 0 ? pad : 16;
    hero.style.setProperty('--light-y', `${(((G.sy + G.sh * 0.57) / G.h) * 100).toFixed(1)}%`);
    gl?.resize(G.sw, G.sh);
    dirty = true;
  };

  // CSS-Transform der Bühne (Roll, Skalierung, Verschiebung) auf Punkte anwenden
  const toHero = (nx: number, ny: number) => {
    const ox = G.sw * 0.5;
    const oy = G.sh * ORIGIN_Y;
    const dx = nx * G.sw - ox;
    const dy = ny * G.sh - oy;
    const a = view.roll * DEG;
    const s = view.scale;
    return {
      x: G.sx + ox + view.tx + s * (dx * Math.cos(a) - dy * Math.sin(a)),
      y: G.sy + oy + view.ty + s * (dx * Math.sin(a) + dy * Math.cos(a)),
    };
  };
  const fromHero = (x: number, y: number) => {
    const ox = G.sw * 0.5;
    const oy = G.sh * ORIGIN_Y;
    const dx = (x - (G.sx + ox + view.tx)) / view.scale;
    const dy = (y - (G.sy + oy + view.ty)) / view.scale;
    const a = -view.roll * DEG;
    return { nx: (dx * Math.cos(a) - dy * Math.sin(a) + ox) / G.sw, ny: (dx * Math.sin(a) + dy * Math.cos(a) + oy) / G.sh };
  };

  // ---------- Callouts ----------
  const callouts = new Map<Zone, HTMLElement>();
  hero.querySelectorAll<HTMLElement>('[data-spot]').forEach((el) => callouts.set(el.dataset.spot as Zone, el));
  const spotUV = (z: Zone) => {
    const el = callouts.get(z)!;
    return { u: Number(el.dataset.u), v: Number(el.dataset.v), side: el.dataset.side as 'left' | 'right' };
  };
  const place = (el: HTMLElement, z: Zone) => {
    const { u, v, side } = spotUV(z);
    const [nx, ny] = project(camera(view.yaw, view.elev, STAGE_AR), uvToModel(u, v));
    const p = toHero(nx, ny);
    const edge = side === 'left' ? G.gutter : G.w - G.gutter;
    el.style.setProperty('--ax', `${p.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${p.y.toFixed(1)}px`);
    el.style.setProperty('--lx', `${p.x.toFixed(1)}px`);
    el.style.setProperty('--len', Math.max(Math.abs(p.x - edge), 0).toFixed(1));
    el.style.setProperty('--tx', `${edge.toFixed(1)}px`);
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
      requestAnimationFrame(() => el.classList.add('is-on'));
    }
    request();
  };

  /** Zeiger (Hero-Koordinaten) → Zone auf der Pizza */
  const zoneAt = (x: number, y: number): Zone | null => {
    const { nx, ny } = fromHero(x, y);
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    const uv = unproject(camera(view.yaw, view.elev, STAGE_AR), nx, ny, STAGE_AR);
    if (!uv) return null;
    const dx = uv[0] - 0.5;
    const dz = uv[1] - 0.5;
    const r = Math.hypot(dx, dz) / TEX_RADIUS;
    if (r > 1.12) return null;
    if (r > 0.78) {
      if (dz < 0 && Math.abs(dz) > Math.abs(dx)) return 'ort';
      if (dx > 0 && Math.abs(dx) > Math.abs(dz)) return 'spaet';
      return 'rand';
    }
    // innen: nächster Belag-Anker
    const k = spotUV('kaese');
    const s = spotUV('sauce');
    return Math.hypot(uv[0] - k.u, uv[1] - k.v) < Math.hypot(uv[0] - s.u, uv[1] - s.v) ? 'kaese' : 'sauce';
  };

  // ---------- Darstellung pro Frame ----------
  const typeState = { out: -1, ghost: -1 };
  let visible = true;
  let pointerOn = false; // Kamerareaktion + Hover: Desktop mit Maus
  let idle = false; // Dauerbewegung: zusätzlich echte GPU
  let idleSince = 0;
  let zoneTimer = 0;
  let pendingZone: Zone | null = null;
  let lastDraw = 0;
  let raf = 0;
  let sweepStart = 0; // Licht-Sweep nach dem Übernehmen durch WebGL
  const beamEl = hero.querySelector<HTMLElement>('[data-hero-beam]');
  let beamLast = -1;

  const frame = (now: number) => {
    raf = 0;
    const slowGl = !!gl?.slow;
    const sweeping = sweepStart > 0 && now - sweepStart < 2000;
    const smoothing = sweeping || (!slowGl && (Math.abs(P.tx - P.x) > 0.002 || Math.abs(P.ty - P.y) > 0.002)) || Math.abs((hot.zone ? 1 : 0) - hot.s) > 0.01;
    // reine Idle-Bewegung reicht mit ~30 fps; Scroll/Maus/Hover bekommen jeden Frame
    if (idle && !dirty && !P.moved && !smoothing && now - lastDraw < 30) {
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.1, lastDraw ? (now - lastDraw) / 1000 : 0.016);
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
      const z = P.inside && S.out < 0.15 ? zoneAt(x, y) : null;
      if (z !== pendingZone) {
        pendingZone = z;
        window.clearTimeout(zoneTimer);
        zoneTimer = window.setTimeout(() => setHot(pendingZone), z ? 70 : 220);
      }
    }
    // zeitbasiert glätten (gleich schnell bei 30, 60 oder 120 fps)
    if (pointerOn && !reduced && !gl?.slow) {
      const k = 1 - Math.exp(-dt * 3.5);
      P.x += (P.tx - P.x) * k;
      P.y += (P.ty - P.y) * k;
    }
    hot.s += ((hot.zone ? 1 : 0) - hot.s) * (1 - Math.exp(-dt * 7));

    // Szene: Scroll hat Vorrang, Maus und Idle sind Beiwerk
    const iw = idle ? Math.min(1, (now - idleSince) / 1600) : 0;
    view.roll = S.roll + iw * Math.sin(t * 0.45) * 0.15;
    view.scale = S.scale;
    view.tx = S.tx * G.w + P.x * 5;
    view.ty = S.ty * G.h + iw * Math.sin(t * 0.9) * 2.2 + P.y * 3;
    view.yaw = S.yaw + P.x * 2.5 * DEG + iw * Math.sin(t * 0.31) * 0.7 * DEG;
    view.elev = S.elev - P.y * 1.5 * DEG + iw * Math.sin(t * 0.23 + 1) * 0.4 * DEG;

    object.style.transform = `translate3d(${view.tx.toFixed(2)}px, ${view.ty.toFixed(2)}px, 0) rotate(${view.roll.toFixed(3)}deg) scale(${view.scale.toFixed(4)})`;
    // Licht: Glanz folgt der Maus, Ofenglut flackert leicht, Sweep beim Start
    const flicker = iw * (0.06 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1) + 0.035 * Math.sin(t * 11.7));
    const sw = sweeping ? Math.min(1, (now - sweepStart) / 1800) : -1;
    gl?.draw({
      yaw: view.yaw,
      elev: view.elev,
      hot: [hot.u, hot.v, hot.s],
      spec: 1,
      light: [P.x, P.y],
      glow: S.glow + flicker,
      sweep: sw < 0 ? -1 : sw * sw * (3 - 2 * sw),
    });
    if (beamEl && Math.abs(S.glow - beamLast) > 0.005) {
      beamLast = S.glow;
      hero.style.setProperty('--beam', (0.7 + (S.glow - 1) * 0.6).toFixed(3));
      hero.style.setProperty('--core', (0.65 + (S.glow - 1) * 0.5).toFixed(3));
    }
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

    dirty = false;
    if (visible && !document.hidden && (idle || smoothing)) raf = requestAnimationFrame(frame);
  };
  const request = () => {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // ---------- Start ----------
  measure();
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
    pointerOn = desk() && mqHover.matches;
    const was = idle;
    idle = pointerOn && !reduced && !!gl && !gl.slow;
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
    request();
  });
  hero.addEventListener('pointerleave', () => {
    P.inside = false;
    P.moved = true;
    request();
  });

  // ---------- 3D-Pizza übernehmen, sobald die Textur da ist ----------
  if (!reduced && geo.tex) {
    const big = desk() && (window.devicePixelRatio || 1) * window.innerWidth > 1100;
    const img = new Image();
    img.decoding = 'async';
    img.src = big ? geo.tex.hi : geo.tex.lo;
    img
      .decode()
      .then(() => {
        gl = createPizza3D(geo.profile, { maxDpr: desk() ? 2 : 1.5, segments: desk() ? 192 : 128 });
        if (!gl) return;
        object.appendChild(gl.canvas);
        gl.canvas.addEventListener('webglcontextlost', () => {
          object.classList.remove('gl-on');
          gl = null;
        });
        gl.resize(G.sw, G.sh);
        gl.setTexture(img);
        gl.draw({ yaw: view.yaw, elev: view.elev, hot: [hot.u, hot.v, hot.s], spec: 1, glow: S.glow });
        requestAnimationFrame(() => {
          object.classList.add('gl-on');
          sweepStart = performance.now() + 250;
          request();
        });
        setupPointer();
        if (desk()) startDust(hero);
      })
      .catch(() => {});
  }

  if (!reduced) {
    if (!(desk() && mqHover.matches)) {
      window.setTimeout(() => {
        setHot('rand');
        window.setTimeout(() => setHot(null), 3200);
      }, 1800);
    }
    loadScroll();
  }
  request();

  // ---------- Scroll (GSAP, nachgeladen) ----------
  async function loadScroll() {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add('(min-width: 1024px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=90%',
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
      // wie in der Referenz: aufrichten, drehen, die Kamera fährt herum …
      tl.to(S, { roll: 0, scale: 1, yaw: 18 * DEG, elev: E0 + 7 * DEG, duration: 0.42, ease: 'sine.inOut' }, 0)
        // … weiter um die Pizza, minimal näher …
        .to(S, { roll: 1.2, scale: 1.035, yaw: 36 * DEG, elev: E0 + 4 * DEG, ty: -0.01, duration: 0.33, ease: 'sine.inOut' }, 0.42)
        // … zum Schluss gibt die Typo den Blick frei, die Pizza sinkt in den Übergang
        .to(S, { out: 1, duration: 0.25, ease: 'power2.in' }, 0.75)
        .to(S, { ty: 0.018, scale: 1.04, yaw: 42 * DEG, duration: 0.25, ease: 'power1.inOut' }, 0.75)
        .to(S, { ghost: 1, duration: 1 }, 0)
        // die Ofenglut wird heißer, je weiter man scrollt
        .to(S, { glow: 1.45, duration: 0.75, ease: 'sine.inOut' }, 0);
      return () => request();
    });

    mm.add('(max-width: 1023.98px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1 });
      gsap.to(S, {
        glow: 1.35,
        roll: 1.4,
        scale: 1.06,
        yaw: 34 * DEG,
        elev: E0 + 8 * DEG,
        ty: 0.05,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6, onUpdate: request },
      });
      return () => request();
    });
  }
}

/**
 * Lichtstaub im Spot: wenige warme Partikel, die langsam im Lichtkegel
 * aufsteigen und funkeln. Nur Desktop, nur solange der Hero sichtbar ist.
 */
function startDust(hero: HTMLElement) {
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-dust]');
  if (!canvas || reducedMotion()) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  const size = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  size();
  new ResizeObserver(size).observe(canvas);
  // Sprite: weicher, warmer Punkt
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const sc = sprite.getContext('2d')!;
  const g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,236,200,1)');
  g.addColorStop(0.35, 'rgba(255,200,140,0.45)');
  g.addColorStop(1, 'rgba(255,170,90,0)');
  sc.fillStyle = g;
  sc.fillRect(0, 0, 32, 32);
  const N = 46;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const parts = Array.from({ length: N }, () => ({ x: rnd(-1, 1), y: rnd(0, 1), r: rnd(0.6, 2.2), sp: rnd(0.012, 0.04), ph: rnd(0, 6.28), tw: rnd(0.6, 1.8) }));
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const cx = w / 2;
      const top = h * 0.02;
      const bottom = h * 0.62;
      for (const p of parts) {
        p.y -= p.sp * dt;
        if (p.y < 0) {
          p.y = 1;
          p.x = rnd(-1, 1);
        }
        // Kegel: oben schmal, unten breit
        const yy = top + (bottom - top) * p.y;
        const half = (0.09 + 0.26 * p.y) * Math.min(w, 1600);
        const x = cx + p.x * half + Math.sin(now / 1000 * 0.6 + p.ph) * 6;
        const a = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now / 1000 * p.tw + p.ph))) * Math.sin(Math.PI * p.y) * 0.55;
        ctx.globalAlpha = a;
        const s = p.r * 4;
        ctx.drawImage(sprite, x - s / 2, yy - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
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
