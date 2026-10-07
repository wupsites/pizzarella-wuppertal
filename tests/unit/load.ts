import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteData } from '../../src/data/load.ts';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data');
const json = (p: string) => JSON.parse(readFileSync(join(dataDir, p), 'utf8'));

export const site = loadSiteData({
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
