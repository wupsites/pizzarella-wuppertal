"""
Pizza-Baukasten: der Boden für „Erstelle deine eigene Pizza“ und die Ebenen
der Exploded View auf der Speisekarte – aus der echten Hero-Pizza.

    python3 scripts/pizza-builder/build-base.py

Quelle: src/assets/hero/pizza-top.png (entzerrtes CC0-Foto, siehe
scripts/hero/build-pizza3d.py). Die Salamischeiben werden mit gedrehten
Käse-/Sauce-Stücken derselben Pizza abgedeckt und per Poisson-Verfahren
(cv2.seamlessClone) nahtlos eingeblendet – übrig bleibt eine Margherita mit
Tomatensauce, Mozzarella und Leopardenrand. Die Scheiben selbst werden in
build-toppings.py zur Zutat „Rindersalami“.

Ergebnis in public/pizza/:
  base.webp, base-640.webp, base-320.webp   der Boden (RGBA)
  layer-{crust,sauce,cheese}.webp           Ebenen für die Exploded View (640², RGBA)
  thumb-{crust,sauce,cheese}.webp           dieselben Ebenen in 256²
  base.json                                 Radius, Innenkante des Rands

Voraussetzung: pip install opencv-contrib-python-headless numpy
"""
import json
import math
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERO = os.path.join(ROOT, 'src/assets/hero/pizza-top.png')
HERO_META = os.path.join(ROOT, 'src/assets/hero/pizza-top.json')
OUT = os.path.join(ROOT, 'public/pizza')
N = 1024
INNER = 0.8  # Innenkante des Rands (relativ zum Umriss)
# Salamischeiben im 1024er-Bild: Mitte x, y, Radius (von Hand vermessen)
SALAMI = [
    (408, 172, 72), (606, 174, 72), (755, 258, 72), (275, 322, 82), (448, 302, 82), (586, 316, 78),
    (814, 447, 75), (252, 500, 98), (457, 510, 95), (700, 620, 108), (455, 690, 108),
]
PATCH = 56  # Radius der eingesetzten Stücke


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def outline(meta):
    prof = np.array(meta['profile'], np.float32)
    bins = len(prof)
    c = N / 2
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    th = np.arctan2(yy - c, xx - c)
    f = ((th + np.pi) / (2 * np.pi) * bins - 0.5) % bins
    i0 = np.floor(f).astype(int)
    u = f - i0
    o = prof[i0 % bins] * (1 - u) + prof[(i0 + 1) % bins] * u
    rad = np.hypot(xx - c, yy - c)
    R = meta['radius'] * N
    return rad / (R * o), np.clip((R * o - rad) / 1.2 + 0.5, 0, 1)


