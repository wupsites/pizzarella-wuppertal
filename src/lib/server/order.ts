/**
 * Bestellungen prüfen und für die Küche aufbereiten (nur Server).
 * Preise, Öffnungszeiten, Liefergebiet und Mindestbestellwert werden hier
 * unabhängig vom Browser neu berechnet.
 */
import { z } from 'zod';
import type { SiteData } from '../../data/load.ts';
import { computeTotals, findZone, formatEuro, formatPrice, priceLine, PricingError, type PricedLine, type Totals, type Zone } from '../pricing.ts';
import { getStatus, preorderSlots } from '../hours.ts';

export const orderRequestSchema = z.object({
  mode: z.enum(['delivery', 'pickup']),
  items: z
    .array(
      z.object({
        productId: z.string().max(80),
        variantId: z.string().max(40),
        options: z.record(z.string().max(40), z.array(z.string().max(60)).max(40)).optional(),
        qty: z.number().int().min(1).max(50),
        note: z.string().max(140).optional(),
      }),
    )
    .min(1, 'Der Warenkorb ist leer.')
    .max(60),
  customer: z.object({
    name: z.string().trim().min(2, 'Bitte gib deinen Namen an.').max(80),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+0-9][0-9 /()-]{5,}$/, 'Bitte gib eine gültige Telefonnummer an.'),
    email: z.union([z.literal(''), z.string().trim().pipe(z.email('Die E-Mail-Adresse sieht nicht richtig aus.').max(120))]).optional(),
  }),
  address: z
    .object({
      street: z.string().trim().min(2, 'Bitte gib die Straße an.').max(80),
      houseNumber: z.string().trim().min(1, 'Bitte gib die Hausnummer an.').max(12),
      zip: z.string().trim().regex(/^\d{5}$/, 'Bitte gib eine fünfstellige PLZ an.'),
      city: z.string().trim().min(2).max(60),
      hint: z.string().trim().max(160).optional(),
    })
    .optional(),
  time: z.string().max(20).default('asap'),
  payment: z.string().max(30),
  note: z.string().trim().max(400).optional(),
  /** Honeypot – muss leer bleiben */
  website: z.string().max(0).optional(),
  /** Millisekunden zwischen Formularanzeige und Absenden */
  elapsed: z.number().int().min(0).optional(),
  clientTotal: z.number().int().optional(),
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;

