/**
 * Warenkorb-Ansicht – rendert in jeden [data-cart-view]-Container
 * (Drawer auf allen Seiten, feste Spalte auf der Speisekarte am Desktop).
 */
import { formatEuro } from '../../lib/pricing.ts';
import { iconSvg } from '../../lib/icons.ts';
import { cart, type Snapshot } from '../store.ts';
import { data, product } from '../data.ts';
import { status } from './status.ts';
import { toast } from './toast.ts';
import { announce, esc, pulse, withFocus } from './util.ts';

let uid = 0;

function modeToggle(snap: Snapshot, name: string): string {
  const d = data();
  if (!d.ordering.modes.delivery || !d.ordering.modes.pickup) return '';
  return `<div class="segmented cart-mode" role="radiogroup" aria-label="Lieferung oder Abholung">
    <input type="radio" id="${name}-d" name="${name}" value="delivery" data-mode-input ${snap.mode === 'delivery' ? 'checked' : ''}>
    <label for="${name}-d">${iconSvg('scooter')}Lieferung</label>
    <input type="radio" id="${name}-p" name="${name}" value="pickup" data-mode-input ${snap.mode === 'pickup' ? 'checked' : ''}>
    <label for="${name}-p">${iconSvg('store')}Abholung</label>
  </div>`;
}

function lineMeta(l: Snapshot['lines'][number]): string {
  const parts: string[] = [];
  if (l.variantLabel) parts.push(esc(l.variantLabel));
  if (l.optionLabels.length) parts.push(esc(l.optionLabels.join(', ')));
  if (l.note) parts.push(`„${esc(l.note)}“`);
  if (l.deposit) parts.push(`zzgl. ${formatEuro(l.depositTotal)} Pfand`);
  if (l.qty > 1) parts.push(`${formatEuro(l.unit)} pro Stück`);
  return parts.join(' · ');
}

