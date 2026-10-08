"""
Pizza-Baukasten: Boden in Ebenen, damit Sauce und Käse frei wählbar sind.

    python3 scripts/pizza-builder/build-layers.py

Nimmt die Ebenen aus build-base.py (Teig, Tomatensauce, Käse – dieselbe Pizza,
1024 px aus base.webp neu berechnet) und erzeugt zusätzlich:
  - Sauce Hollandaise: die Tomatensauce cremig umgefärbt (Licht und Glanz bleiben)
  - Käse für die Hollandaise-Pizza: ohne den rosigen Tomatenschimmer

Ergebnis in public/pizza/ (je 640 und 1024 px):
  pb-crust, pb-crust-clean (Rand ohne Tomatenspuren), pb-sauce-tomato,
  pb-sauce-holl, pb-cheese, pb-cheese-holl
"""
import json
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public/pizza')


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def lab_of(bgr):
    lab = cv2.cvtColor(np.clip(bgr, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    return lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128


def from_lab(L, A, B):
    lab = np.dstack([L, A + 128, B + 128])
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)


def main():
    meta = json.load(open(os.path.join(OUT, 'base.json')))
    base = cv2.imread(os.path.join(OUT, 'base.webp'), cv2.IMREAD_UNCHANGED).astype(np.float32)
    n = base.shape[0]
    bgr, alpha = base[..., :3], base[..., 3] / 255
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    rho = np.hypot(xx - n / 2, yy - n / 2) / (meta['radius'] * n)
    inner_k = meta['inner']
    L, A, B = lab_of(bgr)

    # ---- Käse (wie build-base.py): hell und farbarm, innerhalb des Rands
    cheese = ((rho < inner_k) & (L > 172) & (A < 18)).astype(np.uint8)
    cheese = cv2.morphologyEx(cheese, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cheese = cv2.dilate(cheese, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    cheese_a = np.clip(cv2.GaussianBlur(cheese.astype(np.float32), (0, 0), 1.6) * 1.3, 0, 1) * smoothstep(inner_k + 0.02, inner_k - 0.03, rho)
    # Rand der Käseflecken leicht goldbraun (im Ofen angezogen) – hebt sie vom Untergrund ab
    edge = np.clip(cheese_a - cv2.erode(cheese_a, np.ones((13, 13), np.uint8)), 0, 1)
    edge = cv2.GaussianBlur(edge, (0, 0), 3) * 0.55

    # ---- Tomatensauce: Innenfläche, unter dem Käse aus der Umgebung ergänzt
    u8 = np.clip(bgr, 0, 255).astype(np.uint8)
    sauce = cv2.inpaint(u8, cheese * 255, 9, cv2.INPAINT_TELEA).astype(np.float32)
    sauce_a = smoothstep(inner_k + 0.05, inner_k, rho)

    # ---- Teig: Rand wie im Foto, innen heller, leicht gebackener Boden
    rng = np.random.default_rng(5)

    def soft_noise(sigma):
        z = cv2.GaussianBlur(rng.random((n, n)).astype(np.float32), (0, 0), sigma)
        return (z - z.min()) / (z.max() - z.min() + 1e-6)

    tone = 0.55 * soft_noise(26) + 0.3 * soft_noise(7) + 0.15 * soft_noise(1.6)
    # ohne Sauce sieht man den Boden: goldgelb gebacken, damit heller Käse darauf wirkt
    light = np.array([150, 196, 230], np.float32)
    baked = np.array([92, 146, 200], np.float32)
    brown = np.clip((tone - 0.3) * 1.5, 0, 1) * 0.55 + smoothstep(0.4, inner_k, rho) * 0.35
    dough = light * (1 - brown[..., None]) + baked * brown[..., None]
    flour = (soft_noise(0.8) > 0.93).astype(np.float32)
    dough = dough * (1 - 0.06 * flour[..., None]) + 255 * 0.06 * flour[..., None]
    dough *= (0.96 + 0.08 * soft_noise(2.2))[..., None]
    under = smoothstep(inner_k + 0.04, inner_k - 0.04, rho)[..., None]
    crust = bgr * (1 - under) + dough * under

    # ---- Hollandaise: aus der Tomatensauce umgefärbt
    Ls, As, Bs = lab_of(sauce)
    Lb = cv2.GaussianBlur(Ls, (0, 0), 5)
    rel = (Lb - cv2.GaussianBlur(Ls, (0, 0), 24)) * 0.55
    Lh = np.clip(222 + (Lb - 140) * 0.16 + rel, 178, 250)
    bake = smoothstep(130, 85, Lb) * 0.45
    Lh = Lh - 16 * bake
    spec = np.clip((Ls - cv2.GaussianBlur(Ls, (0, 0), 6) - 14) / 20, 0, 1)
    Lh = np.clip(Lh + 20 * spec, 0, 252)
    Ah = 3 + 10 * bake + 0 * As
    Bh = 52 - (Lh - 220) * 0.2 + 10 * bake - 25 * spec
    holl = from_lab(Lh, Ah, Bh)

    # ---- Käse ohne Tomatenschimmer (für Hollandaise und „ohne Sauce“)
    Lc, Ac, Bc = lab_of(bgr)
    cheese_plain = from_lab(Lc + 10 * smoothstep(120, 180, Lc) - 18 * edge, Ac * 0.2 + 5 * edge, Bc + 8 + 22 * edge)
    cheese_tomato = from_lab(Lc - 14 * edge, Ac + 3 * edge, Bc + 18 * edge)

    def save(name, img, a):
        out = np.dstack([np.clip(img, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
        for size, q in ((1024, 86), (640, 84)):
            r = out if size == n else cv2.resize(out, (size, size), interpolation=cv2.INTER_AREA)
            cv2.imwrite(os.path.join(OUT, f'{name}-{size}.webp'), r, [cv2.IMWRITE_WEBP_QUALITY, q])

    # Rand ohne Tomatenspuren (für Hollandaise und „ohne Sauce“): rötliche Stellen
    # am Rand auf die Farbe des gebackenen Teigs bringen – Bräunung und Flecken bleiben
    Lr, Ar, Br = lab_of(crust)
    redness = Ar - 0.45 * Br
    w = smoothstep(2, 14, redness) * smoothstep(inner_k - 0.08, inner_k - 0.02, rho)
    w = cv2.GaussianBlur(w, (0, 0), 1.5)
    crust_clean = from_lab(Lr + 6 * w, Ar * (1 - w) + (0.28 * Br + 3) * w, Br * (1 - 0.15 * w) + 4 * w)
    save('pb-crust', crust, alpha)
    save('pb-crust-clean', crust_clean, alpha)
    save('pb-sauce-tomato', sauce, sauce_a * alpha)
    save('pb-sauce-holl', holl, sauce_a * alpha)
    save('pb-cheese', cheese_tomato, cheese_a * alpha)
    save('pb-cheese-holl', cheese_plain, cheese_a * alpha)
    print('→ public/pizza/pb-*.webp')


if __name__ == '__main__':
    main()
