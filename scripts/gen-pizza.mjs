/**
 * Erzeugt die Hero-Illustration (Draufsicht einer Pizza) als SVG.
 * Jedes der 8 Stücke trägt den Belag einer echten Pizza von der Karte
 * (Reihenfolge = home.json → heroSlices). Kein Foto, keine Behauptung –
 * eine Art-Direction-Illustration mit festem Zufalls-Seed.
 *
 *   node scripts/gen-pizza.mjs   → src/assets/hero-pizza.svg
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'assets', 'hero-pizza.svg');

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(117); // Hausnummer als Seed
const rand = (a, b) => a + rng() * (b - a);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const f = (n) => Math.round(n).toString();
const rad = (d) => (d * Math.PI) / 180;

/** geschlossene, organische Form (Catmull-Rom → Bézier) */
function blob(cx, cy, r, wobble = 0.12, n = 12, stretch = 1, rot = 0) {
  const phase = [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (0.6 * Math.sin(a * 2 + phase[0]) + 0.3 * Math.sin(a * 3 + phase[1]) + 0.25 * Math.sin(a * 5 + phase[2]));
    let x = Math.cos(a) * r * k * stretch;
    let y = Math.sin(a) * r * k;
    const c = Math.cos(rad(rot));
    const s = Math.sin(rad(rot));
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

const R_CRUST = 480;
const R_SAUCE = 418;
const R_TOP = 372;

// ── Basis ──────────────────────────────────────────────────────────────
let base = '';
base += `<circle r="${R_CRUST}" fill="url(#gCrust)"/>`;
// Röstspuren am Rand
for (let i = 0; i < 54; i++) {
  const a = rand(0, 360);
  const r = rand(R_SAUCE + 8, R_CRUST - 6);
  const x = Math.cos(rad(a)) * r;
  const y = Math.sin(rad(a)) * r;
  base += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rand(3, 13))}" ry="${f(rand(2, 6))}" transform="rotate(${f(a + 90)} ${f(x)} ${f(y)})" fill="#5a2810" opacity="${(rand(0.18, 0.5)).toFixed(2)}"/>`;
}
for (let i = 0; i < 34; i++) {
  const a = rand(0, 360);
  const r = rand(R_SAUCE + 14, R_CRUST - 10);
  base += `<circle cx="${f(Math.cos(rad(a)) * r)}" cy="${f(Math.sin(rad(a)) * r)}" r="${f(rand(1.5, 4))}" fill="#ffe8bd" opacity="${(rand(0.35, 0.7)).toFixed(2)}"/>`;
}
// Sauce
base += `<path d="${blob(0, 0, R_SAUCE, 0.025, 36)}" fill="url(#gSauce)"/>`;
for (let i = 0; i < 26; i++) {
  const a = rand(0, 360);
  const r = rand(40, R_SAUCE - 20);
  base += `<ellipse cx="${f(Math.cos(rad(a)) * r)}" cy="${f(Math.sin(rad(a)) * r)}" rx="${f(rand(6, 16))}" ry="${f(rand(4, 10))}" transform="rotate(${f(rand(0, 180))} ${f(Math.cos(rad(a)) * r)} ${f(Math.sin(rad(a)) * r)})" fill="#a3260f" opacity="${(rand(0.25, 0.5)).toFixed(2)}"/>`;
}
// Käse – überlappende Flächen, Sauce blitzt durch
let cheese = '';
for (let i = 0; i < 34; i++) {
  // Ring-weise verteilen, damit der Käse bis an den Rand reicht
  const a = (i / 34) * 360 * 2.618 + rand(-20, 20);
  const r = i < 6 ? rand(0, 120) : rand(170, R_SAUCE - 52);
  cheese += `<path d="${blob(Math.cos(rad(a)) * r, Math.sin(rad(a)) * r, rand(70, 112), 0.24, 9)}" fill="url(#gCheese)"/>`;
}
// gebräunte Käsestellen
for (let i = 0; i < 32; i++) {
  const a = rand(0, 360);
  const r = Math.sqrt(rng()) * (R_TOP - 30);
  const x = Math.cos(rad(a)) * r, y = Math.sin(rad(a)) * r;
  cheese += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rand(5, 15))}" ry="${f(rand(4, 10))}" transform="rotate(${f(rand(0, 180))} ${f(x)} ${f(y)})" fill="#d48a35" opacity="${(rand(0.35, 0.7)).toFixed(2)}"/>`;
}
for (let i = 0; i < 40; i++) {
  const a = rand(0, 360);
  const r = Math.sqrt(rng()) * (R_TOP - 30);
  const x = Math.cos(rad(a)) * r, y = Math.sin(rad(a)) * r;
  cheese += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rand(8, 22))}" ry="${f(rand(6, 14))}" transform="rotate(${f(rand(0, 180))} ${f(x)} ${f(y)})" fill="#fff4cf" opacity="${(rand(0.35, 0.65)).toFixed(2)}"/>`;
}
base += `<g clip-path="url(#pzCheeseClip)">${cheese}</g>`;

