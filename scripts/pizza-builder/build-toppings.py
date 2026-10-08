"""
Pizza-Baukasten, Teil 2: die Zutaten als Sprite-Atlas.

    python3 scripts/pizza-builder/build-toppings.py

Salami/Sucuk: echte Scheiben aus dem Hero-Foto (src/assets/hero/pizza-top.png).
Alles andere wird wie ein Produktfoto „beleuchtet“ statt flach gezeichnet:
Form (Maske) → Höhenfeld → Normalen → Licht von oben links, weiche
Selbstverschattung, Glanz je Material, feine Struktur aus Rauschen,
Kontaktschatten. Gerendert in doppelter Auflösung, dann verkleinert.

Ergebnis in public/pizza/:
  toppings.webp    Atlas, Kacheln TILE×TILE, je Zutat eine Zeile mit Varianten
  toppings.json    { tile, rows: { id: { row, n } } }
"""
import json
import math
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERO = os.path.join(ROOT, 'src/assets/hero/pizza-top.png')
OUT = os.path.join(ROOT, 'public/pizza')
TILE = 160
SS = 2  # Supersampling
W = TILE * SS
C = W / 2
TAU = math.tau
YY, XX = np.mgrid[0:W, 0:W].astype(np.float32)
LIGHT = np.array([-0.5, -0.62, 0.6], np.float32)
LIGHT /= np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1], np.float32)
HALF /= np.linalg.norm(HALF)


# ---------------------------------------------------------------- Rauschen
def vnoise(cell, seed, shape=(W, W)):
    r = np.random.default_rng(seed)
    gh, gw = shape[0] // cell + 3, shape[1] // cell + 3
    g = r.random((gh, gw)).astype(np.float32)
    up = cv2.resize(g, (gw * cell, gh * cell), interpolation=cv2.INTER_CUBIC)
    return up[cell : cell + shape[0], cell : cell + shape[1]]


def fbm(cell, oct_, seed, gain=0.5):
    s = np.zeros((W, W), np.float32)
    a, t = 1.0, 0.0
    for o in range(oct_):
        s += a * vnoise(max(2, cell >> o), seed + 31 * o)
        t += a
        a *= gain
    return s / t


def speck(seed, density, rmin, rmax):
    """runde Einschlüsse (Fett, Kerne) als weiche Maske"""
    r = np.random.default_rng(seed)
    m = np.zeros((W, W), np.float32)
    for _ in range(int(density)):
        x, y = r.uniform(0, W), r.uniform(0, W)
        rr = r.uniform(rmin, rmax) * SS
        cv2.ellipse(m, (int(x), int(y)), (max(1, int(rr)), max(1, int(rr * r.uniform(0.6, 1)))), r.uniform(0, 180), 0, 360, 1.0, -1, cv2.LINE_AA)
    return m


# ---------------------------------------------------------------- Formen
def organic(rx, ry, seed, wob=0.08, n=64, rot=0.0, cx=C, cy=C, freq=(2, 3, 5)):
    r = np.random.default_rng(seed)
    ph = r.uniform(0, TAU, 3)
    a = np.linspace(0, TAU, n, endpoint=False)
    k = 1 + wob * (0.6 * np.sin(a * freq[0] + ph[0]) + 0.35 * np.sin(a * freq[1] + ph[1]) + 0.25 * np.sin(a * freq[2] + ph[2]))
    x = np.cos(a) * rx * k
    y = np.sin(a) * ry * k
    xr = x * math.cos(rot) - y * math.sin(rot) + cx
    yr = x * math.sin(rot) + y * math.cos(rot) + cy
    return np.stack([xr, yr], 1)


