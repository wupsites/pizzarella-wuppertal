/**
 * Hero „Eine Pizza“ – Ablauf:
 *  1. Ein Standbild der 3D-Pizza ist sofort da (LCP, auch ohne JS).
 *  2. Danach lädt die Fototextur; WebGL übernimmt dieselbe Ansicht ohne
 *     sichtbaren Wechsel. Ab jetzt ist die Pizza ein echtes 3D-Objekt.
 *  3. GSAP ScrollTrigger (nachgeladen) dreht die Pizza beim Scrollen und
 *     führt die Kamera um sie herum: Desktop gepinnt wie in der Referenz,
 *     Handy ohne Pin und einfacher.
 *  4. Info-Schienen wie in der Referenz: beim Überfahren einer Stelle kommt
 *     die passende Schiene hinter der Pizza hervor (Touch: Antippen).
 *  5. Licht: Studiolicht wandert langsam über die Pizza (mit Maus folgt es
 *     dem Zeiger), Ofen-Bloom und Lichtschwenk beim Start.
 *  Reduzierte Bewegung: Standbild, keine Scroll- oder Idle-Bewegung.
 *
 * Pro Frame wird nur geschrieben (transform/opacity direkt am Element, ein
 * Draw-Call) – keine vererbten CSS-Variablen am Hero, keine Filter-Animationen.
 * Layout wird ausschließlich bei Größenänderung gemessen.
 */
