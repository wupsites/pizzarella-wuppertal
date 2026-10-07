/**
 * Rastert src/assets/hero-pizza.svg zu src/assets/hero-pizza.webp (1600 px, transparent).
 * Astro erzeugt daraus beim Build responsive AVIF/WebP-Varianten.
 *   node scripts/gen-pizza.mjs && node scripts/render-pizza.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { browserPath } from './qa/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'src/assets/hero-pizza.svg'), 'utf8');
const SIZE = 1600;
const browser = await chromium.launch({ executablePath: browserPath() });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}<style>svg{width:${SIZE}px;height:${SIZE}px;display:block}</style></body></html>`);
await page.screenshot({ path: join(root, 'src/assets/.hero-pizza.png'), omitBackground: true });
await (await import('sharp')).default(join(root, 'src/assets/.hero-pizza.png')).webp({ quality: 92, alphaQuality: 100 }).toFile(join(root, 'src/assets/hero-pizza.webp'));
(await import('node:fs')).unlinkSync(join(root, 'src/assets/.hero-pizza.png'));
await browser.close();
console.log('hero-pizza.png gerendert');