function pairs(snap: Snapshot): string {
  if (!snap.lines.length) return '';
  const d = data();
  const inCart = new Set(snap.lines.map((l) => l.productId));
  const cats = [...new Set(snap.lines.map((l) => product(l.productId)?.categoryId ?? ''))];
  const ids: string[] = [];
  for (const c of [...cats, 'default']) for (const id of d.ordering.crossSell[c] ?? []) if (!inCart.has(id) && !ids.includes(id)) ids.push(id);
  const picks = ids
    .map((id) => product(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 3);
  if (!picks.length) return '';
  return `<section class="cart-pairs" aria-labelledby="pairs-${uid}">
    <h3 class="label" id="pairs-${uid}">Passt dazu</h3>
    <div class="pairs">${picks
      .map((p) => {
        const v = p.variants[0];
        const needsChoice = p.variants.length > 1 || p.options.some((g) => g.required);
        return `<div class="pair"><span class="pair-name">${esc(p.name)}${v.detail ? ` <span class="muted">${esc(v.label)}</span>` : ''}</span>
          <span class="price">${formatEuro(v.price)}</span>
          <button type="button" class="add" ${needsChoice ? `data-open-product="${p.id}"` : `data-add data-product="${p.id}" data-variant="${v.id}"`} data-fk="pair-${p.id}" aria-label="${esc(p.name)} für ${formatEuro(v.price)} hinzufügen">${iconSvg('plus', 'i-plus')}${iconSvg('check', 'i-check')}</button></div>`;
      })
      .join('')}</div>
  </section>`;
}

function footer(snap: Snapshot): string {
  const d = data();
  const t = snap.totals;
  const s = status();
  const rows: string[] = [`<div><dt>Zwischensumme</dt><dd>${formatEuro(t.subtotal)}</dd></div>`];
  if (t.deposit) rows.push(`<div><dt>Pfand</dt><dd>${formatEuro(t.deposit)}</dd></div>`);
  if (snap.mode === 'delivery') {
    if (t.deliveryFee === null) rows.push(`<div><dt>Lieferung</dt><dd>PLZ an der Kasse</dd></div>`);
    else rows.push(`<div><dt>Lieferung</dt><dd>${t.deliveryFee === 0 ? 'kostenlos' : formatEuro(t.deliveryFee)}</dd></div>`);
  }
  rows.push(`<div class="total"><dt>Gesamt</dt><dd>${formatEuro(t.total)}</dd></div>`);

  let hint = '';
  if (snap.mode === 'delivery' && t.minOrder !== null && t.missingForMin > 0) {
    const pct = Math.min(100, Math.round((t.subtotal / t.minOrder) * 100));
    hint = `<div class="min-order"><p><strong>Noch ${formatEuro(t.missingForMin)}</strong> bis zum Mindestbestellwert für ${esc(snap.zip)} (${formatEuro(t.minOrder)}).</p><div class="progress" aria-hidden="true"><span style="transform:scaleX(${pct / 100})"></span></div></div>`;
  }

  let cta: string;
  if (!d.ordering.online) {
    cta = `<a class="btn btn--primary btn--lg btn--block" href="tel:${d.phone.e164}">${iconSvg('phone')}Telefonisch bestellen</a>`;
  } else if (!s.accepting && d.ordering.allowPreorder) {
    cta = `<a class="btn btn--primary btn--lg btn--block" href="/kasse/" data-fk-fallback>Vorbestellen <span class="price">· ${formatEuro(t.total)}</span>${iconSvg('arrow', 'btn-arrow')}</a>`;
  } else if (!s.accepting) {
    const when = s.open ? 'Bestellannahme geschlossen' : s.opensDay === 'heute' ? `Bestellbar ab ${s.opensAt} Uhr` : `Bestellbar ${s.opensDay} ab ${s.opensAt} Uhr`;
    cta = `<span class="btn btn--dark btn--lg btn--block" aria-disabled="true">${esc(when)}</span>`;
  } else {
    cta = `<a class="btn btn--primary btn--lg btn--block" href="/kasse/" data-fk-fallback>Zur Kasse <span class="price">· ${formatEuro(t.total)}</span>${iconSvg('arrow', 'btn-arrow')}</a>`;
  }
  return `<div class="cart-foot sheet-foot">${hint}<dl class="totals">${rows.join('')}</dl>${cta}</div>`;
}

function render(container: HTMLElement, snap: Snapshot, change?: { type: string; key?: string }) {
  uid++;
  const name = container.dataset.modeName ?? `mode-c${uid}`;
  container.dataset.modeName = name;
  const s = status();
  const closedNote =
    snap.lines.length && !s.accepting
      ? `<div class="notice notice--closed">${iconSvg('moon')}<span>${s.open ? 'Bestellannahme für heute beendet.' : 'Gerade geschlossen.'} ${
          data().ordering.allowPreorder && s.opensAt
            ? `Du kannst schon jetzt für ${s.opensDay === 'heute' ? 'heute' : esc(s.opensDay ?? '')} ab ${s.opensAt} Uhr vorbestellen.`
            : `Dein Warenkorb bleibt gespeichert${s.opensAt ? ` – ${s.opensDay === 'heute' ? 'heute' : esc(s.opensDay ?? '')} ab ${s.opensAt} Uhr kannst du bestellen` : ''}.`
        }</span></div>`
      : '';

  if (!snap.lines.length) {
    const onMenu = Boolean(document.querySelector('[data-cat-nav]'));
    container.innerHTML = `<div class="cart-body sheet-body">${modeToggle(snap, name)}
      <div class="cart-empty">${iconSvg('plate')}<p class="h4">Noch leer.</p>
      <p class="muted">${onMenu ? 'Größe antippen – schon ist die Pizza drin. Oder Döner. Oder beides.' : 'Fang mit einer Pizza an – oder einem Döner. Oder beidem.'}</p>
      ${onMenu ? '' : `<a class="btn btn--dark" href="/speisekarte/" data-fk-fallback>Zur Speisekarte${iconSvg('arrow', 'btn-arrow')}</a>`}</div></div>`;
    return;
  }

  const lines = snap.lines
    .map((l, i) => {
      const isNew = change?.type === 'add' && change.key === l.key;
      return `<li class="cart-line${isNew ? ' is-new' : ''}" data-key="${esc(l.key)}">
        <span class="cart-line-name">${esc(l.name)}</span>
        <span class="cart-line-price price">${formatEuro(l.total)}</span>
        ${lineMeta(l) ? `<span class="cart-line-meta">${lineMeta(l)}</span>` : ''}
        <div class="cart-line-actions">
          <div class="stepper" role="group" aria-label="Menge ${esc(l.name)}">
            <button type="button" data-act="dec" data-fk="dec-${i}" aria-label="${l.qty === 1 ? `${esc(l.name)} entfernen` : 'Eins weniger'}">${iconSvg(l.qty === 1 ? 'trash' : 'minus')}</button>
            <span class="qty" aria-label="${l.qty} Stück">${l.qty}</span>
            <button type="button" data-act="inc" data-fk="inc-${i}" aria-label="Eins mehr" ${l.qty >= 50 ? 'disabled' : ''}>${iconSvg('plus')}</button>
          </div>
          <button type="button" class="link-btn" data-act="edit" data-fk="edit-${i}" data-product="${esc(l.productId)}">Ändern</button>
        </div>
      </li>`;
    })
    .join('');

  container.innerHTML = `<div class="cart-body sheet-body">
      ${modeToggle(snap, name)}
      ${closedNote}
      <ul class="cart-lines" role="list" aria-label="Positionen im Warenkorb">${lines}</ul>
      ${pairs(snap)}
    </div>${footer(snap)}`;
}

export function initCartViews() {
  const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-view]'));
  cart.subscribe((snap, change) => {
    for (const c of containers) withFocus(c, () => render(c, snap, change));
    // Zähler & Summen überall
    for (const el of document.querySelectorAll<HTMLElement>('[data-cart-count]')) {
      el.textContent = String(snap.totals.count);
      el.hidden = snap.totals.count === 0;
      if (change.type === 'add') pulse(el);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-cart-total]')) el.textContent = formatEuro(snap.totals.total);
    for (const el of document.querySelectorAll<HTMLElement>('[data-cart-button]')) {
      el.setAttribute('aria-label', snap.totals.count ? `Warenkorb öffnen, ${snap.totals.count} Artikel, ${formatEuro(snap.totals.total)}` : 'Warenkorb öffnen, leer');
      el.classList.toggle('has-items', snap.totals.count > 0);
    }
    document.documentElement.dataset.cart = snap.totals.count ? 'filled' : 'empty';
  });

  for (const c of containers) {
    c.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn) return;
      const li = btn.closest<HTMLElement>('[data-key]');
      const key = li?.dataset.key;
      if (!key) return;
      const line = cart.get().lines.find((l) => l.key === key);
      if (!line) return;
      const act = btn.dataset.act;
      if (act === 'inc') {
        cart.setQty(key, line.qty + 1);
        announce(`${line.name}: ${line.qty + 1} Stück`);
      } else if (act === 'dec') {
        if (line.qty > 1) {
          cart.setQty(key, line.qty - 1);
          announce(`${line.name}: ${line.qty - 1} Stück`);
        } else {
          const index = cart.indexOf(key);
          const removed = cart.remove(key);
          announce(`${line.name} entfernt`);
          if (removed) toast(`${line.name} entfernt`, { icon: 'trash', action: { label: 'Rückgängig', run: () => cart.restore(removed, index) } });
        }
      } else if (act === 'edit') {
        document.dispatchEvent(new CustomEvent('product:edit', { detail: { key, productId: line.productId } }));
      }
    });
    c.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.matches('[data-mode-input]')) cart.setMode(input.value as 'delivery' | 'pickup');
    });
  }
}
