/**
 * Hero-QA: Screenshots an mehreren Scroll-Positionen (je Wortpaar),
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
// keine eingefrorene Uhr: GSAP und der Shader laufen über die echte Zeit
await p.goto(base + '/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
const glOn = await p.evaluate(() => document.querySelector('[data-hero-object]')?.classList.contains('gl-on'));
const pinLen = await p.evaluate(() => {
  const s = document.querySelector('.pin-spacer');
  return s ? s.offsetHeight - window.innerHeight : document.querySelector('[data-hero]').offsetHeight;
});
console.log(`${w}x${h} gl:${glOn} scrollstrecke:${pinLen}`);
// sichtbares Wortpaar: Satz, dessen Wörter gerade deckend sind
const words = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-set]')]
      .filter((e) => Number(getComputedStyle(e).opacity) > 0.9)
      .map((e) => e.textContent.trim())
      .join(' / '),
  );
const stops = mobile ? [0, 0.5, 1] : [0, 0.27, 0.49, 0.7, 0.9, 1];
for (const s of stops) {
  await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(pinLen * s));
  await p.waitForTimeout(2200);
  console.log(`  ${Math.round(s * 100)}%: ${await words()}`);
  await p.screenshot({ path: `${out}/hero-${w}-s${Math.round(s * 100)}.png` });
}
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await p.waitForTimeout(2200);
console.log('  zurück oben:', await words());
if (mobile) {
  // Handy: die Wortpaare wechseln von selbst
  await p.waitForTimeout(3800);
  console.log('  nach 3,8 s:', await words());
  await p.screenshot({ path: `${out}/hero-${w}-auto.png` });
}
console.log(errors.length ? 'FEHLER:\n' + errors.join('\n') : 'Konsole sauber');
await b.close();
