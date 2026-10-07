// Screenshot: node scripts/qa/shot.mjs <url> <out.png> [breite] [höhe] [full]
// Bei „full“ wird vorher durchgescrollt, damit Scroll-Reveals auslösen.
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';
const [, , url, out, w = '1280', h = '800', full = ''] = process.argv;
const b = await chromium.launch({ executablePath: browserPath() });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
if (full === 'full') {
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(+h * 0.7)) {
    await p.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await p.waitForTimeout(260);
  }
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(1400);
}
await p.screenshot({ path: out, fullPage: full === 'full' });
await b.close();
