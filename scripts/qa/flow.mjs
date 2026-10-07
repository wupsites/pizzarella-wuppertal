/**
 * End-to-End-Test des Bestellablaufs (Speisekarte → Warenkorb → Kasse → Bestätigung).
 *   ORDER_DEV_SINK=true npm run dev   (in einem zweiten Terminal)
 *   node scripts/qa/flow.mjs [baseUrl] [breite]
 */
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const width = Number(process.argv[3] ?? 1440);
const mobile = width < 1024;
const out = process.env.QA_OUT ?? 'qa-output';
const log = (...a) => console.log(mobile ? '[mobil]' : '[desktop]', ...a);
const fail = (m) => {
  console.error('✖', m);
  process.exitCode = 1;
};

const b = await chromium.launch({ executablePath: browserPath() });
const ctx = await b.newContext({ viewport: { width, height: mobile ? 844 : 900 }, hasTouch: mobile, isMobile: mobile });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

await p.goto(`${base}/speisekarte/`, { waitUntil: 'networkidle' });
const count = () => p.locator('[data-cart-count]').first().textContent();

// 1) Größe direkt antippen
await p.locator('#p-pizza-margherita .size-btn[data-variant="gross"]').click();
await p.waitForTimeout(300);
log('Margherita groß → Zähler', await count());
if ((await count()) !== '1') fail('Zähler nach Schnell-Hinzufügen ist nicht 1');

// 2) Pflichtauswahl über Sheet (Dönerteller: Beilage)
await p.locator('#p-doenerteller [data-open-product]').last().click();
await p.waitForSelector('#product-sheet[open]');
await p.locator('#product-sheet button[type="submit"]').click();
await p.waitForTimeout(200);
const err = await p.locator('#product-sheet .ps-error').textContent();
log('Fehler ohne Beilage:', err?.trim());
if (!err?.includes('Beilage')) fail('Pflichtauswahl wurde nicht verlangt');
await p.locator('#product-sheet label:has(input[name="opt-teller-beilage"][value="reis"])').click();
await p.locator('#product-sheet label:has(input[name="opt-doener-sauce"][value="knoblauch"])').click();
await p.locator('#product-sheet [data-ps-inc]').click();
await p.locator('#product-sheet button[type="submit"]').click();
await p.waitForTimeout(500);
log('nach Dönerteller ×2 → Zähler', await count());
if ((await count()) !== '3') fail('Dönerteller ×2 nicht korrekt im Warenkorb');

// 3) Extras auf Pizza (größenabhängiger Aufpreis)
await p.waitForSelector('#product-sheet:not([open])', { state: 'attached' });
await p.locator('#p-pizza-salami [data-open-product]').first().click();
await p.waitForSelector('#product-sheet[open]');
await p.locator('#product-sheet label:has(input[name="variant"][value="klein"])').click();
await p.locator('#product-sheet [data-group-wrap="pizza-zutaten"] summary').click();
await p.locator('#product-sheet label:has(input[value="mit-extra-kaese"])').click();
await p.waitForTimeout(100);
const priceText = await p.locator('[data-ps-total]').textContent();
log('Salami klein + extra Käse:', priceText);
if (!priceText?.includes('9,40')) fail(`Aufpreis falsch: ${priceText}`);
await p.locator('#product-sheet button[type="submit"]').click();
await p.waitForTimeout(400);

// 4) Getränk
await p.waitForSelector('#product-sheet:not([open])', { state: 'attached' });
await p.locator('#p-cola [data-open-product]').first().click();
await p.waitForSelector('#product-sheet[open]');
await p.locator('#product-sheet label:has(input[name="variant"][value="1-0l"])').click();
await p.locator('#product-sheet button[type="submit"]').click();
await p.waitForTimeout(400);
log('Warenkorb-Zähler', await count(), 'Summe', await p.locator('[data-cart-total]').first().textContent());

// 5) Suche
const search = p.locator('#menu-q');
await search.click();
await search.fill('falafel');
await p.waitForTimeout(300);
const visible = await p.locator('[data-dish]:not(.is-hidden)').count();
log('Suche „falafel“ → Treffer', visible);
if (visible < 5) fail('Suche liefert zu wenige Treffer');
await search.fill('xyzabc');
await p.waitForTimeout(300);
if (await p.locator('[data-search-empty]').isHidden()) fail('Leerer Suchzustand wird nicht gezeigt');
await search.fill('');

// 6) Warenkorb öffnen, Menge ändern
if (mobile) {
  await p.locator('.mobile-bar [data-cart-open]').click();
  await p.waitForSelector('#cart-sheet[open]');
  await p.locator('#cart-sheet .cart-line').first().locator('[data-act="inc"]').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/flow-cart-${width}.png` });
  await p.locator('#cart-sheet [data-close]').first().click();
} else {
  await p.locator('[data-cart-panel] .cart-line').first().locator('[data-act="inc"]').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/flow-cart-${width}.png` });
}
log('nach +1 → Zähler', await count());

// 7) Kasse
await p.goto(`${base}/kasse/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
await p.locator('[data-co-submit]').click();
await p.waitForTimeout(300);
const summaryErr = await p.locator('[data-co-errors]').textContent();
log('Validierung leer:', summaryErr?.slice(0, 80));
if (!summaryErr?.includes('Namen')) fail('Pflichtfelder werden nicht geprüft');
await p.fill('#co-name', 'Test Kundin');
await p.fill('#co-phone', '0202 123456');
await p.fill('#co-street', 'Friedrich-Engels-Allee');
await p.fill('#co-no', '1');
await p.fill('#co-zip', '42999');
await p.locator('[data-co-submit]').click();
await p.waitForTimeout(300);
if (!(await p.locator('[data-co-errors]').textContent())?.includes('liefern wir leider nicht')) fail('PLZ außerhalb wird nicht abgelehnt');
await p.fill('#co-zip', '42285');
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/flow-checkout-${width}.png`, fullPage: true });
await p.locator('[data-co-submit]').click();
await p.waitForSelector('[data-co-done]:not([hidden])', { timeout: 8000 }).catch(() => {});
const done = await p.locator('[data-co-done]').isVisible();
const nr = await p.locator('[data-done-nr]').textContent();
log('Bestellung abgeschickt:', done, 'Nr.', nr);
if (!done) fail(`Bestätigung nicht sichtbar: ${await p.locator('[data-co-errors]').textContent()}`);
await p.screenshot({ path: `${out}/flow-done-${width}.png` });
log('Zähler nach Bestellung', await count());

if (errors.length) fail(`Konsolenfehler: ${errors.join(' | ')}`);
await b.close();
console.log(process.exitCode ? '✖ Ablauf mit Fehlern' : '✔ Bestellablauf ok');
