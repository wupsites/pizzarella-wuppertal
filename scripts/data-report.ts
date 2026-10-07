/**
 * Validiert alle Daten in src/data/ und listet offene Prüfpunkte.
 *
 *   npm run data:check               → Bericht in der Konsole (bricht bei ungültigen Daten ab)
 *   npm run data:check -- --md       → schreibt zusätzlich docs/DATENSTATUS.md
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteData } from '../src/data/load.ts';
import { formatEuro } from '../src/lib/pricing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src', 'data');
const json = (p: string) => JSON.parse(readFileSync(join(dataDir, p), 'utf8'));

let site;
try {
  site = loadSiteData({
    business: json('business.json'),
    options: json('options.json'),
    ordering: json('ordering.json'),
    allergens: json('allergens.json'),
    reviews: json('reviews.json'),
    promotions: json('promotions.json'),
    home: json('home.json'),
    categories: readdirSync(join(dataDir, 'menu'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ file: f, data: json(join('menu', f)) })),
  });
} catch (err) {
  console.error(`\n✖ ${(err as Error).message}\n`);
  process.exit(1);
}

const { business, ordering, catalog, allergens, reviews } = site;
const sourceLabel = (id: string) => business.sources.find((s) => s.id === id)?.label ?? id;

const blockers: string[] = [];
const checks: string[] = [];

if (business.phone.status !== 'confirmed') blockers.push(`Telefonnummer ${business.phone.display} bestätigen – ${business.phone.note ?? ''}`.trim());
if (!business.email) checks.push('E-Mail-Adresse für Impressum fehlt (business.json → "email").');
if (business.hours.status !== 'confirmed') blockers.push('Öffnungszeiten bestätigen.');
if (ordering.deliveryZonesStatus === 'missing' || site.zones.length === 0)
  blockers.push('Liefergebiete (PLZ), Mindestbestellwert und Liefergebühr in ordering.json eintragen.');
else if (ordering.deliveryZonesStatus === 'unconfirmed')
  blockers.push(
    `Liefergebiet bestätigen: ${site.zones.reduce((n, z) => n + z.zips.length, 0)} PLZ aus dem Lieferando-Shop übernommen, Mindestbestellwert ${formatEuro(site.zones[0].minOrder)} (ohne Getränke) und 0 € Liefergebühr laut bisheriger Website. Lieferando staffelt den Mindestwert je PLZ (11,99–34,99 €) – falls das auch für Direktbestellungen gelten soll, je Zone eintragen.`,
  );
for (const p of ordering.payment) if (p.status !== 'confirmed') blockers.push(`Zahlart „${p.label}“ bestätigen (ordering.json → payment).`);
if (allergens.productDataStatus === 'missing') blockers.push('Allergene/Zusatzstoffe je Gericht eintragen (LMIV-Pflicht im Fernabsatz).');
else if (allergens.productDataStatus === 'unconfirmed') blockers.push(`Allergen-Kennzeichnung prüfen: ${allergens.note ?? ''}`);
const unconfirmedSets = Object.entries(site.optionSets).filter(([, s]) => s.status === 'unconfirmed').map(([id]) => id);
if (unconfirmedSets.length)
  blockers.push(`Aufpreise/Auswahl bestätigen (aus dem Lieferando-Shop übernommen): ${unconfirmedSets.join(', ')} – siehe src/data/options.json.`);
if (site.home.directPrice?.enabled)
  checks.push(`Preisvergleich „${site.home.directPrice.text}“ wurde am ${site.home.directPrice.checked} geprüft – regelmäßig nachprüfen oder in home.json abschalten.`);
if (!reviews.publish) checks.push('Bewertungen sind ausgeblendet – aktuelle Werte mit Datum in reviews.json eintragen und "publish": true setzen.');
checks.push('Getränkepreise enthalten laut Lieferando-Shop das Pfand („inkl. Pfand“). Nach PAngV § 7 sollte Pfand neben dem Preis und nicht im Gesamtpreis angegeben werden – Darstellung mit Steuerberatung/Rechtsberatung abstimmen.');

const categoryRows: string[] = [];
const productRows: string[] = [];
let visibleCount = 0;
for (const c of catalog.categories) {
  visibleCount += c.products.length;
  const status = c.status === 'missing' ? 'FEHLT' : c.source === 'own-site' ? 'bisherige Website' : 'nur Lieferando-Shop';
  categoryRows.push(`| ${c.name} | ${c.products.length} | ${c.fromPrice !== null ? formatEuro(c.fromPrice) : '–'} | ${status} |`);
  if (c.status === 'missing') blockers.push(`Kategorie „${c.name}“: ${c.note ?? 'Produkte fehlen.'}`);
  else if (c.source !== 'own-site') checks.push(`Kategorie „${c.name}“: Preise stammen aus ${sourceLabel(c.source)} – mit Kassen-/Ladenpreisen abgleichen.`);
  for (const p of c.products) {
    if (p.confidence !== 'high' || p.note) {
      productRows.push(`| ${c.name} | ${p.name} | ${p.variants.map((v) => formatEuro(v.price)).join(' / ')} | ${p.confidence} | ${p.note ?? ''} |`);
    }
  }
  for (const h of c.hiddenProducts) productRows.push(`| ${c.name} | ${h.name} | ausgeblendet | – | ${h.note ?? ''} |`);
}

const md = `# Datenstatus

Automatisch erzeugt mit \`npm run data:check -- --md\` am ${new Date().toISOString().slice(0, 10)}.

**${visibleCount} bestellbare Produkte in ${catalog.visibleCategories.length} Kategorien.**

## Vor dem Go-Live zwingend klären

${blockers.map((b) => `- [ ] ${b}`).join('\n')}

## Prüfen

${checks.map((b) => `- [ ] ${b}`).join('\n')}

## Kategorien

| Kategorie | Produkte | ab | Quelle |
|---|---:|---:|---|
${categoryRows.join('\n')}

## Positionen mit Anmerkung oder ohne volle Bestätigung

${
  productRows.length
    ? `| Kategorie | Produkt | Preis | Sicherheit | Anmerkung |\n|---|---|---|---|---|\n${productRows.join('\n')}`
    : 'Keine – alle Produkte und Preise stammen von der bisherigen eigenen Website.'
}
`;

console.log(`\n✔ Daten gültig: ${visibleCount} Produkte in ${catalog.visibleCategories.length} Kategorien.`);
console.log(`\n⚠ ${blockers.length} offene Go-Live-Punkte:`);
for (const b of blockers) console.log(`  • ${b}`);
console.log(`\nℹ ${checks.length} Prüfhinweise, ${productRows.length} Positionen mit Anmerkung (Details: npm run data:check -- --md)\n`);

if (process.argv.includes('--md')) {
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'DATENSTATUS.md'), md);
  console.log('→ docs/DATENSTATUS.md geschrieben\n');
}
