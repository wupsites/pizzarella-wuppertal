"""
Gemeinsame Werkzeuge für die Gerichte-Bilder der Speisekarte (siehe build.py).

Gleicher Stil wie die Pizza-Zutaten (scripts/pizza-builder/build-toppings.py):
Form → Höhenfeld → Licht von oben links, Glanz je Material, weicher
Kontaktschatten. Gerendert auf S×S (doppelte Auflösung), gespeichert als
OUT×OUT. Alle Ebenen liegen vormultipliziert (premultiplied) vor, damit
Stücke beim Drehen und Verkleinern keine hellen Säume bekommen.
"""
import importlib.util
import math
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location('toppings', os.path.join(ROOT, 'scripts/pizza-builder/build-toppings.py'))
tp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tp)

S = 512  # Arbeitsgröße
OUTPX = 256  # gespeicherte Größe (Speisekarte: 7,75 rem bei 2× Pixeldichte)
C = S / 2
SS = tp.SS
TAU = math.tau
YY, XX = np.mgrid[0:S, 0:S].astype(np.float32)
RR = np.hypot(XX - C, YY - C)

render = tp.render
dome = tp.dome
smooth = tp.smooth
hexcol = tp.hexcol
mix = tp.mix
organic = tp.organic


def fbm(cell, oct_, seed, gain=0.5):
    s = np.zeros((S, S), np.float32)
    a, t = 1.0, 0.0
    for o in range(oct_):
        s += a * tp.vnoise(max(2, cell >> o), seed + 31 * o, (S, S))
        t += a
        a *= gain
    return s / t


def fillp(poly):
    m = np.zeros((S, S), np.uint8)
    cv2.fillPoly(m, [np.round(np.asarray(poly) * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    return m.astype(np.float32) / 255


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blank():
    return np.zeros((S, S, 4), np.float32)


def pm(rgba):
    """gerade → vormultipliziert"""
    out = rgba.copy()
    out[..., :3] *= out[..., 3:4]
    return out


def over(dst, src):
    """beide vormultipliziert"""
    return src + dst * (1 - src[..., 3:4])


def drop_shadow(mask, dx=6, dy=10, blur=14, alpha=0.28, col=(0.10, 0.14, 0.22)):
    """weicher Schlagschatten unter großen Formen (Teller, Brot …), vormultipliziert"""
    sh = cv2.GaussianBlur(mask, (0, 0), blur)
    sh = np.roll(np.roll(sh, dy, 0), dx, 1) * alpha
    out = np.zeros((S, S, 4), np.float32)
    out[..., 3] = sh
    out[..., :3] = np.array(col, np.float32) * sh[..., None]
    return out


def lit(mask, height, albedo, **kw):
    return pm(render(mask, height, albedo, **kw))


def place(layer, piece, x, y, size, rot=0.0, flip=False):
    """Stück aus dem Zutaten-Renderer (Kachel mit Motiv ≈ 68 % Breite) auf die Ebene setzen.
    size = gewünschter Durchmesser des Motivs in Arbeits-Pixeln"""
    P = piece.shape[0]
    src = pm(piece)  # Zutaten-Renderer liefern gerade (nicht vormultiplizierte) Farben
    if flip:
        src = src[:, ::-1]
    scale = size / (0.68 * P)
    M = cv2.getRotationMatrix2D((P / 2, P / 2), rot, scale)
    M[0, 2] += x - P / 2
    M[1, 2] += y - P / 2
    w = cv2.warpAffine(src, M, (S, S), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    return over(layer, w)


def scatter_points(region, n, seed, min_dist, tries=4000):
    """n Punkte innerhalb der Maske region (S×S, 0/1) mit Mindestabstand (weich: wird kleiner, wenn es eng wird)"""
    r = np.random.default_rng(seed)
    ys, xs = np.nonzero(region > 0.5)
    if not len(xs):
        return []
    pts = []
    d = min_dist
    t = 0
    while len(pts) < n and t < tries:
        t += 1
        i = r.integers(len(xs))
        p = (float(xs[i]) + r.uniform(-0.5, 0.5), float(ys[i]) + r.uniform(-0.5, 0.5))
        if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 >= d * d for q in pts):
            pts.append(p)
        if t % 400 == 0:
            d *= 0.85
    return pts


def scatter(layer, pieces, region, n, size, seed, min_dist=None, size_jit=0.15, rot=(0, 360)):
    r = np.random.default_rng(seed + 7)
    for k, (x, y) in enumerate(scatter_points(region, n, seed, min_dist if min_dist is not None else size * 0.55)):
        pc = pieces[k % len(pieces)]
        layer = place(layer, pc, x, y, size * r.uniform(1 - size_jit, 1 + size_jit), r.uniform(*rot), flip=bool(r.integers(2)))
    return layer


def ellipse_mask(cx, cy, rx, ry, rot=0.0):
    m = np.zeros((S, S), np.float32)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), rot, 0, 360, 1.0, -1, cv2.LINE_AA)
    return m


def rrect_mask(cx, cy, w, h, rad, rot=0.0):
    """abgerundetes Rechteck (Breite, Höhe, Eckradius in Pixeln)"""
    m = np.zeros((S, S), np.uint8)
    hw, hh = w / 2 - rad, h / 2 - rad
    pts = []
    for qx, qy, a0 in ((hw, -hh, -90), (hw, hh, 0), (-hw, hh, 90), (-hw, -hh, 180)):
        for a in np.linspace(a0, a0 + 90, 12):
            pts.append((qx + rad * math.cos(math.radians(a)), qy + rad * math.sin(math.radians(a))))
    pts = np.array(pts, np.float32)
    c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    pts = pts @ np.array([[c, s_], [-s_, c]], np.float32) + np.array([cx, cy], np.float32)
    cv2.fillPoly(m, [np.round(pts * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    return m.astype(np.float32) / 255


def save(path, layer):
    """vormultipliziert verkleinern, dann zurückrechnen und als WebP speichern"""
    small = cv2.resize(layer, (OUTPX, OUTPX), interpolation=cv2.INTER_AREA)
    a = small[..., 3:4]
    rgb = np.where(a > 1e-4, small[..., :3] / np.maximum(a, 1e-4), 0)
    out = np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
    cv2.imwrite(path, np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 84])


def sheet(layers, path, bg=(236, 245, 250), cols=6):
    """Kontaktbogen zum Prüfen (Hintergrund wie die Karten der Speisekarte)"""
    tiles = []
    for L in layers:
        small = cv2.resize(L, (OUTPX, OUTPX), interpolation=cv2.INTER_AREA)
        bgc = np.array(bg, np.float32) / 255
        rgb = small[..., :3] + bgc * (1 - small[..., 3:4])
        tiles.append((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    while len(tiles) % cols:
        tiles.append(np.full((OUTPX, OUTPX, 3), bg, np.uint8))
    rows = [np.hstack(tiles[i : i + cols]) for i in range(0, len(tiles), cols)]
    cv2.imwrite(path, np.vstack(rows))
