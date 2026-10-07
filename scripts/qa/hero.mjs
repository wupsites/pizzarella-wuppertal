/**
 * Hero-QA: Screenshots an mehreren Scroll-Positionen, Hover-Callouts,
 * Konsole, WebGL-Status.
 *   node scripts/qa/hero.mjs <baseUrl> <breite> <höhe> [ausgabeordner]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const w = Number(process.argv[3] ?? 1440);
const h = Number(process.argv[4] ?? 900);
const out = process.argv[5] ?? 'qa-output/hero';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: browserPath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = w < 1024;
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
await p.clock.setFixedTime(new Date('2026-10-09T19:30:00+02:00'));
await p.goto(base + '/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
const glOn = await p.evaluate(() => document.querySelector('[data-hero-object]')?.classList.contains('gl-on'));
const pinLen = await p.evaluate(() => {
  const s = document.querySelector('.pin-spacer');
  return s ? s.offsetHeight - window.innerHeight : document.querySelector('[data-hero]').offsetHeight;
});
console.log(`${w}x${h} gl:${glOn} scrollstrecke:${pinLen}`);
const stops = [0, 0.25, 0.5, 0.75, 1];
for (const s of stops) {
  await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(pinLen * s));
  await p.waitForTimeout(1700);
  await p.screenshot({ path: `${out}/hero-${w}-s${Math.round(s * 100)}.png` });
}
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await p.waitForTimeout(1500);
if (!mobile) {
  const box = await p.$eval('[data-hero-stage]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const zones = { rand: [0.45, 0.82], kaese: [0.6, 0.55], sauce: [0.35, 0.5], spaet: [0.93, 0.58], ort: [0.5, 0.3] };
  for (const [z, [u, v]] of Object.entries(zones)) {
    await p.mouse.move(box.x + box.w * u, box.y + box.h * v, { steps: 8 });
    await p.waitForTimeout(900);
    const on = await p.evaluate(() => [...document.querySelectorAll('.rail.is-on')].map((e) => e.dataset.spot).join(','));
    console.log(`hover ${z}: ${on}`);
    await p.screenshot({ path: `${out}/hero-${w}-hover-${z}.png` });
  }
  await p.mouse.move(5, h - 5, { steps: 5 });
  await p.waitForTimeout(800);
  console.log('nach Verlassen:', await p.evaluate(() => document.querySelectorAll('.rail.is-on').length));
} else {
  await p.waitForTimeout(400);
  console.log('mobil aktiv:', await p.evaluate(() => [...document.querySelectorAll('.rail.is-on')].map((e) => e.dataset.spot).join(',')));
}
console.log(errors.length ? 'FEHLER:\n' + errors.join('\n') : 'Konsole sauber');
await b.close();
