// Seite laden, Konsolenfehler ausgeben: node scripts/qa/console.mjs <url>
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';
const b = await chromium.launch({ executablePath: browserPath() });
const p = await b.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
console.log(errs.length ? errs.join('\n') : 'keine Konsolenfehler');
await b.close();
