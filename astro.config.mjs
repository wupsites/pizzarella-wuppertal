// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.SITE_URL ?? 'https://pizzarella-wuppertal.de';

// Alte URLs der bisherigen Website (WordPress-Kategorieseiten) → neue Speisekarte.
// Bekannt: /dessert/. Die übrigen Pfade sind die naheliegenden Slugs der alten Kategorien.
const legacy = {
  '/dessert': '/speisekarte/#dessert',
  '/pizza': '/speisekarte/#pizza',
  '/party-pizza': '/speisekarte/#party-pizza',
  '/pasta': '/speisekarte/#pasta',
  '/insalatone': '/speisekarte/#salate',
  '/salate': '/speisekarte/#salate',
  '/panini-pizzabroetchen': '/speisekarte/#pizzabroetchen',
  '/pizzabroetchen': '/speisekarte/#pizzabroetchen',
  '/doener': '/speisekarte/#doener',
  '/falafel': '/speisekarte/#falafel',
  '/snacks': '/speisekarte/#snacks',
  '/saucen': '/speisekarte/#saucen',
  '/drinks': '/speisekarte/#getraenke',
  '/getraenke': '/speisekarte/#getraenke',
  '/warenkorb': '/kasse/',
  '/kontakt-2': '/kontakt/',
};

export default defineConfig({
  site: SITE,
  trailingSlash: 'ignore',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    sitemap({
      filter: (page) => !/\/(kasse|404)\/?$/.test(page) && !Object.keys(legacy).some((p) => page.endsWith(`${p}/`)),
    }),
  ],
  redirects: Object.fromEntries(Object.entries(legacy).map(([from, to]) => [from, { status: 301, destination: to }])),
  build: {
    inlineStylesheets: 'always',
    format: 'directory',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  devToolbar: { enabled: false },
  server: { host: true },
});
