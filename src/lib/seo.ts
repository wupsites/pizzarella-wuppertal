/**
 * Strukturierte Daten (schema.org) für Local SEO.
 * Nur belegte Angaben – keine Geo-Koordinaten (nicht verifiziert), keine Bewertungssterne.
 */
import type { SiteData } from '../data/load.ts';
import { openingHoursSpec } from './hours.ts';

export function restaurantJsonLd(site: SiteData, url: string) {
  const { business } = site;
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${url}#restaurant`,
    name: business.name,
    url,
    telephone: business.phone.e164,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address.street,
      postalCode: business.address.zip,
      addressLocality: business.address.city,
      addressCountry: business.address.country,
    },
    servesCuisine: ['Pizza', 'Döner', 'Lahmacun', 'Pasta', 'Falafel', 'Salate'],
    priceRange: '€',
    acceptsReservations: false,
    hasMenu: `${url}speisekarte/`,
    openingHoursSpecification: openingHoursSpec(business.hours),
    image: `${url}og.jpg`,
    potentialAction: {
      '@type': 'OrderAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${url}speisekarte/`, inLanguage: 'de-DE', actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] },
      deliveryMethod: ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet', 'http://purl.org/goodrelations/v1#DeliveryModePickUp'],
    },
  };
  if (business.email) ld.email = business.email;
  // Bewusst kein aggregateRating: Plattform-Bewertungen als eigene Sterne
  // auszuzeichnen, verstößt gegen Googles Richtlinien zu „self-serving reviews“.
  return ld;
}

export function menuJsonLd(site: SiteData, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': `${url}speisekarte/#menu`,
    name: `Speisekarte ${site.business.name} Wuppertal`,
    inLanguage: 'de-DE',
    hasMenuSection: site.catalog.visibleCategories.map((c) => ({
      '@type': 'MenuSection',
      name: c.name,
      ...(c.intro ? { description: c.intro } : {}),
      hasMenuItem: c.products.map((p) => ({
        '@type': 'MenuItem',
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        ...(p.tags.includes('vegetarisch') ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}),
        offers: p.variants.map((v) => ({
          '@type': 'Offer',
          price: (v.price / 100).toFixed(2),
          priceCurrency: 'EUR',
          ...(v.id !== 'std' ? { name: v.detail ? `${v.label} (${v.detail})` : v.label } : {}),
        })),
      })),
    })),
  };
}

export function breadcrumbJsonLd(url: string, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${url}${it.path.replace(/^\//, '')}` })),
  };
}
