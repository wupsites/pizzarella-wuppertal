"""
Alle Gerichte außer Pizza aus echten Fotos (CC0/gemeinfrei/CC BY, siehe
sources.json). Jede Funktion liefert {ebene: Bild} (vormultipliziert, S×S);
die Zuordnung zu den Gerichten und die Beschriftungen stehen in LAYOUT
(wird nach src/data/dish-art.json geschrieben).
"""
import functools
import math
import os

import cv2
import numpy as np

import doener as DN
import materials as M
import pasta as PA
import photolib as P
import vessels as V
from photolib import C, S, blank, ell, lab, over, place, poly

UP = 'upright'  # Ebenen gehen beim Überfahren senkrecht auseinander (Seitenansicht, Glas)


# ---------------------------------------------------------------- Hilfen auf der Arbeitsfläche
def clip(layer, mask):
    return layer * np.clip(mask, 0, 1)[..., None]


def cell(cx, cy, rx, ry, a=0):
    m = np.zeros((S, S), np.float32)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), a, 0, 360, 1.0, -1, cv2.LINE_AA)
    return m


def heap_into(mat, region, fill=1.0, rot=0, shadow=0.35, squash=1.0):
    im, m = mat
    x0, y0, x1, y1 = P.bbox(region)
    w, h = (x1 - x0) * fill, (y1 - y0) * fill
    mx0, my0, mx1, my1 = P.bbox(m)
    size = max(w, h) if squash == 1.0 else w
    lay = place(im, m, (x0 + x1) / 2, (y0 + y1) / 2, size, rot, by='w' if squash != 1.0 else 'max', shadow=shadow)
    if squash != 1.0:
        lay = squash_y(lay, squash, (y0 + y1) / 2)
    return clip(lay, P.dilate(region, 9))


def squash_y(lay, k, cy):
    M_ = np.float32([[1, 0, 0], [0, k, cy * (1 - k)]])
    return cv2.warpAffine(lay, M_, (S, S), flags=cv2.INTER_AREA, borderValue=0)


def scatter(im, masks, region, n, size, seed, shadow=0.4, rot=(0, 360), squash=1.0, min_d=0.75):
    r = np.random.default_rng(seed)
    ys, xs = np.nonzero(region > 0.5)
    pts = []
    out = blank()
    for j in range(n):
        for _ in range(200):
            i = r.integers(len(xs))
            p = (float(xs[i]), float(ys[i]))
            if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > (size * min_d) ** 2 for q in pts):
                break
        pts.append(p)
        mm = masks[j % len(masks)]
        lay = place(im, mm, p[0], p[1], size * r.uniform(0.88, 1.12), r.uniform(*rot), flip=bool(r.integers(2)), shadow=shadow)
        if squash != 1.0:
            lay = squash_y(lay, squash, p[1])
        out = over(out, lay)
    return out


def tiles_scatter(tiles, region, n, size, seed, squash=1.0, shadow=0.35):
    """RGBA-Kacheln (gerade Farben, z. B. echte Wurstscheiben) verteilen"""
    ims = []
    masks = []
    for t in tiles:
        ims.append(t[..., :3])
        masks.append(t[..., 3])
    r = np.random.default_rng(seed)
    out = blank()
    ys, xs = np.nonzero(region > 0.5)
    pts = []
    for j in range(n):
        for _ in range(200):
            i = r.integers(len(xs))
            p = (float(xs[i]), float(ys[i]))
            if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > (size * 0.7) ** 2 for q in pts):
                break
        pts.append(p)
        k = j % len(ims)
        lay = place(ims[k], masks[k], p[0], p[1], size, r.uniform(0, 360), shadow=shadow)
        if squash != 1.0:
            lay = squash_y(lay, squash, p[1])
        out = over(out, lay)
    return out


def sauce_over(region, seed=1, scale=1.0, tint=None, alpha=1.0):
    """weiße Sauce (echt, aus wrap-open) über eine Fläche legen; tint = Farbe (LAB-Ziel) für andere Saucen"""
    im, s = M.white_sauce()
    if tint is not None:
        im = P.lab_match(im, s, tint[:3], tint[3] if len(tint) > 3 else 0.8)
    x0, y0, x1, y1 = P.bbox(region)
    lay = place(im, s, (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) * 1.15 * scale, rot=np.random.default_rng(seed).uniform(0, 360), shadow=0.25, edge=0.7)
    return clip(lay, region) * alpha


# ---------------------------------------------------------------- Stück-Vorräte
def pieces_rendered(fn_name, n, seed):
    """gerenderte Zutaten aus dem Pizza-Baukasten (dort, wo es kein freies Foto gibt)"""
    import sys

    pass
    from base import tp
    import pieces as PC

    fn = getattr(tp, fn_name, None) or getattr(PC, fn_name)
    return [fn(seed + i * 101) for i in range(n)]


def jalapenos():
    from base import tp

    return [tp.ring_slice(50 + i * 7, '#2f6e22', '#9dc46c', '#efe9bf', 0.8) for i in range(4)]


