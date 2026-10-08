"""Echte Foto-Zutaten (freigestellt) zum Wiederverwenden: (Bild, Maske) in Arbeitsauflösung."""
import functools

import cv2
import numpy as np

import photolib as P
from photolib import cutout, ell, lab, poly

OK_LIGHT = lambda lmin, cmax: (lambda x: 1 - P.vessel_pixels(x, lmin, cmax))  # noqa: E731


@functools.lru_cache(None)
def fries():
    """Pommes-Haufen (fries-ketchup, ohne Ketchup-Schälchen)"""
    im = P.load('fries-ketchup')
    rm = ell(590, 520, 260, 190, 0, im.shape)
    m = cutout(im, [(80, 520), (700, 470), (1500, 520), (1520, 1100), (1400, 1600), (900, 1800), (300, 1680), (40, 1200)], remove=rm,
               keep=lambda x: ((lab(x)[2] > 16) & (lab(x)[0] > 90)).astype(np.float32), holes=False)
    return im, m


@functools.lru_cache(None)
def fries_plate():
    im = P.load('fries-plate')
    m = cutout(im, (717, 1141, 715, 625, 0), keep=OK_LIGHT(165, 18))
    return im, m


@functools.lru_cache(None)
def sweet_fries():
    im = P.load('fries-orange')
    m = cutout(im, (527, 907, 520, 590, 0), keep=lambda x: (lab(x)[1] > 8).astype(np.float32))
    return im, m


@functools.lru_cache(None)
def meat(chicken=True):
    """Dönerfleisch-Haufen (teller-doener); als Hähnchen-Kebab heller und goldener"""
    im = P.load('teller-doener')
    L, A, B = lab(im)
    region = poly([(330, 330), (420, 190), (700, 160), (1000, 150), (1250, 190), (1450, 280), (1530, 430), (1480, 560), (1380, 680), (1300, 770), (1000, 790), (800, 800), (620, 760), (520, 640), (450, 520), (360, 440)], im.shape)
    m = P.clean(((L < 120) | (A > 12)).astype(np.float32) * region * (1 - ell(1625, 485, 150, 80, -15, im.shape)), 3, 13, 500)
    m = P.fill_holes(m)
    if chicken:
        im = P.lab_shift(im, m, dL=14, da=3, db=12, kL=1.05)
    return im, m


@functools.lru_cache(None)
def white_sauce():
    """cremige weiße Sauce (fries-meat-sauce): nur die Sauce, etwas heller (Knoblauch-Joghurt)"""
    im = P.load('fries-meat-sauce')
    L, A, B = lab(im)
    s = ((B < 22) & (L > 55 * 2.55) & (A < 12)).astype(np.float32)
    s = P.clean(s, 3, 7, 400)
    im = P.lab_shift(im, s, dL=9, kab=0.55)
    return im, s


@functools.lru_cache(None)
def lettuce():
    im = P.load('lahmacun-salad')
    m = cutout(im, (665, 742, 430, 440, 0), keep=lambda x: ((lab(x)[1] < -8) & (lab(x)[2] > 12)).astype(np.float32))
    return im, m


@functools.lru_cache(None)
def tomato_salad():
    im = P.load('teller-doener')
    sh = im.shape
    reg = poly([(170, 560), (330, 500), (500, 560), (620, 700), (660, 850), (650, 1000), (580, 1100), (460, 1150), (300, 1120), (180, 1050), (130, 900), (140, 700)], sh)
    L, A, B = lab(im)
    m = P.clean(reg * (1 - ((L > 185) & (np.hypot(A, B) < 14))), 3, 11, 300)
    return im, P.fill_holes(m)


@functools.lru_cache(None)
def falafel_balls():
    im = P.load('falafel-plate')
    out = []
    for cx, cy in [(664, 373), (992, 428), (783, 546), (628, 655), (910, 783)]:
        m = cutout(im, (cx, cy, 82, 80, 0), inner=0.55, outer=1.25)
        out.append(m)
    return im, out


@functools.lru_cache(None)
def nuggets():
    im = P.load('nuggets-iso')
    nw = lambda x: 1 - P.vessel_pixels(x, 200, 16)  # noqa: E731
    return im, [cutout(im, e, keep=nw) for e in [(318, 373, 300, 185, 0), (955, 200, 295, 175, 0), (873, 537, 340, 170, 0)]]


