"""
Pizza-Baukasten: der Boden für „Erstelle deine eigene Pizza“ und die Ebenen
der Exploded View auf der Speisekarte.

    python3 scripts/pizza-builder/build-base.py

Quelle: scripts/pizza-builder/source/cheese-pizza-wordpress-photos-cc0.jpg
(WordPress Photo Directory, CC0) – eine klassische Käse-Pizza mit Tomatensauce,
fast genau von oben. Nur freigestellt, leicht entzerrt (Ellipse → Kreis) und
warm abgestimmt; ein kleiner Blitzreflex wird entfernt.

Ergebnis in public/pizza/:
  base.webp, base-640.webp, base-320.webp   der Boden (RGBA)
  layer-crust.webp            Teig mit Rand (innen heller Teig)       640², RGBA
  layer-sauce.webp            Tomatensauce                            640², RGBA
  layer-cheese.webp           Käse (Innenfläche des Fotos)            640², RGBA
  thumb-{crust,sauce,cheese}.webp           dieselben Ebenen in 256²
  base.json                   Radius, Innenradius (für die Zutaten)

Voraussetzung: pip install opencv-contrib-python-headless numpy
"""
import json
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'scripts/pizza-builder/source/cheese-pizza-wordpress-photos-cc0.jpg')
OUT = os.path.join(ROOT, 'public/pizza')
N = 1024
RADIUS = 0.47  # Pizza-Radius relativ zur Kantenlänge
INNER = 0.86  # Innenkante des Rands (relativ zum Radius)
# Startellipse in der Quelle: Mitte, Durchmesser, Drehung
SEED = ((1047, 1076), (1945, 2034), 157.4)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(shape, cell, octaves, seed):
    r = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(2, cell >> o)
        g = r.random((shape[0] // c + 3, shape[1] // c + 3)).astype(np.float32)
        up = cv2.resize(g, (g.shape[1] * c, g.shape[0] * c), interpolation=cv2.INTER_CUBIC)[c : c + shape[0], c : c + shape[1]]
        out += amp * up
        tot += amp
        amp *= 0.5
    return out / tot


def segment(img):
    """GrabCut auf Viertelgröße, Umriss als geglättetes Polarprofil"""
    h, w = img.shape[:2]
    s = 0.25
    sm = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    (cx, cy), (d1, d2), ang = SEED
    mask = np.full(sm.shape[:2], cv2.GC_BGD, np.uint8)
    for k, v in ((1.06, cv2.GC_PR_BGD), (0.97, cv2.GC_PR_FGD), (0.8, cv2.GC_FGD)):
        cv2.ellipse(mask, ((cx * s, cy * s), (d1 * s * k, d2 * s * k), ang), v, -1)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(sm, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)[:, 0, :].astype(np.float32) / s
    m = c.mean(0)
    ang_ = np.arctan2(c[:, 1] - m[1], c[:, 0] - m[0])
    rad = np.hypot(c[:, 0] - m[0], c[:, 1] - m[1])
    B = 720
    idx = ((ang_ + np.pi) / (2 * np.pi) * B).astype(int) % B
    prof = np.array([np.median(rad[idx == i]) if np.any(idx == i) else np.nan for i in range(B)])
    ok = ~np.isnan(prof)
    prof[~ok] = np.interp(np.nonzero(~ok)[0], np.nonzero(ok)[0], prof[ok], period=B)
    k = 9
    pad = np.concatenate([prof[-k:], prof, prof[:k]])
    prof = np.array([np.median(pad[i : i + 2 * k + 1]) for i in range(B)])
    g = np.exp(-0.5 * (np.arange(-12, 13) / 4) ** 2)
    g /= g.sum()
    prof = np.convolve(np.concatenate([prof[-12:], prof, prof[:12]]), g, 'valid')
    th = -np.pi + (np.arange(B) + 0.5) * 2 * np.pi / B
    return np.stack([m[0] + prof * np.cos(th), m[1] + prof * np.sin(th)], 1).astype(np.float32)


def grade(bgr):
    """warm, etwas satter, sanfte S-Kurve – appetitlich, nicht künstlich"""
    lab = cv2.cvtColor(np.clip(bgr, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[..., 0] / 255
    L = L + 0.06 * np.sin(np.pi * (L - 0.5)) * (1 - np.abs(2 * L - 1))  # S-Kurve
    lab[..., 0] = np.clip(L * 255 * 1.02, 0, 255)
    lab[..., 1] = 128 + (lab[..., 1] - 128) * 1.14 + 1.5
    lab[..., 2] = 128 + (lab[..., 2] - 128) * 1.12 + 3
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)


def main():
    img = cv2.imread(SRC)
    if img is None:
        raise SystemExit(f'Quelle fehlt: {SRC}')
    poly = segment(img)
    (ex, ey), (d1, d2), ang = cv2.fitEllipse(poly)
    R = RADIUS * N
    t = np.deg2rad(ang)
    Rm = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    A = Rm @ np.diag([2 * R / d1, 2 * R / d2]) @ Rm.T
    off = np.array([N / 2, N / 2]) - A @ np.array([ex, ey])
    M = np.hstack([A, off[:, None]]).astype(np.float32)
    tex = cv2.warpAffine(img, M, (N, N), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    # Maske in 4-facher Auflösung zeichnen → saubere, weiche Kante
    big = np.zeros((img.shape[0] * 2, img.shape[1] * 2), np.uint8)
    cv2.fillPoly(big, [(poly * 2).astype(np.int32)], 255)
    M2 = M.copy()
    M2[:, :2] /= 2
    alpha = cv2.warpAffine(big, M2, (N, N), flags=cv2.INTER_AREA).astype(np.float32) / 255
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)

    # Blitzreflex (sehr hell, kaum Farbe) klein ausbessern
    lab = cv2.cvtColor(np.clip(tex, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    glare = ((lab[..., 0] > 228) & (np.abs(lab[..., 1] - 128) < 6) & (np.abs(lab[..., 2] - 128) < 14) & (alpha > 0.9)).astype(np.uint8)
    glare = cv2.dilate(glare, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    if glare.any():
        tex = cv2.inpaint(np.clip(tex, 0, 255).astype(np.uint8), glare * 255, 7, cv2.INPAINT_TELEA).astype(np.float32)
    base = grade(tex)

    c = N / 2
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    rho = np.hypot(xx - c, yy - c) / R

    # ---- Ebenen für die Exploded View
    # Käse: Innenfläche des Fotos, weich am Rand ausgeblendet
    cheese_a = smoothstep(INNER + 0.02, INNER - 0.03, rho)
    # Sauce: sattes Tomatenrot mit ruhiger Struktur, minimal größer als der Käse
    n1 = fbm((N, N), 64, 4, 3)[..., None]
    n2 = fbm((N, N), 8, 2, 4)[..., None]
    sauce = np.array([28, 52, 170], np.float32) * (0.82 + 0.3 * n1) + np.array([10, 30, 40], np.float32) * (n2 - 0.5)
    sauce_a = smoothstep(INNER + 0.05, INNER, rho)
    # Teig: Rand wie im Foto, innen heller Teig
    dough = np.array([150, 196, 230], np.float32) * (0.9 + 0.14 * fbm((N, N), 20, 3, 5)[..., None])
    under = smoothstep(INNER + 0.04, INNER - 0.04, rho)[..., None]
    crust = base * (1 - under) + dough * under

    os.makedirs(OUT, exist_ok=True)

    def save(name, bgr, a, size, q=86):
        out = np.dstack([np.clip(bgr, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
        if size != N:
            out = cv2.resize(out, (size, size), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, name), out, [cv2.IMWRITE_WEBP_QUALITY, q])

    save('base.webp', base, alpha, N, 88)
    save('base-640.webp', base, alpha, 640, 86)
    save('base-320.webp', base, alpha, 320, 82)
    save('layer-crust.webp', crust, alpha, 640)
    save('layer-sauce.webp', sauce, sauce_a * alpha, 640)
    save('layer-cheese.webp', base, cheese_a * alpha, 640)
    # kleine Ebenen für die Karten der Speisekarte
    save('thumb-crust.webp', crust, alpha, 256, 80)
    save('thumb-sauce.webp', sauce, sauce_a * alpha, 256, 80)
    save('thumb-cheese.webp', base, cheese_a * alpha, 256, 80)
    json.dump({'size': N, 'radius': RADIUS, 'inner': INNER}, open(os.path.join(OUT, 'base.json'), 'w'))
    print('→ public/pizza/ fertig')


if __name__ == '__main__':
    main()
