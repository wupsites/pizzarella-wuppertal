"""
Bausteine, die direkt auf der Ebene gezeichnet werden (keine Einzelstücke):
Saucen-Fäden, Saucen-Spiegel, Nudeln, Reis, Aufstriche, Getränke.
Alle Funktionen liefern eine vormultiplizierte S×S-Ebene.
"""
import math

import cv2
import numpy as np

from base import C, RR, S, TAU, XX, YY, blank, dome, fbm, hexcol, lit, mix, over, smooth, sstep


def drizzle(box, light, dark, n=5, width=9, seed=1, amp=0.35, spec=0.9, alpha=1.0):
    """Sauce in Fäden (Zickzack quer über eine Fläche): box = (x0, y0, x1, y1)"""
    r = np.random.default_rng(seed)
    x0, y0, x1, y1 = box
    m = np.zeros((S, S), np.float32)
    for i in range(n):
        y = y0 + (y1 - y0) * (i + 0.5) / n + r.uniform(-0.25, 0.25) * (y1 - y0) / n
        xs = np.linspace(x0, x1, 60)
        ph = r.uniform(0, TAU)
        ys = y + np.sin(xs / (x1 - x0) * TAU * r.uniform(1.4, 2.2) + ph) * amp * (y1 - y0) / n + r.normal(0, 1.2, xs.shape)
        pts = np.stack([xs, ys], 1)
        w = int(width * r.uniform(0.75, 1.15))
        cv2.polylines(m, [np.round(pts * 4).astype(np.int32)], False, 1.0, w, cv2.LINE_AA, shift=2)
    m = np.clip(smooth(m, 0.6) * 1.2, 0, 1)
    h = dome(m, width * 0.35, 0.5)
    alb = mix(hexcol(light), hexcol(dark), np.clip(1 - h + fbm(10, 2, seed) * 0.2, 0, 1) * 0.6)
    out = lit(m, h, alb, spec=spec, shin=60, bump=8, wrap=0.45, ao=0.2, shadow=0.35)
    return out * alpha


def pool(mask, light, dark, seed=1, spec=0.9, gloss_bump=8, chunks=None, chunk_col=None, flecks=None, fleck_col=None, soft=0.0):
    """Saucen-Spiegel in einer Maske (Dip, Pasta-Sauce): glänzend, Rand etwas dunkler.
    soft > 0: Rand läuft unregelmäßig aus (Sauce zwischen den Nudeln)"""
    if soft:
        mask = np.clip(smooth(mask, soft) * (0.7 + 0.6 * fbm(10, 2, seed + 50)) * 1.25 - 0.1, 0, 1)
    edge = 1 - dome(mask, 14, 1.0)
    swirl = smooth(fbm(30, 2, seed), 3)
    alb = mix(hexcol(light), hexcol(dark), np.clip(edge * 0.6 + swirl * 0.35, 0, 1))
    h = dome(mask, 22, 0.5) * 0.5 + swirl * 0.2
    if chunks is not None:
        alb = alb * (1 - chunks[..., None] * 0.8) + hexcol(chunk_col)[None, None] * chunks[..., None] * 0.8
        h = h + chunks * 0.25
    if flecks is not None:
        alb = alb * (1 - flecks[..., None]) + hexcol(fleck_col)[None, None] * flecks[..., None]
    return lit(mask, h, alb, spec=spec, shin=70, bump=gloss_bump, wrap=0.45, ao=0.15, shadow=0.2)


def specks(seed, n, rmin, rmax, region=None):
    """kleine Einschlüsse (Chili, Kräuter, Zwiebelstückchen) als Maske 0..1"""
    r = np.random.default_rng(seed)
    m = np.zeros((S, S), np.float32)
    ys, xs = (np.nonzero(region > 0.5) if region is not None else (None, None))
    for _ in range(n):
        if xs is not None:
            i = r.integers(len(xs))
            x, y = xs[i], ys[i]
        else:
            x, y = r.uniform(0, S), r.uniform(0, S)
        rr = r.uniform(rmin, rmax)
        cv2.ellipse(m, (int(x), int(y)), (max(1, int(rr)), max(1, int(rr * r.uniform(0.5, 1)))), r.uniform(0, 180), 0, 360, 1.0, -1, cv2.LINE_AA)
    return m


