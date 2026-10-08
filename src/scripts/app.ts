/**
 * Globales Verhalten auf jeder Seite: Status, Warenkorb, Produkt-Sheet,
 * Toasts, Menü, Reveals. Kein Framework – nur kleine, gezielte Module.
 */
import { initStatus } from './ui/status.ts';
import { initCartViews } from './ui/cart-view.ts';
import { initProductSheet } from './ui/product-sheet.ts';
import { initQuickAdd } from './ui/quick-add.ts';
import { initModeToggles } from './ui/mode.ts';
import { initHeader, initReveals } from './ui/motion.ts';
import { closeDialog, enhanceDialog, openDialog } from './ui/dialog.ts';

document.documentElement.classList.add('js');

initStatus();
initModeToggles();
initCartViews();
initProductSheet();
initQuickAdd();
initHeader();
initReveals();

// Warenkorb-Drawer
const cartSheet = document.getElementById('cart-sheet') as HTMLDialogElement | null;
if (cartSheet) {
  enhanceDialog(cartSheet);
  const open = (opener?: HTMLElement | null) => {
    // Desktop-Speisekarte hat eine feste Warenkorb-Spalte – dorthin scrollen statt Drawer
    const panel = document.querySelector<HTMLElement>('[data-cart-panel]');
    if (panel && panel.offsetParent !== null && window.matchMedia('(min-width: 1200px)').matches) {
      panel.querySelector<HTMLElement>('h2')?.focus();
      panel.classList.remove('flash');
      void panel.offsetWidth;
      panel.classList.add('flash');
      return;
    }
    openDialog(cartSheet, opener);
  };
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cart-open]');
    if (t) {
      e.preventDefault();
      open(t);
    }
  });
  document.addEventListener('cart:open', () => open(null));
  // Links im Drawer (z. B. zur Kasse) schließen ihn sauber
  cartSheet.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href]');
    if (a) cartSheet.close();
  });
}

// Mobiles Seitenmenü
const siteMenu = document.getElementById('site-menu') as HTMLDialogElement | null;
if (siteMenu) {
  enhanceDialog(siteMenu);
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-menu-open]');
    if (t) openDialog(siteMenu, t);
  });
  siteMenu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a[href]')) closeDialog(siteMenu);
  });
}

// Messanzeige für echte Geräte (nur mit ?fps in der Adresse)
if (/[?&]fps\b/.test(location.search)) void import('./ui/fps.ts').then((m) => m.startFps());
