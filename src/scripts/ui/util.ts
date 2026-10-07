export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string | undefined | null) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Klasse kurz setzen und nach Animation entfernen (z. B. „bump“). */
export function pulse(el: Element | null, cls = 'bump', ms = 600) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

/** Bildschirmleser-Ansage über die globale Live-Region. */
export function announce(text: string) {
  const live = document.getElementById('sr-live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => (live.textContent = text), 60);
}

/** Fokus nach Neu-Rendern wiederherstellen (über data-fk). */
export function withFocus(container: Element, render: () => void) {
  const active = document.activeElement as HTMLElement | null;
  const fk = active && container.contains(active) ? active.dataset.fk : undefined;
  render();
  if (fk) {
    const next = container.querySelector<HTMLElement>(`[data-fk="${CSS.escape(fk)}"]`);
    if (next) next.focus({ preventScroll: true });
    else container.querySelector<HTMLElement>('[data-fk-fallback]')?.focus({ preventScroll: true });
  }
}
