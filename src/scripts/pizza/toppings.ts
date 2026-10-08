/**
 * Zutaten für die Pizza. Die Stücke kommen aus einem vorab gerenderten Atlas
 * (public/pizza/toppings.webp, scripts/pizza-builder/build-toppings.py):
 * Salami echt aus dem Foto, alles andere wie ein Produktfoto beleuchtet.
 * Nur Öle und die Hollandaise (über die ganze Fläche) werden hier im Canvas
 * gezeichnet. Ein Bild für alles – einmal dekodiert, keine Dauer-Schleife.
 *
 * Schlüssel sind die echten Choice-IDs der Gruppe „pizza-zutaten“.
 */

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;
type Paint = (c: Ctx, R: number, r: Rnd, v: number) => void;

export interface Look {
  /** Ebene: 0 auf der Sauce, 1 Käse, 2 Belag, 3 obenauf */
  z: 0 | 1 | 2 | 3;
  /** Stückzahl klein / groß */
  n: [number, number];
  /** Größe eines Stücks relativ zum Pizza-Radius */
  size: number;
  /** Varianten (verschiedene Formen) */
  variants: number;
  /** ganze Fläche statt einzelner Stücke (Öl, Sauce) – im Canvas gezeichnet */
  cover?: boolean;
  paint?: Paint;
  /** kurzer Name für Hinweise/Labels */
  short?: string;
}

// ---------------------------------------------------------------- Werkzeuge
export function rng(seed: number): Rnd {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const TAU = Math.PI * 2;

/** organische, geschlossene Form */
function blob(c: Ctx, cx: number, cy: number, rx: number, ry: number, r: Rnd, wob = 0.1, n = 14, rot = 0) {
  const ph = [r() * TAU, r() * TAU, r() * TAU];
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (0.6 * Math.sin(a * 2 + ph[0]) + 0.35 * Math.sin(a * 3 + ph[1]) + 0.25 * Math.sin(a * 5 + ph[2]));
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (i === 0) c.moveTo(p1[0], p1[1]);
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  c.closePath();
}

function gloss(c: Ctx, x: number, y: number, rx: number, ry: number, a: number, rot = -0.5) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, TAU);
  c.fill();
  c.restore();
}

function dots(c: Ctx, R: number, r: Rnd, n: number, size: number, color: string, within = 0.85) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * R * within;
    blob(c, Math.cos(a) * d, Math.sin(a) * d, size * (0.6 + r() * 0.8), size * (0.5 + r() * 0.7), r, 0.25, 8, r() * TAU);
    c.fill();
  }
}

// ---------------------------------------------------------------- über die ganze Fläche
function drizzle(color: string, width: number, alpha: number): Paint {
  return (c, R, r) => {
    // R = halber Kachelrand; ein paar lockere, ungleichmäßige Schwünge wie
    // aus der Flasche – nie ein Raster
    const lim = R * 0.74;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const lines = 3;
    for (let k = 0; k < lines; k++) {
      const pts: [number, number][] = [];
      const ang = r() * TAU;
      const off = (k / (lines - 1) - 0.5) * lim * 1.3 + (r() - 0.5) * lim * 0.15;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const steps = 9;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps - 0.5) * 2 * lim;
        const wav = Math.sin(i * 1.7 + r() * 0.8) * lim * 0.12;
        const x = t;
        const y = off + wav;
        if (x * x + y * y > lim * lim) continue;
        pts.push([x * ca - y * sa, x * sa + y * ca]);
      }
      if (pts.length < 3) continue;
      const path = () => {
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      };
      const w = R * width * (0.8 + r() * 0.5);
      c.globalAlpha = alpha;
      c.strokeStyle = color;
      c.lineWidth = w;
      c.shadowColor = 'rgba(60,24,4,0.22)';
      c.shadowBlur = w * 0.6;
      c.shadowOffsetY = w * 0.25;
      path();
      c.stroke();
      c.shadowColor = 'transparent';
      c.globalAlpha = alpha * 0.5;
      c.strokeStyle = 'rgba(255,252,235,0.9)';
      c.lineWidth = w * 0.28;
      c.translate(-w * 0.12, -w * 0.12);
      path();
      c.stroke();
      c.translate(w * 0.12, w * 0.12);
    }
    c.restore();
  };
}
function oil(tint: string, flecks: string): Paint {
  return (c, R, r) => {
    c.save();
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * R * 0.62;
      const rr = R * (0.1 + r() * 0.12);
      const g = c.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, rr);
      g.addColorStop(0, tint);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU);
      c.fill();
      gloss(c, Math.cos(a) * d - rr * 0.2, Math.sin(a) * d - rr * 0.2, rr * 0.4, rr * 0.15, 0.35);
    }
    c.restore();
    dots(c, R, r, 60, R * 0.014, flecks, 0.78);
  };
}