@functools.lru_cache(None)
def fritters():
    im = P.load('fritters-dip')
    ring = [(690, 1150), (1180, 620), (1440, 760), (1600, 1000), (1580, 1300), (1290, 1500), (870, 1430), (460, 1300), (380, 1050), (480, 760), (820, 460), (1220, 420)]
    return im, ring


@functools.lru_cache(None)
def chicken_strips():
    """gegrillte Hähnchenbruststreifen (chicken-sliced)"""
    im = P.load('chicken-sliced')
    L, A, B = lab(im)
    reg = poly([(500, 430), (900, 380), (1300, 420), (1600, 600), (1640, 1100), (1400, 1320), (1100, 1150), (900, 1000), (560, 900)], im.shape)
    m = P.clean(((B < 38) & (L < 175) & (A > -4)).astype(np.float32) * reg, 5, 11, 2500)
    m = P.fill_holes(m)
    return im, [m]


@functools.lru_cache(None)
def broccoli():
    im = P.load('chicken-broccoli')
    L, A, B = lab(im)
    reg = poly([(830, 560), (1300, 520), (1530, 700), (1500, 1300), (1100, 1360), (820, 1250), (820, 900)], im.shape)
    m = P.fill_holes(P.clean((A < -8).astype(np.float32) * reg, 3, 9, 800))
    return im, [m]


@functools.lru_cache(None)
def mushrooms():
    im = P.load('tag-mush')
    L, A, B = lab(im)
    region = ell(930, 640, 430, 340, 0, im.shape)
    m = P.fill_holes(P.clean(((L < 125) & (B < 42)).astype(np.float32) * region, 3, 9, 600))
    return im, [m]


