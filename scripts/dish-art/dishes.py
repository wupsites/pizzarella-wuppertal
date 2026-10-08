"""
Ebenen der Gerichte. Jede Funktion liefert eine vormultiplizierte S×S-Ebene;
build.py speichert sie unter public/dishes/<name>.webp. Welche Ebenen zu
welchem Gericht gehören (und wie sie beschriftet sind), steht in
src/lib/dish-art.ts – dort nur, was in der Beschreibung der Karte steht.
"""
import math

import cv2
import numpy as np

import parts
import pieces as P
import vessels as V
from base import C, RR, S, TAU, XX, YY, blank, dome, ellipse_mask, fbm, hexcol, lit, mix, over, place, rrect_mask, scatter, smooth, sstep, tp

# ---------------------------------------------------------------- Stück-Vorräte (einmal rendern)
_cache = {}


def pool_of(name, fn, n):
    if name not in _cache:
        _cache[name] = [fn(i) for i in range(n)]
    return _cache[name]


def KEBAB():
    return pool_of('kebab', lambda i: tp.doener(130 + i * 101), 6)


def FRIES():
    return pool_of('fries', lambda i: tp.fries(270 + i * 101), 6)


def CHICKEN():
    return pool_of('chicken', lambda i: tp.chicken(120 + i * 101), 5)


def ONION():
    return pool_of('onion', lambda i: tp.onion(30 + i * 101), 4)


def ICEBERG():
    return pool_of('iceberg', lambda i: P.iceberg(400 + i * 13), 6)


def CABBAGE():
    return pool_of('cabbage', lambda i: P.cabbage(500 + i * 13), 6)


def CUCUMBER():
    return pool_of('cucumber', lambda i: P.cucumber(600 + i * 13), 3)


def TOMATO():
    return pool_of('tomato', lambda i: P.tomato_slice(700 + i * 13), 3)


def LETTUCE():
    return pool_of('lettuce', lambda i: P.lettuce(800 + i * 13, *(('#a9cf5c', '#4f8a2a') if i % 3 else ('#c9e07a', '#6f9c3a'))), 6)


def FALAFEL():
    return pool_of('falafel', lambda i: P.falafel(900 + i * 13, half=(i == 2)), 4)


def GRILLED():
    return pool_of('grilled', lambda i: P.grilled(1000 + i * 13, 'zucchini' if i % 2 == 0 else 'aubergine') if i < 4 else tp.pepper_strip(1000 + i, 'ry'[i % 2]), 6)


def JALAPENO():
    return pool_of('jala', lambda i: tp.ring_slice(50 + i * 7, '#2f6e22', '#9dc46c', '#efe9bf', 0.8), 4)


def SUCUK():
    if 'sucuk' not in _cache:
        _cache['sucuk'] = tp.real_slices(dark=True)[4:10]
    return _cache['sucuk']


# ---------------------------------------------------------------- Döner im Fladenbrot (Tasche)
POCKET_FILL = (C, S * 0.3, S * 0.38, S * 0.13)  # Füllung quillt oben aus dem Brot


def _pocket_region(dy=0.0, shrink=1.0):
    cx, cy, rx, ry = POCKET_FILL
    return ellipse_mask(cx, cy + dy * S, rx * shrink, ry * shrink)


def pocket_meat():
    return scatter(blank(), KEBAB(), _pocket_region(0.015), 40, S * 0.18, 11, min_dist=S * 0.04)


def pocket_salad():
    lay = scatter(blank(), ICEBERG(), _pocket_region(-0.01, 0.95), 24, S * 0.14, 12, min_dist=S * 0.05)
    return scatter(lay, CABBAGE(), _pocket_region(-0.01, 0.95), 20, S * 0.13, 13, min_dist=S * 0.045)


def pocket_veg():
    lay = scatter(blank(), CUCUMBER(), _pocket_region(-0.015, 0.92), 6, S * 0.085, 14, min_dist=S * 0.1)
    lay = scatter(lay, TOMATO(), _pocket_region(-0.015, 0.92), 6, S * 0.095, 15, min_dist=S * 0.1)
    return scatter(lay, ONION(), _pocket_region(-0.02, 0.92), 7, S * 0.075, 16, min_dist=S * 0.08)


def pocket_salad_mix():
    """Eisberg, Kraut, Zwiebeln, Gurken, Tomaten in einer Ebene"""
    return over(pocket_salad(), pocket_veg())


def pocket_greens():
    """„Salat“ ohne nähere Angabe: Eisberg mit etwas Tomate"""
    lay = scatter(blank(), ICEBERG(), _pocket_region(-0.01), 26, S * 0.13, 17, min_dist=S * 0.05)
    return scatter(lay, TOMATO(), _pocket_region(-0.015, 0.9), 5, S * 0.09, 18, min_dist=S * 0.1)


def pocket_sauce():
    cx, cy, rx, ry = POCKET_FILL
    return parts.drizzle((cx - rx * 0.8, cy - ry * 0.7, cx + rx * 0.8, cy + ry * 0.5), '#fbf8ee', '#e9e1cd', n=2, width=11, seed=21, amp=0.6)