// ── Beläge ─────────────────────────────────────────────────────────────
const T = {
  salami(x, y, s) {
    const r = 30 * s;
    let g = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#gSalami)"/>`;
    g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r - 1.5)}" fill="none" stroke="#6d1512" stroke-width="2.5" opacity=".55"/>`;
    for (let i = 0; i < 7; i++) {
      const a = rand(0, 6.28);
      const d = Math.sqrt(rng()) * r * 0.72;
      g += `<ellipse cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" rx="${f(rand(1.8, 3.6))}" ry="${f(rand(1.5, 2.8))}" fill="#f4b9a0" opacity=".85"/>`;
    }
    g += `<path d="M${f(x - r * 0.55)} ${f(y - r * 0.35)}Q${f(x)} ${f(y - r * 0.85)} ${f(x + r * 0.55)} ${f(y - r * 0.35)}" fill="none" stroke="#e46a52" stroke-width="3" stroke-linecap="round" opacity=".45"/>`;
    return g;
  },
  mushroom(x, y, s) {
    const rot = rand(0, 360);
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s.toFixed(2)})"><path d="M-23 3C-23-14-11-23 0-23 11-23 23-14 23 3Q13 7 7 5L8 19Q0 23-8 19L-7 5Q-13 7-23 3Z" fill="url(#gMush)" stroke="#a9845a" stroke-width="2.5"/><path d="M-16 0Q0-9 16 0" fill="none" stroke="#c4a172" stroke-width="2.2"/><path d="M-2 8L-2 16M3 8L3 15" stroke="#d6bc93" stroke-width="1.6" stroke-linecap="round"/></g>`;
  },
  peperoni(x, y, s) {
    const r = 15 * s;
    let g = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#d9df8e" fill-opacity=".35" stroke="#9fae35" stroke-width="${f(r * 0.42)}"/>`;
    for (let i = 0; i < 3; i++) g += `<ellipse cx="${f(x + rand(-r / 2, r / 2))}" cy="${f(y + rand(-r / 2, r / 2))}" rx="2.2" ry="1.4" fill="#f4f0c8"/>`;
    return g;
  },
  chicken(x, y, s) {
    let g = `<path d="${blob(x, y, rand(15, 21) * s, 0.28, 9, rand(1.1, 1.5), rand(0, 180))}" fill="url(#gChicken)" stroke="#b57a42" stroke-width="1.5"/>`;
    const a = rand(0, 3.14);
    g += `<path d="M${f(x - 8 * Math.cos(a))} ${f(y - 8 * Math.sin(a))}l${f(12 * Math.cos(a + 0.4))} ${f(12 * Math.sin(a + 0.4))}" stroke="#8e5726" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`;
    return g;
  },
  broccoli(x, y, s) {
    const rot = rand(0, 360);
    let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s.toFixed(2)})"><path d="M-4 4L-3 20Q0 23 3 20L4 4Z" fill="#8bb764"/>`;
    const pts = [[-11, -2], [0, -7], [11, -2], [-6, -13], [6, -13], [0, 1]];
    for (const [px, py] of pts) g += `<circle cx="${px}" cy="${py}" r="${f(rand(7, 9.5))}" fill="${pick(['#3b7533', '#447f39', '#4e8c3f'])}"/>`;
    g += `<circle cx="-4" cy="-10" r="3" fill="#7db55b" opacity=".8"/><circle cx="7" cy="-5" r="2.5" fill="#7db55b" opacity=".7"/></g>`;
    return g;
  },
  doener(x, y, s) {
    const rot = rand(0, 180);
    const d = blob(x, y, rand(10, 13) * s, 0.32, 9, rand(2, 2.6), rot);
    return `<path d="${d}" fill="url(#gDoener)" stroke="#6a3112" stroke-width="2" stroke-opacity=".55"/><path d="${blob(x - 2, y - 2, rand(4, 6) * s, 0.3, 7, 2.2, rot)}" fill="#e0a465" opacity=".55"/>`;
  },
  salad(x, y, s) {
    const rot = rand(0, 360);
    const col = pick(['#7fb34c', '#93c25c', '#b9d97b']);
    return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s.toFixed(2)})" d="M-18 0Q-7-8 4-2T20-4" fill="none" stroke="${col}" stroke-width="4.5" stroke-linecap="round"/>`;
  },
  ham(x, y, s) {
    let g = `<path d="${blob(x, y, rand(19, 25) * s, 0.2, 6, 1.15, rand(0, 180))}" fill="url(#gHam)" stroke="#c77079" stroke-width="2"/>`;
    g += `<path d="M${f(x - 10)} ${f(y + rand(-4, 4))}q10 -6 20 0" fill="none" stroke="#fde3dc" stroke-width="3" stroke-linecap="round" opacity=".8"/>`;
    return g;
  },
  pineapple(x, y, s) {
    const rot = rand(0, 360);
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s.toFixed(2)})"><path d="M-15-11Q0-14 15-11L10 12Q0 14-10 12Z" fill="#f5cf47" stroke="#d6a92a" stroke-width="2"/><path d="M-6-8L-4 9M0-9L0 10M6-8L4 9" stroke="#e2b733" stroke-width="1.6"/></g>`;
  },
  spinach(x, y, s) {
    const rot = rand(0, 180);
    let g = `<path d="${blob(x, y, rand(14, 22) * s, 0.38, 9, 1.4, rot)}" fill="${pick(['#2d5a2a', '#356634', '#2a522a'])}" opacity=".92"/>`;
    g += `<path d="M${f(x - 10 * Math.cos(rad(rot)))} ${f(y - 10 * Math.sin(rad(rot)))}L${f(x + 10 * Math.cos(rad(rot)))} ${f(y + 10 * Math.sin(rad(rot)))}" stroke="#4f8a46" stroke-width="1.6" opacity=".7"/>`;
    return g;
  },
  feta(x, y, s) {
    const rot = rand(0, 90);
    const w = 18 * s;
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"><rect x="${f(-w / 2 + 2)}" y="${f(-w / 2 + 3)}" width="${f(w)}" height="${f(w * 0.9)}" rx="4" fill="#000" opacity=".12"/><rect x="${f(-w / 2)}" y="${f(-w / 2)}" width="${f(w)}" height="${f(w * 0.9)}" rx="4" fill="#fffdf6" stroke="#c9bb9a" stroke-width="2"/></g>`;
  },
  tuna(x, y, s) {
    let g = '';
    for (let i = 0; i < 6; i++) {
      g += `<path d="${blob(x + rand(-14, 14) * s, y + rand(-12, 12) * s, rand(6, 10) * s, 0.3, 7)}" fill="${pick(['#d2ac8c', '#c49a78', '#e3c4a6', '#b98d6c'])}"/>`;
    }
    return g;
  },
  hollandaise(i) {
    const mid = -90 + i * 45 + 22.5;
    let d = '';
    for (let r = 80; r <= 360; r += 7) {
      const a = mid + Math.sin(r / 26) * 10 * (r / 360 + 0.4);
      const x = Math.cos(rad(a)) * r;
      const y = Math.sin(rad(a)) * r;
      d += (d ? 'L' : 'M') + `${f(x)} ${f(y)}`;
    }
    return `<path d="${d}" fill="none" stroke="#e2a93a" stroke-width="17" stroke-opacity=".55"/><path d="${d}" fill="none" stroke="#f4d067" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/><path d="${d}" fill="none" stroke="#fff3c4" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity=".7" transform="translate(-2 -2)"/>`;
  },
};

