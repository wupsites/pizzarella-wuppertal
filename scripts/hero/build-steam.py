"""
Dampf-Sprite für den Hero: zwei weiche, gedrehte Schwaden, weiß mit Alpha.
    python3 scripts/hero/build-steam.py
→ src/assets/hero/steam.png (wird vom Build als WebP ausgeliefert)
"""
import os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 320, 640
rng = np.random.default_rng(117)


def fbm(h, w, octaves=5):
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        s = 2 ** (o + 5)
        n = rng.random((h // s + 2, w // s + 2)).astype(np.float32)
        out += amp * cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
        total += amp
        amp *= 0.55
    return out / total


y = np.linspace(0, 1, H, dtype=np.float32)[:, None]   # 0 oben, 1 unten
x = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
# Domain-Warp: verwirbelt die Fahnen, statt sie nur zu maskieren
warp_x = (fbm(H, W, 3) - 0.5) * 0.9 * (1.15 - y)
warp_y = (fbm(H, W, 3) - 0.5) * 0.12
alpha = np.zeros((H, W), np.float32)
ribbons = [(-0.12, 0.05, 0.0, 1.0), (-0.02, 0.035, 1.3, 0.8), (0.14, 0.045, 2.6, 0.9), (0.05, 0.03, 4.0, 0.6)]
for off, width, phase, gain in ribbons:
    yy = np.clip(y + warp_y, 0, 1)
    sway = 0.26 * np.sin(yy * 6.0 + phase) * (1 - yy) ** 1.2 + 0.07 * np.sin(yy * 19 + phase * 1.7) * (1 - yy)
    wdt = width * (0.6 + 2.4 * (1 - yy) ** 1.5)    # nach oben breiter, dünner
    col = np.exp(-(((x + warp_x - off - sway) / wdt) ** 2))
    fade = np.clip(yy * 2.6, 0, 1) * np.clip((1 - yy) * 1.8, 0, 1) ** 1.6
    alpha += gain * col * fade * (0.45 + 0.55 * fbm(H, W, 2))
alpha = cv2.GaussianBlur(alpha, (0, 0), 3.5)
alpha = np.nan_to_num(np.clip(alpha / np.percentile(alpha, 99.7), 0, 1) ** 1.15)
rgba = np.dstack([np.full((H, W), 255, np.uint8)] * 3 + [(alpha * 255).astype(np.uint8)])
os.makedirs(os.path.join(ROOT, 'src/assets/hero'), exist_ok=True)
cv2.imwrite(os.path.join(ROOT, 'src/assets/hero/steam.png'), rgba)
print('→ src/assets/hero/steam.png', W, 'x', H)
