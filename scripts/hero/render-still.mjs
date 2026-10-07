/**
 * Standbild der 3D-Pizza (Startansicht) für den ersten Seitenaufbau und als
 * Fallback ohne WebGL – mit demselben Renderer wie im Browser.
 *   node scripts/hero/render-still.mjs
 * → src/assets/hero/pizza-still.png (2100×1400, transparent)
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { browserPath } from '../qa/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = join(root, 'scripts/hero/.cache/still');
mkdirSync(tmp, { recursive: true });
await build({
  stdin: {
    contents: `
      import { createPizza3D } from './src/scripts/hero/gl3d.ts';
      import { E0 } from './src/scripts/hero/camera.ts';
      import meta from './src/assets/hero/pizza-top.json';
      window.renderStill = async (w, h, src) => {
        const img = new Image(); img.src = src; await img.decode();
        const r = createPizza3D(meta.profile, { maxDpr: 1, segments: 256, preserve: true });
        document.body.appendChild(r.canvas);
        r.resize(w, h); r.setTexture(img);
        r.draw({ yaw: 0, elev: E0, hot: [0.5, 0.5, 0], spec: 1 });
        return r.canvas.toDataURL('image/png');
      };`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  outfile: join(tmp, 'bundle.js'),
  logLevel: 'error',
});
const tex = `data:image/png;base64,${readFileSync(join(root, 'src/assets/hero/pizza-top.png')).toString('base64')}`;
writeFileSync(join(tmp, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"><script src="bundle.js"></script>');
const b = await chromium.launch({ executablePath: browserPath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 2100, height: 1400 } });
await p.goto('file://' + join(tmp, 'index.html'));
const url = await p.evaluate(([s]) => window.renderStill(2100, 1400, s), [tex]);
await b.close();
writeFileSync(join(root, 'src/assets/hero/pizza-still.png'), Buffer.from(url.split(',')[1], 'base64'));
rmSync(tmp, { recursive: true, force: true });
console.log('→ src/assets/hero/pizza-still.png');
