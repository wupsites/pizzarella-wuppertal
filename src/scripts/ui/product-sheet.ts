/**
 * Produkt-Sheet: Größe, Auswahl (Saucen, Dressing, Extras), Anmerkung, Menge.
 * Bottom-Sheet auf dem Handy, zentriertes Fenster am Desktop.
 */
import { formatEuro, lineKey, PricingError, type LineInput } from '../../lib/pricing.ts';
import { choicePrice, type ClientProduct } from '../../lib/catalog.ts';
import { iconSvg } from '../../lib/icons.ts';
import { cart } from '../store.ts';
import { categoryName, data, product } from '../data.ts';
import { closeDialog, enhanceDialog, openDialog } from './dialog.ts';
import { feedbackAdded, isPizza } from './quick-add.ts';
import { flyToCart } from '../pizza/peel.ts';
import { esc } from './util.ts';

let dialog: HTMLDialogElement | null = null;
let current: ClientProduct | null = null;
let editingKey: string | null = null;
let qty = 1;

const iconFor = (catId: string) => data().categories.find((c) => c.id === catId)?.icon ?? 'pizza';

function sizeViz(p: ClientProduct): string {
  // Fläche Ø 25 vs. Ø 30 cm sichtbar machen – reine Geometrie, keine Behauptung
  const klein = p.variants.find((v) => v.id === 'klein');
  const gross = p.variants.find((v) => v.id === 'gross');
  if (!klein || !gross) return '';
  const pct = Math.round(((30 * 30) / (25 * 25) - 1) * 100);
  const diff = gross.price - klein.price;
  return `<div class="size-viz" aria-hidden="true">
    <svg viewBox="0 0 120 64"><circle cx="30" cy="34" r="25" class="sv-k"/><circle cx="88" cy="32" r="30" class="sv-g"/></svg>
    <p><strong>Groß = ${pct} % mehr Pizza</strong> für ${formatEuro(diff)} mehr.</p>
  </div>`;
}

function groupHtml(g: ClientProduct['options'][number], selected: string[], variantId: string): string {
  const type = g.type === 'single' ? 'radio' : 'checkbox';
  const choices = g.choices.filter((c) => choicePrice(c, variantId) !== null);
  if (!choices.length) return '';
  const allFree = choices.every((c) => choicePrice(c, variantId) === 0);
  const hint = g.required ? (g.type === 'single' ? 'bitte wählen' : 'mindestens eins') : g.max ? `optional · bis zu ${g.max}` : 'optional';
  const body = `<div class="ps-choices${choices.length > 8 ? ' is-dense' : ''}">
    ${choices
      .map((c) => {
        const add = choicePrice(c, variantId) ?? 0;
        return `<label class="choice choice--sm">
          <input type="${type}" name="opt-${g.id}" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''}>
          <span class="${type === 'radio' ? 'tick' : 'box'}" aria-hidden="true"></span>
          <span class="choice-main"><span class="choice-title">${esc(c.label)}</span></span>
          <span class="choice-price price">${add ? `+${formatEuro(add)}` : allFree ? '' : 'inklusive'}</span>
        </label>`;
      })
      .join('')}
    </div>`;
  const legend = `<legend><span class="h4">${esc(g.label)}</span> <span class="label muted">${hint}</span></legend>`;
  // lange, optionale Listen (Extra-Zutaten) einklappen
  if (!g.required && choices.length > 6) {
    const n = selected.length;
    return `<details class="ps-more" data-group-wrap="${g.id}" ${n ? 'open' : ''}><summary><span>${esc(g.label)}${n ? ` <span class="label muted">${n} gewählt</span>` : ''}</span>${iconSvg('chevron-down')}</summary>
      <fieldset class="ps-group" data-group="${g.id}">${legend.replace('<legend>', '<legend class="sr-only">')}${body}</fieldset></details>`;
  }
  return `<fieldset class="ps-group" data-group="${g.id}">${legend}${body}</fieldset>`;
}

function renderGroups(p: ClientProduct, variantId: string, sel: Record<string, string[]>) {
  const host = dialog?.querySelector<HTMLElement>('[data-ps-groups]');
  if (host) host.innerHTML = p.options.map((g) => groupHtml(g, sel[g.id] ?? [], variantId)).join('');
}