def remove_salami(tex, rho):
    """jede Scheibe: Kranz aus Stücken + eins in die Mitte, je nahtlos eingeblendet
    (Poisson). Unregelmäßige Formen, damit kein runder Rand an Salami erinnert."""
    rng = np.random.default_rng(11)
    hole = np.zeros((N, N), np.uint8)
    for x, y, r in SALAMI:
        cv2.circle(hole, (x, y), r + 12, 255, -1)
    clean = ((hole == 0) & (rho < INNER)).astype(np.uint8)
    d = cv2.distanceTransform(clean, cv2.DIST_L2, 5)
    sy, sx = np.nonzero(d >= PATCH + 2)
    P = PATCH + 6
    res = tex.copy()

    def blob_mask():
        a = np.linspace(0, math.tau, 48, endpoint=False)
        ph = rng.uniform(0, math.tau, 3)
        k = 1 + 0.12 * np.sin(a * 2 + ph[0]) + 0.08 * np.sin(a * 3 + ph[1]) + 0.05 * np.sin(a * 5 + ph[2])
        rr = PATCH * 0.86 * k
        pts = np.stack([P + np.cos(a) * rr, P + np.sin(a) * rr], 1)
        m = np.zeros((2 * P + 1, 2 * P + 1), np.uint8)
        cv2.fillPoly(m, [np.clip(pts, 2, 2 * P - 2).astype(np.int32)], 255)
        return m

    for x, y, r in sorted(SALAMI, key=lambda s: -s[2]):
        R = r + 12
        pts = []
        if R > PATCH:
            k = 7 if R > 90 else 5
            dd = R - PATCH * 0.72
            a0 = rng.uniform(0, math.tau)
            pts = [(x + math.cos(a0 + i * math.tau / k) * dd, y + math.sin(a0 + i * math.tau / k) * dd) for i in range(k)]
        pts.append((x, y))
        for px, py in pts:
            # Quelle mit ähnlichem Abstand zur Mitte (gleiches Licht)
            tr = rho[int(np.clip(py, 0, N - 1)), int(np.clip(px, 0, N - 1))]
            cand = np.nonzero(np.abs(rho[sy, sx] - tr) < 0.12)[0]
            if len(cand) < 20:
                cand = np.arange(len(sy))
            j = rng.choice(cand)
            M = cv2.getRotationMatrix2D((float(sx[j]), float(sy[j])), rng.uniform(0, 360), 1.0)
            M[0, 2] += P - sx[j]
            M[1, 2] += P - sy[j]
            src = cv2.warpAffine(tex, M, (2 * P + 1, 2 * P + 1), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            res = cv2.seamlessClone(src, res, blob_mask(), (int(round(px)), int(round(py))), cv2.NORMAL_CLONE)
    return res


def main():
    meta = json.load(open(HERO_META))
    tex = cv2.resize(cv2.imread(HERO), (N, N), interpolation=cv2.INTER_AREA)
    rho, alpha = outline(meta)
    base = remove_salami(tex, rho).astype(np.float32)

    # ---- Ebenen für die Exploded View
    lab = cv2.cvtColor(np.clip(base, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a = lab[..., 0], lab[..., 1] - 128
    cheese = ((rho < INNER) & (L > 172) & (a < 18)).astype(np.uint8)
    cheese = cv2.morphologyEx(cheese, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cheese_a = np.clip(cv2.GaussianBlur(cheese.astype(np.float32), (0, 0), 1.6) * 1.3, 0, 1) * smoothstep(INNER + 0.02, INNER - 0.03, rho)
    # Sauce: Innenfläche, unter dem Käse aus der Umgebung ergänzt
    u8 = np.clip(base, 0, 255).astype(np.uint8)
    sauce = cv2.inpaint(u8, cheese * 255, 9, cv2.INPAINT_TELEA).astype(np.float32)
    sauce_a = smoothstep(INNER + 0.05, INNER, rho)
    # Teig: Rand wie im Foto, innen ein heller, leicht gebackener Teigboden
    # (gezeichnet statt aus dem Foto ergänzt – das ergab strahlenförmige Schlieren)
    rng = np.random.default_rng(5)

    def soft_noise(sigma):
        n = cv2.GaussianBlur(rng.random((N, N)).astype(np.float32), (0, 0), sigma)
        return (n - n.min()) / (n.max() - n.min() + 1e-6)

    tone = 0.55 * soft_noise(26) + 0.3 * soft_noise(7) + 0.15 * soft_noise(1.6)
    light = np.array([176, 214, 238], np.float32)  # BGR: heller Teig
    baked = np.array([118, 168, 214], np.float32)  # BGR: goldbraun
    brown = np.clip((tone - 0.35) * 1.6, 0, 1) * 0.45 + smoothstep(0.45, INNER, rho) * 0.35
    dough = light * (1 - brown[..., None]) + baked * brown[..., None]
    # Mehlstaub und kleine Bläschen
    flour = (soft_noise(0.8) > 0.93).astype(np.float32)
    dough = dough * (1 - 0.06 * flour[..., None]) + 255 * 0.06 * flour[..., None]
    dough *= (0.96 + 0.08 * soft_noise(2.2))[..., None]
    under = smoothstep(INNER + 0.04, INNER - 0.04, rho)[..., None]
    crust = base * (1 - under) + dough * under

    os.makedirs(OUT, exist_ok=True)

    def save(name, bgr, a_, size, q=86):
        out = np.dstack([np.clip(bgr, 0, 255), np.clip(a_ * 255, 0, 255)]).astype(np.uint8)
        if size != N:
            out = cv2.resize(out, (size, size), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, name), out, [cv2.IMWRITE_WEBP_QUALITY, q])

    save('base.webp', base, alpha, N, 88)
    save('base-640.webp', base, alpha, 640, 86)
    save('base-320.webp', base, alpha, 320, 82)
    save('layer-crust.webp', crust, alpha, 640)
    save('layer-sauce.webp', sauce, sauce_a * alpha, 640)
    save('layer-cheese.webp', base, cheese_a * alpha, 640)
    save('thumb-crust.webp', crust, alpha, 256, 80)
    save('thumb-sauce.webp', sauce, sauce_a * alpha, 256, 80)
    save('thumb-cheese.webp', base, cheese_a * alpha, 256, 80)
    json.dump({'size': N, 'radius': meta['radius'], 'inner': INNER}, open(os.path.join(OUT, 'base.json'), 'w'))
    print('→ public/pizza/ fertig')


if __name__ == '__main__':
    main()