// ---------------------------------------------------------------- Katalog
export const LOOKS: Record<string, Look> = {
  'mit-rindersalami': { z: 2, n: [7, 9], size: 0.13, variants: 4, short: 'Rindersalami' },
  'mit-sucuk': { z: 2, n: [9, 11], size: 0.085, variants: 4, short: 'Sucuk' },
  'mit-pastirma': { z: 2, n: [6, 7], size: 0.17, variants: 3, short: 'Pastirma' },
  'mit-putenschinken': { z: 2, n: [8, 10], size: 0.13, variants: 4, short: 'Putenschinken' },
  'mit-haehnchenbrustfilet': { z: 2, n: [8, 10], size: 0.15, variants: 4, short: 'Hähnchen' },
  'mit-haehnchen-doener-kebab': { z: 2, n: [10, 13], size: 0.14, variants: 4, short: 'Döner' },
  'mit-chicken-nuggets': { z: 3, n: [6, 8], size: 0.12, variants: 4, short: 'Nuggets' },
  'mit-thunfisch': { z: 2, n: [7, 9], size: 0.13, variants: 4, short: 'Thunfisch' },
  'mit-sardellen': { z: 2, n: [6, 7], size: 0.15, variants: 3, short: 'Sardellen' },
  'mit-garnelen': { z: 2, n: [7, 9], size: 0.11, variants: 3, short: 'Garnelen' },
  'mit-frutti-di-mare': { z: 2, n: [10, 12], size: 0.1, variants: 3, short: 'Meeresfrüchte' },
  'mit-bolognese': { z: 0, n: [9, 11], size: 0.14, variants: 3, short: 'Bolognese' },
  'mit-champignons-frisch': { z: 2, n: [8, 10], size: 0.11, variants: 4, short: 'Champignons' },
  'mit-paprika-frisch': { z: 2, n: [8, 10], size: 0.13, variants: 3, short: 'Paprika' },
  'mit-zwiebeln-rot': { z: 2, n: [7, 9], size: 0.11, variants: 4, short: 'Zwiebeln' },
  'mit-peperoni': { z: 2, n: [8, 10], size: 0.075, variants: 4, short: 'Peperoni' },
  'mit-jalapenos': { z: 2, n: [9, 11], size: 0.075, variants: 4, short: 'Jalapeños' },
  'mit-oliven': { z: 2, n: [10, 12], size: 0.072, variants: 4, short: 'Oliven' },
  'mit-mais': { z: 2, n: [10, 13], size: 0.09, variants: 4, short: 'Mais' },
  'mit-ananas': { z: 2, n: [8, 10], size: 0.1, variants: 4, short: 'Ananas' },
  'mit-cherry-tomaten-frisch': { z: 2, n: [7, 9], size: 0.095, variants: 4, short: 'Cherry-Tomaten' },
  'mit-rucola-frisch': { z: 3, n: [9, 11], size: 0.13, variants: 4, short: 'Rucola' },
  'mit-blattspinat': { z: 1, n: [7, 9], size: 0.14, variants: 4, short: 'Spinat' },
  'mit-broccoli': { z: 2, n: [6, 8], size: 0.1, variants: 4, short: 'Brokkoli' },
  'mit-kapern': { z: 2, n: [9, 11], size: 0.06, variants: 3, short: 'Kapern' },
  'mit-pommes': { z: 3, n: [9, 12], size: 0.13, variants: 4, short: 'Pommes' },
  'mit-ei': { z: 3, n: [1, 1], size: 0.3, variants: 1, short: 'Ei' },
  'mit-extra-kaese': { z: 1, n: [7, 9], size: 0.15, variants: 4, short: 'Extra Käse' },
  'mit-parmesan': { z: 3, n: [10, 12], size: 0.08, variants: 4, short: 'Parmesan' },
  'mit-schafskaese': { z: 2, n: [10, 13], size: 0.07, variants: 4, short: 'Schafskäse' },
  'mit-gorgonzola': { z: 1, n: [9, 12], size: 0.08, variants: 4, short: 'Gorgonzola' },
  'mit-sauce-hollandaise': { z: 3, n: [1, 1], size: 1, variants: 1, cover: true, paint: drizzle('#f4c94f', 0.055, 0.94), short: 'Hollandaise' },
  'knoblauch-oel': { z: 0, n: [1, 1], size: 1, variants: 1, cover: true, paint: oil('rgba(240,200,90,0.35)', 'rgba(245,238,205,0.95)'), short: 'Knoblauch-Öl' },
  'chili-oel': { z: 0, n: [1, 1], size: 1, variants: 1, cover: true, paint: oil('rgba(225,80,30,0.32)', 'rgba(170,30,15,0.95)'), short: 'Chili-Öl' },
};

