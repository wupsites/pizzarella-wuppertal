/**
 * Normalisiert die redaktionellen Menüdaten in ein einheitliches Format
 * (Preise in Cent, jede Position mit mindestens einer Variante, Auswahl-
 * Gruppen aufgelöst). Reine Funktionen – läuft im Browser, auf dem Server
 * und in Node-Skripten.
 */
import type { OptionSets, RawCategory } from '../data/schema.ts';

export interface Variant {
  id: string;
  label: string;
  detail?: string;
  /** Preis in Cent */
  price: number;
  /** im Preis enthaltenes Pfand in Cent (nur Anzeige) */
  deposit: number;
  /** Füllmenge in Litern (Grundpreis) */
  volume?: number;
}

export interface OptionChoice {
  id: string;
  label: string;
  /** Aufpreis in Cent, falls größenunabhängig */
  price: number;
  /** Aufpreis je Varianten-ID in Cent */
  prices?: Record<string, number>;
}

export interface OptionGroup {
  id: string;
  label: string;
  type: 'single' | 'multi';
  required: boolean;
  max?: number;
  choices: OptionChoice[];
}

export interface Product {
  id: string;
  nr?: string;
  categoryId: string;
  name: string;
  listName: string;
  description?: string;
  variants: Variant[];
  options: OptionGroup[];
  noteRequired: boolean;
  notePrompt?: string;
  tags: string[];
  allergens: string[];
  additives: string[];
  image?: { src: string; alt: string };
  available: boolean;
  /** kleinster Preis über alle Varianten (Cent) */
  fromPrice: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  note?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  intro?: string;
  source: string;
  status: 'ok' | 'missing';
  note?: string;
  products: Product[];
  /** ausgeblendete/unbestätigte Positionen – nur für Berichte */
  hiddenProducts: { id: string; name: string; note?: string }[];
  fromPrice: number | null;
}

export interface Catalog {
  categories: Category[];
  /** nur Kategorien mit sichtbaren Produkten */
  visibleCategories: Category[];
  products: Map<string, Product>;
}

export const cents = (euro: number): number => Math.round(euro * 100);

/** Aufpreis einer Auswahl für eine Variante; null = für diese Größe nicht verfügbar */
export function choicePrice(choice: OptionChoice, variantId: string): number | null {
  if (choice.prices) return choice.prices[variantId] ?? null;
  return choice.price;
}

/** Grundpreis je Liter (PAngV) – Preis ohne enthaltenes Pfand */
export function unitPricePerLitre(v: Variant): number | null {
  if (!v.volume) return null;
  return Math.round((v.price - v.deposit) / v.volume);
}

function resolveGroups(ids: string[] | undefined, sets: OptionSets, owner: string) {
  return (ids ?? []).map((id) => {
    const set = sets[id];
    if (!set) throw new Error(`${owner}: Auswahl-Gruppe "${id}" fehlt in options.json`);
    return { id, ...set };
  });
}

export function buildCatalog(raw: RawCategory[], sets: OptionSets = {}): Catalog {
  const products = new Map<string, Product>();
  const categories: Category[] = raw.map((c) => {
    const defs = c.variants ?? [];
    const visible: Product[] = [];
    const hiddenProducts: Category['hiddenProducts'] = [];

    for (const p of c.products) {
      if (products.has(p.id)) throw new Error(`Doppelte Produkt-ID: ${p.id}`);
      if (p.hidden) {
        hiddenProducts.push({ id: p.id, name: p.name, note: p.note });
        continue;
      }
      let variants: Variant[];
      if (p.variants && p.variants.length) {
        variants = p.variants.map((v) => ({
          id: v.id,
          label: v.label,
          detail: v.detail,
          price: cents(v.price),
          deposit: cents(v.deposit ?? 0),
          volume: v.volume,
        }));
      } else if (p.prices && Object.keys(p.prices).length > 0) {
        variants = Object.entries(p.prices).map(([vid, price]) => {
          const def = defs.find((d) => d.id === vid);
          if (!def) throw new Error(`Produkt ${p.id}: Variante "${vid}" ist in Kategorie ${c.id} nicht definiert`);
          return { id: vid, label: def.label, detail: def.detail, price: cents(price), deposit: 0 };
        });
        variants.sort((a, b) => defs.findIndex((d) => d.id === a.id) - defs.findIndex((d) => d.id === b.id));
      } else {
        variants = [{ id: 'std', label: 'Standard', price: cents(p.price ?? 0), deposit: 0 }];
      }

      const groups = [...resolveGroups(p.optionSets ?? c.optionSets, sets, p.id), ...(p.options ?? [])];
      const options: OptionGroup[] = groups
        .map((g) => ({
          id: g.id,
          label: g.label,
          type: g.type,
          required: g.required,
          max: g.max,
          choices: g.choices
            .map((ch) => ({
              id: ch.id,
              label: ch.label,
              price: cents(ch.price ?? 0),
              ...(ch.prices ? { prices: Object.fromEntries(Object.entries(ch.prices).map(([k, v]) => [k, cents(v)])) } : {}),
            }))
            // nur Auswahlen, die für mindestens eine Variante dieses Produkts gelten
            .filter((ch) => !ch.prices || variants.some((v) => ch.prices?.[v.id] !== undefined)),
        }))
        .filter((g) => g.choices.length > 0);

      const product: Product = {
        id: p.id,
        nr: p.nr,
        categoryId: c.id,
        name: p.name,
        listName: p.listName ?? p.name,
        description: p.description,
        variants,
        options,
        noteRequired: Boolean(p.noteRequired),
        notePrompt: p.notePrompt,
        tags: p.tags ?? [],
        allergens: p.allergens ?? [],
        additives: p.additives ?? [],
        image: p.image,
        available: p.available,
        fromPrice: Math.min(...variants.map((v) => v.price)),
        confidence: p.confidence,
        source: p.source ?? c.source,
        note: p.note,
      };
      products.set(p.id, product);
      visible.push(product);
    }

    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      intro: c.intro,
      source: c.source,
      status: c.status,
      note: c.note,
      products: visible,
      hiddenProducts,
      fromPrice: visible.length ? Math.min(...visible.map((p) => p.fromPrice)) : null,
    };
  });

  return {
    categories,
    visibleCategories: categories.filter((c) => c.products.length > 0),
    products,
  };
}

/** Serialisierbare Fassung für den Browser (Warenkorb, Suche) – ohne interne Prüfvermerke. */
export type ClientProduct = Pick<
  Product,
  'id' | 'nr' | 'categoryId' | 'name' | 'listName' | 'description' | 'variants' | 'options' | 'tags' | 'fromPrice' | 'noteRequired' | 'notePrompt' | 'allergens' | 'additives'
>;
export interface ClientCatalog {
  categories: { id: string; name: string; icon: string }[];
  products: ClientProduct[];
}

export function toClientCatalog(catalog: Catalog): ClientCatalog {
  const products: ClientProduct[] = [];
  for (const c of catalog.visibleCategories) {
    for (const p of c.products) {
      if (!p.available) continue;
      products.push({
        id: p.id,
        nr: p.nr,
        categoryId: p.categoryId,
        name: p.name,
        listName: p.listName,
        description: p.description,
        variants: p.variants,
        options: p.options,
        tags: p.tags,
        fromPrice: p.fromPrice,
        noteRequired: p.noteRequired,
        notePrompt: p.notePrompt,
        allergens: p.allergens,
        additives: p.additives,
      });
    }
  }
  return {
    categories: catalog.visibleCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    products,
  };
}
