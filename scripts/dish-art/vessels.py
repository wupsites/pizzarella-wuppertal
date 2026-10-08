"""Gefäße und Böden: Teller, Schüssel, Box, Schale, Dip-Becher, Glas, Brote."""
import math

import cv2
import numpy as np

from base import C, RR, S, SS, TAU, XX, YY, blank, dome, drop_shadow, fbm, hexcol, lit, mix, over, rrect_mask, smooth, sstep


def _shade_white(mask, h, tint='#f7f4ee', spec=0.55, shin=70, bump=16):
    alb = mix(hexcol(tint), hexcol('#e9e3d8'), fbm(60, 2, 3) * 0.3)
    return lit(mask, h, alb, spec=spec, shin=shin, bump=bump, wrap=0.45, ao=0.15, shadow=0.25)


def plate(r_out=0.47, r_in=0.32):
    """flacher weißer Teller (Draufsicht)"""
    Ro, Ri = S * r_out, S * r_in
    m = np.clip((Ro - RR) / 1.2 + 0.5, 0, 1)
    # Spiegel flach, Fahne steigt an und fällt zum Rand leicht ab
    h = sstep(Ri, Ri + S * 0.06, RR) * (1 - 0.35 * sstep(Ro - S * 0.06, Ro, RR))
    out = over(blank(), drop_shadow(m, 6, 12, 16, 0.22))
    return over(out, _shade_white(m, h))


def bowl(r_out=0.47, r_floor=0.2):
    """tiefe Schüssel: Innenwand fängt Licht und Schatten"""
    Ro, Rf = S * r_out, S * r_floor
    m = np.clip((Ro - RR) / 1.2 + 0.5, 0, 1)
    rim = sstep(Ro - S * 0.035, Ro - S * 0.012, RR) * (1 - sstep(Ro - S * 0.01, Ro, RR))
    wall = sstep(Rf, Ro - S * 0.04, RR) ** 1.6
    h = wall * 1.0 + rim * 0.12
    out = over(blank(), drop_shadow(m, 7, 14, 18, 0.26))
    return over(out, _shade_white(m, h, '#f6f1e8', bump=26))


def dip_cup(r_out=0.36):
    """kleiner Dip-Becher mit geriffelter Wand"""
    Ro = S * r_out
    m = np.clip((Ro - RR) / 1.2 + 0.5, 0, 1)
    ang = np.arctan2(YY - C, XX - C)
    rib = (0.5 + 0.5 * np.cos(ang * 48)) * sstep(Ro - S * 0.06, Ro - S * 0.035, RR)
    h = sstep(Ro - S * 0.075, Ro - S * 0.02, RR) * (1 - 0.3 * sstep(Ro - S * 0.012, Ro, RR)) + rib * 0.05
    out = over(blank(), drop_shadow(m, 5, 9, 10, 0.24))
    return over(out, _shade_white(m, h, '#fbfaf7', spec=0.7, shin=90, bump=18))


def kraft_box(w=0.86, h=0.66, wall=0.05, rad=0.05, rot=0.0, deep=1.0):
    """offene Pappbox (Döner Box) – Kraftpapier, Innenboden etwas dunkler"""
    W_, H_ = S * w, S * h
    outer = rrect_mask(C, C, W_, H_, S * rad, rot)
    inner = rrect_mask(C, C, W_ - 2 * S * wall, H_ - 2 * S * wall, S * rad * 0.6, rot)
    inner_s = smooth(inner, 3)
    hgt = (1 - inner_s) * 1.0 * deep + 0.04 * fbm(8, 2, 5)
    fib = fbm(6, 3, 11)
    alb = mix(hexcol('#d3a874'), hexcol('#a87a48'), np.clip(fib * 0.5 + inner_s * 0.25, 0, 1))
    out = over(blank(), drop_shadow(outer, 6, 12, 14, 0.26))
    return over(out, lit(outer, hgt, alb, spec=0.08, shin=10, bump=14, wrap=0.35, ao=0.5, shadow=0.3))


def paper_tray(w=0.84, h=0.62, rot=-8.0):
    """Snack-Schale aus Kraftpapier mit weißem Einschlagpapier"""
    W_, H_ = S * w, S * h
    outer = rrect_mask(C, C, W_, H_, S * 0.16, rot)
    inner = rrect_mask(C, C, W_ - S * 0.07, H_ - S * 0.07, S * 0.13, rot)
    inner_s = smooth(inner, 4)
    hgt = (1 - inner_s) * 0.9 + 0.03 * fbm(8, 2, 7)
    alb = mix(hexcol('#cfa16b'), hexcol('#ad7d4a'), fbm(6, 3, 13) * 0.6)
    out = over(blank(), drop_shadow(outer, 6, 11, 13, 0.24))
    out = over(out, lit(outer, hgt, alb, spec=0.08, shin=10, bump=16, wrap=0.35, ao=0.5, shadow=0.3))
    # Einschlagpapier: zerknittert, leicht durchscheinend
    paper = rrect_mask(C, C, W_ - S * 0.1, H_ - S * 0.1, S * 0.11, rot)
    crinkle = fbm(26, 3, 21)
    hp = dome(paper, 10, 0.6) * 0.2 + crinkle * 0.5
    albp = mix(hexcol('#fbf7ee'), hexcol('#e8dfcc'), crinkle * 0.6)
    pp = lit(paper, hp, albp, spec=0.12, shin=12, bump=10, wrap=0.4, ao=0.2, shadow=0.15)
    return over(out, pp * 0.96)