@functools.lru_cache(None)
def cheese_melt():
    """geschmolzener Mozzarella aus der Hero-Pizza (Käse-Ebene), als Stücke"""
    import os

    im = cv2.imread(os.path.join(P.ROOT, 'public/pizza/layer-cheese.webp'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    rgb, a = im[..., :3], im[..., 3]
    P.K = 1.0
    pieces = []
    rng = np.random.default_rng(4)
    ys, xs = np.nonzero(a > 0.8)
    while len(pieces) < 10:
        i = rng.integers(len(xs))
        blob = ell(xs[i], ys[i], rng.uniform(40, 60), rng.uniform(32, 48), rng.uniform(0, 180), a.shape)
        m = P.clean(blob * (a > 0.4), 0, 5)
        if m.sum() > 1500:
            pieces.append(m)
    return rgb, pieces


def sucuk():
    """echte Wurstscheiben (aus dem Hero-Foto, dunkler): Liste von RGBA-Kacheln"""
    from base import tp

    return tp.real_slices(dark=True)[4:10]


@functools.lru_cache(None)
def fries_heap():
    """Pommes auf hellem Teller (fries-plate): sauberste Pommes"""
    im = P.load('fries-plate')
    m = cutout(im, [(20, 820), (500, 560), (1200, 520), (1440, 900), (1400, 1500), (900, 1760), (300, 1700), (20, 1300)],
               keep=lambda x: ((lab(x)[2] > 20)).astype(np.float32), holes=False)
    # Foto hat einen Grünstich – Pommes goldener
    im = P.lab_shift(im, m, dL=2, da=7, db=10)
    return im, m


@functools.lru_cache(None)
def onion_rings():
    im = P.load('onion-rings')
    cup = ell(1071, 1201, 345, 340, 0, im.shape)
    m = cutout(im, [(70, 615), (230, 430), (480, 350), (700, 260), (900, 230), (1060, 330), (1300, 480), (1420, 780), (1400, 1000), (1100, 900), (850, 1150),
                    (750, 1400), (400, 1420), (150, 1250), (60, 950)], remove=cup, keep=lambda x: (lab(x)[2] > 22).astype(np.float32), holes=False)
    return im, m


@functools.lru_cache(None)
def nugget_pieces():
    """flache Nuggets (nuggets-iso, freigestellt auf Weiß)"""
    im = P.load('nuggets-iso')
    nw = lambda x: (1 - P.vessel_pixels(x, 215, 14))  # noqa: E731
    return im, [cutout(im, e, keep=nw, inner=0.5, outer=1.12) for e in [(318, 373, 300, 185, 0), (955, 200, 295, 175, 0), (873, 537, 340, 170, 0)]]


@functools.lru_cache(None)
def croquette_pieces():
    """längliche, panierte Stücke (nuggets-box)"""
    im = P.load('nuggets-box')
    ells = [(269, 657, 125, 258, 0), (472, 660, 100, 242, 0), (669, 666, 104, 230, -8), (862, 616, 140, 236, -10)]
    keep = lambda x: (lab(x)[2] > 30).astype(np.float32)  # noqa: E731
    return im, [cutout(im, e, keep=keep, inner=0.55, outer=1.06) for e in ells]


@functools.lru_cache(None)
def fritter_pieces():
    """runde, krosse Bällchen (fritters-dip)"""
    im = P.load('fritters-dip')
    cs = [(369, 728), (573, 542), (808, 367), (1124, 347), (1440, 450), (1573, 728), (1542, 1006), (471, 1057), (849, 1346), (1257, 1325)]
    keep = lambda x: ((lab(x)[0] < 170) & (lab(x)[2] > 10)).astype(np.float32)  # noqa: E731
    return im, [cutout(im, (x, y, 185, 180, 0), keep=keep, inner=0.5, outer=1.15) for x, y in cs]


@functools.lru_cache(None)
def buns():
    """Brötchen (buns-rack): enge Ellipsen innerhalb je eines Brötchens – runde, saubere Kanten"""
    im = P.load('buns-rack')
    ells = [(283, 739, 215, 222, 0), (764, 847, 290, 228, 0), (1423, 918, 305, 262, 0), (1205, 351, 192, 152, 0), (574, 224, 165, 128, 0)]
    return im, [P.soft(ell(*e, im.shape), 2.5) for e in ells]


@functools.lru_cache(None)
def swirls():
    im = P.load('cinnamon')
    ells = [(994, 903, 480, 382, 0), (607, 516, 326, 237, 0), (1375, 466, 312, 205, 0)]
    keep = lambda x: ((lab(x)[2] > 18) & (lab(x)[0] > 60)).astype(np.float32)  # noqa: E731
    return im, [cutout(im, e, keep=keep, inner=0.6, outer=1.05) for e in ells]


@functools.lru_cache(None)
def tiramisu():
    im = P.load('tiramisu')
    m = cutout(im, [(420, 316), (1366, 320), (1432, 856), (1406, 1166), (376, 1186), (332, 866), (360, 656)], inner=0.8, outer=1.05)
    return im, m


@functools.lru_cache(None)
def olives():
    im = P.load('penne-orange')
    keep = lambda x: (lab(x)[0] < 80).astype(np.float32)  # noqa: E731
    return im, [cutout(im, (x, y, 80, 78, 0), keep=keep, inner=0.4, outer=1.2, holes=False) for x, y in [(395, 746), (1325, 842), (950, 1418), (746, 1725)]]


@functools.lru_cache(None)
def shred_salad():
    """gemischter, geschnittener Salat (salad-shred): Tomaten, Gurken, Kraut, Möhren"""
    im = P.load('salad-shred')
    return im, P.poly([(40, 40), (1490, 40), (1490, 2000), (40, 2000)], im.shape)




@functools.lru_cache(None)
def knots():
    """Pizzabrötchen (knots-dip): Brötchen mit Kräutern und Käse, ohne das Dip-Schälchen"""
    im = P.load('knots-dip')
    cup = ell(750, 424, 440, 350, 0, im.shape)
    rough = [(0, 410), (335, 400), (372, 559), (615, 745), (1043, 745), (1192, 466), (1117, 177), (1601, 186), (1899, 372), (1918, 782), (1899, 1229),
             (1676, 1304), (1043, 1285), (968, 1490), (372, 1490), (56, 1155)]
    m = cutout(im, rough, remove=cup, keep=lambda x: 1 - P.vessel_pixels(x, 200, 13), inner=0.7, outer=1.04)
    return im, m