def strands(region_r, seed, n=80, width=7.0, col='#f3d48a', dark='#c99a45', ribbon=False, cx=C, cy=C):
    """Spaghetti/Tagliatelle als Nest: viele gebogene Fäden, jeder als Röhre schattiert"""
    r = np.random.default_rng(seed)
    out = blank()
    base, deep = hexcol(col), hexcol(dark)
    for i in range(n):
        # Bogen um einen Punkt nahe der Mitte
        ox, oy = r.normal(0, region_r * 0.18, 2)
        rad = r.uniform(0.35, 0.95) * region_r
        a0 = r.uniform(0, TAU)
        span = r.uniform(1.6, 3.6) * (1 if r.random() < 0.5 else -1)
        t = np.linspace(0, 1, 40)
        a = a0 + span * t
        wob = 1 + 0.06 * np.sin(t * 7 + r.uniform(0, TAU))
        xs = cx + ox + np.cos(a) * rad * wob
        ys = cy + oy + np.sin(a) * rad * wob * r.uniform(0.85, 1.0)
        pts = np.round(np.stack([xs, ys], 1) * 4).astype(np.int32)
        w = width * (r.uniform(1.8, 2.3) if ribbon else r.uniform(0.85, 1.1))
        # Schatten, Körper, Glanzlinie
        sh = np.zeros((S, S), np.float32)
        cv2.polylines(sh, [pts + np.array([6, 10])], False, 1.0, int(w + 3), cv2.LINE_AA, shift=2)
        sh = smooth(sh, 1.2) * 0.16
        lay = np.zeros((S, S, 4), np.float32)
        lay[..., 3] = sh
        lay[..., :3] = np.array([0.08, 0.2, 0.36], np.float32) * sh[..., None]
        out = over(out, lay)
        body = np.zeros((S, S), np.float32)
        cv2.polylines(body, [pts], False, 1.0, int(w), cv2.LINE_AA, shift=2)
        shade = 0.85 + 0.15 * r.random()
        colr = (base * shade * (1 - 0.25 * r.random()) + deep * 0.0).astype(np.float32)
        layb = np.zeros((S, S, 4), np.float32)
        layb[..., 3] = body
        # Kanten dunkler (Röhre), Mitte hell
        core = np.zeros((S, S), np.float32)
        cv2.polylines(core, [pts - 2], False, 1.0, max(1, int(w * (0.35 if not ribbon else 0.6))), cv2.LINE_AA, shift=2)
        core = smooth(core, 0.8) * body
        c3 = deep[None, None] * (1 - core[..., None]) * 0.35 + colr[None, None] * (0.65 + core[..., None] * 0.35)
        layb[..., :3] = c3 * body[..., None]
        out = over(out, layb)
        hl = np.zeros((S, S), np.float32)
        cv2.polylines(hl, [pts - 6], False, 1.0, 2 if not ribbon else 3, cv2.LINE_AA, shift=2)
        hl = smooth(hl, 0.6) * body * 0.55
        layh = np.zeros((S, S, 4), np.float32)
        layh[..., 3] = hl
        layh[..., :3] = np.array([0.93, 0.98, 1.0], np.float32) * hl[..., None]
        out = over(out, layh)
    return out


def rice(region, seed=1, n=1600):
    """Reis: viele Körner, als Haufen schattiert"""
    r = np.random.default_rng(seed)
    ys, xs = np.nonzero(region > 0.5)
    m = np.zeros((S, S), np.float32)
    grains = np.zeros((S, S), np.float32)
    for _ in range(n):
        i = r.integers(len(xs))
        x, y = int(xs[i]), int(ys[i])
        a = r.uniform(0, 180)
        cv2.ellipse(m, (x, y), (7, 3), a, 0, 360, 1.0, -1, cv2.LINE_AA)
        cv2.ellipse(grains, (x - 1, y - 1), (5, 2), a, 0, 360, 1.0, -1, cv2.LINE_AA)
    m = np.clip(m, 0, 1)
    h = dome(region, 40, 0.5) * 0.6 + smooth(grains, 0.6) * 0.3
    alb = mix(hexcol('#fbf6e6'), hexcol('#e6d9b4'), np.clip(1 - smooth(grains, 0.6), 0, 1) * 0.5)
    return lit(m, h, alb, spec=0.35, shin=30, bump=10, wrap=0.45, ao=0.4, shadow=0.3)


