/** Lieferung/Abholung: alle Umschalter der Seite synchron halten. */
import { cart } from '../store.ts';

export function initModeToggles() {
  document.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.matches('[data-mode-input]') || input.closest('[data-cart-view]')) return;
    cart.setMode(input.value as 'delivery' | 'pickup');
  });
  cart.subscribe((snap) => {
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-mode-input]')) {
      input.checked = input.value === snap.mode;
    }
    document.documentElement.dataset.mode = snap.mode;
    for (const el of document.querySelectorAll<HTMLElement>('[data-mode-text]')) {
      el.textContent = snap.mode === 'delivery' ? (el.dataset.delivery ?? '') : (el.dataset.pickup ?? '');
    }
  });
}
