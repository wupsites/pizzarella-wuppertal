"""Döner, Falafel, Lahmacun – aus echten Fotos."""
import numpy as np

import photolib as P
from photolib import C, S, blank, cutout, ell, lab, over, place, poly

# ---------------------------------------------------------------- Döner im Brot (Seitenansicht, doener-bread)
BREAD_ROUGH = (618, 505, 420, 245, 0)
BREAD_REMOVE = [(658, 0), (1280, 0), (1280, 452), (905, 452), (845, 330), (790, 285), (658, 262)]
TOP_BREAD = [(262, 515), (268, 455), (300, 400), (350, 352), (420, 320), (500, 298), (580, 288), (660, 290), (740, 303), (800, 323), (840, 355),
             (850, 392), (800, 404), (700, 414), (610, 427), (530, 442), (470, 457), (420, 470), (370, 482), (320, 495), (285, 512)]


def sandwich_parts():
    """→ (Bild, Maske, {teil: Maske}) in Arbeitsauflösung: Deckel, Boden, Füllung, Salat+Sauce"""
    im = P.load('doener-bread')
    rm = poly(BREAD_REMOVE, im.shape)
    m = cutout(im, BREAD_ROUGH, remove=rm, keep=lambda x: 1 - P.vessel_pixels(x, 150, 14))
    top = P.soft(poly(TOP_BREAD, im.shape), 1.2) * m
    L, A, B = lab(im)
    rest = m * (1 - (top > 0.5))
    yy, xx = np.mgrid[0 : im.shape[0], 0 : im.shape[1]] / P.K
    below = (yy > 545 + (xx - 260) * 0.05).astype(np.float32)
    bread_col = ((A < 12) & (B < 38) & (L > 52 * 2.55)).astype(np.float32)
    bottom = P.fill_holes(P.clean(bread_col * below * rest, 3, 25, 400)) * rest
    green = P.clean(((A < -6) & (B > 12)).astype(np.float32) * rest, 0, 15, 150)
    red = P.clean(((A > 24) & (L < 62 * 2.55)).astype(np.float32) * rest, 0, 15, 150)
    bottom = bottom * (1 - green)
    # Boden unter der Füllung mit Brot ergänzen (sichtbar, wenn die Füllung abhebt)
    hidden = P.dilate(bottom, 3) * (1 - bottom) * below * m
    im2 = P.fill_patches(im, hidden, bottom, patch=8, seed=3)
    filling = P.clean(rest * (1 - bottom), 3, 7, 300)
    veg = P.fill_holes(np.maximum(green, red)) * filling
    return im2, m, {'top': top, 'bottom': np.maximum(bottom, hidden * 0), 'filling': filling, 'veg': veg}


def sandwich_layers(size=S * 0.92):
    im, m, parts = sandwich_parts()
    x0, y0, x1, y1 = P.bbox(m)
    s = size / max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    out = {}
    for k, pm in parts.items():
        bx0, by0, bx1, by1 = P.bbox(pm)
        pcx, pcy = (bx0 + bx1) / 2, (by0 + by1) / 2
        out[k] = place(im, pm, C + (pcx - cx) * s, C + (pcy - cy) * s, max(bx1 - bx0, by1 - by0) * s, shadow=0.0, edge=0.6)
    # Lage der Füllung auf der Arbeitsfläche (für Extras wie Pommes, Falafel)
    zone = (C + (560 * P.K - cx) * s, C + (520 * P.K - cy) * s, 300 * P.K * s, 70 * P.K * s)
    return out, zone
