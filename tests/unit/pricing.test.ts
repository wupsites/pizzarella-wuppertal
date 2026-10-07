import { test } from 'node:test';
import assert from 'node:assert/strict';
import { site } from './load.ts';
import { computeTotals, findZone, priceLine, PricingError } from '../../src/lib/pricing.ts';

const lookup = (id: string) => site.catalog.products.get(id);

test('Pizza: Größe und größenabhängiger Extra-Aufpreis', () => {
  const klein = priceLine(lookup, { productId: 'pizza-salami', variantId: 'klein', options: { 'pizza-zutaten': ['mit-extra-kaese'] }, qty: 1 });
  assert.equal(klein.unit, 790 + 150);
  const gross = priceLine(lookup, { productId: 'pizza-salami', variantId: 'gross', options: { 'pizza-zutaten': ['mit-extra-kaese'] }, qty: 2 });
  assert.equal(gross.unit, 990 + 200);
  assert.equal(gross.total, 2 * 1190);
});

test('Pflichtauswahl und Pflicht-Anmerkung werden erzwungen', () => {
  assert.throws(() => priceLine(lookup, { productId: 'doenerteller', variantId: 'std', qty: 1 }), PricingError);
  assert.doesNotThrow(() => priceLine(lookup, { productId: 'doenerteller', variantId: 'std', options: { 'teller-beilage': ['reis'] }, qty: 1 }));
  assert.throws(() => priceLine(lookup, { productId: 'party-pizza-nach-wahl', variantId: '60x40', qty: 1 }), PricingError);
  assert.doesNotThrow(() => priceLine(lookup, { productId: 'party-pizza-nach-wahl', variantId: '60x40', qty: 1, note: 'Salami' }));
});

test('Ungültige Eingaben werden abgelehnt', () => {
  assert.throws(() => priceLine(lookup, { productId: 'gibt-es-nicht', variantId: 'std', qty: 1 }), PricingError);
  assert.throws(() => priceLine(lookup, { productId: 'pizza-margherita', variantId: 'riesig', qty: 1 }), PricingError);
  assert.throws(() => priceLine(lookup, { productId: 'pizza-margherita', variantId: 'klein', qty: 0 }), PricingError);
  assert.throws(() => priceLine(lookup, { productId: 'pizza-margherita', variantId: 'klein', qty: 51 }), PricingError);
  assert.throws(() => priceLine(lookup, { productId: 'pizza-margherita', variantId: 'klein', qty: 1, options: { 'teller-beilage': ['reis'] } }), PricingError);
  assert.throws(() => priceLine(lookup, { productId: 'insalata-mista', variantId: 'std', qty: 1, options: { 'salat-dressing': ['honig-senf', 'balsamico'] } }), PricingError);
});

test('Mindestbestellwert ohne Getränke, keine Liefergebühr', () => {
  const zone = findZone(site.zones, '42285');
  assert.ok(zone);
  const lines = [
    priceLine(lookup, { productId: 'pizza-margherita', variantId: 'klein', qty: 1 }),
    priceLine(lookup, { productId: 'cola', variantId: '1-0l', qty: 1 }),
  ];
  const t = computeTotals(lines, 'delivery', zone, site.ordering.minOrderExcludeCategories);
  assert.equal(t.subtotal, 690 + 350);
  assert.equal(t.minOrderBase, 690);
  assert.equal(t.missingForMin, 1000 - 690);
  assert.equal(t.deliveryFee, 0);
  assert.equal(t.deposit, 15);
  assert.equal(t.total, 1040);
  const pickup = computeTotals(lines, 'pickup', null, site.ordering.minOrderExcludeCategories);
  assert.equal(pickup.missingForMin, 0);
});

test('PLZ außerhalb des Liefergebiets', () => {
  assert.equal(findZone(site.zones, '42999'), null);
  assert.equal(findZone(site.zones, '10115'), null);
});