def pocket_fries():
    return scatter(blank(), FRIES(), _pocket_region(0.0), 18, S * 0.2, 19, min_dist=S * 0.05, rot=(-40, 40))


def pocket_grilled():
    return scatter(blank(), GRILLED(), _pocket_region(-0.005), 9, S * 0.14, 22, min_dist=S * 0.08)


def pocket_jalapenos():
    return scatter(blank(), JALAPENO(), _pocket_region(-0.02, 0.9), 8, S * 0.075, 23, min_dist=S * 0.07)


def pocket_sucuk():
    return scatter(blank(), SUCUK(), _pocket_region(-0.005, 0.95), 7, S * 0.14, 24, min_dist=S * 0.09)


def pocket_falafel():
    return scatter(blank(), FALAFEL(), _pocket_region(0.0, 0.95), 6, S * 0.13, 25, min_dist=S * 0.11)


# ---------------------------------------------------------------- Dürüm (offener Fladen, Füllung als Streifen)
def _wrap_region(shrink=1.0):
    return rrect_mask(C, C, S * 0.3 * shrink, S * 0.66 * shrink, S * 0.12, 0)


def wrap_meat():
    return scatter(blank(), KEBAB(), _wrap_region(), 30, S * 0.17, 31, min_dist=S * 0.045, rot=(60, 120))


def wrap_falafel():
    return scatter(blank(), FALAFEL(), _wrap_region(0.95), 7, S * 0.13, 32, min_dist=S * 0.11)


# ---------------------------------------------------------------- Lahmacun
def lahm_meat():
    return scatter(blank(), KEBAB(), ellipse_mask(C, C, S * 0.24, S * 0.22), 26, S * 0.16, 41, min_dist=S * 0.05)


def lahm_salad():
    reg = ellipse_mask(C, C, S * 0.3, S * 0.28)
    lay = scatter(blank(), ICEBERG(), reg, 20, S * 0.13, 42, min_dist=S * 0.06)
    lay = scatter(lay, TOMATO(), ellipse_mask(C, C, S * 0.26, S * 0.24), 6, S * 0.09, 43, min_dist=S * 0.1)
    return scatter(lay, ONION(), ellipse_mask(C, C, S * 0.26, S * 0.24), 6, S * 0.075, 44, min_dist=S * 0.08)


def lahm_sauce():
    return parts.drizzle((C - S * 0.26, C - S * 0.22, C + S * 0.26, C + S * 0.22), '#fbf8ee', '#e9e1cd', n=4, width=9, seed=45)


# ---------------------------------------------------------------- Box (Döner Box, Falafel Box)
BOX_IN = (S * 0.74, S * 0.54)


def box_fries():
    reg = rrect_mask(C, C, BOX_IN[0] * 0.98, BOX_IN[1] * 0.96, S * 0.03)
    return scatter(blank(), FRIES(), reg, 80, S * 0.23, 51, min_dist=S * 0.026)


def box_meat():
    return scatter(blank(), KEBAB(), ellipse_mask(C + S * 0.06, C, S * 0.24, S * 0.17), 26, S * 0.17, 52, min_dist=S * 0.045)


def box_falafel():
    return scatter(blank(), FALAFEL(), ellipse_mask(C + S * 0.06, C, S * 0.22, S * 0.16), 7, S * 0.13, 53, min_dist=S * 0.11)


def box_sauce():
    return parts.drizzle((C - S * 0.2, C - S * 0.16, C + S * 0.3, C + S * 0.16), '#fbf8ee', '#e9e1cd', n=3, width=10, seed=54)


# ---------------------------------------------------------------- Teller (Dönerteller, Falafelteller)
def plate_fries():
    return scatter(blank(), FRIES(), ellipse_mask(C - S * 0.12, C + S * 0.06, S * 0.15, S * 0.2), 36, S * 0.21, 61, min_dist=S * 0.03, rot=(-60, 60))


def plate_meat():
    return scatter(blank(), KEBAB(), ellipse_mask(C + S * 0.12, C + S * 0.06, S * 0.15, S * 0.19), 32, S * 0.17, 62, min_dist=S * 0.04)


def plate_falafel():
    return scatter(blank(), FALAFEL(), ellipse_mask(C + S * 0.12, C + S * 0.07, S * 0.13, S * 0.16), 5, S * 0.13, 63, min_dist=S * 0.11)


def plate_salad():
    reg = ellipse_mask(C, C - S * 0.18, S * 0.2, S * 0.09)
    lay = scatter(blank(), ICEBERG(), reg, 14, S * 0.12, 64, min_dist=S * 0.05)
    lay = scatter(lay, TOMATO(), reg, 3, S * 0.085, 65, min_dist=S * 0.1)
    return scatter(lay, CUCUMBER(), reg, 3, S * 0.08, 66, min_dist=S * 0.1)


def plate_sauce():
    return parts.drizzle((C + S * 0.0, C - S * 0.08, C + S * 0.25, C + S * 0.2), '#fbf8ee', '#e9e1cd', n=3, width=9, seed=67)


# ---------------------------------------------------------------- Pasta
NEST = S * 0.25


