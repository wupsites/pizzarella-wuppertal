/**
 * Schemas für alle redaktionellen Daten in src/data/.
 * Ungültige Daten brechen den Build ab (npm run data:check / astro build),
 * damit nie eine kaputte Speisekarte online geht.
 */
import { z } from 'zod';

const euro = z.number().min(0).max(999);
const time = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'Uhrzeit im Format HH:MM');
const confidence = z.enum(['high', 'medium', 'low']);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'nur a–z, 0–9 und Bindestriche');

const choiceSchema = z.object({
  id: slug,
  label: z.string().min(1),
  /** Aufpreis unabhängig von der Größe */
  price: euro.optional(),
  /** Aufpreis je Größe, z. B. { "klein": 1.5, "gross": 2 } */
  prices: z.record(z.string(), euro).optional(),
});

export const optionGroupSchema = z.object({
  id: slug,
  label: z.string().min(1),
  type: z.enum(['single', 'multi']).default('single'),
  required: z.boolean().default(false),
  max: z.number().int().positive().optional(),
  choices: z.array(choiceSchema).min(1),
});

/** wiederverwendbare Gruppen in options.json (ID = Schlüssel) */
export const optionSetSchema = optionGroupSchema.omit({ id: true }).extend({
  status: z.enum(['confirmed', 'unconfirmed']).default('confirmed'),
});
export const optionSetsSchema = z.record(z.string(), optionSetSchema);

export const variantDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().optional(),
});

/** vollständige Variante direkt am Produkt (z. B. Getränke) */
export const productVariantSchema = variantDefSchema.extend({
  price: euro,
  /** im Preis enthaltenes Pfand */
  deposit: euro.optional(),
  /** Füllmenge in Litern (für den Grundpreis) */
  volume: z.number().positive().optional(),
});

export const productSchema = z
  .object({
    id: slug,
    /** Nummer auf der Karte (für Bestellungen am Telefon) */
    nr: z.string().optional(),
    name: z.string().min(1),
    listName: z.string().optional(),
    description: z.string().optional(),
    descriptionSource: z.string().optional(),
    /** Einzelpreis (ohne Varianten) */
    price: euro.optional(),
    /** Preise je Kategorie-Variante, z. B. { "klein": 6.90, "gross": 7.90 } */
    prices: z.record(z.string(), euro).optional(),
    /** eigene Varianten mit Preis/Pfand/Füllmenge */
    variants: z.array(productVariantSchema).optional(),
    /** Auswahl-Gruppen aus options.json; ersetzt die Vorgabe der Kategorie */
    optionSets: z.array(z.string()).optional(),
    options: z.array(optionGroupSchema).optional(),
    /** Anmerkung ist Pflicht (z. B. „Welcher Belag?“) */
    noteRequired: z.boolean().optional(),
    notePrompt: z.string().optional(),
    tags: z.array(z.enum(['vegetarisch', 'vegan', 'scharf'])).optional(),
    allergens: z.array(z.string()).optional(),
    additives: z.array(z.string()).optional(),
    image: z.object({ src: z.string(), alt: z.string() }).optional(),
    available: z.boolean().default(true),
    hidden: z.boolean().default(false),
    confidence: confidence,
    source: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((p) => p.hidden || p.price !== undefined || (p.prices && Object.keys(p.prices).length > 0) || (p.variants && p.variants.length > 0), {
    message: 'Sichtbare Produkte brauchen "price", "prices" oder "variants".',
  });

export const categorySchema = z.object({
  id: slug,
  name: z.string().min(1),
  icon: z.string().min(1),
  intro: z.string().optional(),
  source: z.string(),
  status: z.enum(['ok', 'missing']).default('ok'),
  note: z.string().optional(),
  variants: z.array(variantDefSchema).optional(),
  optionSets: z.array(z.string()).optional(),
  products: z.array(productSchema),
});

const interval = z.tuple([time, time]);
const dayKey = z.enum(['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']);

export const businessSchema = z.object({
  name: z.string(),
  legalName: z.string(),
  owner: z.string(),
  legalForm: z.string().optional(),
  address: z.object({ street: z.string(), zip: z.string().regex(/^\d{5}$/), city: z.string(), country: z.string() }),
  phone: z.object({
    display: z.string(),
    e164: z.string().regex(/^\+\d{6,15}$/),
    status: z.enum(['confirmed', 'unconfirmed']),
    note: z.string().optional(),
  }),
  email: z.string().email().nullable(),
  website: z.string().url(),
  timezone: z.string(),
  hours: z.object({
    status: z.enum(['confirmed', 'unconfirmed']),
    source: z.string(),
    weekly: z.record(dayKey, z.array(interval)),
    lastOrderMinutesBeforeClose: z.number().int().min(0).max(120),
    exceptions: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        intervals: z.array(interval).default([]),
        note: z.string().optional(),
      }),
    ),
  }),
  familyRun: z.object({ text: z.string(), source: z.string() }).optional(),
  social: z.array(z.object({ label: z.string(), url: z.string().url() })),
  sources: z.array(z.object({ id: z.string(), label: z.string(), url: z.string().url() })),
});

