import { test } from 'node:test';
import assert from 'node:assert/strict';
import { site } from './load.ts';
import { getStatus, preorderSlots, closingSentence } from '../../src/lib/hours.ts';

const h = site.business.hours;
// Hilfsfunktion: Berliner Ortszeit → Date (Oktober 2026 = MESZ, UTC+2)
const berlin = (iso: string) => new Date(`${iso}:00+02:00`);

test('Freitag 00:30 gehört zur Donnerstag-Schicht (bis 01:00)', () => {
  const s = getStatus(h, berlin('2026-10-09T00:30')); // Fr 00:30, Do-Schicht bis 01:00
  assert.equal(s.open, true);
  assert.equal(s.closesAt, '01:00');
  assert.equal(s.accepting, true);
});

test('Annahmeschluss 15 Minuten vor Ladenschluss', () => {
  const s = getStatus(h, berlin('2026-10-09T00:50'));
  assert.equal(s.open, true);
  assert.equal(s.accepting, false);
});

test('Samstag 01:30 → Freitag-Schicht bis 02:00', () => {
  const s = getStatus(h, berlin('2026-10-10T01:30'));
  assert.equal(s.open, true);
  assert.equal(s.closesAt, '02:00');
});

test('Mittwoch ist Ruhetag', () => {
  const s = getStatus(h, berlin('2026-10-07T19:00'));
  assert.equal(s.open, false);
  assert.equal(s.opensDay, 'morgen');
  assert.equal(s.opensAt, '16:00');
});

test('Sonntag 14:00 bis 24:00', () => {
  assert.equal(getStatus(h, berlin('2026-10-11T13:59')).open, false);
  assert.equal(getStatus(h, berlin('2026-10-11T14:00')).open, true);
  assert.equal(getStatus(h, berlin('2026-10-11T23:59')).open, true);
  assert.equal(getStatus(h, berlin('2026-10-12T00:00')).open, false);
});

test('Wunschzeiten liegen in der Öffnungszeit', () => {
  const slots = preorderSlots(h, berlin('2026-10-08T12:00'), 15);
  assert.equal(slots[0].value, '2026-10-08T16:30');
  assert.equal(slots.at(-1)?.value, '2026-10-09T00:45');
});

test('Öffnungszeiten-Satz wird aus den Daten erzeugt', () => {
  assert.equal(
    closingSentence(h),
    'Freitag und Samstag bis 2 Uhr, Montag, Dienstag und Donnerstag bis 1 Uhr, Sonntag bis Mitternacht. Mittwoch ist Ruhetag.',
  );
});