def grilled_veg():
    import sys

    pass
    import pieces as PC
    from base import tp

    return [PC.grilled(1000, 'zucchini'), PC.grilled(1013, 'aubergine'), tp.pepper_strip(1004, 'r'), PC.grilled(1026, 'zucchini'), PC.grilled(1039, 'aubergine'), tp.pepper_strip(1005, 'y')]


# ---------------------------------------------------------------- Döner im Brot (aufrecht)
@functools.lru_cache(None)
def sandwich():
    return DN.sandwich_layers()


def tasche(extras=(), meat=True):
    L, (zx, zy, zrx, zry) = sandwich()
    zone = cell(zx, zy, zrx, zry)
    out = {'tasche-brot': L['bottom'], 'tasche-deckel': L['top']}
    out['tasche-fuellung' if meat else 'tasche-salat'] = L['filling'] if meat else L['veg']
    for e in extras:
        if e == 'fries':
            out['tasche-pommes'] = heap_into(M.fries(), cell(zx, zy + zry * 0.2, zrx * 1.05, zry * 1.1), squash=0.5)
        elif e == 'falafel':
            im, balls = M.falafel_balls()
            out['tasche-falafel'] = scatter(im, balls, cell(zx, zy, zrx * 0.85, zry * 0.6), 5, zry * 2.0, 31, squash=0.85)
        elif e == 'sucuk':
            out['tasche-sucuk'] = tiles_scatter(M.sucuk(), cell(zx, zy, zrx * 0.85, zry * 0.6), 6, zry * 1.9, 32, squash=0.5)
        elif e == 'grilled':
            g = grilled_veg()
            out['tasche-gemuese'] = tiles_scatter(g, cell(zx, zy, zrx * 0.85, zry * 0.6), 7, zry * 2.0, 33, squash=0.55)
        elif e == 'jalapenos':
            out['tasche-jalapenos'] = tiles_scatter(jalapenos(), cell(zx, zy - zry * 0.3, zrx * 0.8, zry * 0.5), 6, zry * 1.2, 34, squash=0.6)
    return out


# ---------------------------------------------------------------- Box, Teller, Dürüm, Lahmacun
def box_dish(main='meat'):
    lay, inner = V.box()
    x0, y0, x1, y1 = P.bbox(inner)
    out = {'box': lay, 'box-pommes': clip(heap_into(M.fries(), inner, fill=1.15), inner)}
    right = cell(x0 + (x1 - x0) * 0.62, (y0 + y1) / 2, (x1 - x0) * 0.3, (y1 - y0) * 0.36) * inner
    if main == 'meat':
        out['box-fleisch'] = heap_into(M.meat(), right, fill=1.0)
    else:
        im, balls = M.falafel_balls()
        out['box-falafel'] = scatter(im, balls, cell(x0 + (x1 - x0) * 0.62, (y0 + y1) / 2, (x1 - x0) * 0.2, (y1 - y0) * 0.25), 5, (x1 - x0) * 0.2, 41)
    out['box-sauce'] = sauce_over(cell(x0 + (x1 - x0) * 0.55, (y0 + y1) / 2, (x1 - x0) * 0.36, (y1 - y0) * 0.36), 2)
    return out


@functools.lru_cache(None)
def teller_base():
    """Dönerteller (teller-doener): Platte leer + Beilagen + Salat + Fleisch, aus demselben Foto"""
    im = P.load('teller-doener')
    sh = im.shape
    platter = ell(962, 790, 945, 680, 0, sh)
    L, A, B = lab(im)
    plate_px = (L > 160) & (np.hypot(A, B) < 20)
    food = (platter > 0.5) & ~((L > 185) & (np.hypot(A, B) < 14))
    meat_r = poly([(330, 330), (420, 190), (700, 160), (1000, 150), (1250, 190), (1450, 280), (1530, 430), (1480, 560), (1380, 680), (1300, 770), (1000, 790), (800, 800), (620, 760), (520, 640), (450, 520), (360, 440)], sh)
    fries_r = poly([(560, 850), (720, 800), (900, 760), (1150, 740), (1300, 780), (1420, 920), (1500, 1050), (1570, 1180), (1450, 1300), (1200, 1350), (1000, 1420), (800, 1420), (650, 1330), (540, 1200), (430, 1250), (420, 1130), (480, 1100), (600, 1000)], sh)
    salad_r = poly([(170, 560), (330, 500), (500, 560), (620, 700), (660, 850), (650, 1000), (580, 1100), (460, 1150), (300, 1120), (180, 1050), (130, 900), (140, 700)], sh)
    rice_r = poly([(1380, 520), (1550, 480), (1700, 520), (1810, 620), (1830, 800), (1780, 950), (1650, 1000), (1500, 980), (1400, 900), (1360, 750), (1360, 620)], sh)
    peppers = np.maximum(ell(1625, 485, 140, 70, -15, sh), ell(1545, 1035, 110, 70, -20, sh))
    m_meat = P.clean(food * meat_r * (1 - peppers), 3, 9, 300)
    m_fries = P.clean(food * fries_r * (1 - meat_r), 3, 9, 300)
    m_salad = P.clean(food * salad_r * (1 - fries_r), 3, 11, 200)
    im2 = P.fill_patches(im, peppers * rice_r, rice_r * (1 - peppers), patch=14, seed=4)
    m_rice = P.clean(rice_r, 0, 9)
    food_all = np.clip(m_meat + m_fries + m_salad + m_rice + peppers * platter, 0, 1)
    plate_img = P.fill_plate(im, P.dilate(food_all, 9), plate_px & (platter > 0.5) & (P.dilate(food_all, 9) < 0.5))
    meat_px = P.clean(((L < 120) | (A > 12)).astype(np.float32), 0, 5) * m_meat
    chicken = P.lab_shift(im2, cv2.GaussianBlur(meat_px, (0, 0), 2), dL=14, da=3, db=12, kL=1.05)
    F = P.Frame.fit(0, 90, 1930, 1485, fill=0.96)
    pl = F.mask(platter)
    lay = lambda img, m: over(P.contact(P.soft(F.mask(m), 0.8)), P.layer(F.img(img), P.soft(F.mask(m), 0.8)))  # noqa: E731
    return {
        'teller': over(P.drop_shadow(pl), P.layer(F.img(plate_img), P.soft(pl, 1))),
        'teller-pommes': lay(im2, m_fries),
        'teller-reis': lay(im2, m_rice),
        'teller-salat': lay(im2, m_salad),
        'teller-fleisch': lay(chicken, m_meat),
        '_meat_region': P.soft(F.mask(m_meat), 2),
    }


