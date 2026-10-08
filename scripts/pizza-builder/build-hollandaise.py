"""
Pizza-Baukasten: Boden mit Sauce Hollandaise statt Tomatensauce.

    python3 scripts/pizza-builder/build-hollandaise.py

Nimmt den fertigen Boden (public/pizza/base.webp, aus build-base.py) und färbt
nur die Tomatensauce zwischen dem Käse in eine cremige Hollandaise um –
Licht, Glanz und Struktur des Fotos bleiben. Käse und Rand bleiben unverändert.

Ergebnis: public/pizza/base-holl.webp, base-holl-640.webp, base-holl-320.webp
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


def main():
    meta = json.load(open(os.path.join(OUT, 'base.json')))
    im = cv2.imread(os.path.join(OUT, 'base.webp'), cv2.IMREAD_UNCHANGED).astype(np.float32)
    n = im.shape[0]
    bgr, alpha = im[..., :3], im[..., 3]
    lab = cv2.cvtColor(bgr.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    rho = np.hypot(xx - n / 2, yy - n / 2) / (meta['radius'] * n)
    inner = smoothstep(meta['inner'] + 0.05, meta['inner'] - 0.01, rho)
    # Tomatensauce: rot/orange; der Käse daneben ist im Foto rosig angefärbt
    sauce = smoothstep(10, 26, A) * (1 - smoothstep(165, 195, L)) * inner
    sauce = cv2.GaussianBlur(sauce, (0, 0), 2.0)
    # Hollandaise: glatt, glänzend, warm hellgelb – nur grobe Licht- und Glanzverläufe
    # des Fotos bleiben (feine Tomatenkörnung wäre bei einer Sahnesauce falsch)
    Lb = cv2.GaussianBlur(L, (0, 0), 5)
    rel = (Lb - cv2.GaussianBlur(L, (0, 0), 24)) * 0.55
    Lh = np.clip(220 + (Lb - 140) * 0.18 + rel, 175, 250)
    # im Ofen leicht angezogen: wo das Foto dunkler ist, goldbraune Stellen
    baked = smoothstep(140, 95, Lb) * 0.45
    Lh = Lh - 16 * baked
    ah = 3 + 10 * baked
    bh = 52 - (Lh - 220) * 0.2 + 10 * baked
    # Glanzlichter der Sauce (aus den hellsten Spitzen des Fotos)
    spec = np.clip((L - cv2.GaussianBlur(L, (0, 0), 6) - 14) / 20, 0, 1)
    Lh = np.clip(Lh + 22 * spec, 0, 252)
    bh = bh - 25 * spec
    # Käse ohne Tomatensauce: nicht mehr rosig, leicht cremig
    cheese = inner * (1 - sauce)
    A2 = A * (1 - 0.75 * cheese)
    B2 = B + 3 * cheese
    L = L + 10 * cheese * smoothstep(120, 180, L)
    out = lab.copy()
    out[..., 0] = L * (1 - sauce) + Lh * sauce
    out[..., 1] = (A2 * (1 - sauce) + ah * sauce) + 128
    out[..., 2] = (B2 * (1 - sauce) + bh * sauce) + 128
    rgb = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    # leicht goldene, im Ofen angezogene Stellen dort, wo die Sauce am Käse anliegt
    edge = np.clip(sauce - cv2.erode(sauce, np.ones((7, 7), np.uint8)), 0, 1)
    rgb = rgb * (1 - 0.18 * edge[..., None]) + np.array([60, 150, 205], np.float32) * 0.18 * edge[..., None]
    res = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    for name, size, q in (('base-holl.webp', n, 88), ('base-holl-640.webp', 640, 86), ('base-holl-320.webp', 320, 82)):
        r = res if size == n else cv2.resize(res, (size, size), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, name), r, [cv2.IMWRITE_WEBP_QUALITY, q])
    print('→ public/pizza/base-holl*.webp')


if __name__ == '__main__':
    main()