/** Unbekannte Zutat (neu in den Daten): Käsestücke statt nichts */
const FALLBACK: Look = { z: 2, n: [8, 10], size: 0.09, variants: 3 };
export function look(id: string): Look {
  return LOOKS[id] ?? FALLBACK;
}

// ---------------------------------------------------------------- Bilder
export interface Atlas {
  url: string;
  tile: number;
  cols: number;
  rows: Record<string, { row: number; n: number }>;
  count: number;
}
let atlasP: Promise<Atlas> | null = null;
/** Atlas laden und vorab dekodieren (danach ruckelt nichts beim ersten Stück) */
export function loadAtlas(base = '/pizza/'): Promise<Atlas> {
  if (!atlasP)
    atlasP = fetch(base + 'toppings.json')
      .then((r) => r.json())
      .then(async (m: Omit<Atlas, 'url' | 'count'>) => {
        const url = base + 'toppings.webp';
        const img = new Image();
        img.src = url;
        await img.decode().catch(() => undefined);
        return { ...m, url, count: Object.keys(m.rows).length };
      });
  return atlasP;
}

/** CSS für ein Stück aus dem Atlas (passt sich jeder Elementgröße an) */
export function tileCss(a: Atlas, id: string, v: number): string {
  const row = a.rows[id] ?? a.rows['mit-extra-kaese'];
  const col = v % row.n;
  const rows = Math.round(a.count);
  const x = a.cols > 1 ? (col / (a.cols - 1)) * 100 : 0;
  const y = rows > 1 ? (row.row / (rows - 1)) * 100 : 0;
  return `background-image:url(${a.url});background-size:${a.cols * 100}% ${rows * 100}%;background-position:${x}% ${y}%`;
}

const covers = new Map<string, Promise<string>>();
/** Ganze-Fläche-Sorten (Öl, Hollandaise) in Pizzagröße; px in Gerätepixeln */
export function coverSprite(id: string, px: number): Promise<string> {
  const key = `${id}|${px}`;
  let p = covers.get(key);
  if (p) return p;
  p = new Promise((resolve) => {
    const L = look(id);
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d')!;
    c.translate(px / 2, px / 2);
    L.paint?.(c, px / 2, rng(hash(id)), 0);
    cv.toBlob((b) => resolve(b ? URL.createObjectURL(b) : cv.toDataURL()), 'image/png');
  });
  covers.set(key, p);
  return p;
}

export interface Spot {
  /** Position in Pizza-Radien relativ zur Mitte (−1…1) */
  x: number;
  y: number;
  rot: number;
  scale: number;
  v: number;
}

/**
 * Verteilung wie von Hand belegt: „bester Kandidat“ (Mitchell) in der
 * Belagsfläche – gleichmäßig, aber nie im Raster; fester Seed je Zutat.
 */
export function spots(id: string, count: number, inner = 0.72): Spot[] {
  const L = look(id);
  const r = rng(hash(id) ^ 0x9e3779b9);
  if (L.cover) return [{ x: 0, y: 0, rot: 0, scale: 1, v: 0 }];
  if (count === 1) return [{ x: (r() - 0.5) * 0.12, y: (r() - 0.5) * 0.12, rot: r() * 360, scale: 1, v: 0 }];
  const out: Spot[] = [];
  const lim = inner - L.size * 0.55;
  for (let i = 0; i < count; i++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * lim;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      let md = Infinity;
      for (const s of out) md = Math.min(md, (s.x - x) ** 2 + (s.y - y) ** 2);
      // leichte Bevorzugung des Randes, damit die Mitte nicht überladen wirkt
      md = Math.sqrt(md) + 0.05 * (d / lim);
      if (md > bestD) {
        bestD = md;
        best = [x, y];
      }
    }
    out.push({ x: best[0], y: best[1], rot: r() * 360, scale: 0.9 + r() * 0.2, v: i % L.variants });
  }
  return out;
}
