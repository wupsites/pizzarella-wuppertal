/** Liest die JSON-Dateninsel (#site-data) einmalig ein. */
import type { ClientData } from '../lib/client-data.ts';
import { hydrateClientProducts, type ClientProduct } from '../lib/catalog.ts';

let cache: ClientData | null = null;
let list: ClientProduct[] | null = null;
let index: Map<string, ClientProduct> | null = null;

export function data(): ClientData {
  if (!cache) {
    const el = document.getElementById('site-data');
    cache = el ? (JSON.parse(el.textContent || '{}') as ClientData) : ({ products: [], categories: [], groups: {} } as unknown as ClientData);
  }
  return cache;
}

export function products(): ClientProduct[] {
  if (!list) list = hydrateClientProducts(data());
  return list;
}

export function product(id: string): ClientProduct | undefined {
  if (!index) index = new Map(products().map((p) => [p.id, p]));
  return index.get(id);
}

export function categoryName(id: string): string {
  return data().categories.find((c) => c.id === id)?.name ?? '';
}