def pasta_spaghetti():
    return parts.strands(NEST, 3, n=150, width=7.5, col='#f6d47c', dark='#d19c3e')


def pasta_tagliatelle():
    return parts.strands(NEST * 0.92, 5, n=130, width=7.5, col='#f4d27a', dark='#cf973c', ribbon=True)


def pasta_penne():
    lay = scatter(blank(), pool_of('penne', lambda i: P.penne(1100 + i * 13), 6), ellipse_mask(C, C, NEST * 0.95, NEST * 0.9), 34, S * 0.15, 71, min_dist=S * 0.04)
    return lay


def _pasta_pool(seed, r=0.17):
    ang = np.arctan2(YY - C, XX - C)
    edge = S * r * (1 + 0.12 * np.sin(ang * 3 + seed) + 0.07 * np.sin(ang * 7 + 2 * seed))
    return np.clip((edge - RR) / 1.5 + 0.5, 0, 1)


def _coat(col, alpha, seed):
    """dünner Saucenfilm über den Nudeln (Sahnesaucen)"""
    m = np.clip((NEST * 1.02 - RR) / 6, 0, 1) * np.clip(0.55 + 0.6 * fbm(18, 2, seed), 0, 1)
    out = np.zeros((S, S, 4), np.float32)
    out[..., :3] = hexcol(col)[None, None] * (m * alpha)[..., None]
    out[..., 3] = m * alpha
    return out


def _sauce(light, dark, seed, coat=None, coat_a=0.35, r=0.17, **kw):
    lay = blank()
    if coat:
        lay = over(lay, _coat(coat, coat_a, seed))
    return over(lay, parts.pool(_pasta_pool(seed, r), light, dark, seed=seed, soft=4, **kw))


def sauce_napoli():
    m = _pasta_pool(81)
    chunks = parts.specks(82, 50, 3, 7, m) * m
    return _sauce('#d8401f', '#9e1f0e', 81, chunks=chunks, chunk_col='#b0230f')


def sauce_arrabiata():
    m = _pasta_pool(83)
    fl = parts.specks(84, 70, 1.5, 3.2, m) * m
    return _sauce('#d23a1b', '#8e1a0b', 83, flecks=fl, fleck_col='#5a0d06')


def sauce_bolognese():
    lay = _sauce('#b8452a', '#7a2715', 85)
    crumbs = pool_of('bolo', lambda i: tp.bolognese(180 + i * 101), 3)
    return scatter(lay, crumbs, _pasta_pool(85, 0.15), 10, S * 0.11, 86, min_dist=S * 0.06)


def sauce_carbonara():
    m = _pasta_pool(87, 0.18)
    fl = parts.specks(88, 60, 1.2, 2.4, m) * m * 0.6
    return _sauce('#fbf0c8', '#e8d18e', 87, coat='#f8ebc0', coat_a=0.45, r=0.18, flecks=fl, fleck_col='#5b4a32')


def sauce_formaggi():
    return _sauce('#fdf6dc', '#ecdcaa', 89, coat='#fbf1d0', coat_a=0.45, r=0.18)


def sauce_hollandaise():
    return _sauce('#fde9a0', '#efc659', 90, coat='#fbe39a', coat_a=0.4)


def sauce_cremefraiche():
    return _sauce('#fffcf2', '#ece6d4', 91, coat='#fffaf0', coat_a=0.45, r=0.18)


def sauce_sahne():
    return _sauce('#fefaee', '#ebe2c9', 92, coat='#fdf7e8', coat_a=0.45, r=0.18)


def sauce_tomatensahne():
    return _sauce('#f08a55', '#c4552c', 93, coat='#f3a578', coat_a=0.3)


def sauce_curry():
    return _sauce('#f6c24a', '#d9902a', 94, coat='#f4c968', coat_a=0.35)


def sauce_rose():
    return _sauce('#f5a493', '#d66f5d', 95, coat='#f6b9aa', coat_a=0.3)


def _tops(pools, n, size, seed, r=0.2):
    lay = blank()
    reg = ellipse_mask(C, C, S * r, S * r * 0.95)
    for k, (pcs, cnt) in enumerate(pools):
        lay = scatter(lay, pcs, reg, cnt, size, seed + k * 5, min_dist=size * 0.7)
    return lay


def pasta_chicken():
    return _tops([(CHICKEN(), 8)], 8, S * 0.13, 101)


def pasta_chicken_broccoli():
    return _tops([(CHICKEN(), 6), (pool_of('broc', lambda i: tp.broccoli(210 + i * 101), 3), 6)], 12, S * 0.12, 102)


def pasta_chicken_mushrooms():
    return _tops([(CHICKEN(), 5), (pool_of('mush', lambda i: tp.mushroom(10 + i * 101), 3), 6)], 11, S * 0.12, 103)


def pasta_onions_spinach():
    spin = pool_of('spin', lambda i: tp.leaf(200 + i, '#2f5a22', '#173a12', 0.1, 0.5), 3)
    return _tops([(spin, 6), (ONION(), 6)], 12, S * 0.11, 104)


