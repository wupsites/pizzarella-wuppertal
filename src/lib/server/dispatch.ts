/**
 * Zustellung einer Bestellung an den Laden. Kanäle per Umgebungsvariablen:
 *  - SMTP (ORDER_MAIL_TO …) → E-Mail mit Bon an den Laden (+ optional Kopie an Kund:in)
 *  - ORDER_WEBHOOK_URL       → JSON-POST, signiert mit ORDER_WEBHOOK_SECRET (HMAC-SHA256)
 *  - ORDER_DEV_SINK=true     → Datei in ./.orders/ (nur Entwicklung/Test)
 * Ohne konfigurierten Kanal ist Online-Bestellen bewusst deaktiviert.
 */
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PreparedOrder } from './order.ts';
import { orderText } from './order.ts';
import { formatEuro } from '../pricing.ts';

const env = (k: string) => (process.env[k] ?? '').trim();

export function channels() {
  return {
    mail: Boolean(env('SMTP_HOST') && env('ORDER_MAIL_TO')),
    webhook: Boolean(env('ORDER_WEBHOOK_URL')),
    dev: env('ORDER_DEV_SINK') === 'true',
  };
}

export function orderingAvailable(): boolean {
  const c = channels();
  return c.mail || c.webhook || c.dev;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function orderHtml(o: PreparedOrder, shop: string, forCustomer: boolean): string {
  const rows = o.lines
    .map(
      (l) => `<tr><td style="padding:6px 0;vertical-align:top;width:34px"><b>${l.qty}×</b></td><td style="padding:6px 8px 6px 0"><b>${escapeHtml(l.name)}</b>${
        l.variantLabel ? `<br><span style="color:#5c4b3f">${escapeHtml(l.variantLabel)}</span>` : ''
      }${l.optionLabels.length ? `<br><span style="color:#5c4b3f">+ ${escapeHtml(l.optionLabels.join(', '))}</span>` : ''}${
        l.note ? `<br><i>„${escapeHtml(l.note)}“</i>` : ''
      }</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${formatEuro(l.total)}</td></tr>`,
    )
    .join('');
  const addr = o.address
    ? `${escapeHtml(o.address.street)} ${escapeHtml(o.address.houseNumber)}<br>${escapeHtml(o.address.zip)} ${escapeHtml(o.address.city)}${o.address.hint ? `<br><i>${escapeHtml(o.address.hint)}</i>` : ''}`
    : '';
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f4ebdc;font-family:Arial,Helvetica,sans-serif;color:#1c1511">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fbf7ef;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b3301a">${escapeHtml(shop)} · ${o.mode === 'delivery' ? 'Lieferung' : 'Abholung'}</p>
<h1 style="margin:0 0 4px;font-size:26px">${forCustomer ? 'Danke für deine Bestellung!' : `Bestellung ${o.number}`}</h1>
<p style="margin:0 0 16px;color:#5c4b3f">${forCustomer ? `Bestellnummer <b>${o.number}</b> · ` : ''}${escapeHtml(o.createdAtLocal)} · Zeit: ${escapeHtml(o.timeLabel)}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
<hr style="border:0;border-top:1px dashed #c9b9a6;margin:12px 0">
<table style="width:100%;font-size:15px">
<tr><td>Zwischensumme</td><td style="text-align:right">${formatEuro(o.totals.subtotal)}</td></tr>
${o.mode === 'delivery' ? `<tr><td>Liefergebühr</td><td style="text-align:right">${o.totals.deliveryFee === null ? 'n. V.' : formatEuro(o.totals.deliveryFee)}</td></tr>` : ''}
<tr><td style="font-size:18px;padding-top:6px"><b>Gesamt</b></td><td style="text-align:right;font-size:18px;padding-top:6px"><b>${formatEuro(o.totals.total)}</b></td></tr>
</table>
<p style="margin:12px 0 0;color:#5c4b3f">Zahlung: ${escapeHtml(o.payment)}${o.totals.deposit ? ` · darin ${formatEuro(o.totals.deposit)} Pfand` : ''}</p>
<hr style="border:0;border-top:1px dashed #c9b9a6;margin:16px 0">
<p style="margin:0;line-height:1.5"><b>${escapeHtml(o.customer.name)}</b><br>${escapeHtml(o.customer.phone)}${o.customer.email ? `<br>${escapeHtml(o.customer.email)}` : ''}${addr ? `<br>${addr}` : ''}</p>
${o.note ? `<p style="margin:12px 0 0"><b>Anmerkung:</b> ${escapeHtml(o.note)}</p>` : ''}
</div></div></body></html>`;
}

export async function dispatchOrder(o: PreparedOrder, shop: { name: string; phone: string }): Promise<string[]> {
  const c = channels();
  const done: string[] = [];
  const errors: unknown[] = [];
  const text = orderText(o, shop.name);

  if (c.mail) {
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: env('SMTP_HOST'),
        port: Number(env('SMTP_PORT') || 587),
        secure: env('SMTP_SECURE') === 'true',
        auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      });
      const from = env('ORDER_MAIL_FROM') || env('SMTP_USER');
      await transport.sendMail({
        from,
        to: env('ORDER_MAIL_TO'),
        replyTo: o.customer.email || undefined,
        subject: `Bestellung ${o.number} · ${o.mode === 'delivery' ? 'Lieferung' : 'Abholung'} · ${formatEuro(o.totals.total)}`,
        text,
        html: orderHtml(o, shop.name, false),
      });
      if (o.customer.email && env('ORDER_MAIL_CUSTOMER_COPY') !== 'false') {
        await transport
          .sendMail({
            from,
            to: o.customer.email,
            subject: `Deine Bestellung bei ${shop.name} (${o.number})`,
            text: `Danke für deine Bestellung!\n\n${text}\n\nFragen? Ruf uns an: ${shop.phone}`,
            html: orderHtml(o, shop.name, true),
          })
          .catch((e: unknown) => console.error('[order] Kundenkopie fehlgeschlagen', e));
      }
      done.push('mail');
    } catch (e) {
      errors.push(e);
      console.error('[order] E-Mail fehlgeschlagen', e);
    }
  }

  if (c.webhook) {
    try {
      const body = JSON.stringify({ type: 'order.created', order: o, text });
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (env('ORDER_WEBHOOK_SECRET')) headers['x-pizzarella-signature'] = createHmac('sha256', env('ORDER_WEBHOOK_SECRET')).update(body).digest('hex');
      const res = await fetch(env('ORDER_WEBHOOK_URL'), { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Webhook antwortete mit ${res.status}`);
      done.push('webhook');
    } catch (e) {
      errors.push(e);
      console.error('[order] Webhook fehlgeschlagen', e);
    }
  }

  if (c.dev) {
    const dir = join(process.cwd(), '.orders');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${o.number}.json`), JSON.stringify({ ...o, text }, null, 2));
    await writeFile(join(dir, `${o.number}.txt`), text);
    done.push('dev');
  }

  if (!done.length) throw new Error(`Bestellung konnte über keinen Kanal zugestellt werden (${errors.length} Fehler)`);
  return done;
}