def glass(r=0.4):
    """Trinkglas von oben: Rand, Boden, Lichtring"""
    R = S * r
    m_out = np.clip((R - RR) / 1.2 + 0.5, 0, 1)
    out = blank()
    # Lichtfleck/Kaustik auf dem Tisch + weicher Schatten
    out = over(out, drop_shadow(m_out, 8, 14, 18, 0.16))
    caust = np.exp(-(((XX - C - R * 0.25) ** 2 + (YY - C - R * 0.3) ** 2) / (R * 0.5) ** 2)) * 0.18 * m_out
    lay = np.zeros((S, S, 4), np.float32)
    # Glaskörper: kaum Farbe, leichte Tönung, Bodenring
    base_ring = np.exp(-((RR - R * 0.62) / (R * 0.05)) ** 2) * 0.22 + np.exp(-((RR - R * 0.9) / (R * 0.04)) ** 2) * 0.12
    a = np.clip(0.07 + base_ring, 0, 1) * m_out
    col = np.array([0.93, 0.95, 0.94], np.float32)
    lay[..., :3] = col * a[..., None] + caust[..., None] * np.array([1.0, 0.98, 0.9], np.float32)
    lay[..., 3] = np.clip(a + caust, 0, 1)
    out = over(out, lay)
    # Rand: heller Ring mit Glanzbögen
    ring = np.exp(-((RR - R * 0.975) / (R * 0.022)) ** 2)
    ang = np.arctan2(YY - C, XX - C)
    gl = (np.clip(np.cos(ang + 2.4), 0, 1) ** 6 * 0.9 + np.clip(np.cos(ang - 0.7), 0, 1) ** 10 * 0.5) * np.exp(-((RR - R * 0.95) / (R * 0.03)) ** 2)
    rim = np.zeros((S, S, 4), np.float32)
    ra = np.clip(ring * 0.55 + gl, 0, 1)
    rim[..., :3] = ra[..., None] * np.array([0.98, 0.99, 1.0], np.float32)
    rim[..., 3] = ra
    return over(out, rim)