// Belagsrezepte je Pizza (Zutaten laut Speisekarte)
const RECIPES = {
  'pizza-vulcano': [['salami', 8], ['mushroom', 5], ['peperoni', 6]],
  'pizza-ela': [['hollandaise', 1], ['chicken', 9], ['broccoli', 6]],
  'pizza-doener': [['doener', 15], ['salad', 16]],
  'pizza-hawaii': [['ham', 9], ['pineapple', 9]],
  'pizza-spinaci-spezial': [['spinach', 13], ['feta', 11]],
  'pizza-prosciutto-e-funghi': [['ham', 8], ['mushroom', 8]],
  'pizza-tonno': [['tuna', 13]],
  'pizza-margherita': [],
};
const slices = JSON.parse(
  (await import('node:fs')).readFileSync(join(root, 'src', 'data', 'home.json'), 'utf8'),
).heroSlices;

let toppings = '';
slices.forEach((id, i) => {
  const recipe = RECIPES[id] ?? [];
  const a0 = -90 + i * 45 + 6;
  const a1 = -90 + (i + 1) * 45 - 6;
  const placed = [];
  let g = '';
  for (const [kind, count] of recipe) {
    if (kind === 'hollandaise') {
      g += T.hollandaise(i);
      continue;
    }
    for (let n = 0, tries = 0; n < count && tries < 400; tries++) {
      const r = 64 + Math.sqrt(rng()) * (R_SAUCE - 64 - 46);
      const a = rand(a0, a1);
      // innen wird das Stück schmal – Abstand zur Schnittkante in Pixeln prüfen
      const arcSpace = (Math.min(a - a0, a1 - a) * Math.PI * r) / 180;
      if (arcSpace < 14) continue;
      const x = Math.cos(rad(a)) * r;
      const y = Math.sin(rad(a)) * r;
      const minDist = kind === 'salad' ? 14 : kind === 'peperoni' || kind === 'feta' || kind === 'doener' ? 34 : 46;
      if (placed.some(([px, py, pk]) => Math.hypot(px - x, py - y) < (pk === 'salad' || kind === 'salad' ? 14 : minDist))) continue;
      placed.push([x, y, kind]);
      g += T[kind](x, y, rand(1.08, 1.32));
      n++;
    }
  }
  toppings += `<g data-slice="${i}" data-product="${id}">${g}</g>`;
});