def teller(main='meat'):
    t = teller_base()
    out = {k: v for k, v in t.items() if not k.startswith('_')}
    region = t['_meat_region']
    if main == 'falafel':
        del out['teller-fleisch']
        del out['teller-reis']
        im, balls = M.falafel_balls()
        x0, y0, x1, y1 = P.bbox(region)
        out['teller-falafel'] = scatter(im, balls, cell((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.33, (y1 - y0) * 0.3), 6, (y1 - y0) * 0.42, 51)
    out['teller-sauce'] = sauce_over(region, 3, 0.85)
    return out


@functools.lru_cache(None)
def wraps():
    im = P.load('wraps-plate')
    plate_e = (768, 1097, 790, 687, 0)
    v = ell(*plate_e, im.shape)
    w = P.cutout(im, [(59, 1112), (263, 585), (585, 497), (878, 497), (1287, 503), (1404, 658), (1229, 1317), (966, 1434), (644, 1463), (439, 1404), (59, 1375)], keep=lambda x: 1 - P.vessel_pixels(x, 160, 20))
    clean_img = P.fill_plate(im, P.dilate(w, 25) * v, (P.vessel_pixels(im, 160, 20) * v * (1 - P.dilate(w, 25))) > 0.5)
    F = P.Frame.circle(*plate_e, r_out=0.47)
    vm = P.soft(F.mask(v), 1)
    return over(P.drop_shadow(vm), P.layer(F.img(clean_img), vm)), over(P.contact(P.soft(F.mask(w), 0.8), 0.4), P.layer(F.img(im), P.soft(F.mask(w), 0.8))), P.soft(F.mask(w), 2)


def dueruem(falafel=False):
    plate, wrap, wm = wraps()
    out = {'duerum-teller': plate, 'duerum-wrap': wrap}
    if falafel:
        im, balls = M.falafel_balls()
        out['duerum-falafel'] = scatter(im, balls, cell(C + S * 0.18, C + S * 0.22, S * 0.1, S * 0.06), 3, S * 0.12, 61)
    return out


@functools.lru_cache(None)
def lahmacun_base():
    im = P.load('lahmacun-single')
    m = P.cutout(im, (650, 714, 645, 715, 0), inner=0.85, outer=1.03)
    return place(im, m, C, C, S * 0.84, -8, shadow=0.0)


def lahmacun(meat=False):
    base = lahmacun_base()
    plate = PA.plate()
    out = {'lahm-teller': plate, 'lahm-boden': over(P.contact(base[..., 3], 0.35, 4, 5), base)}
    mid = cell(C, C, S * 0.22, S * 0.2)
    if meat:
        out['lahm-fleisch'] = heap_into(M.meat(), mid, fill=1.05)
    out['lahm-salat'] = heap_into(M.lettuce(), cell(C, C, S * 0.25, S * 0.24), fill=1.0)
    out['lahm-sauce'] = sauce_over(cell(C, C, S * 0.22, S * 0.2), 5, 0.9)
    return out


# ---------------------------------------------------------------- gerenderte Ergänzungen (wie bei der Pizza)
def rendered(fn, n, seed, **kw):
    from base import tp

    return [getattr(tp, fn)(seed + i * 101, **kw) for i in range(n)]


def leaves(kind):
    from base import tp

    if kind == 'spinach':
        return [tp.leaf(200 + i, '#2f5a22', '#173a12', 0.1, 0.5) for i in range(4)]
    return [tp.leaf(190 + i, '#5c8d30', '#2f5418', 0.55, 0.3) for i in range(4)]


def garlic():
    import pieces as PC

    return [PC.garlic_slice(1300 + i * 13) for i in range(4)]


def chili_rings():
    import pieces as PC

    return [PC.chili_ring(1200 + i * 13) for i in range(4)]


def egg_slices():
    import pieces as PC

    return [PC.egg_slice(1500 + i * 13) for i in range(3)]


def onions():
    from base import tp

    return [tp.onion(30 + i * 101) for i in range(4)]


# ---------------------------------------------------------------- Pasta
@functools.lru_cache(None)
def pasta_plate():
    return PA.plate()


TOP = cell(C, C, S * 0.2, S * 0.18)


def heap_small(mat, cx, cy, w, rot=0):
    im, ms = mat
    m = ms[0] if isinstance(ms, list) else ms
    return place(im, m, cx, cy, w, rot, shadow=0.4)


def pasta(base, sauce=None, tops=()):
    out = {'pasta-teller': pasta_plate()}
    if isinstance(base, tuple):
        out['pasta-nudeln'], out['pasta-sauce'] = base
    else:
        out['pasta-nudeln'] = base
    lay = blank()
    for kind, *args in tops:
        if kind == 'heap':
            mat, cx, cy, w = args
            lay = over(lay, heap_small(mat, C + cx * S, C + cy * S, w * S, rot=(cx * 300) % 360))
        elif kind == 'tiles':
            tl, n, size, seed = args
            lay = over(lay, tiles_scatter(tl, TOP, n, size * S, seed))
    if tops:
        out['pasta-belag'] = lay
    return out


def penne_white_heap(color=None):
    return PA.penne_white(color)


PASTA = {
    'spaghetti-napoli': lambda: pasta(PA.spag_napoli()),
    'spaghetti-aglio-olio': lambda: pasta(PA.spag_aglio(), tops=[('tiles', garlic(), 9, 0.06, 1), ('tiles', chili_rings(), 7, 0.05, 2)]),
    'spaghetti-bolognese': lambda: pasta(PA.spag_bolo_parts()),
    'spaghetti-carbonara': lambda: pasta(PA.spag_carbo()),
    'penne-arrabiata': lambda: pasta(PA.penne_red(), tops=[('tiles', chili_rings(), 6, 0.05, 3)]),
    'penne-quattro-formaggi': lambda: pasta(PA.penne_white(), tops=[('tiles', rendered('parmesan', 3, 240) + rendered('gorgonzola', 3, 260) + rendered('feta', 3, 250), 10, 0.075, 4)]),
    'penne-ela': lambda: pasta(PA.penne_white({'db': 22, 'da': 3}), tops=[('heap', M.chicken_strips(), -0.06, -0.04, 0.3), ('heap', M.broccoli(), 0.1, 0.07, 0.22)]),
    'penne-fresh': lambda: pasta(PA.penne_white({'kab': 0.7, 'dL': 3}), tops=[('heap', M.chicken_strips(), -0.07, 0.04, 0.28), ('heap', M.mushrooms(), 0.08, -0.06, 0.24), ('tiles', leaves('spinach') + onions(), 8, 0.08, 5)]),
    'tagliatelle-mediteran': lambda: pasta(PA.tag_cream({'kab': 0.6, 'dL': 4}), tops=[('heap', M.chicken_strips(), 0.0, -0.02, 0.3), ('tiles', leaves('spinach'), 6, 0.1, 6)]),
    'tagliatelle-orient': lambda: pasta(PA.tag_red({'kab': 0.85, 'dL': 5, 'da': 3}), tops=[('heap', M.meat(), 0.0, 0.0, 0.3)]),
    'tagliatelle-indiano': lambda: pasta(PA.tag_cream({'db': 38, 'da': 10, 'dL': -4}), tops=[('heap', M.chicken_strips(), 0.0, 0.0, 0.3)]),
    'tagliatelle-gamberetti': lambda: pasta(PA.tag_red({'kab': 0.7, 'dL': 7, 'da': 9, 'db': -6}), tops=[('tiles', rendered('shrimp', 4, 160), 7, 0.12, 7)]),
}


# ---------------------------------------------------------------- Pizzabrötchen: 8 Brötchen auf dem Teller
@functools.lru_cache(None)
def snack_plate():
    # derselbe saubere, weiße Teller wie bei der Pasta
    return PA.plate()


ROLL_AREA = cell(C, C, S * 0.31, S * 0.28)


@functools.lru_cache(None)
def rolls():
    """echte Pizzabrötchen als runder Haufen: das Foto zweimal (gedreht), damit
    die Lücke des entfernten Dip-Schälchens geschlossen ist"""
    im, m = M.knots()
    back = place(im, m, C + S * 0.02, C - S * 0.06, S * 0.5, 180, shadow=0.35)
    front = place(im, m, C, C + S * 0.04, S * 0.62, 0, shadow=0.4)
    return clip(over(back, front), P.soft(cell(C, C, S * 0.32, S * 0.3), 3))


def roll_cheese():
    """überbackener Käse: echte Käsesauce (fries-cheese), heller wie geschmolzener Mozzarella"""
    im, m = cheese_sauce()
    im = P.lab_match(im, m, (86, 2, 34), 0.8)
    return clip(place(im, m, C, C, S * 0.62, 30, shadow=0.25), P.soft(cell(C, C, S * 0.26, S * 0.23), 4))


def roll_meat():
    """Dönerfleisch zwischen und auf den Brötchen (mehrere kleine Häufchen)"""
    im, m = M.meat()
    lay = blank()
    for k, (dx, dy) in enumerate(((-0.12, -0.06), (0.1, -0.08), (0.0, 0.05), (-0.13, 0.1), (0.14, 0.08))):
        lay = over(lay, clip(place(im, m, C + dx * S, C + dy * S, S * 0.34, k * 70, shadow=0.35), P.soft(cell(C + dx * S, C + dy * S, S * 0.065, S * 0.055), 2)))
    return lay


def roll_chicken():
    im, ms = M.chicken_strips()
    lay = blank()
    for k, (dx, dy) in enumerate(((-0.12, -0.06), (0.1, -0.08), (0.0, 0.05), (-0.13, 0.1), (0.14, 0.08))):
        lay = over(lay, clip(place(im, ms[0], C + dx * S, C + dy * S, S * 0.3, k * 70, shadow=0.35), P.soft(cell(C + dx * S, C + dy * S, S * 0.07, S * 0.055), 2)))
    return lay


def roll_sucuk():
    return tiles_scatter(M.sucuk(), cell(C, C, S * 0.2, S * 0.17), 7, S * 0.11, 71)


def dollops(target, seed=1, size=0.09):
    """echte Sauce aus dem Dip-Schälchen, umgefärbt, als glänzende Kleckse auf den Brötchen"""
    _, img, m = V.dip_cup()
    img = P.lab_match(img, m, target[:3], target[3] if len(target) > 3 else 1.0)
    lay = blank()
    r = np.random.default_rng(seed)
    for k, (dx, dy) in enumerate(((-0.13, -0.08), (0.06, -0.12), (0.15, 0.0), (-0.02, 0.03), (-0.15, 0.1), (0.1, 0.12))):
        mm = m * P.soft(cell(C + r.normal(0, S * 0.04), C + r.normal(0, S * 0.04), S * r.uniform(0.07, 0.11), S * r.uniform(0.05, 0.08), r.uniform(0, 180)), 3)
        lay = over(lay, place(img, mm, C + dx * S, C + dy * S, S * size * 0.85, k * 40, shadow=0.3, edge=1.2))
    return lay


HOLLANDAISE = (84, 3, 44, 0.8)
NUTELLA = (24, 14, 20, 1.2)

ROLLS = {
    'pizzabroetchen': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls()},
    'pizzabroetchen-mit-kaese': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-kaese': roll_cheese()},
    'pizzabroetchen-mit-fuellung-nach-wahl': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-kaese': roll_cheese()},
    'pizzabroetchen-speciale': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-haehnchen': roll_chicken(), 'pb-kaese': roll_cheese(), 'pb-hollandaise': dollops(HOLLANDAISE)},
    'pizzabroetchen-doener': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-fleisch': roll_meat(), 'pb-kaese': roll_cheese()},
    'pizzabroetchen-doener-spezial': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-fleisch': roll_meat(), 'pb-kaese': roll_cheese(), 'pb-hollandaise': dollops(HOLLANDAISE)},
    'pizzabroetchen-sucuk': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-sucuk': roll_sucuk(), 'pb-kaese': roll_cheese()},
    'pizzabroetchen-nutella': lambda: {'pb-teller': snack_plate(), 'pb-broetchen': rolls(), 'pb-nutella': dollops(NUTELLA, size=0.1)},
}


