/**
 * Hero „Eine Pizza“ – Ablauf:
 *  1. Ein Standbild der 3D-Pizza ist sofort da (LCP, auch ohne JS).
 *  2. Danach lädt die Fototextur; WebGL übernimmt dieselbe Ansicht ohne
 *     sichtbaren Wechsel. Ab jetzt ist die Pizza ein echtes 3D-Objekt.
 *  3. Scroll (GSAP ScrollTrigger, nachgeladen): Desktop gepinnt, die Pizza
 *     dreht sich, und wie in der Burger-Referenz wechseln die großen
 *     Wortpaare – die alten fliegen seitlich hinaus, die neuen kommen hinter
 *     der Pizza hervor. Handy: ohne Pin, die Wortpaare wechseln von selbst.
 *  4. Licht: eine Ofenglut hinter der Pizza wandert und flackert; dieselbe
 *     Glut lenkt das Gegenlicht auf dem Rand und leuchtet den Dampf an. Der
 *     Spot von oben folgt dem Studiolicht (Maus oder langsame Drift).
 *  5. Dampf (steam.ts) steigt hinter der Pizza auf und folgt ihrer Lage.
 *  6. Ende des Scrollens: Raum, Spot und Studiolicht dunkeln leicht ab
 *     (an den Scroll gebunden, stufenlos) – die Glut bleibt. Signalisiert
 *     das Ende, bevor der nächste Abschnitt kommt.
 *  Reduzierte Bewegung: Standbild, erste Headline, keine Bewegung.
 *
 * Pro Frame wird nur geschrieben (transform/opacity direkt am Element, zwei
 * Draw-Calls) – keine vererbten CSS-Variablen am Hero, keine Filter-Animationen.
 * Layout wird ausschließlich bei Größenänderung gemessen.
 */
import { reducedMotion } from '../ui/util.ts';
import { createPizza3D, type Pizza3D } from './gl3d.ts';
import { createSteam, type Steam } from './steam.ts';
import { camera, project, E0, H_BASE, STAGE_AR } from './camera.ts';

interface Geo {
  profile: number[];
  tex: { hi: string; lo: string };
}
type Gsap = typeof import('gsap').gsap;

const ORIGIN_Y = 0.58; // transform-origin der Pizza (siehe Hero.astro)
const CART_KEY = 'pizzarella.cart.v1';
const DEG = Math.PI / 180;
/** Desktop: ab diesem Scroll-Fortschritt gilt das Wortpaar (0 = Headline) */
const SET_AT = [0, 0.16, 0.38, 0.6];

const hero = document.querySelector<HTMLElement>('[data-hero]');
if (hero) init(hero);