// Oregano
let herbs = '';
for (let i = 0; i < 64; i++) {
  const a = rand(0, 360);
  const r = Math.sqrt(rng()) * (R_SAUCE - 10);
  herbs += `<circle cx="${f(Math.cos(rad(a)) * r)}" cy="${f(Math.sin(rad(a)) * r)}" r="${f(rand(1.2, 2.6))}" fill="#4a5626" opacity=".75"/>`;
}

// Schnitte
let cuts = '';
for (let i = 0; i < 8; i++) {
  const a = rad(-90 + i * 45);
  const x = Math.cos(a) * (R_CRUST - 4);
  const y = Math.sin(a) * (R_CRUST - 4);
  cuts += `<path d="M0 0L${f(x)} ${f(y)}" stroke="#6b2f12" stroke-width="5" opacity=".28"/><path d="M2 2L${f(x + 2)} ${f(y + 2)}" stroke="#ffe7b0" stroke-width="2" opacity=".22"/>`;
}

const defs = `<defs>
<radialGradient id="gCrust"><stop offset="0" stop-color="#f1c47e"/><stop offset=".86" stop-color="#e3a65c"/><stop offset=".95" stop-color="#c77f3a"/><stop offset="1" stop-color="#985222"/></radialGradient>
<radialGradient id="gSauce"><stop offset="0" stop-color="#d9482b"/><stop offset="1" stop-color="#b42d17"/></radialGradient>
<radialGradient id="gCheese" cx=".4" cy=".35"><stop offset="0" stop-color="#fff0bd"/><stop offset=".6" stop-color="#f8d679"/><stop offset="1" stop-color="#efbd4f"/></radialGradient>
<radialGradient id="gSalami" cx=".4" cy=".4"><stop offset="0" stop-color="#c63c30"/><stop offset="1" stop-color="#8a1d1a"/></radialGradient>
<radialGradient id="gChicken" cx=".4" cy=".35"><stop offset="0" stop-color="#f3cd98"/><stop offset="1" stop-color="#c88b4e"/></radialGradient>
<linearGradient id="gDoener" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c7853f"/><stop offset="1" stop-color="#8b4720"/></linearGradient>
<radialGradient id="gHam" cx=".4" cy=".4"><stop offset="0" stop-color="#f5bdb5"/><stop offset="1" stop-color="#de8f90"/></radialGradient>
<radialGradient id="gMush" cx=".45" cy=".35"><stop offset="0" stop-color="#f6e8cd"/><stop offset="1" stop-color="#d8bd90"/></radialGradient>
<clipPath id="pzCheeseClip"><circle r="${R_SAUCE - 4}"/></clipPath>
<radialGradient id="gLight" cx=".32" cy=".26" r=".9"><stop offset="0" stop-color="#fff6dc" stop-opacity=".28"/><stop offset=".55" stop-color="#fff6dc" stop-opacity="0"/><stop offset="1" stop-color="#3a1404" stop-opacity=".22"/></radialGradient>
<radialGradient id="gShadow"><stop offset=".72" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
${Array.from({ length: 8 }, (_, i) => {
  const a0 = rad(-90 + i * 45);
  const a1 = rad(-90 + (i + 1) * 45);
  const R = 520;
  return `<clipPath id="pzc${i}"><path d="M0 0L${f(Math.cos(a0) * R)} ${f(Math.sin(a0) * R)}A${R} ${R} 0 0 1 ${f(Math.cos(a1) * R)} ${f(Math.sin(a1) * R)}Z"/></clipPath>`;
}).join('\n')}
</defs>`;

const pizza = `<g id="pz">${base}${toppings}${herbs}${cuts}<circle r="${R_CRUST}" fill="url(#gLight)"/></g>`;
const slicesUse = Array.from({ length: 8 }, (_, i) => {
  const mid = rad(-90 + i * 45 + 22.5);
  return `<g class="pz-slice" data-i="${i}" data-product="${slices[i]}" style="--dx:${f(Math.cos(mid))};--dy:${f(Math.sin(mid))}"><use href="#pz" clip-path="url(#pzc${i})"/></g>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-520 -520 1040 1040" class="pz" aria-hidden="true" focusable="false">${defs}<circle class="pz-shadow" cx="14" cy="22" r="${R_CRUST + 30}" fill="url(#gShadow)"/><g class="pz-defs-holder" style="display:none">${pizza}</g>${slicesUse}</svg>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`hero-pizza.svg: ${(svg.length / 1024).toFixed(1)} KB`);
