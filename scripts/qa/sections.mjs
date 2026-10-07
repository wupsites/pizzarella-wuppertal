/**
 * Regression unterhalb des Heros: jede Section der Startseite (außer dem Hero)
 * und der Footer werden einzeln fotografiert.
 *   node scripts/qa/sections.mjs <baseUrl> <ausgabeordner>
 * Vergleich: python3 scripts/qa/compare.py <vorher> <nachher>
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const out = process.argv[3] ?? 'qa-output/sections';
mkdirSync(out, { recursive: true });
const widths = [360, 390, 768, 1280, 1440, 1920];
const b = await chromium.launch({ executablePath: browserPath() });
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  // feste Uhrzeit, damit Öffnungsstatus und Zeitleiste vergleichbar sind
  await p.clock.setFixedTime(new Date('2026-10-09T19:30:00+02:00'));
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);
  const sections = await p.$$('main section:not([data-hero]), footer.site-footer');
  let i = 0;
  for (const s of sections) {
    i++;
    await s.screenshot({ path: `${out}/home-${w}-${String(i).padStart(2, '0')}.png`, animations: 'disabled' });
  }
  await ctx.close();
}
await b.close();
console.log('fertig', out);