def pasta_chicken_spinach():
    spin = pool_of('spin', lambda i: tp.leaf(200 + i, '#2f5a22', '#173a12', 0.1, 0.5), 3)
    return _tops([(spin, 6), (CHICKEN(), 6)], 12, S * 0.12, 105)


def pasta_kebab():
    return _tops([(KEBAB(), 12)], 12, S * 0.14, 106)


def pasta_shrimp():
    return _tops([(pool_of('shrimp', lambda i: tp.shrimp(160 + i * 101), 4), 7)], 7, S * 0.13, 107)


def pasta_ham():
    hams = pool_of('ham', lambda i: tp.ham(110 + i * 101), 3)
    return _tops([(hams, 9)], 9, S * 0.08, 108)


def pasta_chili():
    return _tops([(pool_of('chili', lambda i: P.chili_ring(1200 + i * 13), 4), 9)], 9, S * 0.06, 109)


def pasta_garlic_chili():
    return _tops([(pool_of('garlic', lambda i: P.garlic_slice(1300 + i * 13), 4), 10), (pool_of('chili', lambda i: P.chili_ring(1200 + i * 13), 4), 7)], 17, S * 0.055, 110)


def pasta_cheese():
    pools = [
        (pool_of('parm', lambda i: tp.parmesan(240 + i * 101), 3), 4),
        (pool_of('gorg', lambda i: tp.gorgonzola(260 + i * 101), 3), 3),
        (pool_of('feta', lambda i: tp.feta(250 + i * 101), 3), 3),
        (pool_of('melt', lambda i: tp.melt_cheese(230 + i * 101), 3), 3),
    ]
    return _tops(pools, 13, S * 0.1, 111)


def pasta_aglio():
    """Ölglanz über den Spaghetti (Aglio e Olio)"""
    m = np.clip((NEST * 0.95 - RR) / 8, 0, 1) * np.clip(fbm(20, 2, 112) * 1.4 - 0.3, 0, 1)
    out = np.zeros((S, S, 4), np.float32)
    out[..., :3] = hexcol('#f3d36a')[None, None] * (m * 0.22)[..., None]
    out[..., 3] = m * 0.22
    return out


# ---------------------------------------------------------------- Pizzabrötchen (8 Stück in der Schale)
TRAY_ROT = -8.0


def _roll_spots():
    pts = []
    a = math.radians(TRAY_ROT)
    for row in range(2):
        for col in range(4):
            x = (col - 1.5) * S * 0.17
            y = (row - 0.5) * S * 0.2 + (S * 0.02 if col % 2 else -S * 0.02)
            pts.append((C + x * math.cos(a) - y * math.sin(a), C + x * math.sin(a) + y * math.cos(a)))
    return pts


def rolls():
    lay = blank()
    rs = pool_of('roll', lambda i: P.dough_roll(1400 + i * 13), 4)
    for k, (x, y) in enumerate(_roll_spots()):
        lay = place(lay, rs[k % len(rs)], x, y, S * 0.175, k * 47)
    return lay


def _on_rolls(pcs, per, size, seed, spread=0.04):
    r = np.random.default_rng(seed)
    lay = blank()
    for (x, y) in _roll_spots():
        for j in range(per):
            lay = place(lay, pcs[r.integers(len(pcs))], x + r.normal(0, S * spread), y + r.normal(0, S * spread), size * r.uniform(0.85, 1.15), r.uniform(0, 360))
    return lay


def roll_cheese():
    """geschmolzener Käse oben auf jedem Brötchen"""
    lay = blank()
    r = np.random.default_rng(121)
    for (x, y) in _roll_spots():
        m = tp.fill(tp.organic(tp.R0 * 0.8, tp.R0 * 0.72, int(r.integers(1000)), 0.22, n=48, freq=(3, 5, 7)))
        m = np.clip((tp.smooth(m, 1.0) - 0.5) * 2.5 + 0.5, 0, 1)
        alb = tp.mix(hexcol('#fbe7a8'), hexcol('#e9b85a'), np.clip(tp.fbm(14, 2, 5) * 0.8, 0, 1))
        pc = tp.render(m, tp.dome(m, 10, 0.5) * 0.6, alb, spec=0.6, shin=40, bump=8, wrap=0.4, shadow=0.25)
        lay = place(lay, pc, x, y, S * 0.15, r.uniform(0, 360))
    return lay


def roll_kebab():
    return _on_rolls(KEBAB(), 3, S * 0.09, 122)


def roll_sucuk():
    return _on_rolls(SUCUK(), 2, S * 0.08, 123)


def roll_chicken():
    return _on_rolls(CHICKEN(), 3, S * 0.08, 124)


def roll_hollandaise():
    return parts.drizzle((C - S * 0.33, C - S * 0.2, C + S * 0.33, C + S * 0.2), '#fde7a0', '#eec25a', n=3, width=8, seed=125)


def roll_nutella():
    return parts.drizzle((C - S * 0.33, C - S * 0.2, C + S * 0.33, C + S * 0.2), '#6d3b1e', '#3a1c0c', n=3, width=10, seed=126)


# ---------------------------------------------------------------- Salate (Schüssel)
BOWL_R = S * 0.33


