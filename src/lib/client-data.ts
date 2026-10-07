/**
 * Daten, die der Browser für Warenkorb, Suche und Öffnungsstatus braucht.
 * Wird als JSON-Dateninsel in jede Seite gerendert (ohne interne Prüfvermerke).
 */
import { toClientCatalog, type ClientCatalog } from './catalog.ts';
import type { HoursConfig } from './hours.ts';
import type { Zone } from './pricing.ts';
import type { SiteData } from '../data/load.ts';

export interface ClientData extends ClientCatalog {
  hours: HoursConfig;
  phone: { display: string; e164: string };
  ordering: {
    online: boolean;
    defaultMode: 'delivery' | 'pickup';
    modes: { delivery: boolean; pickup: boolean };
    zones: Zone[];
    zonesConfigured: boolean;
    minOrderExclude: string[];
    allowPreorder: boolean;
    slotMinutes: number;
    crossSell: Record<string, string[]>;
  };
  legend: Record<string, string>;
}

export function buildClientData(site: SiteData): ClientData {
  const { business, ordering, zones } = site;
  return {
    ...toClientCatalog(site.catalog),
    hours: {
      weekly: business.hours.weekly,
      lastOrderMinutesBeforeClose: business.hours.lastOrderMinutesBeforeClose,
      exceptions: business.hours.exceptions,
    },
    phone: { display: business.phone.display, e164: business.phone.e164 },
    ordering: {
      online: ordering.online,
      defaultMode: ordering.defaultMode,
      modes: { delivery: ordering.modes.delivery.enabled, pickup: ordering.modes.pickup.enabled },
      zones,
      zonesConfigured: zones.length > 0,
      minOrderExclude: ordering.minOrderExcludeCategories,
      allowPreorder: ordering.allowPreorder,
      slotMinutes: ordering.preorderSlotMinutes,
      crossSell: ordering.crossSell,
    },
    legend: Object.fromEntries([...site.allergens.allergens, ...site.allergens.additives].map((a) => [a.code, a.label])),
  };
}

/** sicher in <script type="application/json"> einbettbar */
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');
}