function codesHtml(p: ClientProduct): string {
  const legend = data().legend ?? {};
  const a = (p.allergens ?? []).map((c) => `${c} = ${legend[c] ?? '?'}`);
  const z = (p.additives ?? []).map((c) => `${c} = ${legend[c] ?? '?'}`);
  const listed = a.length || z.length ? `<span>${a.length ? `<strong>Allergene:</strong> ${esc(a.join(', '))}. ` : ''}${z.length ? `<strong>Zusatzstoffe:</strong> ${esc(z.join(', '))}. ` : ''}` : '<span>';
  return `<p class="ps-allergen muted">${iconSvg('info')}${listed}Angaben laut Betrieb – bei Allergien bitte vorher anrufen: <a href="tel:${data().phone.e164}">${esc(data().phone.display)}</a>. <a href="/allergene/">Legende</a></span></p>`;
}

function readSelection(form: HTMLFormElement): { variantId: string; options: Record<string, string[]>; note: string } {
  const fd = new FormData(form);
  const options: Record<string, string[]> = {};
  for (const g of current?.options ?? []) {
    const vals = fd.getAll(`opt-${g.id}`).map(String);
    if (vals.length) options[g.id] = vals;
  }
  return {
    variantId: String(fd.get('variant') ?? current?.variants[0].id ?? 'std'),
    options,
    note: String(fd.get('note') ?? ''),
  };
}

function unitPrice(form: HTMLFormElement): number {
  if (!current) return 0;
  const sel = readSelection(form);
  const v = current.variants.find((x) => x.id === sel.variantId) ?? current.variants[0];
  let sum = v.price;
  for (const g of current.options)
    for (const id of sel.options[g.id] ?? []) {
      const c = g.choices.find((x) => x.id === id);
      if (c) sum += choicePrice(c, v.id) ?? 0;
    }
  return sum;
}

function updateTotal() {
  if (!dialog || !current) return;
  const form = dialog.querySelector<HTMLFormElement>('form');
  if (!form) return;
  const total = unitPrice(form) * qty;
  const out = dialog.querySelector('[data-ps-total]');
  if (out) out.textContent = formatEuro(total);
  const q = dialog.querySelector('[data-ps-qty]');
  if (q) q.textContent = String(qty);
  const dec = dialog.querySelector<HTMLButtonElement>('[data-ps-dec]');
  if (dec) dec.disabled = qty <= 1;
}

function render(p: ClientProduct, preset?: LineInput) {
  if (!dialog) return;
  const variant = preset?.variantId ?? p.variants[0].id;
  const sel = preset?.options ?? {};
  const multiVariant = p.variants.length > 1;
  const body = dialog.querySelector<HTMLElement>('[data-ps-body]');
  if (!body) return;
  body.innerHTML = `
    <div class="ps-top">
      <span class="ps-glyph" aria-hidden="true">${iconSvg(iconFor(p.categoryId))}</span>
      <p class="label muted">${esc(categoryName(p.categoryId))}</p>
      <h2 class="d3" id="ps-title">${esc(p.name)}</h2>
      ${p.description ? `<p class="ps-desc">${esc(p.description)}</p>` : ''}
      ${p.tags?.length ? `<p class="ps-tags">${p.tags.map((t) => `<span class="tag tag--${t}">${iconSvg(t === 'scharf' ? 'flame' : 'leaf')}${t}</span>`).join('')}</p>` : ''}
    </div>
    ${
      multiVariant
        ? `<fieldset class="ps-group"><legend><span class="h4">${p.categoryId === 'getraenke' ? 'Größe' : 'Größe'}</span></legend>
          <div class="ps-variants">${p.variants
            .map(
              (v) => `<label class="choice">
                <input type="radio" name="variant" value="${v.id}" ${v.id === variant ? 'checked' : ''}>
                <span class="tick" aria-hidden="true"></span>
                <span class="choice-main"><span class="choice-title">${esc(v.label)}</span>${v.detail ? `<span class="choice-sub">${esc(v.detail)}</span>` : ''}</span>
                <span class="choice-price price">${formatEuro(v.price)}${v.deposit ? `<small> zzgl. ${formatEuro(v.deposit)} Pfand</small>` : ''}</span>
              </label>`,
            )
            .join('')}</div>
          ${sizeViz(p)}
        </fieldset>`
        : `<input type="hidden" name="variant" value="${p.variants[0].id}"><p class="ps-single price">${formatEuro(p.variants[0].price)}${p.variants[0].deposit ? ` <small class="muted">zzgl. ${formatEuro(p.variants[0].deposit)} Pfand</small>` : ''}</p>`
    }
    <div data-ps-groups></div>
    <div class="field ps-note${p.noteRequired ? ' is-required' : ''}">
      <label for="ps-note">${p.noteRequired ? esc(p.notePrompt ?? 'Anmerkung') : 'Anmerkung <span class="opt">(optional)</span>'}</label>
      <textarea class="textarea" id="ps-note" name="note" maxlength="140" rows="2" ${p.noteRequired ? 'required' : ''} placeholder="${p.noteRequired ? 'z. B. Salami' : 'z. B. ohne Zwiebeln'}">${esc(preset?.note ?? '')}</textarea>
    </div>
    ${codesHtml(p)}
    <p class="ps-error" role="alert" hidden></p>`;
  renderGroups(p, variant, sel);
  qty = preset?.qty ?? 1;
  const btnLabel = dialog.querySelector('[data-ps-label]');
  if (btnLabel) btnLabel.textContent = editingKey ? 'Übernehmen' : 'In den Warenkorb';
  updateTotal();
}

