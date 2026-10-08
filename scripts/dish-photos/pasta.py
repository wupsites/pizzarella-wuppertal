"""Pasta: ein echter, gereinigter Teller; darauf die echte Pasta aus dem jeweiligen Foto."""
import numpy as np

import photolib as P
from photolib import C, S, cutout, ell, fill_patches, fill_plate, lab, lab_shift, over, place, poly, vessel_pixels

PLATE_E = (1018, 607, 792, 594, 0)  # tiefer Teller in spag-bolo (Quelle)
HEAP = S * 0.66  # Durchmesser der Pasta auf dem Teller


def plate():
    im = P.load('spag-bolo')
    v = ell(*PLATE_E, im.shape)
    food = cutout(im, (1005, 575, 690, 485, 0), keep=lambda x: 1 - vessel_pixels(x, 165, 22))
    hole = P.dilate(food, 31) * v
    ref = (vessel_pixels(im, 165, 22) * v * (1 - hole)) > 0.5
    clean_img = fill_plate(im, hole, ref)
    F = P.Frame.circle(*PLATE_E, r_out=0.47)
    vm = P.soft(F.mask(v), 1.0)
    return over(P.drop_shadow(vm), P.layer(F.img(clean_img), vm))


def not_white(lmin=175, cmax=20):
    return lambda x: 1 - vessel_pixels(x, lmin, cmax)


def heap(key, rough, remove=None, keep=None, rot=0, size=HEAP, color=None, fill=None):
    im = P.load(key)
    rm = None
    if remove:
        rm = np.zeros(im.shape[:2], np.float32)
        for r in remove:
            rm = np.maximum(rm, ell(*r, im.shape) if isinstance(r, tuple) else poly(r, im.shape))
    m = cutout(im, rough, remove=rm, keep=keep)
    if fill is not None:
        holes = fill(im) * m
        im = fill_patches(im, P.dilate(holes, 5) * m, m * (1 - P.dilate(holes, 9)), patch=12, seed=5)
    if color:
        im = lab_shift(im, m, **color)
    return place(im, m, C, C + S * 0.01, size, rot)


def dark_bits(lmax=70):
    def f(x):
        L, A, B = lab(x)
        return P.clean((L < lmax * 2.55).astype(np.float32), 0, 3)
    return f


def spag_napoli():
    return heap('spag-tomato', (765, 1085, 715, 865, 0), remove=[[(0, 450), (140, 450), (150, 2048), (0, 2048)], [(1470, 1100), (1636, 1100), (1636, 2048), (1430, 2048)]], keep=not_white())


def spag_carbo(color=None):
    return heap('spag-carbo', (1082, 651, 710, 410, 0), keep=lambda x: (lab(x)[2] > 18).astype(np.float32), color=color, size=HEAP * 1.02)


def spag_aglio():
    # dieselbe Pasta, ohne Ei und Käse: heller, Öl statt gelber Sauce
    return spag_carbo(color={'kab': 0.55, 'dL': 4})


def spag_bolo_parts():
    """Spaghetti und Sauce aus demselben Foto getrennt (Sauce unten ergänzt, Käse entfernt)"""
    im = P.load('spag-bolo')
    m = cutout(im, (1005, 575, 690, 485, 0), keep=not_white(165, 22))
    L, A, B = lab(im)
    sauce = P.clean(((L < 140) | (A > 14)).astype(np.float32) * m, 3, 17, 1000)
    sauce = P.fill_holes(sauce) * m
    pasta_m = m
    pasta_im = fill_patches(im, P.dilate(sauce, 5) * m, m * (1 - P.dilate(sauce, 21)), patch=14, seed=7)
    cheese = ((L > 175) & (np.hypot(A, B) < 25)).astype(np.float32) * sauce
    sauce_im = fill_patches(im, P.dilate(cheese, 5) * sauce, sauce * (1 - P.dilate(cheese, 9)), patch=10, seed=8)
    x0, y0, x1, y1 = P.bbox(m)
    s = HEAP / max(x1 - x0, y1 - y0)
    # Sauce mit demselben Maßstab und Mittelpunkt wie die Pasta
    sx0, sy0, sx1, sy1 = P.bbox(sauce)
    scx, scy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
    pcx, pcy = (x0 + x1) / 2, (y0 + y1) / 2
    return (
        place(pasta_im, pasta_m, C, C + S * 0.01, HEAP),
        place(sauce_im, sauce, C + (scx - pcx) * s, C + S * 0.01 + (scy - pcy) * s, max(sx1 - sx0, sy1 - sy0) * s, shadow=0.35),
    )


def penne_red():
    return heap('penne-red', (592, 1024, 470, 462, 0), remove=[(1015, 1185, 150, 120, -20), [(0, 760), (360, 760), (360, 900), (0, 900)]], keep=not_white(170, 22), size=HEAP * 0.95)


PENNE_W = dict(rough=(1065, 860, 600, 705, 0), remove=[(463, 486, 300, 390, 20)])


def penne_white(color=None):
    return heap('penne-white', PENNE_W['rough'], remove=PENNE_W['remove'], keep=not_white(185, 16), color=color, size=HEAP * 0.98)


def tag_cream(color=None):
    return heap('tag-cream', (1024, 833, 860, 575, 0), fill=dark_bits(42), color=color, size=HEAP * 1.03)


def tag_red(color=None):
    return heap('tag-red', (1038, 688, 925, 605, 0), color=color, size=HEAP * 1.03)


def mushrooms_material():
    """Champignons aus tag-mush: einzelne Stücke (Quelle) für penne-fresh"""
    im = P.load('tag-mush')
    L, A, B = lab(im)
    region = ell(930, 640, 420, 330, 0, im.shape)
    m = P.clean(((L < 120) & (B < 40)).astype(np.float32) * region, 5, 9, 1500)
    return im, P.fill_holes(m)


def scatter_material(im, mask, n, size, seed, region_r=0.25):
    """Stücke (Zusammenhangskomponenten) einer Maske einzeln auf die Pasta streuen"""
    import cv2

    r = np.random.default_rng(seed)
    k, lbl, st, cen = cv2.connectedComponentsWithStats((mask > 0.5).astype(np.uint8))
    comps = [i for i in range(1, k) if st[i, 4] > 800]
    out = P.blank() if hasattr(P, 'blank') else np.zeros((S, S, 4), np.float32)
    pts = []
    for j in range(n):
        for _ in range(60):
            a, d = r.uniform(0, 6.283), S * region_r * np.sqrt(r.random())
            p = (C + np.cos(a) * d, C + np.sin(a) * d)
            if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > (size * 0.75) ** 2 for q in pts):
                break
        pts.append(p)
        i = comps[r.integers(len(comps))]
        mm = (lbl == i).astype(np.float32)
        out = over(out, place(im, mm, p[0], p[1], size * r.uniform(0.85, 1.15), r.uniform(0, 360), shadow=0.4))
    return out