def flatbread_pocket(seed=3):
    """Dönertasche: halbes Fladenbrot (Pide) mit Sesam und Schwarzkümmel, oben offen"""
    R = S * 0.45
    cy = S * 0.37
    d = np.hypot(XX - C, YY - cy)
    # Schnittkante leicht gewölbt (das Brot ist prall gefüllt)
    cut = cy - S * 0.03 * (1 - ((XX - C) / R) ** 2)
    m = np.clip((R - d) / 1.2 + 0.5, 0, 1) * np.clip((YY - cut) / 1.5 + 0.5, 0, 1)
    m = np.clip(smooth(m, 2.2) * 1.7 - 0.35, 0, 1)
    dist = cv2.distanceTransform((m > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
    h = np.clip(dist / (S * 0.09), 0, 1) ** 0.5
    # Fingerdellen in Reihen (typisch für Pide)
    u = (XX - C + (YY - cy)) / (S * 0.13)
    v = (XX - C - (YY - cy)) / (S * 0.13)
    dimples = (np.cos(u * math.pi) * np.cos(v * math.pi) * 0.5 + 0.5) ** 4
    inner = sstep(S * 0.05, S * 0.11, dist)
    h = h - dimples * 0.07 * inner + fbm(24, 3, seed) * 0.05
    # goldbraun gebacken, oben auf der Wölbung am dunkelsten
    bake = np.clip((fbm(40, 3, seed + 1) - 0.3) * 0.9 + h * 0.35, 0, 1)
    alb = mix(hexcol('#eec27c'), hexcol('#b56f2e'), np.clip(bake * 0.85 - dimples * inner * 0.2, 0, 1))
    out = over(blank(), drop_shadow(m, 6, 12, 14, 0.24))
    out = over(out, lit(m, h, alb, spec=0.3, shin=16, bump=12, wrap=0.4, ao=0.45, shadow=0.3))
    # Sesam (hell) und Schwarzkümmel (dunkel), über die ganze Oberseite
    r = np.random.default_rng(seed)
    seeds = np.zeros((S, S, 4), np.float32)
    ys, xs = np.nonzero((dist > S * 0.025) & (m > 0.5))
    for k in range(130):
        i = r.integers(len(xs))
        x, y = int(xs[i]), int(ys[i])
        dark = k % 3 == 0
        rl = r.uniform(3.4, 4.6) if not dark else r.uniform(1.8, 2.6)
        col = (0.62, 0.86, 0.96) if not dark else (0.07, 0.07, 0.09)
        cv2.ellipse(seeds, (x, y), (int(rl), max(1, int(rl * 0.55))), r.uniform(0, 180), 0, 360, (*col, 1.0), -1, cv2.LINE_AA)
    out = over(out, seeds)
    # Schnittkante: helle, poröse Krume
    band = np.clip(1 - np.abs(YY - cut - 5) / 5.5, 0, 1) * (d < R - 8)
    cr = np.zeros((S, S, 4), np.float32)
    ca = np.clip(band * (0.8 + 0.2 * fbm(4, 2, seed + 5)), 0, 1)
    cr[..., :3] = ca[..., None] * mix(hexcol('#f6e6c2'), hexcol('#dcc08c'), fbm(3, 2, seed + 6))
    cr[..., 3] = ca
    return over(out, cr)


def yufka(seed=4, r=0.46):
    """Dürüm-Fladen: dünn, hell, mit weichen Röstflecken von der Platte"""
    R = S * r
    m = np.clip((R * (1 + 0.025 * np.sin(np.arctan2(YY - C, XX - C) * 5 + 1)) - RR) / 1.2 + 0.5, 0, 1)
    spots = np.clip((fbm(28, 3, seed) - 0.58) * 3.2, 0, 1)
    char = np.clip((fbm(6, 2, seed + 3) - 0.74) * 6, 0, 1) * spots
    alb = mix(hexcol('#f5e7c8'), hexcol('#d39a5c'), spots * 0.85)
    alb = alb * (1 - char[..., None] * 0.4) + hexcol('#8a5326')[None, None] * char[..., None] * 0.4
    # weiche Falten statt Körnung: der Fladen ist dünn und glatt
    h = dome(m, 8, 0.6) * 0.15 + smooth(fbm(60, 2, seed + 9), 4) * 0.5 + spots * 0.04
    out = over(blank(), drop_shadow(m, 5, 9, 10, 0.2))
    return over(out, lit(m, h, alb, spec=0.14, shin=12, bump=10, wrap=0.45, ao=0.25, shadow=0.25))


def lahmacun_base(seed=6, r=0.46):
    """Lahmacun: dünner Teig, knuspriger Rand, dünn aufgestrichene Hackfleischmasse"""
    R = S * r
    ang = np.arctan2(YY - C, XX - C)
    edge = R * (1 + 0.03 * np.sin(ang * 4 + 0.5) + 0.02 * np.sin(ang * 9 + 2))
    m = np.clip((edge - RR) / 1.2 + 0.5, 0, 1)
    rim = sstep(edge - S * 0.05, edge - S * 0.008, RR)
    # Masse: bis kurz vor den Rand, mit kleinen Lücken, durch die der Teig scheint
    cover = (1 - sstep(edge - S * 0.075, edge - S * 0.04, RR + fbm(8, 2, seed + 4) * S * 0.03))
    holes = np.clip((fbm(9, 2, seed + 2) - 0.68) * 5, 0, 1)
    paste = np.clip(cover - holes * 0.8, 0, 1)
    # Hackfleisch: viele kleine, runde Krümel (weich schattiert) statt Rauschen
    rg = np.random.default_rng(seed + 5)
    gm = np.zeros((S, S), np.float32)
    for _ in range(4200):
        x, y = rg.uniform(0, S), rg.uniform(0, S)
        cv2.circle(gm, (int(x), int(y)), int(rg.uniform(2.5, 5)), float(rg.uniform(0.6, 1.0)), -1, cv2.LINE_AA)
    gran = np.clip(smooth(gm, 0.9), 0, 1)
    oil = np.clip((fbm(16, 2, seed + 7) - 0.5) * 2, 0, 1)
    dough = mix(hexcol('#ecc888'), hexcol('#a4612a'), np.clip(rim * 0.85 + np.clip((fbm(12, 2, seed) - 0.6) * 3, 0, 1) * 0.5, 0, 1))
    meat = mix(hexcol('#7a2c18'), hexcol('#c05a36'), np.clip(gran * 0.9, 0, 1))
    meat = meat * (1 - oil[..., None] * 0.3) + hexcol('#d0622c')[None, None] * oil[..., None] * 0.3
    alb = dough * (1 - paste[..., None]) + meat * paste[..., None]
    h = rim * 0.35 + paste * (0.1 + gran * 0.22) + fbm(8, 2, seed + 3) * 0.05
    out = over(blank(), drop_shadow(m, 5, 9, 10, 0.22))
    return over(out, lit(m, h, alb, spec=0.4, shin=26, bump=9, wrap=0.35, ao=0.4, shadow=0.25))
