/** Schnell-Hinzufügen direkt aus Listen (Größen-Knöpfe, „+“). */
import { cart } from '../store.ts';
import { product } from '../data.ts';
import { formatEuro } from '../../lib/pricing.ts';
import { toast } from './toast.ts';
import { announce } from './util.ts';
import { flyToCart } from '../pizza/peel.ts';

/** Pizza-Kategorien bekommen den Ofenschieber (Getränke, Döner … nicht) */
export const isPizza = (categoryId: string) => categoryId === 'pizza' || categoryId === 'party-pizza';

export function feedbackAdded(name: string, variantLabel: string, btn: HTMLElement | null, key: string) {
  if (btn) {
    const host = btn.closest<HTMLElement>('[data-added-host]') ?? btn;
    host.classList.add('is-added');
    window.setTimeout(() => host.classList.remove('is-added'), 1400);
  }
  const snap = cart.get();
  const label = variantLabel ? `${name} (${variantLabel})` : name;
  announce(`${label} hinzugefügt. Warenkorb: ${snap.totals.count} Artikel, ${formatEuro(snap.totals.total)}.`);
  toast(`${label} ist drin.`, {
    action: {
      label: 'Rückgängig',
      run: () => {
        const line = cart.get().lines.find((l) => l.key === key);
        if (!line) return;
        if (line.qty > 1) cart.setQty(key, line.qty - 1);
        else cart.remove(key);
        announce(`${label} wieder entfernt`);
      },
    },
  });
}

export function initQuickAdd() {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-add]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.product ?? '';
    const p = product(id);
    if (!p) return;
    // Pflichtauswahl (z. B. Dressing) → Produkt-Sheet öffnen
    if (p.options.some((g) => g.required)) {
      document.dispatchEvent(new CustomEvent('product:open', { detail: { id, variant: btn.dataset.variant, opener: btn } }));
      return;
    }
    const variantId = btn.dataset.variant ?? p.variants[0].id;
    const v = p.variants.find((x) => x.id === variantId);
    try {
      const key = cart.add({ productId: id, variantId, qty: 1, options: {} });
      feedbackAdded(p.name, v && v.id !== 'std' ? v.label : '', btn, key);
      if (isPizza(p.categoryId)) flyToCart(btn.getBoundingClientRect());
    } catch {
      toast('Das hat nicht geklappt – bitte nochmal.', { icon: 'alert' });
    }
  });

  // Mehrfach-Hinzufügen (z. B. „Ganzen Bon übernehmen“)
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-add-bundle]');
    if (!btn) return;
    e.preventDefault();
    const items = JSON.parse(btn.dataset.addBundle ?? '[]') as { product: string; variant?: string; qty?: number }[];
    let n = 0;
    for (const it of items) {
      const p = product(it.product);
      if (!p) continue;
      cart.add({ productId: it.product, variantId: it.variant ?? p.variants[0].id, qty: it.qty ?? 1, options: {} });
      n += it.qty ?? 1;
    }
    const host = btn.closest<HTMLElement>('[data-added-host]') ?? btn;
    host.classList.add('is-added');
    window.setTimeout(() => host.classList.remove('is-added'), 1600);
    announce(`${n} Artikel hinzugefügt. Warenkorb: ${cart.get().totals.count} Artikel.`);
    toast(`${n} Sachen sind drin.`, {
      action: { label: 'Ansehen', run: () => document.dispatchEvent(new CustomEvent('cart:open')) },
    });
  });
}
