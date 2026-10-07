/**
 * Zentrale Datenquelle für Seiten und API (Build/Server).
 * Inhalte werden ausschließlich in den JSON-Dateien dieses Ordners gepflegt.
 */
import business from './business.json';
import ordering from './ordering.json';
import allergens from './allergens.json';
import reviews from './reviews.json';
import promotions from './promotions.json';
import home from './home.json';
import options from './options.json';
import { loadSiteData } from './load.ts';

const menuFiles = import.meta.glob<{ default: unknown }>('./menu/*.json', { eager: true });

export const site = loadSiteData({
  business,
  options,
  ordering,
  allergens,
  reviews,
  promotions,
  home,
  categories: Object.entries(menuFiles).map(([path, mod]) => ({ file: path.split('/').pop() ?? path, data: mod.default })),
});

export const { catalog, zones } = site;
export default site;
