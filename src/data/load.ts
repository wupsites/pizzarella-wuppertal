/**
 * Validiert alle Rohdaten und baut daraus das Datenobjekt, aus dem
 * Seiten, Warenkorb und Bestell-API rendern. Wird vom Build (Vite) und
 * von Node-Skripten (Datenbericht, Tests) gleichermaßen genutzt.
 */
import {
  allergensSchema,
  businessSchema,
  categorySchema,
  homeSchema,
  orderingSchema,
  optionSetsSchema,
  promotionsSchema,
  reviewsSchema,
  type Allergens,
  type Business,
  type Home,
  type Ordering,
  type Promotions,
  type Reviews,
  type OptionSets,
} from './schema.ts';
import { buildCatalog, cents, type Catalog } from '../lib/catalog.ts';
import type { Zone } from '../lib/pricing.ts';

export interface RawSiteData {
  business: unknown;
  options: unknown;
  ordering: unknown;
  categories: { file: string; data: unknown }[];
  allergens: unknown;
  reviews: unknown;
  promotions: unknown;
  home: unknown;
}

export interface SiteData {
  business: Business;
  optionSets: OptionSets;
  ordering: Ordering;
  zones: Zone[];
  catalog: Catalog;
  allergens: Allergens;
  reviews: Reviews;
  promotions: Promotions;
  home: Home;
}

function parse<T>(label: string, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Ungültige Daten in ${label}:\n${issues}`);
  }
  return result.data;
}

export function loadSiteData(raw: RawSiteData): SiteData {
  const business = parse('business.json', businessSchema, raw.business);
  const ordering = parse('ordering.json', orderingSchema, raw.ordering);
  const categories = raw.categories
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((c) => parse(`menu/${c.file}`, categorySchema, c.data));
  const { $comment: _comment, ...rawSets } = (raw.options ?? {}) as Record<string, unknown>;
  const optionSets = parse('options.json', optionSetsSchema, rawSets);
  const catalog = buildCatalog(categories, optionSets);
  const allergens = parse('allergens.json', allergensSchema, raw.allergens);
  const reviews = parse('reviews.json', reviewsSchema, raw.reviews);
  const promotions = parse('promotions.json', promotionsSchema, raw.promotions);
  const home = parse('home.json', homeSchema, raw.home);

  // Querverweise prüfen
  const refs = [...home.picks, ...home.receipt.items].map((r) => r);
  for (const ref of refs) {
    const p = catalog.products.get(ref.product);
    if (!p) throw new Error(`home.json verweist auf unbekanntes/ausgeblendetes Produkt "${ref.product}"`);
    if (ref.variant && !p.variants.some((v) => v.id === ref.variant)) {
      throw new Error(`home.json: Variante "${ref.variant}" existiert nicht für ${ref.product}`);
    }
  }
  for (const id of home.heroSlices) {
    if (!catalog.products.has(id)) throw new Error(`home.json heroSlices: unbekanntes Produkt "${id}"`);
  }
  const categoryIds = new Set(catalog.categories.map((c) => c.id));
  for (const [key, list] of Object.entries(ordering.crossSell)) {
    if (key !== 'default' && !categoryIds.has(key)) throw new Error(`ordering.json crossSell: unbekannte Kategorie "${key}"`);
    for (const id of list) if (!catalog.products.has(id)) throw new Error(`ordering.json crossSell: unbekanntes Produkt "${id}"`);
  }
  const codes = new Set([...allergens.allergens, ...allergens.additives].map((a) => a.code));
  for (const p of catalog.products.values()) {
    for (const code of [...p.allergens, ...p.additives]) {
      if (!codes.has(code)) throw new Error(`Produkt ${p.id}: Kennzeichnung "${code}" fehlt in allergens.json`);
    }
  }

  const zones: Zone[] = ordering.deliveryZones.map((z) => ({
    name: z.name,
    zips: z.zips,
    minOrder: cents(z.minOrder),
    fee: cents(z.fee),
    freeFrom: z.freeFrom === null ? null : cents(z.freeFrom),
    etaMinutes: z.etaMinutes,
  }));

  for (const id of ordering.minOrderExcludeCategories) {
    if (!categoryIds.has(id)) throw new Error(`ordering.json minOrderExcludeCategories: unbekannte Kategorie "${id}"`);
  }

  return { business, optionSets, ordering, zones, catalog, allergens, reviews, promotions, home };
}
