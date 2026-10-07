/**
 * Bestell-Endpunkt.
 *   GET  /api/order → { available, slots } – ob Online-Bestellung gerade möglich ist
 *   POST /api/order → nimmt eine Bestellung an (JSON), prüft & rechnet neu, stellt zu
 */
import type { APIRoute } from 'astro';
import { site } from '../../data/index.ts';
import { getStatus, preorderSlots } from '../../lib/hours.ts';
import { OrderError, orderRequestSchema, prepareOrder } from '../../lib/server/order.ts';
import { dispatchOrder, orderingAvailable } from '../../lib/server/dispatch.ts';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// einfache Drosselung pro IP (Speicher des Prozesses)
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 6;
}

export const GET: APIRoute = () => {
  const now = new Date();
  const status = getStatus(site.business.hours, now);
  return json({
    available: site.ordering.online && orderingAvailable(),
    accepting: status.accepting,
    opensAt: status.opensAt,
    opensDay: status.opensDay,
    slots: site.ordering.allowPreorder ? preorderSlots(site.business.hours, now, site.ordering.preorderSlotMinutes) : [],
  });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ ok: false, code: 'FORMAT', message: 'Ungültige Anfrage.' }, 415);
  const raw = await request.text();
  if (raw.length > 30_000) return json({ ok: false, code: 'SIZE', message: 'Bestellung zu groß.' }, 413);

  let ip = 'unknown';
  try {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || 'unknown';
  } catch {
    /* clientAddress nicht verfügbar */
  }
  if (limited(ip)) return json({ ok: false, code: 'RATE', message: 'Zu viele Bestellungen in kurzer Zeit. Bitte ruf uns an.' }, 429);

  if (!site.ordering.online || !orderingAvailable()) {
    return json({ ok: false, code: 'UNAVAILABLE', message: `Online-Bestellung ist gerade nicht möglich. Bitte ruf uns an: ${site.business.phone.display}` }, 503);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, code: 'FORMAT', message: 'Ungültige Anfrage.' }, 400);
  }
  const parsed = orderRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json({ ok: false, code: 'INVALID', message: issue?.message ?? 'Bitte prüfe deine Angaben.', field: String(issue?.path?.at(-1) ?? '') }, 422);
  }

  try {
    const order = prepareOrder(site, parsed.data);
    const channels = await dispatchOrder(order, { name: site.business.name, phone: site.business.phone.display });
    return json({
      ok: true,
      number: order.number,
      total: order.totals.total,
      mode: order.mode,
      time: order.timeLabel,
      priceChanged: order.priceChanged,
      channels: channels.length,
    });
  } catch (e) {
    if (e instanceof OrderError) return json({ ok: false, code: e.code, message: e.message, field: e.field }, e.status);
    console.error('[order] unerwarteter Fehler', e);
    return json({ ok: false, code: 'SERVER', message: `Das hat leider nicht geklappt. Bitte ruf uns an: ${site.business.phone.display}` }, 500);
  }
};
