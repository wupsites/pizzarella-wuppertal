// Screenshots interaktiver Zustände: node scripts/qa/states.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';
const base = process.argv[2] ?? 'http://localhost:4321';
const out = 'qa-output/states';
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: browserPath() });
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const mobile = w < 1024;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(base + '/speisekarte/', { waitUntil: 'networkidle' });
  // Produkt-Sheet Pizza mit Extras
  await p.locator('#p-pizza-vulcano [data-open-product]').first().click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/sheet-pizza-${w}.png` });
  await p.locator('#product-sheet [data-group-wrap="pizza-zutaten"] summary').click();
  await p.waitForTimeout(300);
  await p.locator('#product-sheet .sheet-body').evaluate((el) => el.scrollTo(0, 420));
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/sheet-pizza-extras-${w}.png` });
  await p.locator('#product-sheet button[type="submit"]').click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/toast-${w}.png` });
  // Salat mit Pflicht-Dressing
  await p.waitForTimeout(300);
  await p.locator('#p-insalata-tonno [data-open-product]').last().click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/sheet-salat-${w}.png` });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  // Döner schnell hinzufügen
  await p.locator('#p-doenertasche .add').click();
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/added-${w}.png` });
  // Warenkorb
  if (mobile) {
    await p.locator('.mobile-bar [data-cart-open]').click();
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/cart-${w}.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
  } else {
    await p.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/cart-${w}.png` });
  }
  // Leere Suche
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await p.locator('#menu-q').click();
  await p.locator('#menu-q').fill('sushi');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/search-empty-${w}.png` });
  // Mobilmenü
  if (mobile) {
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.locator('[data-menu-open]').click();
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/menu-${w}.png` });
  }
  await ctx.close();
}
await b.close();
console.log('fertig');
