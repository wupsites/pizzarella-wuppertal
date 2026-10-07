/**
 * Preislogik für Warenkorb (Browser) und Bestell-API (Server).
 * Der Server rechnet jede Bestellung mit genau dieser Logik neu –
 * Preise aus dem Browser werden nie übernommen.
 */
import { choicePrice, type OptionGroup, type Variant } from './catalog.ts';

export interface PricingProduct {
  id: string;
  categoryId: string;
  name: string;
  variants: Variant[];
  options: OptionGroup[];
  noteRequired?: boolean;
  notePrompt?: string;
}

export interface LineInput {
  productId: string;
  variantId: string;
  /** Gruppen-ID → gewählte Choice-IDs */
  options?: Record<string, string[]>;
  qty: number;
  note?: string;
}

export interface PricedLine {
  key: string;
  productId: string;
  categoryId: string;
  variantId: string;
  options: Record<string, string[]>;
  name: string;
  /** z. B. "Groß · Ø 30 cm" – leer bei Einzelpreis */
  variantLabel: string;
  optionLabels: string[];
  note: string;
  qty: number;
  /** Stückpreis inkl. Aufpreise (Cent) – Getränkepreise enthalten das Pfand */
  unit: number;
  /** davon Pfand pro Stück (Cent, nur zur Anzeige) */
  deposit: number;
  total: number;
  depositTotal: number;
}

export interface Zone {
  name: string;
  zips: string[];
  minOrder: number;
  fee: number;
  freeFrom: number | null;
  etaMinutes: number | null;
}

export interface Totals {
  count: number;
  subtotal: number;
  /** im Warenwert enthaltenes Pfand (nur Anzeige) */
  deposit: number;
  /** Warenwert, der für den Mindestbestellwert zählt */
  minOrderBase: number;
  /** null = Liefergebühr unbekannt (keine Gebiete gepflegt) */
  deliveryFee: number | null;
  total: number;
  minOrder: number | null;
  /** fehlender Betrag bis Mindestbestellwert (0 = erreicht) */
  missingForMin: number;
  zone: Zone | null;
}

export const MAX_QTY = 50;
export const MAX_NOTE = 140;

export class PricingError extends Error {}

export function variantLabel(v: Variant): string {
  if (v.id === 'std') return '';
  return v.detail ? `${v.label} · ${v.detail}` : v.label;
}

export function normalizeOptions(options: Record<string, string[]> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!options) return out;
  for (const key of Object.keys(options).sort()) {
    const vals = [...new Set(options[key])].sort();
    if (vals.length) out[key] = vals;
  }
  return out;
}

export function lineKey(input: Pick<LineInput, 'productId' | 'variantId' | 'options' | 'note'>): string {
  const opts = normalizeOptions(input.options);
  const optStr = Object.entries(opts)
    .map(([k, v]) => `${k}=${v.join('+')}`)
    .join(';');
  return [input.productId, input.variantId, optStr, (input.note ?? '').trim().toLowerCase()].join('|');
}

export function priceLine(lookup: (id: string) => PricingProduct | undefined, input: LineInput): PricedLine {
  const product = lookup(input.productId);
  if (!product) throw new PricingError(`Unbekanntes Produkt: ${input.productId}`);
  const variant = product.variants.find((v) => v.id === input.variantId);
  if (!variant) throw new PricingError(`Unbekannte Variante ${input.variantId} für ${product.name}`);
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > MAX_QTY) {
    throw new PricingError(`Ungültige Menge für ${product.name}`);
  }

  const options = normalizeOptions(input.options);
  const optionLabels: string[] = [];
  let surcharge = 0;
  for (const key of Object.keys(options)) {
    if (!product.options.some((g) => g.id === key)) throw new PricingError(`Unbekannte Auswahl "${key}" für ${product.name}`);
  }
  for (const group of product.options) {
    const picked = options[group.id] ?? [];
    if (group.required && picked.length === 0) throw new PricingError(`Bitte ${group.label} für ${product.name} wählen`);
    if (group.type === 'single' && picked.length > 1) throw new PricingError(`Nur eine ${group.label} möglich`);
    if (group.max && picked.length > group.max) throw new PricingError(`Höchstens ${group.max}× ${group.label}`);
    for (const id of picked) {
      const choice = group.choices.find((c) => c.id === id);
      if (!choice) throw new PricingError(`Unbekannte Auswahl ${id} für ${product.name}`);
      const add = choicePrice(choice, variant.id);
      if (add === null) throw new PricingError(`${choice.label} gibt es nicht für ${variantLabel(variant) || product.name}`);
      surcharge += add;
      optionLabels.push(choice.label);
    }
  }

  const note = (input.note ?? '').trim().slice(0, MAX_NOTE);
  if (product.noteRequired && !note) throw new PricingError(`${product.notePrompt ?? 'Bitte Anmerkung angeben'} (${product.name})`);
  const unit = variant.price + surcharge;
  return {
    key: lineKey({ ...input, options, note }),
    productId: product.id,
    categoryId: product.categoryId,
    variantId: variant.id,
    options,
    name: product.name,
    variantLabel: variantLabel(variant),
    optionLabels,
    note,
    qty: input.qty,
    unit,
    deposit: variant.deposit,
    total: unit * input.qty,
    depositTotal: variant.deposit * input.qty,
  };
}

export function findZone(zones: Zone[], zip: string | undefined | null): Zone | null {
  if (!zip) return null;
  return zones.find((z) => z.zips.includes(zip.trim())) ?? null;
}

export function computeTotals(
  lines: PricedLine[],
  mode: 'delivery' | 'pickup',
  zone: Zone | null,
  minOrderExcludeCategories: string[] = [],
): Totals {
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const deposit = lines.reduce((s, l) => s + l.depositTotal, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const minOrderBase = lines.filter((l) => !minOrderExcludeCategories.includes(l.categoryId)).reduce((s, l) => s + l.total, 0);

  let deliveryFee: number | null = 0;
  let minOrder: number | null = null;
  if (mode === 'delivery') {
    if (zone) {
      minOrder = zone.minOrder;
      deliveryFee = zone.freeFrom !== null && minOrderBase >= zone.freeFrom ? 0 : zone.fee;
    } else {
      deliveryFee = null;
    }
  }
  const missingForMin = minOrder !== null ? Math.max(0, minOrder - minOrderBase) : 0;
  return {
    count,
    subtotal,
    deposit,
    minOrderBase,
    deliveryFee,
    total: subtotal + (deliveryFee ?? 0),
    minOrder,
    missingForMin,
    zone,
  };
}

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
/** 690 → "6,90 €" */
export function formatEuro(centsValue: number): string {
  return euroFormat.format(centsValue / 100);
}
/** 690 → "6,90" */
export function formatPrice(centsValue: number): string {
  return (centsValue / 100).toFixed(2).replace('.', ',');
}