def fill(poly):
    m = np.zeros((W, W), np.uint8)
    cv2.fillPoly(m, [np.round(poly * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    return m.astype(np.float32) / 255


def dome(mask, radius_px, power=0.6):
    d = cv2.distanceTransform((mask > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
    return np.clip(d / (radius_px * SS), 0, 1) ** power


def smooth(m, s):
    return cv2.GaussianBlur(m, (0, 0), s * SS)


# ---------------------------------------------------------------- Licht
def render(mask, height, albedo, spec=0.25, shin=30, bump=6.0, wrap=0.15, ao=0.35, shadow=0.4, sheen=None):
    """Beleuchtet eine Form. albedo: HxWx3 (BGR, 0..1)"""
    h = height * bump
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) / 8
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) / 8
    n = np.dstack([-gx, -gy, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    ndl = n @ LIGHT
    diff = np.clip((ndl + wrap) / (1 + wrap), 0, 1)
    ndh = np.clip(n @ HALF, 0, 1)
    sp = spec * ndh**shin
    occ = 1 - 0.6 * ao * (1 - np.clip(height, 0, 1)) * mask
    # so normiert, dass eine flache Fläche ihre echte Farbe zeigt; warmes Ofenlicht
    flat = (LIGHT[2] + wrap) / (1 + wrap)
    lit = (0.42 + 0.66 * diff) / (0.42 + 0.66 * flat)
    warm = np.array([0.96, 1.0, 1.04], np.float32)
    col = albedo * lit[..., None] * warm * occ[..., None] + sp[..., None] * np.array([0.92, 0.97, 1.0], np.float32)
    if sheen is not None:
        col += sheen[..., None] * np.array([0.9, 0.95, 1.0], np.float32)
    # Kontaktschatten (versetzt, weich) unter die Form
    sh = cv2.GaussianBlur(mask, (0, 0), 3.2 * SS)
    sh = np.roll(np.roll(sh, int(2.2 * SS), 0), int(1.2 * SS), 1) * shadow
    a = mask + sh * (1 - mask)
    rgb = (col * mask[..., None] + np.array([0.06, 0.12, 0.2], np.float32) * (sh * (1 - mask))[..., None]) / np.maximum(a, 1e-4)[..., None]
    return np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])


def over(dst, src):
    a = src[..., 3:4]
    out = dst.copy()
    out[..., :3] = src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)
    out[..., 3:4] = a + dst[..., 3:4] * (1 - a)
    out[..., :3] /= np.maximum(out[..., 3:4], 1e-4)
    return out


def hexcol(h):
    h = h.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return np.array([b, g, r], np.float32) / 255


def mix(a, b, t):
    return a[None, None] * (1 - t[..., None]) + b[None, None] * t[..., None]


# ---------------------------------------------------------------- Salami (echt)
SALAMI = [(408, 172, 72), (606, 174, 72), (755, 258, 72), (275, 322, 82), (448, 302, 82), (586, 316, 78), (252, 500, 98), (457, 510, 95), (700, 620, 108), (455, 690, 108)]


def real_slices(dark=False):
    tex = cv2.imread(HERO).astype(np.float32) / 255
    tiles = []
    for x, y, r in SALAMI:
        X, Y, R = x * 2, y * 2, r * 2
        pad = int(R * 1.25)
        crop = tex[Y - pad : Y + pad, X - pad : X + pad]
        lab = cv2.cvtColor((crop * 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
        yy, xx = np.mgrid[-pad:pad, -pad:pad].astype(np.float32)
        d = np.hypot(xx, yy)
        red = ((lab[..., 1] - 128 > 20) & (lab[..., 0] < 160)).astype(np.float32)
        red *= (d < R * 1.08).astype(np.float32)
        red = cv2.morphologyEx(red, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
        red = cv2.morphologyEx(red, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
        n, lbl, st, _ = cv2.connectedComponentsWithStats(red.astype(np.uint8))
        if n < 2:
            continue
        i = 1 + int(np.argmax(st[1:, 4]))
        m = (lbl == i).astype(np.float32)
        # Löcher füllen, Kante glätten
        ff = (m * 255).astype(np.uint8)
        h_, w_ = ff.shape
        mm = np.zeros((h_ + 2, w_ + 2), np.uint8)
        f2 = ff.copy()
        cv2.floodFill(f2, mm, (0, 0), 255)
        m = ((ff | cv2.bitwise_not(f2)) > 0).astype(np.float32)
        m = cv2.GaussianBlur(m, (0, 0), 1.6)
        m = np.clip((m - 0.5) * 2.2 + 0.5, 0, 1)
        img = crop.copy()
        if dark:
            hsv = cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
            hsv[..., 0] = (hsv[..., 0] + 4) % 180
            hsv[..., 2] *= 0.72
            hsv[..., 1] = np.clip(hsv[..., 1] * 1.05, 0, 255)
            img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32) / 255
        # Kontaktschatten
        sh = cv2.GaussianBlur(m, (0, 0), R * 0.07)
        sh = np.roll(np.roll(sh, int(R * 0.06), 0), int(R * 0.03), 1) * 0.45
        a = m + sh * (1 - m)
        rgb = (img * m[..., None] + np.array([0.06, 0.12, 0.2], np.float32) * (sh * (1 - m))[..., None]) / np.maximum(a, 1e-4)[..., None]
        t = np.dstack([rgb, a])
        # Kachel = 2,5 × Radius → Scheibe füllt wie die gerenderten Zutaten ~68 %
        t = cv2.resize(t, (TILE, TILE), interpolation=cv2.INTER_AREA)
        tiles.append(t)
    return tiles


# ---------------------------------------------------------------- Zutaten
R0 = W * 0.34  # Grundradius eines Stücks in der Kachel


def mushroom(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(-0.6, 0.6)
    k = r.uniform(0.92, 1.06)
    # Längsschnitt: breiter, flacher Hut + kurzer, dicker Stiel
    a = np.linspace(math.pi, TAU, 48)
    cap = np.stack([np.cos(a) * R0 * 1.05, np.sin(a) * R0 * 0.7 + R0 * 0.18], 1)
    stem = np.array([[R0 * 0.36, R0 * 0.2], [R0 * 0.4, R0 * 0.55], [R0 * 0.33, R0 * 0.8], [-R0 * 0.33, R0 * 0.8], [-R0 * 0.4, R0 * 0.55], [-R0 * 0.36, R0 * 0.2]])
    under = np.array([[-R0 * 1.05, R0 * 0.18], [-R0 * 0.36, R0 * 0.2]])
    poly = np.concatenate([cap, [[R0 * 1.05, R0 * 0.18]], stem, under[::-1][:1]], 0) * k
    c, s_ = math.cos(rot), math.sin(rot)
    poly = poly @ np.array([[c, s_], [-s_, c]]) + C
    m = np.clip((smooth(fill(poly), 1.0) - 0.5) * 2.4 + 0.5, 0, 1)
    px, py = (XX - C) * c + (YY - C) * s_, -(XX - C) * s_ + (YY - C) * c
    px, py = px / k, py / k
    capd = np.hypot(px / 1.05, (py - R0 * 0.18) / 0.7)
    rim = np.clip(1 - np.abs(capd - R0 * 0.93) / (R0 * 0.08), 0, 1) * (py < R0 * 0.2)
    gills = (0.5 + 0.5 * np.sin(np.arctan2(py - R0 * 0.2, px) * 30 + fbm(10, 2, seed) * 3)) * (py < R0 * 0.16) * (capd < R0 * 0.8)
    base = hexcol('#ead7b6')
    alb = mix(base, hexcol('#cfb38a'), gills * 0.35 + fbm(24, 3, seed + 1) * 0.35)
    alb = alb * (1 - rim[..., None] * 0.9) + hexcol('#7c5636')[None, None] * rim[..., None] * 0.9
    # im Ofen leicht gebräunt, saftig
    alb = alb * (1 - 0.1 * fbm(40, 3, seed + 2)[..., None])
    h = dome(m, 12, 0.5) * 0.5 + fbm(8, 2, seed + 3) * 0.06 - gills * 0.03
    return render(m, h, alb, spec=0.18, shin=14, bump=4, wrap=0.4)

def pepper_strip(seed, color):
    r = np.random.default_rng(seed)
    rad = R0 * r.uniform(1.15, 1.6)
    span = r.uniform(0.95, 1.25)
    wdt = R0 * r.uniform(0.32, 0.4)
    rot = r.uniform(0, TAU)
    cx, cy = C + math.cos(rot + math.pi / 2) * (rad - wdt / 2), C + math.sin(rot + math.pi / 2) * (rad - wdt / 2)
    ang = np.arctan2(YY - cy, XX - cx)
    d = np.hypot(XX - cx, YY - cy)
    mid = rot - math.pi / 2
    da = np.angle(np.exp(1j * (ang - mid)))
    m = ((np.abs(da) < span / 2) & (d > rad - wdt) & (d < rad)).astype(np.float32)
    m = np.clip((smooth(m, 1.2) - 0.5) * 2.6 + 0.5, 0, 1)
    across = np.clip((d - (rad - wdt / 2)) / (wdt / 2), -1, 1)
    h = np.sqrt(np.clip(1 - across**2, 0, 1)) * m
    base = hexcol({'r': '#c9281b', 'g': '#43902c', 'y': '#f2b520'}[color])
    deep = hexcol({'r': '#851309', 'g': '#245c16', 'y': '#c68210'}[color])
    alb = mix(base, deep, np.clip(np.abs(across) ** 2 * 0.6 + fbm(20, 3, seed) * 0.2, 0, 1))
    # leicht geröstete, faltige Haut
    alb = alb * (1 - 0.18 * np.clip((fbm(12, 3, seed + 1) - 0.6) * 4, 0, 1)[..., None])
    return render(m, h, alb, spec=0.3, shin=26, bump=7, wrap=0.3, ao=0.2)

def onion(seed):
    r = np.random.default_rng(seed)
    st = r.uniform(0, TAU)
    span = r.uniform(2.4, 4.4)
    out = np.zeros((W, W, 4), np.float32)
    for k, (ro, ri) in enumerate(((1.0, 0.78), (0.74, 0.54))):
        if k == 1 and r.uniform() < 0.35:
            continue
        ang = np.arctan2(YY - C, XX - C)
        d = np.hypot(XX - C, YY - C)
        da = np.mod(ang - st - k * 0.4, TAU)
        sp = span * (1 if k == 0 else r.uniform(0.55, 0.85))
        m = ((da < sp) & (d < R0 * ro) & (d > R0 * ri)).astype(np.float32)
        m = np.clip((smooth(m, 1.0) - 0.5) * 2.6 + 0.5, 0, 1)
        across = np.clip((d - R0 * (ro + ri) / 2) / (R0 * (ro - ri) / 2), -1, 1)
        h = np.sqrt(np.clip(1 - across**2, 0, 1)) * m
        # außen kräftig violett, innen glasig hell – im Ofen weich geworden
        skin = np.clip((across + 0.35) / 1.35, 0, 1) ** 1.6
        alb = mix(hexcol('#e4d0d8'), hexcol('#76315e'), skin * 0.9 + fbm(16, 2, seed + k) * 0.08)
        out = over(out, render(m, h, alb, spec=0.18, shin=20, bump=4, wrap=0.55, ao=0.12, shadow=0.2))
    return out

def ring_slice(seed, skin, flesh, seeds_col, glossy=0.8, hole=False):
    r = np.random.default_rng(seed)
    rx, ry = R0 * 0.62, R0 * 0.62 * r.uniform(0.85, 1.0)
    rot = r.uniform(0, TAU)
    outer = fill(organic(rx, ry, seed, 0.04, rot=rot))
    inner = fill(organic(rx * 0.7, ry * 0.7, seed + 1, 0.06, rot=rot))
    if hole:
        m = np.clip(outer - fill(organic(rx * 0.46, ry * 0.46, seed + 2, 0.05, rot=rot)), 0, 1)
        d = np.hypot((XX - C) / rx, (YY - C) / ry)
        across = (d - 0.73) / 0.27
        h = np.sqrt(np.clip(1 - across**2, 0, 1))
        alb = mix(hexcol(skin), hexcol('#4a3640'), fbm(12, 2, seed) * 0.35)
        return render(m, h, alb, spec=glossy * 0.55, shin=36, bump=7, wrap=0.2, ao=0.2)
    m = outer
    rim = np.clip(outer - inner, 0, 1)
    alb = mix(hexcol(flesh), hexcol(skin), rim)
    # Kerne
    seedsm = np.zeros((W, W), np.float32)
    for i in range(7):
        a = r.uniform(0, TAU)
        dd = r.uniform(0.15, 0.45) * rx
        cv2.ellipse(seedsm, (int(C + math.cos(a) * dd), int(C + math.sin(a) * dd)), (int(rx * 0.1), int(rx * 0.065)), math.degrees(a), 0, 360, 1.0, -1, cv2.LINE_AA)
    alb = mix(hexcol(flesh), hexcol(skin), rim)
    alb = alb * (1 - seedsm[..., None]) + hexcol(seeds_col)[None, None] * seedsm[..., None]
    h = dome(m, 10, 0.6) * 0.5 + seedsm * 0.25 + fbm(10, 2, seed) * 0.05
    return render(m, h, alb, spec=glossy, shin=55, bump=7, wrap=0.25, ao=0.2)


def olive(seed):
    return ring_slice(seed, '#2a2026', '', '', glossy=0.9, hole=True)


def corn(seed):
    r = np.random.default_rng(seed)
    out = np.zeros((W, W, 4), np.float32)
    for i in range(r.integers(3, 6)):
        a = r.uniform(0, TAU)
        d = r.uniform(0, R0 * 0.5)
        s = R0 * r.uniform(0.28, 0.34)
        poly = organic(s, s * 0.85, seed + i, 0.12, n=40, rot=r.uniform(0, TAU), cx=C + math.cos(a) * d, cy=C + math.sin(a) * d, freq=(4, 2, 3))
        m = fill(poly)
        h = dome(m, s / SS * 0.9, 0.5)
        alb = mix(hexcol('#f6c93a'), hexcol('#d99a10'), 1 - h)
        out = over(out, render(m, h, alb, spec=0.8, shin=50, bump=8, shadow=0.35))
    return out


def pineapple(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    pts = np.array([[-0.8, -0.55], [0.8, -0.55], [0.48, 0.62], [-0.48, 0.62]]) * R0
    c, s = math.cos(rot), math.sin(rot)
    poly = pts @ np.array([[c, s], [-s, c]]) + C
    m = smooth(fill(poly), 2.2)
    m = np.clip((m - 0.5) * 2.5 + 0.5, 0, 1)
    px = (XX - C) * c + (YY - C) * s
    fib = 0.5 + 0.5 * np.sin(px / (R0 * 0.06) + fbm(16, 2, seed) * 6)
    alb = mix(hexcol('#f7d564'), hexcol('#dc9b22'), fib * 0.35 + fbm(30, 3, seed + 1) * 0.3)
    h = dome(m, 14, 0.6) * 0.6 + fib * 0.12
    return render(m, h, alb, spec=0.7, shin=40, bump=6, wrap=0.35)


def tomato(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    rx = R0 * 0.72
    m = fill(organic(rx, rx * 0.92, seed, 0.03, rot=rot))
    d = np.hypot(XX - C, YY - C) / rx
    ang = np.arctan2(YY - C, XX - C) - rot
    skin = np.clip((d - 0.86) / 0.1, 0, 1)
    loc = np.zeros((W, W), np.float32)
    seeds_ = np.zeros((W, W), np.float32)
    for i in range(3):
        a = rot + i * TAU / 3 + 0.3
        cv2.ellipse(loc, (int(C + math.cos(a) * rx * 0.44), int(C + math.sin(a) * rx * 0.44)), (int(rx * 0.3), int(rx * 0.2)), math.degrees(a), 0, 360, 1.0, -1, cv2.LINE_AA)
        for k in range(4):
            dd = rx * (0.3 + k * 0.08)
            cv2.ellipse(seeds_, (int(C + math.cos(a + (k - 1.5) * 0.18) * dd), int(C + math.sin(a + (k - 1.5) * 0.18) * dd)), (int(rx * 0.06), int(rx * 0.04)), math.degrees(a), 0, 360, 1.0, -1, cv2.LINE_AA)
    loc = smooth(loc, 1.2)
    alb = mix(hexcol('#d93a2c'), hexcol('#f08a6a'), loc * 0.8)
    alb = alb * (1 - seeds_[..., None]) + hexcol('#e9d27a')[None, None] * seeds_[..., None]
    alb = mix(hexcol('#d93a2c'), hexcol('#9e140c'), skin) * skin[..., None] + alb * (1 - skin[..., None])
    h = dome(m, 18, 0.5) * 0.5 + loc * 0.15 + seeds_ * 0.1
    return render(m, h, alb, spec=1.0, shin=70, bump=7, wrap=0.3, ao=0.2)


def tuna(seed):
    r = np.random.default_rng(seed)
    out = np.zeros((W, W, 4), np.float32)
    for i in range(r.integers(5, 8)):
        a = r.uniform(0, TAU)
        d = r.uniform(0, R0 * 0.55)
        s = R0 * r.uniform(0.2, 0.32)
        rot = r.uniform(0, TAU)
        m = fill(organic(s, s * 0.62, seed + i * 3, 0.2, rot=rot, cx=C + math.cos(a) * d, cy=C + math.sin(a) * d))
        px = (XX - C) * math.cos(rot) + (YY - C) * math.sin(rot)
        flake = 0.5 + 0.5 * np.sin(px / (R0 * 0.045) + fbm(12, 2, seed + i) * 4)
        alb = mix(hexcol('#dcc0a2'), hexcol('#b08868'), flake * 0.45 + fbm(14, 2, seed + i + 9) * 0.25)
        h = dome(m, 6, 0.6) * 0.45 + flake * 0.2
        out = over(out, render(m, h, alb, spec=0.1, shin=16, bump=8, wrap=0.35, shadow=0.28))
    return out

def ham(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 0.95, R0 * 0.7, seed, 0.18, n=24, rot=rot, freq=(3, 5, 7)))
    m = np.clip((smooth(m, 0.6) - 0.5) * 3 + 0.5, 0, 1)
    marb = fbm(26, 3, seed + 1)
    alb = mix(hexcol('#e7a29d'), hexcol('#f5cdc5'), np.clip((marb - 0.55) * 4, 0, 1) * 0.8)
    edge = 1 - dome(m, 5, 1.0)
    alb = alb * (1 - 0.18 * edge[..., None])
    h = dome(m, 14, 0.5) * 0.3 + fbm(18, 3, seed + 2) * 0.25
    return render(m, h, alb, spec=0.35, shin=25, bump=6, wrap=0.4, shadow=0.3)


def chicken(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 0.85, R0 * 0.4, seed, 0.16, rot=rot, freq=(2, 3, 6)))
    m = np.clip((smooth(m, 0.8) - 0.5) * 2.6 + 0.5, 0, 1)
    px, py = (XX - C) * math.cos(rot) + (YY - C) * math.sin(rot), -(XX - C) * math.sin(rot) + (YY - C) * math.cos(rot)
    fib = 0.5 + 0.5 * np.sin(px / (R0 * 0.03) + fbm(10, 2, seed) * 5)
    seared = np.clip((1 - dome(m, 7, 1.0)) * 0.8 + (fbm(16, 3, seed + 2) - 0.55) * 1.5, 0, 1)
    alb = mix(hexcol('#efd2a6'), hexcol('#d6a466'), fib * 0.3 + fbm(24, 3, seed + 1) * 0.25)
    alb = alb * (1 - seared[..., None] * 0.5) + hexcol('#b37a3c')[None, None] * seared[..., None] * 0.5
    h = dome(m, 10, 0.6) * 0.55 + fib * 0.07
    return render(m, h, alb, spec=0.18, shin=18, bump=6, wrap=0.35)

def doener(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 0.95, R0 * 0.3, seed, 0.25, n=40, rot=rot, freq=(3, 6, 9)))
    m = np.clip((smooth(m, 0.5) - 0.5) * 3 + 0.5, 0, 1)
    edge = 1 - dome(m, 6, 1.0)
    alb = mix(hexcol('#c7884c'), hexcol('#6d3a16'), np.clip(edge * 0.9 + fbm(10, 3, seed) * 0.35, 0, 1))
    h = dome(m, 8, 0.6) * 0.5 + fbm(6, 2, seed + 1) * 0.2
    return render(m, h, alb, spec=0.35, shin=30, bump=7, wrap=0.2)


def nugget(seed):
    r = np.random.default_rng(seed)
    m = fill(organic(R0 * 0.85, R0 * 0.66, seed, 0.15, rot=r.uniform(0, TAU)))
    crumbs = fbm(4, 2, seed) * 0.6 + speck(seed + 1, 140, 0.6, 1.6) * 0.5
    alb = mix(hexcol('#e9b257'), hexcol('#a7631c'), np.clip(crumbs * 0.7 + (1 - dome(m, 18, 0.8)) * 0.4, 0, 1))
    h = dome(m, 20, 0.5) * 0.8 + crumbs * 0.25
    return render(m, h, alb, spec=0.15, shin=15, bump=9, wrap=0.2)


def sardine(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 1.0, R0 * 0.2, seed, 0.06, rot=rot, freq=(2, 3, 4)))
    py = -(XX - C) * math.sin(rot) + (YY - C) * math.cos(rot)
    band = np.clip(1 - np.abs(py) / (R0 * 0.07), 0, 1)
    alb = mix(hexcol('#6a4434'), hexcol('#b8aea8'), band * 0.8)
    alb = alb * (1 - 0.15 * fbm(8, 2, seed)[..., None])
    h = dome(m, 6, 0.6)
    return render(m, h, alb, spec=0.7, shin=60, bump=6, sheen=band * 0.12)


def shrimp(seed, scale=1.0):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    ang = np.arctan2(YY - C, XX - C) - rot
    da = np.mod(ang, TAU)
    d = np.hypot(XX - C, YY - C)
    ro, ri = R0 * 0.7 * scale, R0 * 0.28 * scale
    thick = ri + (ro - ri) * (0.55 + 0.45 * np.cos((da - 2.4) / 2.6))
    m = ((da < 4.6) & (d < thick) & (d > ri)).astype(np.float32)
    m = np.clip((smooth(m, 0.8) - 0.5) * 3 + 0.5, 0, 1)
    seg = 0.5 + 0.5 * np.cos(da * 7)
    across = np.clip((d - ri) / np.maximum(thick - ri, 1), 0, 1)
    alb = mix(hexcol('#f7cdb6'), hexcol('#ec7448'), np.clip(across * 1.1 - 0.1 + seg * 0.15, 0, 1))
    h = np.sqrt(np.clip(1 - (across * 2 - 1) ** 2, 0, 1)) * m + seg * 0.05
    return render(m, h, alb, spec=0.7, shin=50, bump=7, wrap=0.35)


def squid(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = np.clip(fill(organic(R0 * 0.62, R0 * 0.55, seed, 0.06, rot=rot)) - fill(organic(R0 * 0.38, R0 * 0.32, seed + 1, 0.06, rot=rot)), 0, 1)
    d = np.hypot((XX - C) / 0.62, (YY - C) / 0.55) / R0
    across = (d - 0.81) / 0.19
    h = np.sqrt(np.clip(1 - across**2, 0, 1))
    alb = mix(hexcol('#f3e9dc'), hexcol('#d9a7a0'), np.clip(fbm(14, 2, seed) - 0.3, 0, 1))
    return render(m, h, alb, spec=0.6, shin=50, bump=8, wrap=0.4)


def mussel(seed):
    r = np.random.default_rng(seed)
    m = fill(organic(R0 * 0.58, R0 * 0.38, seed, 0.12, rot=r.uniform(0, TAU)))
    alb = mix(hexcol('#ef9f55'), hexcol('#a35a2a'), fbm(10, 3, seed) * 0.6)
    h = dome(m, 12, 0.6) * 0.6 + fbm(6, 2, seed + 2) * 0.2
    return render(m, h, alb, spec=0.5, shin=40, bump=8)


def bolognese(seed):
    r = np.random.default_rng(seed)
    out = np.zeros((W, W, 4), np.float32)
    # Hackfleisch-Krümel, leicht in Sauce gebettet (keine Pfütze)
    for i in range(r.integers(12, 18)):
        a = r.uniform(0, TAU)
        d = math.sqrt(r.uniform(0, 1)) * R0 * 0.8
        s = R0 * r.uniform(0.1, 0.18)
        m = fill(organic(s, s * 0.8, seed + i * 5, 0.35, n=24, cx=C + math.cos(a) * d, cy=C + math.sin(a) * d, freq=(3, 5, 7)))
        alb = mix(hexcol('#94512c'), hexcol('#5c2b14'), fbm(5, 2, seed + i) * 0.8)
        out = over(out, render(m, dome(m, 4, 0.6) * 0.7 + fbm(4, 2, seed + i) * 0.3, alb, spec=0.35, shin=30, bump=8, shadow=0.35))
    return out

def leaf(seed, colA, colB, jag, wilt):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    n = 9
    up, dn = [], []
    lobes = jag > 0.3
    for i in range(n + 1):
        t = i / n
        x = -R0 + 2 * R0 * t
        base_w = math.sin(math.pi * t) ** 0.7 * R0 * (0.3 if lobes else 0.44)
        lob = (1 + (0.9 if i % 2 else -0.15) * jag) if lobes else (1 + r.uniform(-0.06, 0.06))
        up.append((x, -base_w * lob * r.uniform(0.9, 1.1)))
        dn.append((x, base_w * ((1 + (0.9 if (i + 1) % 2 else -0.15) * jag) if lobes else 1) * r.uniform(0.9, 1.1)))
    pts = np.array(up + dn[::-1])
    c, s = math.cos(rot), math.sin(rot)
    poly = pts @ np.array([[c, s], [-s, c]]) + C
    m = np.clip((smooth(fill(poly), 1.4 if lobes else 0.8) - 0.5) * 2.6 + 0.5, 0, 1)
    px, py = (XX - C) * c + (YY - C) * s, -(XX - C) * s + (YY - C) * c
    vein = np.clip(1 - np.abs(py) / (R0 * 0.025), 0, 1) * (np.abs(px) < R0 * 0.95)
    side = np.clip(1 - np.abs(np.mod(px - np.abs(py) * 1.4, R0 * 0.32) - R0 * 0.16) / (R0 * 0.018), 0, 1) * 0.45
    alb = mix(hexcol(colA), hexcol(colB), np.clip(fbm(18, 3, seed) * 0.5 + wilt * (1 - dome(m, 9, 1)), 0, 1))
    alb = alb * (1 + 0.3 * (vein + side)[..., None])
    h = dome(m, 10, 0.7) * 0.25 + fbm(10, 3, seed + 1) * 0.3 - (vein + side) * 0.08
    return render(m, h, alb, spec=0.35, shin=28, bump=6, wrap=0.45, shadow=0.28)

def broccoli(seed):
    r = np.random.default_rng(seed)
    out = np.zeros((W, W, 4), np.float32)
    rot = r.uniform(0, TAU)
    c, s_ = math.cos(rot), math.sin(rot)
    sx, sy = C + s_ * -R0 * 0.45, C + c * R0 * 0.45
    stem = fill(organic(R0 * 0.2, R0 * 0.42, seed, 0.06, rot=rot, cx=sx, cy=sy))
    out = over(out, render(stem, dome(stem, 7, 0.6), mix(hexcol('#c9d79a'), hexcol('#93ab62'), fbm(10, 2, seed)), spec=0.15, shin=16, bump=5, wrap=0.4))
    # Krone aus vielen kleinen Röschen, jedes gewölbt
    crown_h = np.zeros((W, W), np.float32)
    crown_m = np.zeros((W, W), np.float32)
    cx, cy = C - s_ * -R0 * 0.1, C - c * R0 * 0.1
    for i in range(26):
        a = r.uniform(0, TAU)
        d = math.sqrt(r.uniform(0, 1)) * R0 * 0.55
        rr = R0 * r.uniform(0.14, 0.22)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        dd = np.hypot(XX - x, YY - y) / rr
        bump = np.sqrt(np.clip(1 - dd**2, 0, 1))
        crown_h = np.maximum(crown_h, bump * (0.7 + 0.3 * (1 - d / (R0 * 0.55))))
        crown_m = np.maximum(crown_m, np.clip((1 - dd) * 6, 0, 1))
    grain = fbm(3, 2, seed + 3)
    alb = mix(hexcol('#6aa340'), hexcol('#2a5a1d'), np.clip(1 - crown_h * 0.9 + grain * 0.35, 0, 1))
    return over(out, render(crown_m, crown_h * 0.8 + grain * 0.15, alb, spec=0.1, shin=12, bump=10, wrap=0.3, ao=0.5))

def caper(seed):
    r = np.random.default_rng(seed)
    out = np.zeros((W, W, 4), np.float32)
    for i in range(r.integers(2, 4)):
        s = R0 * r.uniform(0.28, 0.34)
        cx, cy = C + r.uniform(-0.4, 0.4) * R0, C + r.uniform(-0.4, 0.4) * R0
        m = fill(organic(s, s * 0.9, seed + i, 0.08, cx=cx, cy=cy))
        alb = mix(hexcol('#9aa457'), hexcol('#4a5620'), fbm(6, 2, seed + i) * 0.7)
        out = over(out, render(m, dome(m, s / SS, 0.5) + fbm(4, 2, seed + i) * 0.15, alb, spec=0.7, shin=50, bump=8))
    return out


def melt_cheese(seed):
    r = np.random.default_rng(seed)
    m = fill(organic(R0 * 0.9, R0 * r.uniform(0.6, 0.8), seed, 0.3, rot=r.uniform(0, TAU), freq=(3, 4, 6)))
    m = smooth(m, 3.5)
    m = np.clip((m - 0.2) * 1.3, 0, 1)
    browned = np.clip((fbm(14, 3, seed + 1) - 0.6) * 5, 0, 1) * np.clip(m * 1.5, 0, 1)
    alb = mix(hexcol('#f9e6ad'), hexcol('#eac36a'), np.clip(1 - m + fbm(26, 2, seed) * 0.35, 0, 1))
    alb = alb * (1 - browned[..., None] * 0.4) + hexcol('#c08436')[None, None] * browned[..., None] * 0.4
    h = smooth(m, 5) * 0.6 + fbm(10, 3, seed + 2) * 0.1
    t = render(m, h, alb, spec=0.35, shin=24, bump=4, wrap=0.5, ao=0.05, shadow=0.06)
    # geschmolzen: Ränder laufen in den Käse darunter aus
    t[..., 3] = t[..., 3] * 0.82
    return t

def parmesan(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 0.8, R0 * 0.32, seed, 0.18, rot=rot, freq=(2, 5, 7)))
    m = np.clip((smooth(m, 0.7) - 0.5) * 2.4 + 0.5, 0, 1)
    edge = 1 - dome(m, 5, 1.0)
    alb = mix(hexcol('#fbf0cf'), hexcol('#ead196'), np.clip(fbm(10, 3, seed) * 0.5 + edge * 0.3, 0, 1))
    h = dome(m, 8, 0.8) * 0.3 + fbm(6, 2, seed + 1) * 0.15
    t = render(m, h, alb, spec=0.25, shin=20, bump=5, wrap=0.6, shadow=0.15)
    t[..., 3] *= 0.85 + 0.15 * (1 - edge)
    return t

def feta(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    s = R0 * 0.62
    pts = np.array([[-1, -0.85], [1, -0.9], [0.95, 0.9], [-0.92, 0.85]]) * s
    pts += r.uniform(-0.12, 0.12, pts.shape) * s
    c, sn = math.cos(rot), math.sin(rot)
    m = fill(pts @ np.array([[c, sn], [-sn, c]]) + C)
    rough = speck(seed + 1, 60, 1, 3)
    m = np.clip(smooth(m, 1.2) * 1.4 - smooth(rough, 0.5) * 0.4 * (1 - dome(m, 6, 1)), 0, 1)
    alb = mix(hexcol('#fbf9f2'), hexcol('#dcd6c6'), fbm(8, 2, seed) * 0.5)
    h = dome(m, 14, 0.4) + fbm(5, 2, seed) * 0.2
    return render(m, h, alb, spec=0.08, shin=10, bump=9, wrap=0.3)


def gorgonzola(seed):
    r = np.random.default_rng(seed)
    m = fill(organic(R0 * 0.85, R0 * 0.66, seed, 0.3, rot=r.uniform(0, TAU), freq=(3, 5, 8)))
    veins = np.clip((fbm(10, 3, seed + 1) - 0.58) * 6, 0, 1)
    alb = mix(hexcol('#f6f0dc'), hexcol('#5f8584'), veins * 0.8)
    h = dome(m, 14, 0.5) * 0.6 + fbm(6, 2, seed) * 0.2 - veins * 0.1
    return render(m, h, alb, spec=0.25, shin=20, bump=7, wrap=0.4)


def fries(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    c, s = math.cos(rot), math.sin(rot)
    L, w = R0 * 1.0, R0 * 0.2
    px, py = (XX - C) * c + (YY - C) * s, -(XX - C) * s + (YY - C) * c
    m = ((np.abs(px) < L) & (np.abs(py) < w)).astype(np.float32)
    m = np.clip((smooth(m, 0.8) - 0.5) * 3 + 0.5, 0, 1)
    end = np.clip((np.abs(px) - L * 0.75) / (L * 0.25), 0, 1)
    alb = mix(hexcol('#f2c464'), hexcol('#bd7a24'), np.clip(end * 0.8 + fbm(10, 2, seed) * 0.3, 0, 1))
    h = np.sqrt(np.clip(1 - (py / w) ** 2, 0, 1)) * m * 0.8 + fbm(6, 2, seed) * 0.1
    return render(m, h, alb, spec=0.2, shin=20, bump=7)


def egg(seed):
    r = np.random.default_rng(seed)
    big = R0 * 1.25
    white = fill(organic(big, big * 0.9, seed, 0.14, rot=r.uniform(0, TAU)))
    edge = 1 - dome(white, 8, 1)
    alb = mix(hexcol('#fbf8ef'), hexcol('#d9a258'), np.clip(edge * 0.9 * (fbm(12, 2, seed) + 0.3), 0, 1))
    out = render(white, dome(white, 30, 0.4) * 0.5 + fbm(16, 2, seed) * 0.1, alb, spec=0.5, shin=30, bump=4, wrap=0.4)
    yolk = fill(organic(big * 0.36, big * 0.36, seed + 1, 0.03, cx=C + big * 0.06, cy=C))
    h = dome(yolk, big * 0.36 / SS, 0.5)
    alb2 = mix(hexcol('#ffc94a'), hexcol('#e58c10'), 1 - h)
    return over(out, render(yolk, h, alb2, spec=1.0, shin=80, bump=10, shadow=0.3))


# ---------------------------------------------------------------- Katalog
def variants(fn, n, base_seed):
    return [fn(base_seed + i * 101) for i in range(n)]


def down(t):
    return cv2.resize(t, (TILE, TILE), interpolation=cv2.INTER_AREA)


def main():
    rows = {}
    tiles_all = []

    def add(id_, tiles):
        rows[id_] = {'row': len(tiles_all), 'n': len(tiles)}
        tiles_all.append([t if t.shape[0] == TILE else down(t) for t in tiles])

    sal = real_slices()
    add('mit-rindersalami', sal[:6])
    add('mit-sucuk', real_slices(dark=True)[4:10])
    add('mit-champignons-frisch', variants(mushroom, 4, 10))
    add('mit-paprika-frisch', [pepper_strip(20 + i, 'rgy'[i % 3]) for i in range(6)])
    add('mit-zwiebeln-rot', variants(onion, 4, 30))
    add('mit-oliven', variants(olive, 4, 40))
    add('mit-jalapenos', [ring_slice(50 + i * 7, '#2f6e22', '#9dc46c', '#efe9bf', 0.8) for i in range(4)])
    add('mit-peperoni', [ring_slice(60 + i * 7, '#a7b13c', '#e5e1a2', '#f7f2d6', 0.8) for i in range(4)])
    add('mit-mais', variants(corn, 4, 70))
    add('mit-ananas', variants(pineapple, 4, 80))
    add('mit-cherry-tomaten-frisch', variants(tomato, 4, 90))
    add('mit-thunfisch', variants(tuna, 4, 100))
    add('mit-putenschinken', variants(ham, 4, 110))
    add('mit-haehnchenbrustfilet', variants(chicken, 4, 120))
    add('mit-haehnchen-doener-kebab', variants(doener, 4, 130))
    add('mit-chicken-nuggets', variants(nugget, 4, 140))
    add('mit-sardellen', variants(sardine, 3, 150))
    add('mit-garnelen', variants(shrimp, 4, 160))
    add('mit-frutti-di-mare', [shrimp(170, 0.8), squid(171), mussel(172), squid(173), mussel(174), shrimp(175, 0.8)])
    add('mit-bolognese', variants(bolognese, 3, 180))
    add('mit-rucola-frisch', [leaf(190 + i, '#5c8d30', '#2f5418', 0.55, 0.3) for i in range(4)])
    add('mit-blattspinat', [leaf(200 + i, '#2f5a22', '#173a12', 0.1, 0.5) for i in range(4)])
    add('mit-broccoli', variants(broccoli, 4, 210))
    add('mit-kapern', variants(caper, 3, 220))
    add('mit-extra-kaese', variants(melt_cheese, 4, 230))
    add('mit-parmesan', variants(parmesan, 4, 240))
    add('mit-schafskaese', variants(feta, 4, 250))
    add('mit-gorgonzola', variants(gorgonzola, 4, 260))
    add('mit-pommes', variants(fries, 4, 270))
    add('mit-ei', [egg(280)])

    ncol = max(len(r) for r in tiles_all)
    atlas = np.zeros((len(tiles_all) * TILE, ncol * TILE, 4), np.float32)
    for i, row in enumerate(tiles_all):
        for j, t in enumerate(row):
            atlas[i * TILE : (i + 1) * TILE, j * TILE : (j + 1) * TILE] = t
    os.makedirs(OUT, exist_ok=True)
    img = np.clip(atlas * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'toppings.webp'), img, [cv2.IMWRITE_WEBP_QUALITY, 88])
    json.dump({'tile': TILE, 'cols': ncol, 'rows': rows}, open(os.path.join(OUT, 'toppings.json'), 'w'))
    print('→ public/pizza/toppings.webp', img.shape, os.path.getsize(os.path.join(OUT, 'toppings.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
