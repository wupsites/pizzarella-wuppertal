import { iconSvg } from '../../lib/icons.ts';
import { esc } from './util.ts';

interface ToastOptions {
  icon?: string;
  action?: { label: string; run: () => void };
  duration?: number;
}

export function toast(text: string, opts: ToastOptions = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  // höchstens zwei gleichzeitig – ältere weichen
  const existing = host.querySelectorAll('.toast:not(.is-leaving)');
  if (existing.length >= 2) dismiss(existing[0] as HTMLElement);

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${iconSvg(opts.icon ?? 'check')}<span class="toast-text">${esc(text)}</span>${
    opts.action ? `<button type="button">${esc(opts.action.label)}</button>` : ''
  }`;
  host.appendChild(el);

  let timer = 0;
  const start = () => (timer = window.setTimeout(() => dismiss(el), opts.duration ?? 4200));
  const stop = () => window.clearTimeout(timer);
  el.addEventListener('pointerenter', stop);
  el.addEventListener('pointerleave', start);
  el.addEventListener('focusin', stop);
  el.addEventListener('focusout', start);
  if (opts.action) {
    el.querySelector('button')?.addEventListener('click', () => {
      opts.action?.run();
      dismiss(el);
    });
  }
  start();
}

function dismiss(el: HTMLElement) {
  if (el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  window.setTimeout(() => el.remove(), 240);
}