export function openProduct(id: string, opener?: HTMLElement | null, preset?: LineInput, key?: string) {
  const p = product(id);
  if (!p || !dialog) return;
  current = p;
  editingKey = key ?? null;
  render(p, preset);
  const head = dialog.querySelector<HTMLElement>('[data-ps-head-title]');
  if (head) head.textContent = p.name;
  dialog.classList.remove('is-scrolled');
  openDialog(dialog, opener);
  dialog.querySelector<HTMLElement>('.sheet-body')?.scrollTo(0, 0);
}

export function initProductSheet() {
  dialog = document.getElementById('product-sheet') as HTMLDialogElement | null;
  if (!dialog) return;
  enhanceDialog(dialog);
  const form = dialog.querySelector<HTMLFormElement>('form');
  if (!form) return;

  const body = dialog.querySelector<HTMLElement>('.sheet-body');
  body?.addEventListener(
    'scroll',
    () => dialog?.classList.toggle('is-scrolled', (body?.scrollTop ?? 0) > 70),
    { passive: true },
  );

  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'variant' && current) {
      const sel = readSelection(form);
      renderGroups(current, sel.variantId, sel.options);
    }
    updateTotal();
  });
  dialog.querySelector('[data-ps-inc]')?.addEventListener('click', () => {
    qty = Math.min(50, qty + 1);
    updateTotal();
  });
  dialog.querySelector('[data-ps-dec]')?.addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    updateTotal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!current || !dialog) return;
    const sel = readSelection(form);
    const err = dialog.querySelector<HTMLElement>('.ps-error');
    const input: LineInput = { productId: current.id, variantId: sel.variantId, options: sel.options, qty, note: sel.note };
    try {
      if (editingKey) {
        const index = cart.indexOf(editingKey);
        const old = cart.remove(editingKey);
        try {
          cart.add(input);
        } catch (ex) {
          if (old) cart.restore(old, index);
          throw ex;
        }
      } else {
        cart.add(input);
      }
      if (err) err.hidden = true;
      const name = current.name;
      const v = current.variants.find((x) => x.id === sel.variantId);
      const from = (dialog.querySelector('.ps-top') ?? form).getBoundingClientRect();
      closeDialog(dialog);
      feedbackAdded(name, v && v.id !== 'std' ? v.label : '', null, lineKey(input));
      if (!editingKey && isPizza(current.categoryId)) flyToCart(from);
    } catch (ex) {
      if (err) {
        err.textContent = ex instanceof PricingError ? ex.message : 'Das hat nicht geklappt. Bitte nochmal versuchen.';
        err.hidden = false;
        err.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  // „Ändern“ aus dem Warenkorb
  document.addEventListener('product:edit', (e) => {
    const { key, productId } = (e as CustomEvent<{ key: string; productId: string }>).detail;
    const raw = cart.raw().lines.find((l) => lineKey(l) === key);
    if (raw) openProduct(productId, document.activeElement as HTMLElement, raw, key);
  });

  document.addEventListener('product:open', (e) => {
    const { id, variant, opener } = (e as CustomEvent<{ id: string; variant?: string; opener?: HTMLElement }>).detail;
    openProduct(id, opener, variant ? { productId: id, variantId: variant, qty: 1 } : undefined);
  });

  // Klick auf Produktnamen / „Auswählen“
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-open-product]');
    if (!t) return;
    e.preventDefault();
    openProduct(t.dataset.openProduct ?? '', t, t.dataset.variant ? { productId: t.dataset.openProduct ?? '', variantId: t.dataset.variant, qty: 1 } : undefined);
  });
}