def salad_leaves():
    reg = ellipse_mask(C, C, BOWL_R, BOWL_R)
    return scatter(blank(), LETTUCE(), reg, 26, S * 0.2, 131, min_dist=S * 0.06)


def salad_veg():
    reg = ellipse_mask(C, C, BOWL_R * 0.9, BOWL_R * 0.9)
    lay = scatter(blank(), TOMATO(), reg, 5, S * 0.1, 132, min_dist=S * 0.12)
    lay = scatter(lay, CUCUMBER(), reg, 6, S * 0.095, 133, min_dist=S * 0.11)
    lay = scatter(lay, pool_of('pep', lambda i: tp.pepper_strip(20 + i, 'rgy'[i % 3]), 3), reg, 5, S * 0.12, 134, min_dist=S * 0.1)
    return scatter(lay, pool_of('olive', lambda i: tp.olive(40 + i * 101), 3), reg, 6, S * 0.06, 135, min_dist=S * 0.09)


def _salad_extra(pools, seed, r=0.27):
    lay = blank()
    reg = ellipse_mask(C, C, S * r, S * r)
    for k, (pcs, cnt, size) in enumerate(pools):
        lay = scatter(lay, pcs, reg, cnt, size, seed + k * 5, min_dist=size * 0.8)
    return lay


def TUNA():
    return pool_of('tuna', lambda i: tp.tuna(100 + i * 101), 3)


def CORN():
    return pool_of('corn', lambda i: tp.corn(70 + i * 101), 3)


def salad_tuna_corn():
    return _salad_extra([(TUNA(), 5, S * 0.13), (CORN(), 14, S * 0.04)], 141)


def salad_rucola():
    ruc = pool_of('ruc', lambda i: tp.leaf(190 + i, '#5c8d30', '#2f5418', 0.55, 0.3), 4)
    return _salad_extra([(ruc, 12, S * 0.14)], 142)


def salad_feta():
    return _salad_extra([(pool_of('feta', lambda i: tp.feta(250 + i * 101), 3), 9, S * 0.09)], 143)


def salad_capri1():
    hams = pool_of('ham', lambda i: tp.ham(110 + i * 101), 3)
    eggs = pool_of('eggs', lambda i: P.egg_slice(1500 + i * 13), 3)
    return _salad_extra([(hams, 4, S * 0.11), (TUNA(), 3, S * 0.12), (eggs, 3, S * 0.1)], 144)


def salad_capri2():
    pep = pool_of('peperoni', lambda i: tp.ring_slice(60 + i * 7, '#a7b13c', '#e5e1a2', '#f7f2d6', 0.8), 3)
    ch = pool_of('cstrip', lambda i: P.cheese_strip(1600 + i * 13), 4)
    return _salad_extra([(pep, 5, S * 0.07), (ch, 10, S * 0.1), (CORN(), 10, S * 0.04)], 145)


def salad_chicken():
    return _salad_extra([(CHICKEN(), 8, S * 0.13)], 146)


def salad_shrimp_garlic():
    return _salad_extra([(pool_of('shrimp', lambda i: tp.shrimp(160 + i * 101), 4), 6, S * 0.12), (pool_of('garlic', lambda i: P.garlic_slice(1300 + i * 13), 4), 7, S * 0.05)], 147)


# ---------------------------------------------------------------- Snacks (Schale)
TRAY_IN = (S * 0.7, S * 0.48)


def _tray_region(shrink=1.0):
    return rrect_mask(C, C, TRAY_IN[0] * shrink, TRAY_IN[1] * shrink, S * 0.1, TRAY_ROT)


def snack_fries(sweet=False):
    pcs = pool_of('sweet', lambda i: P.sweet_fries(1700 + i * 13), 5) if sweet else FRIES()
    return scatter(blank(), pcs, _tray_region(0.95), 85, S * 0.24, 151 + sweet, min_dist=S * 0.024)


def snack_sweetfries():
    return snack_fries(True)


