/**
 * Messanzeige für echte Geräte: mit „?fps“ in der Adresse erscheint oben links,
 * wie viele Bilder pro Sekunde die Seite schafft und wie lang das längste Bild
 * war. Nur zum Prüfen – ohne den Parameter wird nichts geladen.
 */
export function startFps() {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:2147483647;padding:6px 9px;border-radius:8px;background:rgb(0 0 0/.72);color:#fff;font:600 12px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let start = last;
  let slow = 0;
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    frames++;
    worst = Math.max(worst, dt);
    if (dt > 25) slow++;
    if (now - start >= 1000) {
      const fps = Math.round((frames * 1000) / (now - start));
      const q = document.documentElement.dataset.heroQuality;
      el.textContent = `${fps} fps · längstes Bild ${Math.round(worst)} ms\nRuckler (>25 ms): ${slow}${q ? ` · Qualität ${q} %` : ''}`;
      el.style.background = fps >= 55 && worst < 34 ? 'rgb(20 110 60/.8)' : fps >= 40 ? 'rgb(170 110 0/.85)' : 'rgb(170 30 20/.85)';
      frames = 0;
      worst = 0;
      slow = 0;
      start = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