import { reducedMotion } from '../ui/util.ts';
import { createPizza3D, type Pizza3D } from './gl3d.ts';
import { camera, project, unproject, uvToModel, E0, STAGE_AR, TEX_RADIUS, type Vec3 } from './camera.ts';

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
  const beamEl = hero.querySelector<HTMLElement>('[data-hero-beam]');
  const coreEl = hero.querySelector<HTMLElement>('.hp-core');
  const vignette = hero.querySelector<HTMLElement>('[data-hero-vignette]');
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
  const P = { x: 0, y: 0, tx: 0, ty: 0, w: 0, inside: false, px: 0, py: 0, moved: false };
  const hot = { zone: null as Zone | null, s: 0, u: 0.5, v: 0.5 };
  const view = { roll: S.roll, scale: S.scale, tx: 0, ty: 0, yaw: 0, elev: E0 };

  // ---------- Geometrie (nur bei Resize messen) ----------
  const G = { w: 0, h: 0, sx: 0, sy: 0, sw: 0, sh: 0, gutter: 16, topL: 0, topR: 0, bottom: 0 };
  let gl: Pizza3D | null = null;
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
    // freie Fläche für die Schienen: unter den Headline-Zeilen, über dem Fuß
    const l1 = lines[1]?.getBoundingClientRect();
    const l2 = lines[2]?.getBoundingClientRect();
    const fr = foot?.getBoundingClientRect();
    G.topL = l1 ? l1.bottom - hr.top : 0;
    G.topR = l2 ? l2.bottom - hr.top : 0;
    G.bottom = fr ? fr.top - hr.top : G.h;
    hero.style.setProperty('--light-y', `${(((G.sy + G.sh * 0.57) / G.h) * 100).toFixed(1)}%`);
    gl?.resize(G.sw, G.sh);
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

  // ---------- Info-Schienen (liegen hinter der Pizza) ----------
  const callouts = new Map<Zone, HTMLElement>();
  hero.querySelectorAll<HTMLElement>('[data-spot]').forEach((el) => callouts.set(el.dataset.spot as Zone, el));
  const spotUV = (z: Zone) => {
    const el = callouts.get(z)!;
    return { u: Number(el.dataset.u), v: Number(el.dataset.v) };
  };
  // Umriss der Pizza auf dem Bildschirm (für die Schienen links/rechts)
  const RIM: Vec3[] = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return [Math.cos(a), 0.04, Math.sin(a)];
  });
  const silhouette = (cam: ReturnType<typeof camera>) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of RIM) {
      const [nx, ny] = project(cam, p);
      const h = toHero(nx, ny);
      minX = Math.min(minX, h.x);
      maxX = Math.max(maxX, h.x);
      maxY = Math.max(maxY, h.y);
    }
    return { minX, maxX, maxY };
  };
  const REM = 16;
  /** Schiene an Stelle und Umriss ausrichten: Karte seitlich (oder darunter), Linie hinter der Pizza */
  const place = (el: HTMLElement, z: Zone) => {
    const { u, v } = spotUV(z);
    const cam = camera(view.yaw, view.elev, STAGE_AR);
    const a = toHero(...project(cam, uvToModel(u, v)));
    const box = silhouette(cam);
    let cx: number;
    let cy: number;
    let ex: number;
    let ey: number;
    if (el.dataset.side === 'below') {
      cx = G.w / 2;
      cy = box.maxY + 1.6 * REM;
      ex = cx;
      ey = cy - 0.8 * REM;
    } else {
      const left = el.dataset.side === 'left';
      const gap = 2.6 * REM;
      // nicht in die Headline-Zeile darüber, nicht in den Fuß darunter
      const top = (left ? G.topL : G.topR) + 1.4 * REM;
      cx = left ? box.minX - gap : box.maxX + gap;
      cy = Math.min(Math.max(a.y, top), G.bottom - 2.4 * REM);
      ex = left ? cx + 0.95 * REM : cx - 0.95 * REM;
      ey = cy;
    }
    const dx = ex - a.x;
    const dy = ey - a.y;
    el.style.setProperty('--lx', `${a.x.toFixed(1)}px`);
    el.style.setProperty('--ly', `${a.y.toFixed(1)}px`);
    el.style.setProperty('--la', `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2)}deg`);
    el.style.setProperty('--len', Math.hypot(dx, dy).toFixed(1));
    el.style.setProperty('--cx', `${cx.toFixed(1)}px`);
    el.style.setProperty('--cy', `${cy.toFixed(1)}px`);
  };
  const leaving = new Set<HTMLElement>();
  let touchTimer = 0;
  const setHot = (z: Zone | null) => {
    if (z === hot.zone) return;
    if (hot.zone) {
      const prev = callouts.get(hot.zone)!;
      prev.classList.remove('is-on');
      leaving.add(prev);
      window.setTimeout(() => leaving.delete(prev), 460);
    }
    hot.zone = z;
    if (z) {
      const { u, v } = spotUV(z);
      hot.u = u;
      hot.v = v;
      const el = callouts.get(z)!;
      leaving.delete(el);
      // Seite beim Erscheinen festlegen: dort, wo die Stelle gerade liegt
      let side = 'below';
      if (desk()) {
        const cam = camera(view.yaw, view.elev, STAGE_AR);
        const box = silhouette(cam);
        side = toHero(...project(cam, uvToModel(u, v))).x < (box.minX + box.maxX) / 2 ? 'left' : 'right';
      }
      el.dataset.side = side;
      el.classList.remove('rail--left', 'rail--right', 'rail--below');
      el.classList.add(`rail--${side}`);
      el.style.setProperty('--dir', side === 'left' ? '-1' : side === 'right' ? '1' : '0');
      place(el, z);
      requestAnimationFrame(() => hot.zone === z && el.classList.add('is-on'));
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
  let bloomStart = 0; // Ofen-Bloom, wenn WebGL übernimmt
  let focus = 0; // Fokus-Modus 0–1 (Zeiger auf der Pizza)
  let focusLast = -1;
  let glowLast = -1;
  let beamLast = 9;

  const frame = (now: number) => {
    raf = 0;
    const slowGl = !!gl?.slow;
    const blooming = bloomStart > 0 && now - bloomStart < 1900;
    // Fokus beim Überfahren (Maus); Touch: halber Fokus, solange die Schiene steht
    const focusTarget = hot.zone && S.out < 0.15 ? (pointerOn ? 1 : 0.5) : 0;
    const smoothing =
      blooming ||
      Math.abs(focusTarget - focus) > 0.003 ||
      Math.abs((pointerOn && P.inside ? 1 : 0) - P.w) > 0.01 ||
      (!slowGl && (Math.abs(P.tx - P.x) > 0.002 || Math.abs(P.ty - P.y) > 0.002)) ||
      Math.abs((hot.zone ? 1 : 0) - hot.s) > 0.01;
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
    P.w += ((pointerOn && P.inside ? 1 : 0) - P.w) * (1 - Math.exp(-dt * 2.5));
    hot.s += ((hot.zone ? 1 : 0) - hot.s) * (1 - Math.exp(-dt * 7));
    // Fokus weich ein- und ausblenden (ca. 0,6 s)
    focus += (focusTarget - focus) * (1 - Math.exp(-dt * 3.4));

    // Szene: Scroll hat Vorrang, Maus und Idle sind Beiwerk
    const iw = idle ? Math.min(1, (now - idleSince) / 1600) : 0;
    view.roll = S.roll + iw * Math.sin(t * 0.45) * 0.15;
    view.scale = S.scale * (1 + 0.015 * focus);
    view.tx = S.tx * G.w + P.x * 5;
    view.ty = S.ty * G.h + iw * Math.sin(t * 0.9) * 2.2 + P.y * 3;
    view.yaw = S.yaw + P.x * 2.5 * DEG + iw * Math.sin(t * 0.31) * 0.7 * DEG;
    view.elev = S.elev - P.y * 1.5 * DEG + iw * Math.sin(t * 0.23 + 1) * 0.4 * DEG;

    object.style.transform = `translate3d(${view.tx.toFixed(2)}px, ${view.ty.toFixed(2)}px, 0) rotate(${view.roll.toFixed(3)}deg) scale(${view.scale.toFixed(4)})`;
    // Licht: Glanz folgt der Maus, Ofenglut flackert leicht, Sweep beim Start
    const flicker = iw * (0.06 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1) + 0.035 * Math.sin(t * 11.7));
    // Ofen-Bloom: warmes Licht blüht auf (~0,3 s) und setzt sich (~1 s),
    // dazu fährt das Studiolicht einmal von links über die Pizza
    const bt = blooming ? (now - bloomStart) / 1000 : 9;
    const bloom = bt < 0.3 ? Math.sin(((bt / 0.3) * Math.PI) / 2) : Math.max(0, 1 - (bt - 0.3) / 1.0) ** 2;
    const sweep = bt < 1.8 ? -1.5 * (1 - bt / 1.8) ** 3 : 0;
    const glow = S.glow + flicker + 0.65 * bloom + 0.22 * focus;
    // Licht: mit Maus folgt es dem Zeiger, sonst wandert es langsam (Glanz läuft über Öl und Käse)
    const ax = iw * (0.62 * Math.sin(t * 0.3) + 0.22 * Math.sin(t * 0.83 + 2));
    const ay = iw * 0.4 * Math.sin(t * 0.21 + 1);
    const lx = P.x * 1.25 * P.w + ax * (1 - P.w) + sweep;
    const ly = P.y * P.w + ay * (1 - P.w);
    gl?.draw({
      yaw: view.yaw,
      elev: view.elev,
      hot: [hot.u, hot.v, hot.s],
      spec: 1,
      light: [lx, ly],
      glow,
      time: t,
      heat: iw,
    });
    // Licht im Raum: Kegel und Glut folgen Glut und Fokus, der Kegel schwenkt mit
    // (direkt am Element: nur Compositing, keine Stilberechnung für den ganzen Hero)
    if (Math.abs(glow - glowLast) > 0.004 || Math.abs(focus - focusLast) > 0.003) {
      glowLast = glow;
      if (beamEl) beamEl.style.opacity = Math.min(1, Math.max(0, 0.7 + (glow - 1) * 0.6) + 0.18 * focus).toFixed(3);
      if (coreEl) coreEl.style.opacity = Math.min(1, Math.max(0, 0.65 + (glow - 1) * 0.55) + 0.12 * focus).toFixed(3);
    }
    if (beamEl && Math.abs(lx - beamLast) > 0.01) {
      beamLast = lx;
      beamEl.style.transform = `translateX(-50%) rotate(${(-lx * 2.4).toFixed(2)}deg)`;
    }
    if (hot.zone) place(callouts.get(hot.zone)!, hot.zone);
    leaving.forEach((el) => place(el, el.dataset.spot as Zone));

    // Typo: Ausklang beim Scrollen (Desktop) und Fokus-Modus
    const o = desk() ? S.out : 0;
    if (o !== typeState.out || S.ghost !== typeState.ghost || Math.abs(focus - focusLast) > 0.003) {
      typeState.out = o;
      typeState.ghost = S.ghost;
      focusLast = focus;
      const vw = G.w / 100;
      if (desk()) {
        if (lines[1]) lines[1].style.translate = `${(-o * 7 * vw).toFixed(1)}px 0`;
        if (lines[2]) lines[2].style.translate = `${(o * 7 * vw).toFixed(1)}px 0`;
        if (ghost) {
          ghost.style.translate = `0 ${(-S.ghost * 0.06 * G.h).toFixed(1)}px`;
          ghost.style.opacity = ((1 - o * 0.7) * (1 - focus)).toFixed(3);
        }
      }
      const lo = ((1 - o) * (1 - 0.86 * focus)).toFixed(3);
      for (const l of lines) l.style.opacity = lo;
      if (foot) foot.style.opacity = (1 - 0.72 * focus).toFixed(3);
      if (vignette) vignette.style.opacity = focus.toFixed(3);
      if (o > 0.15 && hot.zone) setHot(null);
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
    // Hover und Kamerareaktion, sobald es eine Maus gibt (jede Fensterbreite)
    pointerOn = mqHover.matches;
    const was = idle;
    // Dauerbewegung (Licht, Hitze, Atmen) überall, wo die GPU es trägt
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
        gl.draw({ yaw: view.yaw, elev: view.elev, hot: [hot.u, hot.v, hot.s], spec: 1, glow: S.glow });
        requestAnimationFrame(() => {
          object.classList.add('gl-on');
          bloomStart = performance.now() + 120;
          request();
        });
        setupPointer();
        startDust(hero, desk() ? 46 : 24);
      })
      .catch(() => {});
  }

  // Touch: Antippen einer Stelle lässt ihre Schiene hervorkommen
  hero.addEventListener('click', (e) => {
    if (pointerOn || S.out >= 0.15) return;
    const r = hero.getBoundingClientRect();
    const z = zoneAt(e.clientX - r.left, e.clientY - r.top);
    window.clearTimeout(touchTimer);
    setHot(z);
    if (z) touchTimer = window.setTimeout(() => setHot(null), 3600);
  });

  if (!reduced) loadScroll();
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
      tl.to(S, { roll: 0, scale: 1, yaw: 18 * DEG, elev: E0 + 7 * DEG, glow: 1.15, duration: 0.42, ease: 'sine.inOut' }, 0)
        // … weiter um die Pizza, minimal näher, die Glut wird heißer …
        .to(S, { roll: 1.2, scale: 1.035, yaw: 34 * DEG, elev: E0 + 4 * DEG, ty: -0.01, glow: 1.22, duration: 0.32, ease: 'sine.inOut' }, 0.42)
        // … Ausklang: Drehung läuft aus, die Pizza weicht minimal zurück,
        //    das warme Licht dimmt, die Typo gibt den Blick frei
        .to(S, { out: 1, duration: 0.24, ease: 'power2.in' }, 0.74)
        .to(S, { ty: 0.012, scale: 1.0, yaw: 40 * DEG, elev: E0 + 2 * DEG, glow: 0.78, duration: 0.26, ease: 'sine.inOut' }, 0.74)
        .to(S, { ghost: 1, duration: 1 }, 0);
      return () => request();
    });

    mm.add('(max-width: 1023.98px)', () => {
      Object.assign(S, base(), { tx: 0, ty: 0, yaw: 0, elev: E0, out: 0, ghost: 0, glow: 1 });
      gsap.to(S, {
        glow: 1.2,
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
