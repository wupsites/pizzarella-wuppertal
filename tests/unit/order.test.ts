import { test } from 'node:test';
import assert from 'node:assert/strict';
import { site } from './load.ts';
import { OrderError, orderRequestSchema, orderText, prepareOrder } from '../../src/lib/server/order.ts';

const berlin = (iso: string) => new Date(`${iso}:00+02:00`);
const base = {
  mode: 'delivery',
  items: [{ productId: 'pizza-margherita', variantId: 'gross', qty: 2 }],
  customer: { name: 'Test Kundin', phone: '0202 123456', email: '' },
  address: { street: 'Friedrich-Engels-Allee', houseNumber: '1', zip: '42285', city: 'Wuppertal' },
  time: 'asap',
  payment: 'bar',
  elapsed: 5000,
};

test('Gültige Lieferbestellung während der Öffnungszeit', () => {
  const req = orderRequestSchema.parse(base);
  const o = prepareOrder(site, req, berlin('2026-10-09T19:00'));
  assert.equal(o.totals.total, 1580);
  assert.match(o.number, /^\d{4}-\d{3}$/);
  assert.match(orderText(o, 'Pizzarella'), /2× Pizza Margherita/);
});

test('Geschlossen → Fehler, Wunschzeit → ok', () => {
  const req = orderRequestSchema.parse(base);
  assert.throws(() => prepareOrder(site, req, berlin('2026-10-07T19:00')), (e: unknown) => e instanceof OrderError && e.code === 'CLOSED');
  const pre = orderRequestSchema.parse({ ...base, time: '2026-10-08T18:00' });
  assert.equal(prepareOrder(site, pre, berlin('2026-10-07T19:00')).timeLabel, 'morgen 18:00 Uhr');
});

test('Mindestbestellwert & Liefergebiet werden serverseitig geprüft', () => {
  const small = orderRequestSchema.parse({ ...base, items: [{ productId: 'cola', variantId: '1-0l', qty: 3 }] });
  assert.throws(() => prepareOrder(site, small, berlin('2026-10-09T19:00')), (e: unknown) => e instanceof OrderError && e.code === 'MIN_ORDER');
  const far = orderRequestSchema.parse({ ...base, address: { ...base.address, zip: '40210' } });
  assert.throws(() => prepareOrder(site, far, berlin('2026-10-09T19:00')), (e: unknown) => e instanceof OrderError && e.code === 'ZONE');
  const pickup = orderRequestSchema.parse({ ...small, mode: 'pickup', address: undefined });
  assert.doesNotThrow(() => prepareOrder(site, pickup, berlin('2026-10-09T19:00')));
});

test('Manipulierte Preise aus dem Browser werden ignoriert', () => {
  const req = orderRequestSchema.parse({ ...base, clientTotal: 1 });
  const o = prepareOrder(site, req, berlin('2026-10-09T19:00'));
  assert.equal(o.totals.total, 1580);
  assert.equal(o.priceChanged, true);
});

test('Honeypot und Bot-Tempo', () => {
  assert.equal(orderRequestSchema.safeParse({ ...base, website: 'spam' }).success, false);
  const fast = orderRequestSchema.parse({ ...base, elapsed: 200 });
  assert.throws(() => prepareOrder(site, fast, berlin('2026-10-09T19:00')), (e: unknown) => e instanceof OrderError && e.code === 'TOO_FAST');
});

test('Nicht verfügbare Produkte lehnt der Server ab', () => {
  const p = site.catalog.products.get('pizza-margherita')!;
  p.available = false;
  try {
    const req = orderRequestSchema.parse(base);
    assert.throws(
      () => prepareOrder(site, req, berlin('2026-10-09T19:00')),
      (e: unknown) => e instanceof OrderError && e.code === 'ITEM' && /nicht verfügbar/.test(e.message),
    );
  } finally {
    p.available = true;
  }
});
