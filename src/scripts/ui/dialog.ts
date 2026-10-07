/** Native <dialog> mit sanftem Schließen, Backdrop-Klick und Fokus-Rückgabe. */
import { reducedMotion } from './util.ts';

const openers = new WeakMap<HTMLDialogElement, HTMLElement | null>();

export function openDialog(dialog: HTMLDialogElement, opener?: HTMLElement | null) {
  if (dialog.open) return;
  openers.set(dialog, opener ?? (document.activeElement as HTMLElement | null));
  dialog.classList.remove('is-closing');
  dialog.showModal();
  dialog.dispatchEvent(new CustomEvent('sheet:open'));
}

export function closeDialog(dialog: HTMLDialogElement) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  const finish = () => {
    dialog.classList.remove('is-closing');
    dialog.close();
    const opener = openers.get(dialog);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    dialog.dispatchEvent(new CustomEvent('sheet:close'));
  };
  if (reducedMotion()) return finish();
  dialog.classList.add('is-closing');
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    finish();
  };
  dialog.addEventListener('animationend', end, { once: true });
  window.setTimeout(end, 320);
}

export function enhanceDialog(dialog: HTMLDialogElement) {
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog(dialog);
  });
  // Klick auf den abgedunkelten Hintergrund schließt
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-close]');
    if (btn && dialog.contains(btn)) closeDialog(dialog);
  });
}