function init(hero: HTMLElement) {
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]')!;
  const object = hero.querySelector<HTMLElement>('[data-hero-object]')!;
  const ghost = hero.querySelector<HTMLElement>('[data-hero-ghost]');
  const lines = [...hero.querySelectorAll<HTMLElement>('[data-hero-line]')];
  const beamEl = hero.querySelector<HTMLElement>('[data-hero-beam]');
  const coreEl = hero.querySelector<HTMLElement>('.hp-core');
  const steamCanvas = hero.querySelector<HTMLCanvasElement>('[data-hero-steam]');
  const room = hero.querySelector<HTMLElement>('[data-hero-room]');
  const dust = hero.querySelector<HTMLElement>('[data-hero-dust]');
  // Wortpaare: je Satz die Wörter der Zeilen 1 und 2
  const sets: HTMLElement[][] = [];
  hero.querySelectorAll<HTMLElement>('[data-set]').forEach((el) => {
    const i = Number(el.dataset.set);
    (sets[i] ??= [])[Number(el.closest<HTMLElement>('[data-hero-line]')!.dataset.heroLine) - 1] = el;
  });
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
  const S = { ...base(), tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1, dim: 0 };
  /** Zeiger, geglättet */
  const P = { x: 0, y: 0, tx: 0, ty: 0, w: 0, inside: false, px: 0, py: 0, moved: false };
  const view = { roll: S.roll, scale: S.scale, tx: 0, ty: 0, yaw: 0, elev: E0 };

  // ---------- Geometrie (nur bei Resize messen) ----------
  const G = { w: 0, h: 0, sx: 0, sy: 0, sw: 0, sh: 0, fs: 16 };
  let gl: Pizza3D | null = null;
  let steam: Steam | null = null;
  const measure = () => {
    const hr = hero.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    G.w = hr.width;
    G.h = hr.height;
    G.sw = stage.offsetWidth;
    G.sh = stage.offsetHeight;
    G.sx = sr.left - hr.left + (sr.width - G.sw) / 2;
    G.sy = sr.top - hr.top + (sr.height - G.sh) / 2;
    G.fs = parseFloat(getComputedStyle(lines[1] ?? hero).fontSize) || 16;
    hero.style.setProperty('--light-y', `${(((G.sy + G.sh * 0.57) / G.h) * 100).toFixed(1)}%`);
    gl?.resize(G.sw, G.sh);
    steam?.resize(G.w, G.h);
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

  // ---------- Wortpaare wie in der Referenz ----------
  let gsap: Gsap | null = null;
  let cur = 0;
  const showSet = (n: number) => {
    if (n === cur || !gsap || !sets[n]) return;
    const out = sets[cur];
    const inn = sets[n];
    cur = n;
    const W = G.w || window.innerWidth;
    const fs = G.fs;
    gsap.killTweensOf([...out, ...inn]);
    // raus: zur Seite aus dem Bild, wie FLAVOR/POP
    gsap.to(out[0], { x: -W * 0.75, opacity: 0, duration: 0.5, ease: 'power3.in' });
    gsap.to(out[1], { x: W * 0.75, opacity: 0, duration: 0.5, ease: 'power3.in' });
    // rein: tief hinter dem hinteren Pizzarand hervor, nach außen an den Platz
    gsap.fromTo(
      inn[0],
      { x: W * 0.2, y: fs * 2.1, scale: 0.86, opacity: 0 },
      { x: 0, y: 0, scale: 1, opacity: 1, duration: 1.05, ease: 'expo.out', delay: 0.2 },
    );
    gsap.fromTo(
      inn[1],
      { x: -W * 0.18, y: fs * 1.25, scale: 0.86, opacity: 0 },
      { x: 0, y: 0, scale: 1, opacity: 1, duration: 1.05, ease: 'expo.out', delay: 0.3 },
    );
  };

  // ---------- Darstellung pro Frame ----------
  const typeState = { out: -1, ghost: -1 };
  let visible = true;
  let pointerOn = false; // Kamerareaktion: es gibt eine Maus
  let idle = false; // Dauerbewegung: echte GPU
  let idleSince = 0;
  let lastDraw = 0;
  let raf = 0;
  let bloomStart = 0; // Ofen-Bloom, wenn WebGL übernimmt
  let glowLast = -1;
  let beamLast = 9;
  let dimLast = -1;

  const frame = (now: number) => {
    raf = 0;
    const slowGl = !!gl?.slow;
    const blooming = bloomStart > 0 && now - bloomStart < 1900;
    const smoothing =
      blooming ||
      Math.abs((pointerOn && P.inside ? 1 : 0) - P.w) > 0.01 ||
      (!slowGl && (Math.abs(P.tx - P.x) > 0.002 || Math.abs(P.ty - P.y) > 0.002));
    const dt = Math.min(0.1, lastDraw ? (now - lastDraw) / 1000 : 0.016);
    lastDraw = now;
    const t = now / 1000;

    // Zeiger auswerten (Lesen vor Schreiben)
    if (pointerOn && P.moved) {
      P.moved = false;
      const r = hero.getBoundingClientRect();
      P.tx = P.inside ? Math.max(-1, Math.min(1, ((P.px - r.left) / G.w - 0.5) * 2)) : 0;
      P.ty = P.inside ? Math.max(-1, Math.min(1, ((P.py - r.top) / G.h - 0.5) * 2)) : 0;
    }
    // zeitbasiert glätten (gleich schnell bei 30, 60 oder 120 fps)
    if (pointerOn && !reduced && !slowGl) {
      const k = 1 - Math.exp(-dt * 3.5);
      P.x += (P.tx - P.x) * k;
      P.y += (P.ty - P.y) * k;
    }
    P.w += ((pointerOn && P.inside ? 1 : 0) - P.w) * (1 - Math.exp(-dt * 2.5));

    // Szene: Scroll hat Vorrang, Maus und Idle sind Beiwerk
    const iw = idle ? Math.min(1, (now - idleSince) / 1600) : 0;
    view.roll = S.roll + iw * Math.sin(t * 0.45) * 0.15;
    view.scale = S.scale;
    view.tx = S.tx * G.w + P.x * 5;
    view.ty = S.ty * G.h + iw * Math.sin(t * 0.9) * 2.2 + P.y * 3;
    view.yaw = S.yaw + P.x * 2.5 * DEG + iw * Math.sin(t * 0.31) * 0.7 * DEG;
    view.elev = S.elev - P.y * 1.5 * DEG + iw * Math.sin(t * 0.23 + 1) * 0.4 * DEG;
    object.style.transform = `translate3d(${view.tx.toFixed(2)}px, ${view.ty.toFixed(2)}px, 0) rotate(${view.roll.toFixed(3)}deg) scale(${view.scale.toFixed(4)})`;

    // Ofenglut: flackert und wandert langsam hinter der Pizza – sie ist die Quelle
    // des Gegenlichts auf dem Rand und des Lichts im Dampf
    const flicker = iw * (0.07 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1) + 0.04 * Math.sin(t * 11.7) + 0.03 * Math.sin(t * 3.1));
    const oven = iw * (0.42 * Math.sin(t * 0.16) + 0.2 * Math.sin(t * 0.43 + 1.3));
    // Ofen-Bloom: warmes Licht blüht auf (~0,3 s) und setzt sich (~1 s),
    // dazu fährt das Studiolicht einmal von links über die Pizza
    const bt = blooming ? (now - bloomStart) / 1000 : 9;
    const bloom = bt < 0.3 ? Math.sin(((bt / 0.3) * Math.PI) / 2) : Math.max(0, 1 - (bt - 0.3) / 1.0) ** 2;
    const sweep = bt < 1.8 ? -1.5 * (1 - bt / 1.8) ** 3 : 0;
    const glow = S.glow + flicker + 0.65 * bloom;
    // Studiolicht: mit Maus folgt es dem Zeiger, sonst wandert es langsam (Glanz läuft über Öl und Käse)
    const ax = iw * (0.62 * Math.sin(t * 0.3) + 0.22 * Math.sin(t * 0.83 + 2));
    const ay = iw * 0.4 * Math.sin(t * 0.21 + 1);
    const lx = P.x * 1.25 * P.w + ax * (1 - P.w) + sweep;
    const ly = P.y * P.w + ay * (1 - P.w);
    // Ausklang: Studiolicht und Glanz etwas zurück, die Glut bleibt
    const dim = S.dim;
    gl?.draw({
      yaw: view.yaw,
      elev: view.elev,
      hot: [0.5, 0.5, 0],
      spec: 1 - 0.3 * dim,
      key: 1 - 0.24 * dim,
      light: [lx, ly],
      glow,
      time: t,
      heat: iw,
      oven,
    });

    // Licht im Raum, direkt am Element (nur Compositing)
    const beamO = Math.min(1, Math.max(0, 0.7 + (glow - 1) * 0.6)) * (1 - 0.55 * dim);
    if (Math.abs(dim - dimLast) > 0.003) {
      dimLast = dim;
      if (room) room.style.opacity = (1 - 0.32 * dim).toFixed(3);
      if (dust) dust.style.opacity = (1 - 0.6 * dim).toFixed(3);
      glowLast = -1;
    }
    if (Math.abs(glow - glowLast) > 0.004 || Math.abs(lx - beamLast) > 0.01 || beamEl?.style.opacity !== beamO.toFixed(3)) {
      glowLast = glow;
      beamLast = lx;
      if (beamEl) {
        beamEl.style.opacity = beamO.toFixed(3);
        beamEl.style.transform = `translateX(-50%) rotate(${(-lx * 2.4).toFixed(2)}deg)`;
      }
      if (coreEl) {
        coreEl.style.opacity = Math.min(1, Math.max(0, 0.65 + (glow - 1) * 0.7)).toFixed(3);
        coreEl.style.transform = `translate3d(${(oven * G.sw * 0.16).toFixed(1)}px, 0, 0) scale(${(1 + flicker * 0.5).toFixed(3)})`;
      }
    }

    // Dampf: Lage aus der Kamera (Oberseite als Ellipse), Licht aus Glut und Spot
    if (steam) {
      const cam0 = camera(0, view.elev, STAGE_AR);
      const c = toHero(...project(cam0, [0, H_BASE, 0]));
      const ex = toHero(...project(cam0, [1, H_BASE, 0]));
      const ez = toHero(...project(cam0, [0, H_BASE, 1]));
      const rx = Math.hypot(ex.x - c.x, ex.y - c.y);
      const ry = Math.hypot(ez.x - c.x, ez.y - c.y);
      steam.draw({
        time: t,
        ell: [c.x, c.y, rx, ry],
        oven: [c.x + oven * rx * 0.55, c.y - ry * 0.95, Math.max(0, glow) * (1 + flicker)],
        beam: [G.w / 2, lx * 2.4 * DEG, beamO],
        // im Dunkeln bleibt der Dampf vor der Glut sichtbar
        amount: (idle ? 0.35 + 0.65 * iw : 1) * (1 - 0.6 * S.out),
      });
    }

    // Typo: Ausklang beim Scrollen (Desktop)
    const o = desk() ? S.out : 0;
    if (o !== typeState.out || S.ghost !== typeState.ghost) {
      typeState.out = o;
      typeState.ghost = S.ghost;
      const vw = G.w / 100;
      for (const l of lines) {
        const k = l.dataset.heroLine;
        if (desk() && k !== '0') l.style.translate = `${((k === '1' ? -o : o) * 7 * vw).toFixed(1)}px 0`;
        l.style.opacity = (1 - o).toFixed(3);
      }
      if (desk() && ghost) {
        ghost.style.translate = `0 ${(-S.ghost * 0.06 * G.h).toFixed(1)}px`;
        ghost.style.opacity = (1 - o * 0.7).toFixed(3);
      }
    }

    if (visible && !document.hidden && (idle || smoothing)) raf = requestAnimationFrame(frame);
  };
  const request = () => {
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
    // Kamerareaktion, sobald es eine Maus gibt (jede Fensterbreite)
    pointerOn = mqHover.matches;
    const was = idle;
    // Dauerbewegung (Licht, Glut, Dampf, Atmen) überall, wo die GPU es trägt
    idle = !reduced && !!gl && !gl.slow;
    if (idle && !was) idleSince = performance.now();
    request();
  };
  setupPointer();
  mqDesktop.addEventListener('change', setupPointer);
  mqHover.addEventListener('change', setupPointer);
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !pointerOn) return;
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
        gl.draw({ yaw: view.yaw, elev: view.elev, hot: [0.5, 0.5, 0], spec: 1, glow: S.glow });
        if (steamCanvas && !gl.slow) {
          steam = createSteam(steamCanvas, desk() ? 2 : 1.5);
          steam?.resize(G.w, G.h);
        }
        requestAnimationFrame(() => {
          object.classList.add('gl-on');
          hero.classList.add('steam-on');
          bloomStart = performance.now() + 120;
          request();
        });
        setupPointer();
        startDust(hero, desk() ? 46 : 24);
      })
      .catch(() => {});
  }

  if (!reduced) loadScroll();
  request();

  // ---------- Scroll (GSAP, nachgeladen) ----------
  async function loadScroll() {
    const [{ gsap: g }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap = g;
    g.registerPlugin(ScrollTrigger);
    const mm = g.matchMedia();

    mm.add('(min-width: 1024px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1, dim: 0 });
      const tl = g.timeline({
        defaults: { ease: 'none' },
        // jeder Scrub-Schritt zeichnet (auch ohne Dauerbewegung)
        onUpdate: request,
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=220%',
          pin: true,
          scrub: 1.2,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (st) => {
            // Wortpaar zum Fortschritt (die Kapitel wechseln, die Pizza dreht weiter)
            let n = 0;
            SET_AT.forEach((at, i) => st.progress >= at && (n = i));
            showSet(n);
            request();
          },
          onRefresh: () => {
            measure();
            request();
          },
        },
      });
      // wie in der Referenz: aufrichten, drehen, die Kamera fährt herum …
      tl.to(S, { roll: 0, scale: 1, yaw: 14 * DEG, elev: E0 + 6 * DEG, glow: 1.12, duration: 0.16, ease: 'sine.inOut' }, 0)
        .to(S, { roll: 0.6, scale: 1.02, yaw: 30 * DEG, elev: E0 + 8 * DEG, glow: 1.18, duration: 0.22, ease: 'sine.inOut' }, 0.16)
        .to(S, { roll: 1.2, scale: 1.035, yaw: 46 * DEG, elev: E0 + 5 * DEG, ty: -0.01, glow: 1.22, duration: 0.22, ease: 'sine.inOut' }, 0.38)
        .to(S, { yaw: 58 * DEG, elev: E0 + 3 * DEG, duration: 0.2, ease: 'sine.inOut' }, 0.6)
        // … Ausklang: Drehung läuft aus, die Pizza weicht minimal zurück, die
        //    Typo gibt den Blick frei, das Licht dimmt leicht – das Ende
        .to(S, { out: 1, duration: 0.2, ease: 'power2.in' }, 0.8)
        .to(S, { dim: 1, duration: 0.24, ease: 'sine.inOut' }, 0.76)
        .to(S, { ty: 0.012, scale: 1.0, yaw: 64 * DEG, elev: E0 + 2 * DEG, glow: 1.15, duration: 0.2, ease: 'sine.inOut' }, 0.8)
        .to(S, { ghost: 1, duration: 1 }, 0);
      return () => {
        showSet(0);
        request();
      };
    });

    mm.add('(max-width: 1023.98px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1, dim: 0 });
      g.to(S, {
        glow: 1.2,
        roll: 1.4,
        scale: 1.06,
        yaw: 34 * DEG,
        elev: E0 + 8 * DEG,
        ty: 0.05,
        ease: 'none',
        onUpdate: request,
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.6,
        },
      });
      // leichtes Abdunkeln in der zweiten Hälfte des Hero-Scrolls
      g.to(S, {
        dim: 1,
        ease: 'sine.inOut',
        onUpdate: request,
        scrollTrigger: { trigger: hero, start: '35% top', end: 'bottom top', scrub: 0.6 },
      });
      // Handy: kein Pin – die Wortpaare wechseln von selbst, solange der Kopf im Bild ist
      const timer = window.setInterval(() => {
        if (visible && !document.hidden && window.scrollY < G.h * 0.45) showSet((cur + 1) % sets.length);
      }, 3400);
      return () => {
        window.clearInterval(timer);
        showSet(0);
        request();
      };
    });
  }
}

/**
 * Lichtstaub im Spot: wenige warme Partikel, die langsam im Lichtkegel
 * aufsteigen und funkeln. Nur solange der Hero sichtbar ist.
 */
function startDust(hero: HTMLElement, N: number) {
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-dust]');
  if (!canvas || reducedMotion()) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // weiche Lichtpunkte: einfache Auflösung reicht, spart Füllrate
  const dpr = 1;
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