# ---------------------------------------------------------------- Salate
@functools.lru_cache(None)
def salad_base():
    lay, inner = V.bowl()
    x0, y0, x1, y1 = P.bbox(inner)
    leaves_ = heap_into(M.lettuce(), cell(C, C, (x1 - x0) * 0.47, (y1 - y0) * 0.47), fill=1.15)
    im, m = M.shred_salad()
    shred = clip(place(im, m, C, C, S * 0.62, 0, shadow=0.3), cell(C, C, S * 0.22, S * 0.21))
    shred = P.soft_alpha(shred, 6) if hasattr(P, 'soft_alpha') else shred
    peppers = tiles_scatter(rendered('pepper_strip', 3, 20, color='g') + rendered('pepper_strip', 3, 21, color='r'), cell(C, C, S * 0.2, S * 0.19), 5, S * 0.1, 8)
    oim, oms = M.olives()
    olv = scatter(oim, oms, cell(C, C, S * 0.22, S * 0.21), 6, S * 0.055, 9)
    return {'salat-schuessel': lay, 'salat-blaetter': leaves_, 'salat-gemuese': over(shred, peppers), 'salat-oliven': olv}


def salad(extra=None):
    out = dict(salad_base())
    if extra:
        lay = blank()
        reg = cell(C, C, S * 0.2, S * 0.19)
        for kind, *args in extra:
            if kind == 'tiles':
                tl, n, size, seed = args
                lay = over(lay, tiles_scatter(tl, reg, n, size * S, seed))
            elif kind == 'heap':
                mat, cx, cy, w = args
                lay = over(lay, heap_small(mat, C + cx * S, C + cy * S, w * S, rot=(cx * 300) % 360))
        out['salat-extra'] = lay
    return out