def _count(pcs, n, size, seed, cols=3):
    """genau n Stück, locker im Raster in der Schale"""
    r = np.random.default_rng(seed)
    lay = blank()
    rows = math.ceil(n / cols)
    a = math.radians(TRAY_ROT)
    for k in range(n):
        cx = (k % cols - (cols - 1) / 2) * TRAY_IN[0] / cols * 0.95
        cy = (k // cols - (rows - 1) / 2) * TRAY_IN[1] / rows * 0.9
        cx += r.normal(0, S * 0.012)
        cy += r.normal(0, S * 0.012)
        x = C + cx * math.cos(a) - cy * math.sin(a)
        y = C + cx * math.sin(a) + cy * math.cos(a)
        lay = place(lay, pcs[k % len(pcs)], x, y, size * r.uniform(0.92, 1.08), r.uniform(0, 360))
    return lay


def snack_nuggets():
    return _count(pool_of('nug', lambda i: tp.nugget(140 + i * 101), 4), 6, S * 0.26, 161)


def snack_ccnuggets():
    def cc(i):
        t = tp.nugget(1800 + i * 13)
        # würzige, rötliche Panade
        tint = np.array([0.82, 0.9, 1.12], np.float32)
        t = t.copy()
        t[..., :3] = np.clip(t[..., :3] * tint, 0, 1)
        return t

    return _count(pool_of('ccnug', cc, 4), 6, S * 0.26, 162)


def snack_croquettes():
    return _count(pool_of('croq', lambda i: P.croquette(1900 + i * 13), 4), 6, S * 0.26, 163)


def snack_onionrings():
    return _count(pool_of('oring', lambda i: P.onion_ring(2000 + i * 13), 4), 6, S * 0.25, 164)


def snack_mozzarella():
    return _count(pool_of('mozz', lambda i: P.mozzarella_stick(2100 + i * 13), 4), 6, S * 0.3, 165, cols=2)


def snack_chilicheese():
    m = _tray_region(0.62)
    m = np.clip(smooth(m * np.clip(fbm(24, 2, 166) * 1.6 - 0.25, 0, 1), 3) * 2 - 0.4, 0, 1)
    fl = parts.specks(167, 50, 1.5, 3.2, m) * m
    return parts.pool(m, '#f8b43a', '#e07a16', seed=166, flecks=fl, fleck_col='#a3200e')


# ---------------------------------------------------------------- Desserts
def tiramisu_base():
    """Biskuit, mit Kaffee getränkt (untere Lage)"""
    m = rrect_mask(C, C, S * 0.5, S * 0.5, S * 0.02, 8)
    a = math.radians(8)
    px = (XX - C) * math.cos(a) + (YY - C) * math.sin(a)
    fingers = np.cos(px / (S * 0.05) * math.pi) * 0.5 + 0.5
    alb = mix(hexcol('#b9844f'), hexcol('#6e4120'), np.clip(fingers ** 2 * 0.6 + fbm(10, 2, 171) * 0.4, 0, 1))
    return lit(m, dome(m, 10, 0.5) * 0.4 + fingers * 0.2 + fbm(4, 2, 172) * 0.1, alb, spec=0.25, shin=20, bump=10, wrap=0.35, ao=0.3, shadow=0.35)


def tiramisu_cream():
    """Mascarpone-Creme, oben mit Kakao bestäubt; am Rand sieht man die Creme"""
    m = rrect_mask(C, C, S * 0.5, S * 0.5, S * 0.025, 8)
    dust = fbm(3, 2, 173)
    cover = np.clip(dome(m, 22, 1.0) * 1.3 - 0.15 + (fbm(12, 2, 174) - 0.5) * 0.5, 0, 1)
    cocoa = mix(hexcol('#8f5a35'), hexcol('#5a3019'), np.clip(dust * 0.9, 0, 1))
    cream = mix(hexcol('#fbf3df'), hexcol('#ead9b6'), fbm(8, 2, 175))
    alb = cream * (1 - cover[..., None]) + cocoa * cover[..., None]
    return lit(m, dome(m, 14, 0.5) * 0.5 + dust * 0.08 * cover, alb, spec=0.06, shin=8, bump=8, wrap=0.4, ao=0.3, shadow=0.4)


def nutella_pizza():
    ang = np.arctan2(YY - C, XX - C)
    edge = S * 0.36 * (1 + 0.03 * np.sin(ang * 5 + 1) + 0.02 * np.sin(ang * 11))
    m = np.clip((edge - RR) / 1.5 + 0.5, 0, 1)
    return parts.spread(m, 181)


def cinnamon():
    lay = blank()
    cr = pool_of('cin', lambda i: P.cinnamon_roll(2200 + i * 13), 3)
    for k, (dx, dy) in enumerate(((-0.13, -0.08), (0.14, -0.06), (0.0, 0.15))):
        lay = place(lay, cr[k], C + dx * S, C + dy * S, S * 0.33, k * 70)
    return lay


# ---------------------------------------------------------------- Dips
DIP_R = 0.295


def _dip(light, dark, seed, chunks=None, chunk_col=None, flecks=None, fleck_col=None, spec=0.9):
    m = np.clip((S * DIP_R - RR) / 1.5 + 0.5, 0, 1)
    return parts.pool(m, light, dark, seed=seed, spec=spec, chunks=chunks, chunk_col=chunk_col, flecks=flecks, fleck_col=fleck_col)


def _dip_region(shrink=0.9):
    return np.clip((S * DIP_R * shrink - RR) / 1.5 + 0.5, 0, 1)


DIPS = {
    'dip-ketchup': lambda: _dip('#c8261a', '#86100a', 201),
    'dip-mayo': lambda: _dip('#fbf5dc', '#eadfb8', 202),
    'dip-joppie': lambda: _dip('#f6dc7a', '#e3b84a', 203, flecks=parts.specks(204, 40, 2, 4.5, _dip_region()) * 0.85, fleck_col='#fbf3d8'),
    'dip-bbq': lambda: _dip('#7a2e14', '#3d1206', 205),
    'dip-suesssauer': lambda: _dip('#f2702c', '#c63f12', 206),
    'dip-curry': lambda: _dip('#c9471c', '#8a240c', 207, flecks=parts.specks(208, 60, 1, 2, _dip_region()) * 0.5, fleck_col='#e8a33c'),
    'dip-knoblauch': lambda: _dip('#fcf9ee', '#ebe4cf', 209, flecks=parts.specks(210, 50, 1.5, 3, _dip_region()) * 0.6, fleck_col='#e8dcae'),
    'dip-cocktail': lambda: _dip('#f4a58a', '#de7a5e', 211),
    'dip-salsa': lambda: _dip('#cf3a1e', '#93200d', 212, chunks=parts.specks(213, 40, 3, 6, _dip_region()), chunk_col='#e5583a'),
    'dip-chili': lambda: _dip('#d71f12', '#8f0d07', 214, flecks=parts.specks(215, 70, 1.2, 2.6, _dip_region()), fleck_col='#f2c46a'),
    'dip-chilicheese': lambda: _dip('#f6b13c', '#dd7616', 216, flecks=parts.specks(217, 50, 1.5, 3, _dip_region()), fleck_col='#a3200e'),
    'dip-andalouse': lambda: _dip('#ef8a52', '#cc5a2a', 218, chunks=parts.specks(219, 30, 2.5, 4.5, _dip_region()), chunk_col='#c8361b'),
    'dip-samurai': lambda: _dip('#e85a2c', '#b8340f', 220),
    'dip-kraeuterbutter': lambda: _dip('#f7e39a', '#e8c766', 221, flecks=parts.specks(222, 90, 1.5, 3.5, _dip_region()), fleck_col='#3f7a24', spec=0.5),
    'dip-chiliaioli': lambda: _dip('#fbf0dc', '#ecd8b8', 223, flecks=parts.specks(224, 70, 1.2, 2.6, _dip_region()), fleck_col='#c8261a'),
}


# ---------------------------------------------------------------- Getränke
GLASS_LIQ = 0.37
DRINKS = {
    'drink-cola': lambda: parts.liquid(GLASS_LIQ, '#5a2a14', '#1e0a04', 301),
    'drink-fanta': lambda: parts.liquid(GLASS_LIQ, '#ffa733', '#e66a06', 302),
    'drink-sprite': lambda: parts.liquid(GLASS_LIQ, '#f4f9e6', '#d3e6b8', 303, alpha=0.55),
    'drink-mezzo': lambda: parts.liquid(GLASS_LIQ, '#7a3712', '#2a0e04', 304),
    'drink-wasser': lambda: parts.liquid(GLASS_LIQ, '#eef6f8', '#cfe3ea', 305, alpha=0.45),
    'drink-gazoz': lambda: parts.liquid(GLASS_LIQ, '#f7f8ec', '#dfe7cf', 306, alpha=0.55),
    'drink-ayran': lambda: parts.liquid(GLASS_LIQ, '#ffffff', '#ece9e0', 307, cloudy=0.15, alpha=1.0),
    'drink-eistee': lambda: parts.liquid(GLASS_LIQ, '#d98a2e', '#7a3a0c', 308),
    'drink-redbull': lambda: parts.liquid(GLASS_LIQ, '#f3cf5a', '#d39a1c', 309, alpha=0.9),
    'bubbles-cola': lambda: parts.bubbles(GLASS_LIQ, 311, n=60, foam='#c8a17a'),
    'bubbles': lambda: parts.bubbles(GLASS_LIQ, 312, n=80),
}


# ---------------------------------------------------------------- Party-Pizza (60 × 40 cm, rechteckig)
def _party_from(path, inner_only=True):
    """Pizza-Ebene (rund) → rechteckiges Blech: Innenfläche ausschneiden und strecken"""
    import os

    from base import ROOT

    img = cv2.imread(os.path.join(ROOT, 'public/pizza', path), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    n = img.shape[0]
    # Quadrat innerhalb der Innenkante (Radius 0,47 × 0,8)
    half = int(n * 0.47 * 0.8 * 0.7)
    crop = img[n // 2 - half : n // 2 + half, n // 2 - half : n // 2 + half]
    W_, H_ = int(S * 0.78), int(S * 0.52)
    crop = cv2.resize(crop, (W_, H_), interpolation=cv2.INTER_CUBIC)
    out = np.zeros((S, S, 4), np.float32)
    y0, x0 = (S - H_) // 2, (S - W_) // 2
    out[y0 : y0 + H_, x0 : x0 + W_] = crop
    out[..., :3] *= out[..., 3:4]
    return out


def party_crust():
    m = rrect_mask(C, C, S * 0.9, S * 0.62, S * 0.05)
    inner = rrect_mask(C, C, S * 0.8, S * 0.53, S * 0.03)
    rim = np.clip(m - smooth(inner, 4), 0, 1)
    spots = np.clip((fbm(6, 2, 401) - 0.62) * 5, 0, 1) * rim
    alb = mix(hexcol('#ecc27c'), hexcol('#b46a2a'), np.clip(rim * 0.5 + fbm(20, 2, 402) * 0.4, 0, 1))
    alb = alb * (1 - spots[..., None] * 0.6) + hexcol('#4a2a14')[None, None] * spots[..., None] * 0.6
    dough = mix(hexcol('#f2dcab'), hexcol('#dcb576'), fbm(16, 2, 403))
    alb = alb * rim[..., None] + dough * (1 - rim[..., None])
    h = rim * 0.8 + dome(m, 10, 0.6) * 0.2
    out = over(blank(), V.drop_shadow(m, 6, 12, 14, 0.24))
    return over(out, lit(m, h, alb, spec=0.2, shin=16, bump=14, wrap=0.35, ao=0.4, shadow=0.3))


def party_sauce():
    return _party_from('layer-sauce.webp')


def party_cheese():
    return _party_from('layer-cheese.webp')


# ---------------------------------------------------------------- Liste aller Ebenen
def components():
    reg = {
        # Gefäße und Böden
        'plate': V.plate,
        'bowl': V.bowl,
        'dip-cup': V.dip_cup,
        'box': V.kraft_box,
        'tray': V.paper_tray,
        'glass': V.glass,
        'pocket': V.flatbread_pocket,
        'yufka': V.yufka,
        'lahmacun': V.lahmacun_base,
        'dessert-plate': lambda: V.plate(0.44, 0.3),
        # Döner und Falafel im Fladenbrot
        'pocket-meat': pocket_meat,
        'pocket-salad': pocket_salad,
        'pocket-veg': pocket_veg,
        'pocket-salad-mix': pocket_salad_mix,
        'pocket-greens': pocket_greens,
        'pocket-sauce': pocket_sauce,
        'pocket-fries': pocket_fries,
        'pocket-grilled': pocket_grilled,
        'pocket-jalapenos': pocket_jalapenos,
        'pocket-sucuk': pocket_sucuk,
        'pocket-falafel': pocket_falafel,
        'wrap-meat': wrap_meat,
        'wrap-falafel': wrap_falafel,
        'lahm-meat': lahm_meat,
        'lahm-salad': lahm_salad,
        'lahm-sauce': lahm_sauce,
        'box-fries': box_fries,
        'box-meat': box_meat,
        'box-falafel': box_falafel,
        'box-sauce': box_sauce,
        'plate-fries': plate_fries,
        'plate-meat': plate_meat,
        'plate-falafel': plate_falafel,
        'plate-salad': plate_salad,
        'plate-sauce': plate_sauce,
        # Pasta
        'pasta-spaghetti': pasta_spaghetti,
        'pasta-tagliatelle': pasta_tagliatelle,
        'pasta-penne': pasta_penne,
        'sauce-napoli': sauce_napoli,
        'sauce-arrabiata': sauce_arrabiata,
        'sauce-bolognese': sauce_bolognese,
        'sauce-carbonara': sauce_carbonara,
        'sauce-formaggi': sauce_formaggi,
        'sauce-hollandaise': sauce_hollandaise,
        'sauce-cremefraiche': sauce_cremefraiche,
        'sauce-sahne': sauce_sahne,
        'sauce-tomatensahne': sauce_tomatensahne,
        'sauce-curry': sauce_curry,
        'sauce-rose': sauce_rose,
        'pasta-chicken': pasta_chicken,
        'pasta-chicken-broccoli': pasta_chicken_broccoli,
        'pasta-chicken-mushrooms': pasta_chicken_mushrooms,
        'pasta-onions-spinach': pasta_onions_spinach,
        'pasta-chicken-spinach': pasta_chicken_spinach,
        'pasta-kebab': pasta_kebab,
        'pasta-shrimp': pasta_shrimp,
        'pasta-ham': pasta_ham,
        'pasta-chili': pasta_chili,
        'pasta-garlic-chili': pasta_garlic_chili,
        'pasta-cheese': pasta_cheese,
        'pasta-aglio': pasta_aglio,
        # Pizzabrötchen
        'rolls': rolls,
        'roll-cheese': roll_cheese,
        'roll-kebab': roll_kebab,
        'roll-sucuk': roll_sucuk,
        'roll-chicken': roll_chicken,
        'roll-hollandaise': roll_hollandaise,
        'roll-nutella': roll_nutella,
        # Salate
        'salad-leaves': salad_leaves,
        'salad-veg': salad_veg,
        'salad-tuna-corn': salad_tuna_corn,
        'salad-rucola': salad_rucola,
        'salad-feta': salad_feta,
        'salad-capri1': salad_capri1,
        'salad-capri2': salad_capri2,
        'salad-chicken': salad_chicken,
        'salad-shrimp-garlic': salad_shrimp_garlic,
        # Snacks
        'snack-fries': snack_fries,
        'snack-sweetfries': snack_sweetfries,
        'snack-nuggets': snack_nuggets,
        'snack-ccnuggets': snack_ccnuggets,
        'snack-croquettes': snack_croquettes,
        'snack-onionrings': snack_onionrings,
        'snack-mozzarella': snack_mozzarella,
        'snack-chilicheese': snack_chilicheese,
        # Desserts
        'tiramisu-base': tiramisu_base,
        'tiramisu-cream': tiramisu_cream,
        'nutella-pizza': nutella_pizza,
        'cinnamon': cinnamon,
        # Party-Pizza
        'party-crust': party_crust,
        'party-sauce': party_sauce,
        'party-cheese': party_cheese,
    }
    reg.update(DIPS)
    reg.update(DRINKS)
    return reg
