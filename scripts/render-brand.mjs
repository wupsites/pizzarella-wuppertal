/**
 * Erzeugt Favicon-PNGs, App-Icons und das OpenGraph-Bild aus HTML-Vorlagen.
 *   node scripts/render-brand.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { browserPath } from './qa/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const font = (f) => `data:font/woff2;base64,${readFileSync(join(pub, 'fonts', f)).toString('base64')}`;
const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8');
const pizza = `data:image/webp;base64,${readFileSync(join(root, 'src/assets/hero-pizza.webp')).toString('base64')}`;

const b = await chromium.launch({ executablePath: browserPath() });
const page = await b.newPage();

async function render(html, w, h, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const buf = await page.screenshot({ omitBackground: transparent, type: 'png' });
  return buf;
}

// Icons
const iconHtml = (pad) => `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="width:100%;height:100%;display:block;${pad ? `padding:${pad}%;box-sizing:border-box;background:#16110e` : ''}" `)}</body></html>`;
for (const [size, name, pad] of [
  [180, 'apple-touch-icon.png', 0],
  [192, 'icon-192.png', 0],
  [512, 'icon-512.png', 0],
  [512, 'icon-maskable-512.png', 10],
]) {
  const buf = await render(iconHtml(pad), size, size, true);
  writeFileSync(join(pub, name), await sharp(buf).png({ compressionLevel: 9 }).toBuffer());
}

// favicon.ico (PNG in ICO-Container, 32×32)
const png32 = await sharp(await render(iconHtml(0), 32, 32, true)).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0);
entry.writeUInt8(32, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png32.length, 8);
entry.writeUInt32LE(22, 12);
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([header, entry, png32]));

// OpenGraph 1200×630
const og = `<html><head><style>
@font-face{font-family:F;src:url(${font('fraunces-display.woff2')});font-weight:600 900}
@font-face{font-family:FI;src:url(${font('fraunces-display-italic.woff2')});font-weight:600 800;font-style:italic}
@font-face{font-family:I;src:url(${font('instrument-sans.woff2')});font-weight:400 700}
@font-face{font-family:C;src:url(${font('instrument-sans-condensed.woff2')});font-weight:600}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#16110e;color:#f4ebdc;font-family:I;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(45% 70% at 92% 50%,rgba(255,122,61,.35),transparent 70%)}
.pz{position:absolute;right:-250px;top:50%;width:820px;height:820px;transform:translateY(-50%) rotate(12deg)}
.t{position:absolute;left:72px;top:78px;width:620px}
.logo{display:flex;align-items:center;gap:10px;font-family:F;font-weight:900;font-size:44px;letter-spacing:-.03em;font-variation-settings:'SOFT' 100}
.logo svg{width:58px;height:58px}
h1{margin:44px 0 0;font-family:F;font-weight:900;font-variation-settings:'SOFT' 100;font-size:100px;line-height:.9;letter-spacing:-.04em}
h1 em{font-family:FI;font-style:italic;font-weight:800;color:#f2b53a}
p{margin:28px 0 0;font-size:28px;line-height:1.35;color:#c9b9a6}
.l{margin-top:34px;font-family:C;font-weight:600;font-size:20px;letter-spacing:.1em;text-transform:uppercase;color:#f2b53a}
</style></head><body><div class="glow"></div><img class="pz" src="${pizza}">
<div class="t"><div class="logo">${svg.replace('<svg ', '<svg style="width:58px;height:58px" ').replace('<rect width="64" height="64" rx="14" fill="#16110e"/>', '')}<span>Pizzarella</span></div>
<h1>Die Küche<br>bleibt <em>an.</em></h1>
<p>Pizza, Döner, Lahmacun &amp; Pasta aus der Friedrich-Engels-Allee 117.</p>
<div class="l">Wuppertal · Lieferung &amp; Abholung · Fr &amp; Sa bis 2 Uhr</div></div></body></html>`;
const ogBuf = await render(og, 1200, 630);
writeFileSync(join(pub, 'og.jpg'), await sharp(ogBuf).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
await b.close();
console.log('Favicons, App-Icons und og.jpg erzeugt');