SALADS = {
    'insalata-mista': lambda: salad(),
    'insalata-tonno': lambda: salad([('tiles', rendered('tuna', 4, 100), 5, 0.14, 11), ('tiles', rendered('corn', 3, 70), 12, 0.045, 12)]),
    'insalata-rucola': lambda: salad([('tiles', leaves('rucola'), 9, 0.16, 13)]),
    'insalata-fantasia': lambda: salad([('tiles', rendered('feta', 4, 250), 8, 0.1, 14)]),
    'insalata-capricciosa': lambda: salad([('tiles', rendered('ham', 3, 110), 3, 0.15, 15), ('tiles', rendered('tuna', 3, 100), 3, 0.12, 16), ('tiles', egg_slices(), 3, 0.11, 17),
                                           ('tiles', [M_peperoni() for _ in range(1)][0], 4, 0.07, 18), ('tiles', rendered('melt_cheese', 3, 230), 3, 0.1, 19), ('tiles', rendered('corn', 3, 70), 8, 0.045, 20)]),
    'insalata-mediteran': lambda: salad([('heap', M.chicken_strips(), 0.0, 0.0, 0.34)]),
    'insalata-gamberetti': lambda: salad([('tiles', rendered('shrimp', 4, 160), 6, 0.13, 21), ('tiles', garlic(), 6, 0.05, 22)]),
}


