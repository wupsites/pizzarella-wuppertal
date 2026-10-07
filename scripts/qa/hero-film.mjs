/**
 * Flüssiges Video der Hero-Interaktion, Bild für Bild mit gesteuerter Uhr
 * (rAF, Timer und performance.now laufen exakt 1/30 s pro Bild) –
 * unabhängig davon, wie schnell die Maschine rendert.
 *   node scripts/qa/hero-film.mjs <baseUrl> <breite> <höhe> <dpr> <ausgabe.mp4>
 */
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { browserPath } from './browser.mjs';

const [, , base = 'http://localhost:4321', W = '1440', H = '900', DPR = '1', out = 'qa-output/hero/hero.mp4'] = process.argv;
const w = Number(W), h = Number(H), dpr = Number(DPR);
const mobile = w < 1024;
const frames = out.replace(/\.mp4$/, '-frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const b = await chromium.launch({ executablePath: browserPath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
const p = await ctx.newPage();
await p.clock.install({ time: new Date('2026-10-09T19:30:00+02:00') });
await p.goto(base + '/', { waitUntil: 'networkidle' });
await p.clock.runFor(800);
await p.waitForTimeout(500);
await p.clock.runFor(800);

let n = 0;
const FPS = 30;
const snap = async () => {
  await p.clock.runFor(1000 / FPS);
  await p.screenshot({ path: `${frames}/f_${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 });
};
const hold = async (s) => {
  for (let i = 0; i < s * FPS; i++) await snap();
};
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const scroll = async (from, to, s) => {
  const N = Math.round(s * FPS);
  for (let i = 1; i <= N; i++) {
    const y = from + (to - from) * ease(i / N);
    await p.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await snap();
  }
};
let mx = w * 0.5, my = h * 0.92;
const glide = async (x, y, s) => {
  const N = Math.round(s * FPS);
  const x0 = mx, y0 = my;
  for (let i = 1; i <= N; i++) {
    const t = ease(i / N);
    mx = x0 + (x - x0) * t;
    my = y0 + (y - y0) * t;
    await p.mouse.move(mx, my);
    await snap();
  }
};

const dist = await p.evaluate(() => {
  const s = document.querySelector('.pin-spacer');
  return s ? s.offsetHeight - window.innerHeight : document.querySelector('[data-hero]').offsetHeight;
});

if (!mobile) {
  const box = await p.$eval('[data-hero-stage]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await p.mouse.move(mx, my);
  await hold(1);
  for (const [u, v] of [[0.3, 0.8], [0.3, 0.42], [0.74, 0.44], [0.55, 0.1]]) {
    await glide(box.x + box.w * u, box.y + box.h * v, 0.9);
    await hold(0.9);
  }
  await glide(w * 0.5, h * 0.96, 0.8);
  await hold(0.6);
  await scroll(0, dist, 6.5);
  await hold(1.4);
  await scroll(dist, 0, 4.5);
  await hold(1.4);
} else {
  await hold(4.2);
  await scroll(0, dist, 5);
  await hold(1.2);
  await scroll(dist, 0, 3.5);
  await hold(1);
}
await b.close();
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${frames}/f_%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out]);
console.log('→', out, n, 'Bilder');
