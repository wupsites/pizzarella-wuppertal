import { test } from 'node:test';
import assert from 'node:assert/strict';
import { site } from './load.ts';
import { builderModel, BASE_PRODUCT, TOPPING_GROUP } from '../../src/lib/pizza-builder.ts';
import { priceLine } from '../../src/lib/pricing.ts';
import { choicePrice } from '../../src/lib/catalog.ts';

const m = builderModel(site.catalog);

test('Konfigurator: Grundlage und alle echten Extra-Zutaten', () => {
  assert.ok(m);
  assert.equal(m.product.id, BASE_PRODUCT);
  const shown = m.sections.flatMap((s) => s.parts.flatMap((p) => p.items.map((c) => c.id)));
  const all = m.group.choices.map((c) => c.id);
  assert.deepEqual([...shown].sort(), [...all].sort(), 'jede Zutat genau einmal');
  assert.equal(new Set(shown).size, shown.length);
});

test('Konfigurator: Preis = Margherita + Aufpreise je Größe (wie der Server rechnet)', () => {
  assert.ok(m);
  const ids = ['mit-rindersalami', 'mit-champignons-frisch', 'mit-extra-kaese'];
  const choices = m.group.choices;
  for (const v of m.sizes) {
    const extra = ids.map((id) => choicePrice(choices.find((c) => c.id === id)!, v.id) ?? 0);
    const expected: number = v.price + extra.reduce((n, x) => n + x, 0);
    const line = priceLine((id) => site.catalog.products.get(id), { productId: BASE_PRODUCT, variantId: v.id, options: { [TOPPING_GROUP]: ids }, qty: 1 });
    assert.equal(line.unit, expected);
  }
});

test('Konfigurator: fertige Pizzen der Karte werden erkannt (fairer Hinweis)', () => {
  assert.ok(m);
  const byName = new Map(m.classics.map((c) => [c.id, c.choices]));
  assert.deepEqual(byName.get('pizza-salami'), ['mit-rindersalami']);
  assert.deepEqual(byName.get('pizza-hawaii'), ['mit-ananas', 'mit-putenschinken']);
  assert.ok(!m.classics.some((c) => /calzone/i.test(c.name)), 'Calzone nicht vergleichen');
});