export class OrderError extends Error {
  code: string;
  status: number;
  field?: string;
  constructor(code: string, message: string, status = 422, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export interface PreparedOrder {
  number: string;
  createdAt: string;
  createdAtLocal: string;
  mode: 'delivery' | 'pickup';
  timeLabel: string;
  lines: PricedLine[];
  totals: Totals;
  zone: Zone | null;
  customer: { name: string; phone: string; email?: string };
  address?: OrderRequest['address'];
  payment: string;
  note?: string;
  priceChanged: boolean;
}

function orderNumber(now: Date): string {
  const d = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' }).format(now).replace('.', '').replace('.', '');
  const rnd = Math.floor(100 + Math.random() * 900);
  return `${d}-${rnd}`;
}

export function prepareOrder(site: SiteData, req: OrderRequest, now = new Date()): PreparedOrder {
  const { catalog, ordering, business, zones } = site;
  if (!ordering.online) throw new OrderError('OFFLINE', 'Online-Bestellungen sind gerade deaktiviert.', 503);
  if (req.website) throw new OrderError('SPAM', 'Bestellung konnte nicht verarbeitet werden.', 400);
  if (req.elapsed !== undefined && req.elapsed < 1200) throw new OrderError('TOO_FAST', 'Bitte prüfe deine Angaben und sende erneut.', 400);
  if (!ordering.modes[req.mode].enabled) throw new OrderError('MODE', 'Diese Bestellart ist gerade nicht verfügbar.', 422, 'mode');

  // Zeit
  const status = getStatus(business.hours, now);
  let timeLabel = 'so schnell wie möglich';
  if (req.time === 'asap') {
    if (!status.accepting) {
      throw new OrderError(
        'CLOSED',
        status.opensAt ? `Gerade nehmen wir keine Bestellungen an. Wir öffnen ${status.opensDay} um ${status.opensAt} Uhr.` : 'Gerade nehmen wir keine Bestellungen an.',
        409,
        'time',
      );
    }
  } else {
    if (!ordering.allowPreorder) throw new OrderError('NO_PREORDER', 'Vorbestellungen sind gerade nicht möglich.', 422, 'time');
    const slot = preorderSlots(business.hours, now, ordering.preorderSlotMinutes).find((s) => s.value === req.time);
    if (!slot) throw new OrderError('SLOT', 'Diese Uhrzeit ist nicht mehr verfügbar. Bitte wähle eine andere.', 422, 'time');
    timeLabel = slot.label;
  }

  // Positionen
  const lookup = (id: string) => {
    const p = catalog.products.get(id);
    if (p && !p.available) throw new PricingError(`${p.name} ist gerade nicht verfügbar`);
    return p;
  };
  let lines: PricedLine[];
  try {
    lines = req.items.map((it) => priceLine(lookup, it));
  } catch (e) {
    if (e instanceof PricingError) throw new OrderError('ITEM', `${e.message}. Bitte prüfe deinen Warenkorb.`, 422);
    throw e;
  }

  // Liefergebiet & Mindestbestellwert
  let zone: Zone | null = null;
  if (req.mode === 'delivery') {
    if (!req.address) throw new OrderError('ADDRESS', 'Bitte gib deine Lieferadresse an.', 422, 'street');
    zone = findZone(zones, req.address.zip);
    if (zones.length && !zone) throw new OrderError('ZONE', `Nach ${req.address.zip} liefern wir leider nicht. Du kannst aber gerne abholen.`, 422, 'zip');
  }
  const totals = computeTotals(lines, req.mode, zone, ordering.minOrderExcludeCategories);
  if (req.mode === 'delivery' && totals.missingForMin > 0) {
    throw new OrderError(
      'MIN_ORDER',
      `Für die Lieferung fehlen noch ${formatEuro(totals.missingForMin)} bis zum Mindestbestellwert von ${formatEuro(totals.minOrder ?? 0)}${ordering.minOrderExcludeCategories.length ? ' (Getränke zählen nicht mit)' : ''}.`,
      422,
    );
  }

  const payment = ordering.payment.find((p) => p.id === req.payment);
  if (!payment) throw new OrderError('PAYMENT', 'Bitte wähle eine Zahlart.', 422, 'payment');

  const createdAtLocal = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }).format(now);
  return {
    number: orderNumber(now),
    createdAt: now.toISOString(),
    createdAtLocal,
    mode: req.mode,
    timeLabel,
    lines,
    totals,
    zone,
    customer: { name: req.customer.name, phone: req.customer.phone, email: req.customer.email || undefined },
    address: req.mode === 'delivery' ? req.address : undefined,
    payment: payment.label,
    note: req.note || undefined,
    priceChanged: req.clientTotal !== undefined && req.clientTotal !== totals.total,
  };
}

/** Bon-Text für die Küche (E-Mail, Drucker, Telegram …) */
export function orderText(o: PreparedOrder, shopName: string): string {
  const w = 44;
  const row = (left: string, right: string) => {
    const space = Math.max(1, w - left.length - right.length);
    return left + ' '.repeat(space) + right;
  };
  const out: string[] = [];
  out.push(`${shopName.toUpperCase()} – BESTELLUNG ${o.number}`);
  out.push(o.mode === 'delivery' ? '>>> LIEFERUNG <<<' : '>>> ABHOLUNG <<<');
  out.push(`Eingang: ${o.createdAtLocal}`);
  out.push(`Zeit: ${o.timeLabel}`);
  out.push('-'.repeat(w));
  for (const l of o.lines) {
    out.push(row(`${l.qty}× ${l.name}`, formatPrice(l.total)));
    if (l.variantLabel) out.push(`   ${l.variantLabel}`);
    if (l.optionLabels.length) out.push(`   + ${l.optionLabels.join(', ')}`);
    if (l.note) out.push(`   „${l.note}“`);
  }
  out.push('-'.repeat(w));
  out.push(row('Zwischensumme', formatEuro(o.totals.subtotal)));
  if (o.mode === 'delivery') out.push(row('Liefergebühr', o.totals.deliveryFee === null ? 'n. V.' : formatEuro(o.totals.deliveryFee)));
  out.push(row('GESAMT', formatEuro(o.totals.total)));
  if (o.totals.deposit) out.push(`(darin ${formatEuro(o.totals.deposit)} Pfand)`);
  out.push(`Zahlung: ${o.payment}`);
  out.push('-'.repeat(w));
  out.push(`Name: ${o.customer.name}`);
  out.push(`Telefon: ${o.customer.phone}`);
  if (o.customer.email) out.push(`E-Mail: ${o.customer.email}`);
  if (o.address) {
    out.push(`Adresse: ${o.address.street} ${o.address.houseNumber}, ${o.address.zip} ${o.address.city}`);
    if (o.address.hint) out.push(`Hinweis: ${o.address.hint}`);
  }
  if (o.note) out.push(`Anmerkung: ${o.note}`);
  if (o.priceChanged) out.push('! Preise im Browser waren veraltet – berechnet wurde der aktuelle Preis.');
  return out.join('\n');
}
