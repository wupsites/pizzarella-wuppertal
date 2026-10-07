/** Kasse: Zusammenfassung, Formular-Validierung, Absenden, Bestätigung. */
import { cart, type Snapshot } from './store.ts';
import { data } from './data.ts';
import { formatEuro } from '../lib/pricing.ts';
import { iconSvg } from '../lib/icons.ts';
import { announce, esc } from './ui/util.ts';

const root = document.querySelector<HTMLElement>('[data-checkout]');
const form = document.querySelector<HTMLFormElement>('[data-co-form]');
if (root && form) init(root, form);

interface Availability {
  available: boolean;
  accepting: boolean;
  opensAt: string | null;
  opensDay: string | null;
  slots: { value: string; label: string }[];
}

function init(root: HTMLElement, form: HTMLFormElement) {
  const shownAt = Date.now();
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const summary = $('[data-co-summary]');
  const totalBtn = $('[data-co-total]');
  const totalSum = $('[data-co-total-sum]');
  const errorsBox = $('[data-co-errors]');
  const submit = $<HTMLButtonElement>('[data-co-submit]');
  const slotSel = $<HTMLSelectElement>('#co-slot');
  const slotField = $('[data-field="time"]');
  const zipInput = $<HTMLInputElement>('#co-zip');
  const zipOk = $('.co-zip-ok');
  const asapSub = $('[data-asap-sub]');
  const sumDetails = $<HTMLDetailsElement>('[data-sum-details]');
  let avail: Availability | null = null;
  let sending = false;

  if (sumDetails && window.matchMedia('(max-width: 1023px)').matches) sumDetails.open = false;

  // ---- Zusammenfassung ----
  const renderSummary = (snap: Snapshot) => {
    const empty = snap.lines.length === 0;
    const main = $('[data-co-main]');
    const emptyBox = $('[data-co-empty]');
    const done = $('[data-co-done]');
    if (done && !done.hidden) return;
    if (main) main.hidden = empty;
    if (emptyBox) emptyBox.hidden = !empty;
    if (empty || !summary) return;
    const t = snap.totals;
    const rows = snap.lines
      .map(
        (l) => `<li class="cs-line"><span class="cs-q">${l.qty}×</span><span class="cs-n"><strong>${esc(l.name)}</strong>${
          l.variantLabel ? `<span>${esc(l.variantLabel)}</span>` : ''
        }${l.optionLabels.length ? `<span>+ ${esc(l.optionLabels.join(', '))}</span>` : ''}${l.note ? `<span>„${esc(l.note)}“</span>` : ''}</span><span class="cs-p price">${formatEuro(l.total)}</span></li>`,
      )
      .join('');
    let min = '';
    if (snap.mode === 'delivery' && t.minOrder !== null && t.missingForMin > 0) {
      min = `<p class="notice notice--warn cs-min">${iconSvg('info')}<span>Noch <strong>${formatEuro(t.missingForMin)}</strong> bis zum Mindestbestellwert von ${formatEuro(t.minOrder)}${
        data().ordering.minOrderExclude.length ? ' (Getränke zählen nicht mit)' : ''
      }. <a href="/speisekarte/">Noch was dazu?</a></span></p>`;
    }
    summary.innerHTML = `<ul class="cs-lines" role="list">${rows}</ul>
      <a class="link-btn cs-edit" href="/speisekarte/">${iconSvg('arrow-left')}Bestellung ändern</a>
      ${min}
      <dl class="totals cs-totals">
        <div><dt>Zwischensumme</dt><dd>${formatEuro(t.subtotal)}</dd></div>
        ${snap.mode === 'delivery' ? `<div><dt>Liefergebühr</dt><dd>${t.deliveryFee === null ? 'nach PLZ' : t.deliveryFee === 0 ? 'kostenlos' : formatEuro(t.deliveryFee)}</dd></div>` : ''}
        <div class="total"><dt>Gesamt</dt><dd>${formatEuro(t.total)}</dd></div>
      </dl>
      ${t.deposit ? `<p class="cs-dep muted">inkl. ${formatEuro(t.deposit)} Pfand</p>` : ''}`;
    if (totalBtn) totalBtn.textContent = formatEuro(t.total);
    if (totalSum) totalSum.textContent = formatEuro(t.total);
    // Lieferadresse nur bei Lieferung
    root.querySelectorAll<HTMLElement>('[data-delivery-only]').forEach((el) => (el.hidden = snap.mode !== 'delivery'));
    root.querySelectorAll<HTMLElement>('[data-step-n]').forEach((el, i) => (el.textContent = String((snap.mode === 'delivery' ? 4 : 3) + i)));
  };
  cart.subscribe((snap) => renderSummary(snap));

  // ---- PLZ ----
  const checkZip = () => {
    if (!zipInput || !zipOk) return;
    zipInput.value = zipInput.value.replace(/\D/g, '').slice(0, 5);
    const zip = zipInput.value;
    const zone = data().ordering.zones.find((z) => z.zips.includes(zip));
    if (zip.length === 5 && zone) {
      zipOk.textContent = `✓ Wir liefern nach ${zip}.`;
      zipOk.classList.add('is-ok');
      clearError('zip');
    } else {
      zipOk.textContent = '';
      zipOk.classList.remove('is-ok');
    }
    cart.setZip(zip.length === 5 ? zip : '');
  };
  zipInput?.addEventListener('input', checkZip);
  if (zipInput && cart.get().zip) {
    zipInput.value = cart.get().zip;
    checkZip();
  }

  // ---- Zeit ----
  const syncWhen = () => {
    const later = (form.elements.namedItem('when') as RadioNodeList | null)?.value === 'later';
    if (slotField) slotField.hidden = !later;
  };
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'when') syncWhen();
    if (t.name && t.closest('.field')) clearError(t.closest<HTMLElement>('.field')?.dataset.field ?? '');
  });

  fetch('/api/order', { headers: { accept: 'application/json' } })
    .then((r) => r.json() as Promise<Availability>)
    .then((a) => {
      avail = a;
      applyAvailability();
    })
    .catch(() => {
      /* offline – Absenden zeigt dann einen Fehler */
    });

  function applyAvailability() {
    if (!avail) return;
    const unavailable = $('[data-co-unavailable]');
    if (unavailable) unavailable.hidden = avail.available;
    if (slotSel) {
      slotSel.innerHTML = avail.slots.map((s) => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('');
    }
    const asap = form.querySelector<HTMLInputElement>('input[name="when"][value="asap"]');
    const later = form.querySelector<HTMLInputElement>('input[name="when"][value="later"]');
    const laterLabel = later?.closest<HTMLElement>('label');
    if (laterLabel) laterLabel.hidden = avail.slots.length === 0;
    if (asap) {
      asap.disabled = !avail.accepting;
      asap.closest('label')?.classList.toggle('is-disabled', !avail.accepting);
      if (asapSub) asapSub.textContent = avail.accepting ? 'Wir legen direkt los.' : `Gerade geschlossen${avail.opensAt ? ` – wir öffnen ${avail.opensDay} um ${avail.opensAt} Uhr` : ''}.`;
      if (!avail.accepting && later && avail.slots.length) later.checked = true;
    }
    syncWhen();
    if (submit) {
      const blocked = !avail.available || (!avail.accepting && avail.slots.length === 0);
      submit.disabled = blocked;
    }
  }

  // ---- Validierung ----
  type Err = { field: string; message: string };
  function setError(field: string, message: string) {
    const f = root.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!f) return;
    f.classList.add('has-error');
    const span = f.querySelector('.field-error span');
    if (span) span.textContent = message;
    f.querySelector('input, select, textarea')?.setAttribute('aria-invalid', 'true');
  }
  function clearError(field: string) {
    const f = root.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!f) return;
    f.classList.remove('has-error');
    f.querySelector('input, select, textarea')?.removeAttribute('aria-invalid');
  }
  form.addEventListener('input', (e) => {
    const f = (e.target as HTMLElement).closest<HTMLElement>('.field');
    if (f?.classList.contains('has-error')) clearError(f.dataset.field ?? '');
  });

  function validate(): Err[] {
    const v = (n: string) => ((form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '').trim();
    const errs: Err[] = [];
    const mode = cart.get().mode;
    if (v('name').length < 2) errs.push({ field: 'name', message: 'Bitte gib deinen Namen an.' });
    if (!/^[+0-9][0-9 /()-]{5,}$/.test(v('phone'))) errs.push({ field: 'phone', message: 'Bitte gib eine Telefonnummer an, unter der wir dich erreichen.' });
    if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) errs.push({ field: 'email', message: 'Die E-Mail-Adresse sieht nicht richtig aus.' });
    if (mode === 'delivery') {
      if (v('street').length < 2) errs.push({ field: 'street', message: 'Bitte gib die Straße an.' });
      if (!v('houseNumber')) errs.push({ field: 'houseNumber', message: 'Bitte gib die Hausnummer an.' });
      const zip = v('zip');
      if (!/^\d{5}$/.test(zip)) errs.push({ field: 'zip', message: 'Bitte gib eine fünfstellige PLZ an.' });
      else if (data().ordering.zones.length && !data().ordering.zones.some((z) => z.zips.includes(zip)))
        errs.push({ field: 'zip', message: `Nach ${zip} liefern wir leider nicht – du kannst aber abholen.` });
      const t = cart.get().totals;
      if (t.minOrder !== null && t.missingForMin > 0) errs.push({ field: '', message: `Für die Lieferung fehlen noch ${formatEuro(t.missingForMin)} bis zum Mindestbestellwert.` });
    }
    const when = (form.elements.namedItem('when') as RadioNodeList | null)?.value;
    if (when === 'later' && !slotSel?.value) errs.push({ field: 'time', message: 'Bitte wähle eine Uhrzeit.' });
    if (!when) errs.push({ field: 'time', message: 'Bitte wähle, wann du dein Essen möchtest.' });
    return errs;
  }

  function showErrors(errs: Err[], title = 'Bitte prüfe noch:') {
    if (!errorsBox) return;
    root.querySelectorAll('.field.has-error').forEach((f) => clearError((f as HTMLElement).dataset.field ?? ''));
    errs.forEach((e) => e.field && setError(e.field, e.message));
    errorsBox.innerHTML = `<p>${esc(title)}</p><ul>${errs
      .map((e) => {
        const id = e.field ? root.querySelector(`[data-field="${e.field}"] input, [data-field="${e.field}"] select`)?.id : '';
        return `<li>${id ? `<a href="#${id}">${esc(e.message)}</a>` : esc(e.message)}</li>`;
      })
      .join('')}</ul>`;
    errorsBox.hidden = false;
    errorsBox.focus();
  }

  // ---- Absenden ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const errs = validate();
    if (errs.length) return showErrors(errs);
    if (errorsBox) errorsBox.hidden = true;

    const v = (n: string) => ((form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '').trim();
    const snap = cart.get();
    const when = (form.elements.namedItem('when') as RadioNodeList | null)?.value;
    const payload = {
      mode: snap.mode,
      items: cart.raw().lines,
      customer: { name: v('name'), phone: v('phone'), email: v('email') },
      address: snap.mode === 'delivery' ? { street: v('street'), houseNumber: v('houseNumber'), zip: v('zip'), city: v('city') || 'Wuppertal', hint: v('hint') } : undefined,
      time: when === 'later' ? slotSel?.value : 'asap',
      payment: v('payment') || ((form.elements.namedItem('payment') as RadioNodeList | null)?.value ?? ''),
      note: v('note'),
      website: v('website'),
      elapsed: Date.now() - shownAt,
      clientTotal: snap.totals.total,
    };

    sending = true;
    submit?.classList.add('is-loading');
    submit?.setAttribute('aria-busy', 'true');
    announce('Bestellung wird gesendet …');
    try {
      const send = () => fetch('/api/order', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
      let res = await send();
      let out = (await res.json()) as { ok: boolean; code?: string; number?: string; message?: string; field?: string; time?: string; total?: number };
      if (out.code === 'TOO_FAST') {
        // Schutz gegen Bots hat zu früh gegriffen (z. B. Autofill) – kurz warten und erneut senden
        await new Promise((r) => setTimeout(r, 1300));
        payload.elapsed = Date.now() - shownAt;
        res = await send();
        out = (await res.json()) as typeof out;
      }
      if (!res.ok || !out.ok) {
        const map: Record<string, string> = { zip: 'zip', street: 'street', time: 'time', phone: 'phone', name: 'name', email: 'email', houseNumber: 'houseNumber' };
        showErrors([{ field: map[out.field ?? ''] ?? '', message: out.message ?? 'Das hat leider nicht geklappt.' }], 'Die Bestellung wurde noch nicht abgeschickt:');
        return;
      }
      // Erfolg
      const first = v('name').split(/\s+/)[0];
      const done = $('[data-co-done]');
      const main = $('[data-co-main]');
      const nr = $('[data-done-nr]');
      const title = $('[data-done-title]');
      const text = $('[data-done-text]');
      if (nr) nr.textContent = out.number ?? '';
      if (title) title.textContent = `Danke, ${first}!`;
      if (text)
        text.textContent =
          snap.mode === 'delivery'
            ? `Deine Bestellung über ${formatEuro(out.total ?? snap.totals.total)} ist bei uns eingegangen. Wir liefern an ${v('street')} ${v('houseNumber')} – ${out.time ?? 'so schnell wie möglich'}.`
            : `Deine Bestellung über ${formatEuro(out.total ?? snap.totals.total)} ist bei uns eingegangen. Abholen kannst du sie in der Friedrich-Engels-Allee 117 – ${out.time ?? 'so schnell wie möglich'}.`;
      cart.clear();
      if (main) main.hidden = true;
      root.querySelector<HTMLElement>('.co-head')!.hidden = true;
      if (done) {
        done.hidden = false;
        done.focus();
        window.scrollTo({ top: 0 });
      }
      announce(`Bestellung ${out.number} ist eingegangen.`);
    } catch {
      showErrors([{ field: '', message: `Keine Verbindung. Bitte prüf dein Internet und versuch es nochmal – oder ruf uns an: ${data().phone.display}.` }], 'Die Bestellung wurde noch nicht abgeschickt:');
    } finally {
      sending = false;
      submit?.classList.remove('is-loading');
      submit?.removeAttribute('aria-busy');
    }
  });
}
