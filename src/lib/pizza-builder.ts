/**
 * „Erstelle deine eigene Pizza“ – nur aus echten Daten der Karte:
 * Grundlage ist die Pizza Margherita (Tomatensauce + Käse, klein/groß),
 * dazu die Extra-Zutaten der Gruppe „pizza-zutaten“ mit ihren Preisen je
 * Größe. Bestellt wird genau das: Margherita + Extras – so prüft und
 * berechnet es auch der Server.
 *
 * Hier steht nur die Gliederung für die Bedienung (Sauce, Käse, Belag, Extras)
 * und der Abgleich mit fertigen Pizzen der Karte (fairer Hinweis, wenn eine
 * Kombination fertig günstiger ist).
 */
import type { Catalog, OptionChoice, OptionGroup, Product, Variant } from './catalog.ts';
import { choicePrice } from './catalog.ts';

export const BASE_PRODUCT = 'pizza-margherita';
export const TOPPING_GROUP = 'pizza-zutaten';

interface SectionDef {
  id: string;
  title: string;
  /** ist immer dabei (aus „mit Tomatensauce und Käse“) */
  fixed?: string;
  parts: { sub?: string; ids: string[] }[];
}

const SECTIONS: SectionDef[] = [
  { id: 'sauce', title: 'Sauce', fixed: 'Tomatensauce', parts: [{ ids: ['mit-sauce-hollandaise', 'knoblauch-oel', 'chili-oel'] }] },
  { id: 'kaese', title: 'Käse', fixed: 'Käse', parts: [{ ids: ['mit-extra-kaese', 'mit-parmesan', 'mit-schafskaese', 'mit-gorgonzola'] }] },
  {
    id: 'belag',
    title: 'Belag',
    parts: [
      {
        sub: 'Fleisch & Fisch',
        ids: [
          'mit-rindersalami',
          'mit-putenschinken',
          'mit-sucuk',
          'mit-haehnchenbrustfilet',
          'mit-haehnchen-doener-kebab',
          'mit-pastirma',
          'mit-thunfisch',
          'mit-sardellen',
          'mit-garnelen',
          'mit-frutti-di-mare',
        ],
      },
      {
        sub: 'Gemüse',
        ids: [
          'mit-champignons-frisch',
          'mit-paprika-frisch',
          'mit-zwiebeln-rot',
          'mit-mais',
          'mit-oliven',
          'mit-peperoni',
          'mit-jalapenos',
          'mit-ananas',
          'mit-cherry-tomaten-frisch',
          'mit-blattspinat',
          'mit-rucola-frisch',
          'mit-broccoli',
          'mit-kapern',
        ],
      },
    ],
  },
  { id: 'extras', title: 'Extras', parts: [{ ids: ['mit-ei', 'mit-pommes', 'mit-chicken-nuggets', 'mit-bolognese'] }] },
];

export interface BuilderSection {
  id: string;
  title: string;
  fixed?: string;
  parts: { sub?: string; items: OptionChoice[] }[];
}

export interface Classic {
  id: string;
  name: string;
  choices: string[];
  prices: Record<string, number>;
}

export interface BuilderModel {
  product: Product;
  group: OptionGroup;
  sizes: Variant[];
  sections: BuilderSection[];
  classics: Classic[];
  /** günstigster Aufpreis (für den Einstieg) */
  minExtra: number;
}

export function builderModel(catalog: Catalog): BuilderModel | null {
  const product = catalog.products.get(BASE_PRODUCT);
  const group = product?.options.find((g) => g.id === TOPPING_GROUP);
  if (!product || !product.available || !group) return null;
  const byId = new Map(group.choices.map((c) => [c.id, c]));
  const used = new Set<string>();
  const sections: BuilderSection[] = SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    fixed: s.fixed,
    parts: s.parts
      .map((p) => ({
        sub: p.sub,
        items: p.ids.flatMap((id) => {
          const c = byId.get(id);
          if (!c) return [];
          used.add(id);
          return [c];
        }),
      }))
      .filter((p) => p.items.length),
  }));
  // neue Zutaten in den Daten landen bei den Extras statt zu verschwinden
  const rest = group.choices.filter((c) => !used.has(c.id));
  if (rest.length) sections[sections.length - 1].parts.push({ items: rest });

  const prices = group.choices.flatMap((c) => product.variants.map((v) => choicePrice(c, v.id) ?? 0)).filter((p) => p > 0);
  return {
    product,
    group,
    sizes: product.variants,
    sections: sections.filter((s) => s.fixed || s.parts.length),
    classics: classics(catalog, product, group),
    minExtra: prices.length ? Math.min(...prices) : 0,
  };
}

/** Pizzen der Karte, deren Belag genau aus Extra-Zutaten besteht */
function classics(catalog: Catalog, base: Product, group: OptionGroup): Classic[] {
  const alias = new Map<string, string>();
  for (const c of group.choices) alias.set(norm(c.label.split(',')[0]), c.id);
  // Schreibweisen der Beschreibungen
  const extra: Record<string, string> = {
    spinat: 'mit-blattspinat',
    broccoli: 'mit-broccoli',
    zwiebeln: 'mit-zwiebeln-rot',
    meeresfruchte: 'mit-frutti-di-mare',
    'hahnchen-kebab': 'mit-haehnchen-doener-kebab',
  };
  for (const [k, v] of Object.entries(extra)) if (group.choices.some((c) => c.id === v)) alias.set(k, v);
  const out: Classic[] = [];
  for (const p of catalog.products.values()) {
    if (p.id === base.id || p.categoryId !== base.categoryId || !p.available || !p.description?.startsWith('mit ')) continue;
    // Calzone ist zugeklappt – kein Vergleich mit einer offenen Pizza
    if (p.options.some((g) => g.required) || /calzone/i.test(p.name)) continue;
    const parts = p.description
      .slice(4)
      .split(/,\s*|\s+und\s+/)
      .map((s) => norm(s))
      .filter((s) => s && s !== 'tomatensauce' && s !== 'kase');
    const ids = parts.map((s) => alias.get(s));
    if (!ids.length || ids.some((x) => !x)) continue;
    // nur vergleichbar, wenn es dieselben Größen gibt
    const prices: Record<string, number> = {};
    for (const v of base.variants) {
      const pv = p.variants.find((x) => x.id === v.id);
      if (pv) prices[v.id] = pv.price;
    }
    if (!Object.keys(prices).length) continue;
    out.push({ id: p.id, name: p.name, choices: [...new Set(ids as string[])].sort(), prices });
  }
  return out;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .trim();
}
