import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { site } from './load.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const art = JSON.parse(readFileSync(`${root}src/data/dish-art.json`, 'utf8')) as Record<string, unknown>;
type Layers = [string, string][];
const entries = Object.entries(art as Record<string, unknown>)
  .filter(([k]) => !k.startsWith('$'))
  .map(([k, v]) => [k, Array.isArray(v) ? v : (v as { layers: Layers }).layers]) as [string, Layers][];

test('Ebenen-Bilder: nur echte Gerichte, keine Pizza', () => {
  for (const [id] of entries) {
    const p = site.catalog.products.get(id);
    assert.ok(p, `${id} gibt es nicht auf der Karte`);
    assert.notEqual(p.categoryId, 'pizza', `${id}: Pizzen bekommen ihr Bild aus den Pizza-Ebenen`);
  }
});

test('Ebenen-Bilder: Dateien vorhanden, 2–6 Ebenen, mindestens eine Beschriftung', () => {
  for (const [id, layers] of entries) {
    assert.ok(layers.length >= 2 && layers.length <= 6, `${id}: ${layers.length} Ebenen`);
    assert.ok(layers.some(([, label]) => label.trim()), `${id}: keine Beschriftung`);
    for (const [file] of layers) {
      const path = file.startsWith('/') ? `${root}public${file}` : `${root}public/dishes/${file}.webp`;
      assert.ok(existsSync(path), `${id}: ${file} fehlt`);
    }
  }
});