def M_peperoni():
    from base import tp

    return [tp.ring_slice(60 + i * 7, '#a7b13c', '#e5e1a2', '#f7f2d6', 0.8) for i in range(3)]


# ---------------------------------------------------------------- Snacks (auf dem Teller)
def count_on_plate(mat, n, size, seed, cols=3, squash=1.0, rot=None):
    """genau n Stück, locker und leicht überlappend auf dem Teller verteilt"""
    im, ms = mat
    return scatter(im, ms, cell(C, C, S * 0.16, S * 0.15), n, size * S * 1.2, seed, shadow=0.45, min_d=0.5)
    r = np.random.default_rng(seed)
    rows = math.ceil(n / cols)
    lay = blank()
    for k in range(n):
        cx = C + (k % cols - (cols - 1) / 2) * S * 0.62 / cols
        cy = C + (k // cols - (rows - 1) / 2) * S * 0.56 / rows
        cx += r.normal(0, S * 0.01)
        cy += r.normal(0, S * 0.01)
        lay = over(lay, place(im, ms[k % len(ms)], cx, cy, size * S * r.uniform(0.94, 1.06), r.uniform(-25, 25) if rot is None else rot + r.uniform(-12, 12), flip=bool(k % 2), shadow=0.45))
    return lay


@functools.lru_cache(None)
def cheese_sauce():
    """Käsesauce aus fries-cheese (nur die gelbe Sauce)"""
    im = P.load('fries-cheese')
    L, A, B = lab(im)
    m = P.clean(((B > 70) & (A > 5) & (A < 40)).astype(np.float32) * P.rrect(330, 175, 1880, 1700, 170, im.shape), 3, 5, 200)
    return im, m


SNACKS = {
    'pommes': lambda: {'snack-teller': snack_plate(), 'snack-pommes': heap_into(M.fries(), cell(C, C, S * 0.3, S * 0.28), fill=1.15)},
    'chilicheese-pommes': lambda: {'snack-teller': snack_plate(), 'snack-pommes': heap_into(M.fries(), cell(C, C, S * 0.3, S * 0.28), fill=1.15),
                                   'snack-chilicheese': clip(place(*cheese_sauce(), C, C, S * 0.62, 10, shadow=0.3), cell(C, C, S * 0.27, S * 0.25))},
    'chicken-nuggets': lambda: {'snack-teller': snack_plate(), 'snack-nuggets': count_on_plate(M.nugget_pieces(), 6, 0.25, 31)},
    'kroketten': lambda: {'snack-teller': snack_plate(), 'snack-kroketten': count_on_plate(M.croquette_pieces(), 6, 0.27, 32, cols=3, rot=0)},
    'onion-rings': lambda: {'snack-teller': snack_plate(), 'snack-onionrings': heap_into(M.onion_rings(), cell(C, C, S * 0.33, S * 0.31), fill=1.0)},
    'mozzarella-sticks': lambda: {'snack-teller': snack_plate(), 'snack-mozzarella': count_on_plate(mozz_sticks(), 6, 0.3, 33, cols=3, rot=0)},
    'chili-cheese-nuggets': lambda: {'snack-teller': snack_plate(), 'snack-ccnuggets': count_on_plate(M.fritter_pieces(), 6, 0.22, 34)},
    'suesskartoffeln': lambda: {'snack-teller': snack_plate(), 'snack-suesskartoffeln': heap_into(M.sweet_fries(), cell(C, C, S * 0.33, S * 0.31), fill=1.05)},
}


@functools.lru_cache(None)
def mozz_sticks():
    """Mozzarella-Sticks: die länglichen Stücke schmaler und heller"""
    im, ms = M.croquette_pieces()
    out = []
    for m in ms:
        x0, y0, x1, y1 = P.bbox(m)
        cx = (x0 + x1) / 2
        M_ = np.float32([[0.62, 0, cx * 0.38], [0, 1, 0]])
        out.append(cv2.warpAffine(m, M_, (m.shape[1], m.shape[0])))
    im2 = cv2.warpAffine(im, np.float32([[0.62, 0, 0], [0, 1, 0]]), (im.shape[1], im.shape[0]))
    # Bild mitschieben: je Stick eigene Abbildung wäre genauer, hier reicht die Mitte
    out_im = P.lab_shift(im, np.ones(im.shape[:2], np.float32), dL=6, db=-6)
    return out_im, [P.soft(cv2.erode((m > 0.5).astype(np.uint8), np.ones((1, 25), np.uint8)).astype(np.float32), 1) for m in ms]


# ---------------------------------------------------------------- Desserts
def nutella_pizza():
    """echter Pizzaboden (Hero-Pizza): Teig unten, darauf Nutella statt Sauce und Käse"""
    base = cv2.imread(os.path.join(P.ROOT, 'public/pizza/base.webp'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    crust = cv2.imread(os.path.join(P.ROOT, 'public/pizza/layer-crust.webp'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    base = cv2.resize(base, (S, S), interpolation=cv2.INTER_AREA)
    crust = cv2.resize(crust, (S, S), interpolation=cv2.INTER_AREA)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    rho = np.hypot(xx - C, yy - C) / (0.47 * S)
    inner = np.clip((0.83 - rho) / 0.05, 0, 1) * base[..., 3]
    L = lab(base[..., :3])[0]
    Lb = cv2.GaussianBlur(L, (0, 0), 3)
    gloss = np.clip((L - cv2.GaussianBlur(L, (0, 0), 8) - 16) / 30, 0, 1) * 0.6
    lab_c = np.zeros((S, S, 3), np.float32)
    lab_c[..., 0] = np.clip(58 + (Lb - 150) * 0.12 + 90 * gloss, 30, 220)
    lab_c[..., 1] = 128 + 13 - 6 * gloss
    lab_c[..., 2] = 128 + 18 - 10 * gloss
    choc = cv2.cvtColor(np.clip(lab_c, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32) / 255
    cm = np.clip(inner * 1.2 - 0.1, 0, 1)
    cl = np.dstack([crust[..., :3] * crust[..., 3:4], crust[..., 3]])
    return {'nutella-boden': over(P.drop_shadow(crust[..., 3]), cl), 'nutella-creme': over(P.contact(cm, 0.3), P.layer(choc, cm))}


DESSERTS = {
    'tiramisu': lambda: {'dessert-teller': snack_plate(), 'dessert-tiramisu': place(*M.tiramisu(), C, C + S * 0.02, S * 0.56, 0, shadow=0.45)},
    'pizza-nutella': nutella_pizza,
    'zimtschnecken': lambda: {'dessert-teller': snack_plate(), 'dessert-zimt': over(over(place(M.swirls()[0], M.swirls()[1][1], C - S * 0.12, C - S * 0.1, S * 0.32, 20, shadow=0.45),
                                                                                        place(M.swirls()[0], M.swirls()[1][2], C + S * 0.13, C - S * 0.06, S * 0.32, -15, shadow=0.45)),
                                                                                   place(M.swirls()[0], M.swirls()[1][0], C, C + S * 0.11, S * 0.38, 0, shadow=0.45))},
}


# ---------------------------------------------------------------- Saucen im Dip-Schälchen
def dip(target, flecks=None, seed=1):
    cup, img, m = V.dip_cup()
    img = P.lab_match(img, m, target[:3], target[3] if len(target) > 3 else 1.0)
    sauce = P.layer(img, m)
    if flecks:
        col, n, rmin, rmax = flecks
        r = np.random.default_rng(seed)
        fl = np.zeros((S, S), np.float32)
        ys, xs = np.nonzero(m > 0.9)
        for _ in range(n):
            i = r.integers(len(xs))
            cv2.ellipse(fl, (int(xs[i]), int(ys[i])), (int(r.uniform(rmin, rmax)), int(r.uniform(rmin, rmax) * 0.7)), r.uniform(0, 180), 0, 360, 1.0, -1, cv2.LINE_AA)
        fl = cv2.GaussianBlur(fl, (0, 0), 0.6) * m
        c = np.array(col[::-1], np.float32) / 255
        sauce = over(sauce, np.dstack([c * fl[..., None], fl]))
    return {'dip-becher': cup, 'dip-sauce': sauce}


DIPS = {
    'ketchup': lambda: dip((34, 48, 32, 1.3)),
    'mayonnaise': lambda: dip((93, -1, 12, 0.8)),
    'joppiesauce': lambda: dip((86, 4, 48, 0.9), ((246, 236, 214), 40, 3, 6)),
    'bbq-sauce': lambda: dip((24, 26, 26, 1.4)),
    'suess-sauer-sauce': lambda: dip((56, 48, 58, 1.1)),
    'curry-sauce': lambda: dip((38, 42, 40, 1.2), ((214, 150, 60), 60, 1, 2)),
    'knoblauchsauce': lambda: dip((94, -1, 7, 0.7), ((235, 228, 196), 50, 2, 3)),
    'cocktail-sauce': lambda: dip((74, 26, 26, 1.0)),
    'salsa-sauce': lambda: dip((42, 50, 40, 1.3), ((200, 50, 30), 40, 3, 6)),
    'chilisauce': lambda: dip((36, 54, 40, 1.3), ((240, 200, 110), 60, 1, 2)),
    'chilicheese-sauce': lambda: dip((74, 22, 70, 1.0), ((160, 30, 14), 50, 1, 3)),
    'andalouse': lambda: dip((64, 34, 46, 1.0), ((190, 50, 30), 30, 2, 4)),
    'samurai': lambda: dip((60, 36, 48, 1.0)),
    'kraeuterbutter': lambda: dip((88, -3, 40, 0.8), ((60, 120, 40), 90, 1.5, 3)),
    'chili-aioli': lambda: dip((92, 4, 12, 0.8), ((200, 40, 30), 70, 1.2, 2.5)),
}


# ---------------------------------------------------------------- Getränke (aufrecht, im Glas)
def drink(target, alpha=1.0, fizz=True, seed=1):
    glass_l, gi, lm, gm = V.glass()
    liq = P.lab_match(gi, lm, target[:3], target[3] if len(target) > 3 else 1.0)
    a = lm * alpha
    liquid = np.dstack([liq * a[..., None], a])
    out = {'drink-glas': glass_l, 'drink-inhalt': liquid}
    if fizz:
        r = np.random.default_rng(seed)
        b = np.zeros((S, S, 4), np.float32)
        ys, xs = np.nonzero(lm > 0.95)
        for _ in range(70):
            i = r.integers(len(xs))
            rr = r.uniform(1.5, 4)
            cv2.circle(b, (int(xs[i]), int(ys[i])), int(rr), (0.9, 0.95, 1.0, 0.6), 1, cv2.LINE_AA)
            cv2.circle(b, (int(xs[i] - rr * 0.3), int(ys[i] - rr * 0.3)), 1, (1, 1, 1, 0.9), -1, cv2.LINE_AA)
        b[..., :3] *= b[..., 3:4]
        out['drink-perlen'] = b
    return out


DRINKS = {
    'cola': lambda: drink((14, 16, 18, 0.6)),
    'cola-zero': lambda: drink((14, 16, 18, 0.6)),
    'fanta': lambda: drink((66, 42, 72, 0.9)),
    'sprite': lambda: drink((93, -6, 12, 0.35), alpha=0.45),
    'mezzo-mix': lambda: drink((20, 22, 24, 0.6)),
    'wasser': lambda: drink((96, -3, -2, 0.2), alpha=0.3, fizz=False),
    'uludag-gazoz': lambda: drink((94, -2, 10, 0.3), alpha=0.45),
    'ayran': lambda: drink((95, -1, 5, 0.25), fizz=False),
    'eistee': lambda: drink((42, 26, 46, 0.8), alpha=0.92, fizz=False),
    'red-bull': lambda: drink((78, 4, 52, 0.6), alpha=0.85),
}


# ---------------------------------------------------------------- Döner (Zuordnung)
DOENER = {
    'doenertasche': lambda: tasche(),
    'doenertasche-mit-gegrilltem-gemuese': lambda: tasche(('grilled',)),
    'doenertasche-mit-pommes': lambda: tasche(('fries',)),
    'chilicheese-doenertasche': lambda: tasche(('fries', 'jalapenos')),
    'doener-box': lambda: box_dish('meat'),
    'doenerteller': lambda: teller('meat'),
    'doener-dueruem': lambda: dueruem(),
    'sucuk-tasche': lambda: tasche(('fries', 'sucuk'), meat=False),
    'gemuesetasche': lambda: tasche(('grilled',), meat=False),
    'pommes-tasche': lambda: tasche(('fries',), meat=False),
    'lahmacun-doener': lambda: lahmacun(True),
    'lahmacun': lambda: lahmacun(False),
    'falafeltasche': lambda: tasche(('falafel',), meat=False),
    'gemuese-falafeltasche': lambda: tasche(('grilled', 'falafel'), meat=False),
    'falafel-dueruem': lambda: dueruem(True),
    'falafelteller': lambda: teller('falafel'),
    'falafel-box': lambda: box_dish('falafel'),
}

ALL = {**DOENER, **PASTA, **ROLLS, **SALADS, **SNACKS, **DESSERTS, **DIPS, **DRINKS}