export const deliveryZoneSchema = z.object({
  name: z.string(),
  zips: z.array(z.string().regex(/^\d{5}$/)).min(1),
  minOrder: euro,
  fee: euro,
  freeFrom: euro.nullable().default(null),
  etaMinutes: z.number().int().positive().nullable().default(null),
});

export const orderingSchema = z.object({
  online: z.boolean(),
  defaultMode: z.enum(['delivery', 'pickup']),
  modes: z.object({
    delivery: z.object({ enabled: z.boolean(), label: z.string(), etaMinutes: z.number().int().positive().nullable() }),
    pickup: z.object({ enabled: z.boolean(), label: z.string(), etaMinutes: z.number().int().positive().nullable() }),
  }),
  deliveryZonesStatus: z.enum(['ok', 'missing', 'unconfirmed']),
  deliveryZones: z.array(deliveryZoneSchema),
  /** Kategorien, die nicht zum Mindestbestellwert zählen (bisherige Website: „ohne Getränke“) */
  minOrderExcludeCategories: z.array(z.string()).default([]),
  payment: z
    .array(z.object({ id: slug, label: z.string(), detail: z.string().optional(), status: z.enum(['confirmed', 'unconfirmed']) }))
    .min(1),
  allowPreorder: z.boolean(),
  preorderSlotMinutes: z.number().int().min(5).max(60),
  crossSell: z.record(z.string(), z.array(z.string())),
});

export const allergensSchema = z.object({
  productDataStatus: z.enum(['ok', 'missing', 'unconfirmed']),
  note: z.string().optional(),
  allergens: z.array(z.object({ code: z.string(), label: z.string(), note: z.string().optional() })),
  additives: z.array(z.object({ code: z.string(), label: z.string(), note: z.string().optional() })),
});

export const reviewsSchema = z.object({
  publish: z.boolean(),
  platforms: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      rating: z.number().nullable(),
      scale: z.number(),
      count: z.number().int().nullable(),
      checked: z.string().nullable(),
      url: z.string().url().optional(),
      note: z.string().optional(),
    }),
  ),
  quotes: z.array(
    z.object({
      text: z.string(),
      author: z.string().optional(),
      platform: z.string(),
      date: z.string(),
      url: z.string().url().optional(),
    }),
  ),
});

export const promotionsSchema = z.object({
  items: z.array(
    z.object({
      id: slug,
      text: z.string(),
      from: z.string().optional(),
      until: z.string().optional(),
      link: z.string().optional(),
    }),
  ),
});

export const directPriceSchema = z.object({
  enabled: z.boolean(),
  checked: z.string(),
  text: z.string(),
  example: z.string().optional(),
});

const pickRef = z.object({ product: z.string(), variant: z.string().optional(), qty: z.number().int().positive().optional() });
export const homeSchema = z.object({
  picks: z.array(pickRef),
  receipt: z.object({ title: z.string(), items: z.array(pickRef) }),
  heroSlices: z.array(z.string()),
  directPrice: directPriceSchema.optional(),
});

export type RawCategory = z.infer<typeof categorySchema>;
export type RawProduct = z.infer<typeof productSchema>;
export type Business = z.infer<typeof businessSchema>;
export type Ordering = z.infer<typeof orderingSchema>;
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;
export type Allergens = z.infer<typeof allergensSchema>;
export type Reviews = z.infer<typeof reviewsSchema>;
export type Promotions = z.infer<typeof promotionsSchema>;
export type Home = z.infer<typeof homeSchema>;
export type OptionSets = z.infer<typeof optionSetsSchema>;
export type DayKey = z.infer<typeof dayKey>;