def spread(mask, seed=1, light='#6b3a1f', dark='#3a1c0c', swirl=True):
    """Aufstrich (Nutella): glänzend, mit Spachtel-Schwüngen"""
    ang = np.arctan2(YY - C, XX - C)
    sw = np.sin(RR / (S * 0.035) + ang * 2 + fbm(40, 2, seed) * 6) * 0.5 + 0.5 if swirl else fbm(20, 2, seed)
    h = dome(mask, 10, 0.5) * 0.4 + sw * 0.25
    alb = mix(hexcol(light), hexcol(dark), np.clip(sw * 0.5 + (1 - dome(mask, 8, 1)) * 0.3, 0, 1))
    return lit(mask, h, alb, spec=0.9, shin=60, bump=10, wrap=0.4, ao=0.2, shadow=0.3)


def liquid(r, top, deep, seed=1, cloudy=0.0, alpha=0.96):
    """Getränk im Glas von oben: Farbe nach innen tiefer, Meniskus hell, Spiegelung"""
    R = S * r
    m = np.clip((R - RR) / 1.2 + 0.5, 0, 1)
    depth = np.clip(1 - RR / R, 0, 1)
    col = mix(hexcol(top), hexcol(deep), depth ** 0.6)
    if cloudy:
        col = col * (1 - cloudy * 0.3) + np.float32(cloudy * 0.3) * fbm(30, 2, seed)[..., None]
    men = np.exp(-((RR - R * 0.97) / (R * 0.035)) ** 2)
    col = col * (1 - men[..., None] * 0.5) + np.array([0.95, 0.97, 1.0], np.float32) * men[..., None] * 0.5
    # Fensterreflex oben links
    refl = np.exp(-(((XX - C + R * 0.38) / (R * 0.22)) ** 2 + ((YY - C + R * 0.42) / (R * 0.1)) ** 2)) * 0.55
    col = col + refl[..., None] * np.array([0.9, 0.95, 1.0], np.float32)
    out = np.zeros((S, S, 4), np.float32)
    a = m * alpha
    out[..., :3] = np.clip(col, 0, 1) * a[..., None]
    out[..., 3] = a
    return out


def bubbles(r, seed=1, n=70, rim_bias=0.7, foam=None):
    """Kohlensäure: kleine Perlen mit Glanzpunkt, am Rand dichter; optional Schaumkranz"""
    R = S * r
    rg = np.random.default_rng(seed)
    out = blank()
    if foam:
        fm = np.clip((RR - R * 0.8) / (R * 0.12), 0, 1) * np.clip((R * 0.965 - RR) / 2, 0, 1)
        fm = np.clip(fm * (0.6 + 0.6 * fbm(4, 2, seed + 3)), 0, 1)
        f = np.zeros((S, S, 4), np.float32)
        f[..., :3] = hexcol(foam)[None, None] * fm[..., None]
        f[..., 3] = fm
        out = over(out, f)
    lay = np.zeros((S, S, 4), np.float32)
    for _ in range(n):
        rr = R * (1 - rg.random() ** (1 + rim_bias * 2)) * 0.94
        a = rg.uniform(0, TAU)
        x, y = C + math.cos(a) * rr, C + math.sin(a) * rr
        br = rg.uniform(2.0, 5.5)
        cv2.circle(lay, (int(x), int(y)), int(br), (0.85, 0.9, 0.95, 0.55), 1, cv2.LINE_AA)
        cv2.circle(lay, (int(x - br * 0.35), int(y - br * 0.35)), max(1, int(br * 0.35)), (1, 1, 1, 0.9), -1, cv2.LINE_AA)
    lay[..., :3] *= 1  # Farben sind bereits mit Alpha gewichtet gezeichnet
    lay[..., :3] = lay[..., :3] * lay[..., 3:4]
    return over(out, lay)
