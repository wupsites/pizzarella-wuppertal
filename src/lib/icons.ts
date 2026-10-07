/**
 * Icon-Set (24er-Raster, 1,75er Strich, runde Enden).
 * UI-Icons + eigene Kategorie-Glyphen. Wird von Astro-Komponenten und vom
 * Browser-Code (Warenkorb, Produkt-Sheet) gleichermaßen genutzt.
 */
export const ICONS: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>',
  bag: '<path d="M5.5 8.5h13l-1.1 11.2a1.5 1.5 0 0 1-1.5 1.3H8.1a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  phone:
    '<path d="M6.8 3.5h2.4l1.6 4.2-2.1 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2.1 4.2 1.6v2.4a2.2 2.2 0 0 1-2.4 2.2C10.7 18.8 5.2 13.3 4.6 5.9a2.2 2.2 0 0 1 2.2-2.4z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
  arrow: '<path d="M4.5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19.5 12h-14M11 6l-6 6 6 6"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  trash: '<path d="M4.5 7h15M10 7V4.8h4V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  scooter:
    '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M9 17.5h5.6l2.3-7.5h2.1M16.9 10l-1.1-4.2h-2.3"/><rect x="3" y="8" width="6.5" height="5.5" rx="1"/>',
  store:
    '<path d="M4 9.5L5.5 4.5h13L20 9.5"/><path d="M4 9.5c0 1.4 1.2 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5"/><path d="M5.5 12v7.5h13V12M10 19.5v-4.5h4v4.5"/>',
  menu: '<path d="M4 8.5h16M4 15.5h16"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r=".6" fill="currentColor"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  flame:
    '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.3 2.6-5 3.4-8.4.9 1.4 1.6 2.6 1.6 4 1.4-.9 2.4-2.6 2.4-4.6 2.9 2 4.6 5.4 4.6 8.8 0 3.3-2.4 5.8-6 5.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14.5-14-.6 9.4-6.2 14-14.5 14z"/><path d="M5 19l7.5-7.5"/>',
  route: '<path d="M4 11.5L20 4l-7.5 16-1.8-7.3z"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  plate: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',

  /* ---- Kategorie-Glyphen ---- */
  pizza:
    '<path d="M4.4 6.4c4.9-2.7 10.3-2.7 15.2 0L12 21z"/><path d="M5.7 9c4.1-2 8.5-2 12.6 0"/><circle cx="10" cy="11.6" r="1.25"/><circle cx="14.3" cy="11" r="1.05"/><circle cx="12.1" cy="15.3" r="1.05"/>',
  party:
    '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M9 5.5v13M15 5.5v13M3 12h18"/><circle cx="6" cy="8.8" r=".9"/><circle cx="12" cy="15.2" r=".9"/><circle cx="18" cy="8.8" r=".9"/>',
  doener:
    '<path d="M4.5 11.2h15c0 5-3.4 8.8-7.5 8.8s-7.5-3.8-7.5-8.8z"/><path d="M5.4 11.2c.5-1.7 1.8-2.7 3.1-2.5.8-1.7 2.7-2.4 4.1-1.4 1.5-.9 3.4-.4 4.2 1.2 1.3.1 2.3 1.2 2.6 2.7"/><path d="M7.6 14.6c2.8 1.3 6 1.3 8.8 0"/>',
  lahmacun:
    '<path d="M6.6 20.4a4.9 4.9 0 0 1 0-6.9l7.2-7.2a4.9 4.9 0 0 1 6.9 6.9l-7.2 7.2a4.9 4.9 0 0 1-6.9 0z"/><circle cx="17.25" cy="9.75" r="2.3"/><circle cx="17.25" cy="9.75" r=".7"/><path d="M8.7 14.6l2.6 2.6M11.2 12.1l2.6 2.6"/>',
  falafel:
    '<circle cx="7.8" cy="15.4" r="3.6"/><circle cx="16.2" cy="15.4" r="3.6"/><circle cx="12" cy="8.3" r="3.6"/><path d="M6.6 14.6h.01M9 16.4h.01M15 14.6h.01M17.4 16.5h.01M11.2 7.6h.01M13.2 9.2h.01"/>',
  pasta:
    '<path d="M3.5 12.5h17c-.4 4.4-4.1 7.5-8.5 7.5s-8.1-3.1-8.5-7.5z"/><path d="M6.4 12.5c.5-2.1 2-3.1 3.6-2.6 1-1.7 3.1-1.9 4.4-.6 1.5-.6 3.1.4 3.3 3.2"/><path d="M14.6 9.2l4.6-6.2M17.4 2.7l2.5 1.9"/>',
  rolls:
    '<path d="M3.5 13.3c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7c0 3.3-3.8 4.7-8.5 4.7s-8.5-1.4-8.5-4.7z"/><path d="M8.4 9.6l1.6 3.1M12 8.8v3.5M15.6 9.6L14 12.7"/>',
  salad:
    '<path d="M3.5 12.5h17c-.4 4.4-4.1 7.5-8.5 7.5s-8.1-3.1-8.5-7.5z"/><path d="M7 12.5c-.6-2.6.4-4.6 2.8-5.2.4 2.3-.6 4.1-2.8 5.2zM12.2 12.5c-1.1-2.9 0-5.5 2.7-6.5.9 2.7-.1 5.2-2.7 6.5zM16.6 12.5c.1-1.9 1.4-3.3 3.1-3.4"/>',
  fries: '<path d="M6 10.2h12l-1.6 9.8H7.6z"/><path d="M8.2 10.2V5M10.6 10.2V3.6M13.4 10.2V4.4M15.8 10.2V5.8"/>',
  dessert:
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 12c.8 0 1.4-.6 1.4-1.4S12.8 9 11.7 9c-1.6 0-2.8 1.3-2.8 2.9 0 2 1.6 3.6 3.6 3.6 2.4 0 4.3-2 4.3-4.4"/>',
  dip: '<path d="M5 12.2h14l-1.4 7.4a1.5 1.5 0 0 1-1.5 1.2H7.9a1.5 1.5 0 0 1-1.5-1.2z"/><path d="M7.5 12.2c0-2 1.5-3.1 3-3 .4-1.6 1.6-2.5 3.1-2.3 1.7.2 2.8 1.6 2.6 3.2 1 .3 1.6 1.1 1.4 2.1"/>',
  drink: '<path d="M10 3h4v3.2l1.6 2.6V20a1 1 0 0 1-1 1H9.4a1 1 0 0 1-1-1V8.8L10 6.2z"/><path d="M8.4 12.2h7.2M8.4 16.2h7.2"/>',
};

export function iconSvg(name: string, cls = '', label?: string): string {
  const body = ICONS[name] ?? ICONS.info;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="i i-${name}${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}
