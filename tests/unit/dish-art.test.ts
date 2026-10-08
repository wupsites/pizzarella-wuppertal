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

test('Ebenen-Bilder: jedes Gericht außer Pizza hat ein Bild, nur echte Gerichte', () => {
  const ids = new Set(site.catalog.products.keys());
  for (const [id] of entries) assert.ok(ids.has(id), `${id} gibt es nicht auf der Karte`);
  for (const p of site.catalog.products.values()) {
    if (p.categoryId === 'pizza') continue; // Pizzen: Ebenen aus den Extra-Zutaten
    if (p.categoryId === 'getraenke') continue; // Getränke: vorerst ohne Bild
    assert.ok(art[p.id], `${p.id} hat kein Bild`);
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
