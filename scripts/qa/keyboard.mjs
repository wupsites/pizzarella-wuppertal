// Tastatur- und Reduced-Motion-Prüfung: node scripts/qa/keyboard.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';
const base = process.argv[2] ?? 'http://localhost:4321';
const b = await chromium.launch({ executablePath: browserPath() });
const ok = (c, m) => { console.log(c ? '✔' : '✖', m); if (!c) process.exitCode = 1; };

// --- Tastatur ---
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(base + '/speisekarte/', { waitUntil: 'networkidle' });
await p.keyboard.press('Tab');
ok(await p.evaluate(() => document.activeElement?.classList.contains('skip-link')), 'Erster Tab = „Zum Inhalt springen“');
await p.waitForTimeout(450);
const skipVisible = await p.evaluate(() => document.activeElement.getBoundingClientRect().top >= 0);
ok(skipVisible, 'Skip-Link wird beim Fokus sichtbar');
await p.keyboard.press('Enter');
ok(await p.evaluate(() => document.activeElement?.id === 'main'), 'Skip-Link setzt Fokus auf Hauptinhalt');
// Fokus-Stil vorhanden
await p.focus('#p-pizza-margherita .size-btn[data-variant="klein"]');
const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
ok(outline !== 'none', `Sichtbarer Fokusrahmen (${outline})`);
await p.keyboard.press('Enter');
await p.waitForTimeout(300);
ok((await p.locator('[data-cart-count]').first().textContent()) === '1', 'Enter auf Größen-Knopf legt in den Warenkorb');
await p.focus('#p-pizza-funghi .dish-name button');
await p.keyboard.press('Enter');
await p.waitForTimeout(500);
ok(await p.evaluate(() => document.querySelector('#product-sheet')?.contains(document.activeElement)), 'Produkt-Sheet öffnet mit Fokus im Dialog');
for (let i = 0; i < 40; i++) await p.keyboard.press('Tab');
ok(await p.evaluate(() => document.querySelector('#product-sheet')?.contains(document.activeElement)), 'Fokus bleibt im Dialog gefangen');
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
ok(await p.evaluate(() => !document.querySelector('#product-sheet').open), 'Escape schließt Dialog');
ok(await p.evaluate(() => document.activeElement?.closest('#p-pizza-funghi') !== null), 'Fokus kehrt zum Auslöser zurück');
// Warenkorb per Tastatur bedienen
await p.focus('[data-cart-panel] [data-act="inc"]');
await p.keyboard.press('Enter');
await p.waitForTimeout(300);
ok((await p.locator('[data-cart-count]').first().textContent()) === '2', 'Menge per Tastatur erhöht');
ok(await p.evaluate(() => document.activeElement?.dataset?.act === 'inc'), 'Fokus bleibt nach Neu-Rendern auf dem Knopf');
const live = await p.locator('#sr-live').textContent();
ok(Boolean(live && live.length), `Screenreader-Ansage: „${live}“`);

// --- Reduced Motion ---
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const r = await ctx.newPage();
await r.goto(base + '/', { waitUntil: 'networkidle' });
const anim = await r.evaluate(() => getComputedStyle(document.querySelector('[data-hero-stage]')).animationName);
ok(anim === 'none', `Keine Pizza-Animation bei reduzierter Bewegung (${anim})`);
const rot0 = await r.evaluate(() => document.querySelector('[data-hero-object]').style.transform);
const hidden = await r.evaluate(() => [...document.querySelectorAll('.reveal')].filter((e) => getComputedStyle(e).opacity === '0').length);
ok(hidden === 0, `Alle Inhalte sofort sichtbar (${hidden} versteckt)`);
await r.evaluate(() => window.scrollTo(0, 600));
await r.waitForTimeout(200);
const rot = await r.evaluate(() => document.querySelector('[data-hero-object]').style.transform);
ok(rot === rot0, 'Keine scroll-gekoppelte Drehung');
await b.close();
