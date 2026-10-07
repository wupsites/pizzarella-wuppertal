// Video-Rundgang: node scripts/qa/video.mjs <baseUrl> <outDir> [breite] [höhe]
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';
const [, , base = 'http://localhost:4321', outDir = 'qa-output/video', w = '1280', h = '800'] = process.argv;
const W = +w, H = +h, mobile = W < 1024;
const b = await chromium.launch({ executablePath: browserPath() });
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, recordVideo: { dir: outDir, size: { width: W, height: H } } });
const p = await ctx.newPage();
const slow = (ms) => p.waitForTimeout(ms);
const scrollTo = async (y, steps = 25) => {
  const start = await p.evaluate(() => scrollY);
  for (let i = 1; i <= steps; i++) { await p.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), start + ((y - start) * i) / steps); await slow(28); }
};
await p.goto(base + '/', { waitUntil: 'networkidle' });
await slow(2200);
if (!mobile) { // Pizza-Stücke
  const box = await p.locator('[data-hero-pizza]').boundingBox();
  if (box) for (const [dx, dy] of [[0.3, 0.2], [0.15, 0.45], [0.3, 0.75]]) { await p.mouse.move(box.x + box.width * dx, box.y + box.height * dy, { steps: 12 }); await slow(900); }
}
const total = await p.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total - H; y += H * 0.8) { await scrollTo(y + H * 0.8); await slow(900); }
await slow(600);
await p.goto(base + '/speisekarte/', { waitUntil: 'networkidle' });
await slow(1200);
await p.locator('#p-pizza-margherita .size-btn[data-variant="gross"]').click(); await slow(1400);
await p.locator('#p-pizza-salami [data-open-product]').first().click(); await slow(1200);
await p.locator('#product-sheet label:has(input[name="variant"][value="gross"])').click(); await slow(700);
await p.locator('#product-sheet [data-group-wrap="pizza-zutaten"] summary').click(); await slow(700);
await p.locator('#product-sheet label:has(input[value="mit-extra-kaese"])').click(); await slow(900);
await p.locator('#product-sheet button[type="submit"]').click(); await slow(1400);
await p.locator('[data-cat-link="doener"]').click(); await slow(1500);
await p.locator('#p-doenertasche .add').click(); await slow(1400);
await p.locator('#menu-q').click(); await p.locator('#menu-q').pressSequentially('falafel', { delay: 90 }); await slow(1500);
await p.locator('#menu-q').fill(''); await slow(500);
if (mobile) { await p.locator('.mobile-bar [data-cart-open]').click(); await slow(2200); await p.locator('#cart-sheet a[href="/kasse/"]').click(); }
else { await scrollTo(0, 10); await slow(1500); await p.goto(base + '/kasse/'); }
await p.waitForLoadState('networkidle'); await slow(1200);
await p.fill('#co-name', 'Max Muster'); await p.fill('#co-phone', '0202 123456');
await p.fill('#co-street', 'Friedrich-Engels-Allee'); await p.fill('#co-no', '50'); await p.locator('#co-zip').pressSequentially('42285', { delay: 80 }); await slow(800);
await p.locator('[data-co-submit]').scrollIntoViewIfNeeded(); await slow(800);
await p.locator('[data-co-submit]').click(); await slow(3000);
await ctx.close(); await b.close();
console.log('Video gespeichert in', outDir);
