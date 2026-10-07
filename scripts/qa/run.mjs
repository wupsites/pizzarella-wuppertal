/**
 * QA-Lauf über alle Seiten und Breiten:
 *  - horizontaler Überlauf, Konsolen-/Seitenfehler
 *  - axe-core Barrierefreiheit (WCAG 2.2 AA)
 *  - Screenshots (ganze Seite) in qa-output/
 *   node scripts/qa/run.mjs [baseUrl]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { browserPath } from './browser.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const out = 'qa-output/screens';
mkdirSync(out, { recursive: true });
const pages = ['/', '/speisekarte/', '/kasse/', '/lieferung-abholung/', '/kontakt/', '/allergene/', '/bestellinfos/', '/impressum/', '/datenschutz/', '/gibt-es-nicht/'];
const widths = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1728, 1920];
const shotWidths = new Set([360, 390, 768, 1024, 1440, 1920]);
const report = { overflow: [], errors: [], axe: [] };

const browser = await chromium.launch({ executablePath: browserPath() });
for (const w of widths) {
  const mobile = w < 1024;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 800 : 900 }, isMobile: mobile && w < 768, hasTouch: mobile });
  // Warenkorb mit Inhalt simulieren (für Kasse/Drawer)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('pizzarella.cart.v1', JSON.stringify({ lines: [{ productId: 'pizza-margherita', variantId: 'gross', qty: 2, options: {} }, { productId: 'doenertasche', variantId: 'std', qty: 1, options: {} }], mode: 'delivery', zip: '' }));
    } catch {}
  });
  const page = await ctx.newPage();
  for (const path of pages) {
    const errs = [];
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    // durchscrollen (Reveals auslösen)
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 600) {
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
      await page.waitForTimeout(60);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth;
      if (sw <= window.innerWidth + 1) return null;
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`);
      return { sw, offenders };
    });
    if (overflow) report.overflow.push({ w, path, ...overflow });
    if (errs.length) report.errors.push({ w, path, errs });
    if (shotWidths.has(w)) {
      const name = `${path.replace(/\//g, '_') || 'home'}-${w}.png`.replace(/^_/, '');
      await page.screenshot({ path: `${out}/${name === '-' + w + '.png' ? 'home' + name : name}`, fullPage: true });
    }
    if (w === 390 || w === 1440) {
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of res.violations) report.axe.push({ w, path, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) });
    }
  }
  await ctx.close();
  process.stdout.write(`✓ ${w}px  `);
}
await browser.close();
writeFileSync('qa-output/report.json', JSON.stringify(report, null, 1));
console.log('\n\nÜberlauf:', report.overflow.length, ' Fehler:', report.errors.length, ' axe:', report.axe.length);
for (const o of report.overflow) console.log('  OVERFLOW', o.w, o.path, o.sw, o.offenders.join(', '));
for (const e of report.errors) console.log('  ERROR', e.w, e.path, e.errs.join(' | '));
const seen = new Set();
for (const a of report.axe) {
  const k = `${a.path}|${a.id}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  AXE ${a.w} ${a.path} [${a.impact}] ${a.id}: ${a.help} → ${a.nodes.join(' ; ')}`);
}
