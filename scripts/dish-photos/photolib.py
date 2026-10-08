"""
Werkzeuge für die Gerichte-Bilder aus echten Fotos (CC0/gemeinfrei, siehe
sources.json): freistellen, auf eine quadratische Arbeitsfläche bringen,
in Ebenen zerlegen und verdeckte Stellen glaubwürdig auffüllen.

Ebenen liegen wie in scripts/dish-art vormultipliziert (premultiplied) vor
und werden mit base.save() als 256-px-WebP gespeichert.
"""
import math
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.append(os.path.join(ROOT, 'scripts/dish-art'))  # nach hinten: eigene Module gehen vor
from base import S, blank, over, save  # noqa: E402,F401
C = S / 2

SRC_DIR = os.environ.get('DISH_PHOTOS', os.path.join(HERE, 'source'))


# Arbeitsauflösung der Fotos: längere Seite höchstens MAXSIDE. Koordinaten werden
# im Code in Originalpixeln angegeben (so wie vermessen) und hier umgerechnet.
MAXSIDE = 1100
K = 1.0
_cache = {}


def load(key):
    global K
    if key not in _cache:
        im = cv2.imread(os.path.join(SRC_DIR, f'{key}.jpg'), cv2.IMREAD_COLOR)
        if im is None:
            raise FileNotFoundError(f'{key}.jpg fehlt – erst scripts/dish-photos/fetch.py ausführen')
        k = min(1.0, MAXSIDE / max(im.shape[:2]))
        if k < 1:
            im = cv2.resize(im, (round(im.shape[1] * k), round(im.shape[0] * k)), interpolation=cv2.INTER_AREA)
        _cache[key] = (im.astype(np.float32) / 255, k)
    im, K = _cache[key]
    return im.copy()


# ---------------------------------------------------------------- Masken (Quellkoordinaten)
def poly(pts, shape):
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.round(np.asarray(pts, np.float32) * K * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    return m.astype(np.float32) / 255


def rrect(x0, y0, x1, y1, r, shape):
    """abgerundetes Rechteck in Originalpixeln"""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for a in np.linspace(a0, a0 + 90, 14):
            pts.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
    return poly(pts, shape)


def ell(cx, cy, rx, ry, ang, shape):
    """Ellipse in Originalpixeln des zuletzt geladenen Fotos"""
    m = np.zeros(shape[:2], np.float32)
    cv2.ellipse(m, (int(cx * K), int(cy * K)), (max(1, int(rx * K)), max(1, int(ry * K))), ang, 0, 360, 1.0, -1, cv2.LINE_AA)
    return m


def lab(img):
    L = cv2.cvtColor((np.clip(img, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    return L[..., 0], L[..., 1] - 128, L[..., 2] - 128


def clean(mask, open_px=3, close_px=7, min_area=0):
    m = (mask > 0.5).astype(np.uint8)
    if close_px:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_px, close_px)))
    if open_px:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_px, open_px)))
    if min_area:
        n, lbl, st, _ = cv2.connectedComponentsWithStats(m)
        keep = np.zeros(n, bool)
        keep[1:] = st[1:, 4] >= min_area
        m = keep[lbl].astype(np.uint8)
    return m.astype(np.float32)


def fill_holes(mask):
    m = (mask > 0.5).astype(np.uint8) * 255
    h, w = m.shape
    ff = m.copy()
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    return ((m | cv2.bitwise_not(ff)) > 0).astype(np.float32)


def grabcut(img, prob_fg, sure_fg=None, sure_bg=None, iters=4):
    """Kanten einer groben Maske an das Foto anpassen"""
    u8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    gc = np.full(prob_fg.shape, cv2.GC_PR_BGD, np.uint8)
    gc[prob_fg > 0.5] = cv2.GC_PR_FGD
    if sure_fg is not None:
        gc[sure_fg > 0.5] = cv2.GC_FGD
    if sure_bg is not None:
        gc[sure_bg > 0.5] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(u8, gc, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    return ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.float32)


def soft(mask, px=1.5):
    """Kante weich (Kantenglättung), bleibt im Inneren 1"""
    return np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), px) * 1.15 - 0.075, 0, 1)


# ---------------------------------------------------------------- Auffüllen verdeckter Stellen
def fill_smooth(img, hole, scale=4, noise=0.012, seed=1):
    """glatte Flächen (Teller, Schüssel): Umgebung nach innen fortsetzen"""
    h, w = hole.shape
    sm = cv2.resize(img, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    hm = cv2.resize(hole, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    hm = (cv2.dilate((hm > 0.05).astype(np.uint8), np.ones((5, 5), np.uint8)) * 255).astype(np.uint8)
    filled = cv2.inpaint((np.clip(sm, 0, 1) * 255).astype(np.uint8), hm, 12, cv2.INPAINT_TELEA).astype(np.float32) / 255
    filled = cv2.GaussianBlur(filled, (0, 0), 3)
    up = cv2.resize(filled, (w, h), interpolation=cv2.INTER_CUBIC)
    r = np.random.default_rng(seed)
    up = up + r.normal(0, noise, up.shape[:2]).astype(np.float32)[..., None]
    a = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)[..., None]
    return img * (1 - a) + up * a


def fill_plate(img, hole, ref, noise=0.008, seed=1):
    """leere Teller-/Schüsselfläche unter dem Essen: Farbe und Licht nur aus
    echten Tellerpixeln (ref) übernehmen – mehrstufig geglättet, kein Verschmieren
    von Essensfarben"""
    h, w = hole.shape
    k = 4
    sm = cv2.resize(img, (w // k, h // k), interpolation=cv2.INTER_AREA)
    wt = cv2.resize(ref.astype(np.float32), (w // k, h // k), interpolation=cv2.INTER_AREA)
    est = np.zeros_like(sm)
    done = np.zeros(wt.shape, bool)
    for sig in (6, 16, 40, 100, 250):
        num = cv2.GaussianBlur(sm * wt[..., None], (0, 0), sig)
        den = cv2.GaussianBlur(wt, (0, 0), sig)
        ok = ((den > 0.08) | ((sig == 250) & (den > 1e-5))) & ~done
        est[ok] = num[ok] / den[ok][..., None]
        done |= ok
    est = cv2.GaussianBlur(est, (0, 0), 2)
    up = cv2.resize(est, (w, h), interpolation=cv2.INTER_CUBIC)
    r = np.random.default_rng(seed)
    up = up + r.normal(0, noise, (h, w)).astype(np.float32)[..., None]
    a = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 2.5)[..., None]
    return img * (1 - a) + up * a


def fill_patches(img, hole, source, patch=40, seed=3, ring=True):
    """strukturierte Flächen (Nudeln, Fleisch, Teig): Löcher mit gedrehten Stücken
    derselben Fläche füllen und nahtlos (Poisson) einblenden"""
    r = np.random.default_rng(seed)
    out = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    srcm = cv2.erode((source > 0.5).astype(np.uint8), np.ones((3, 3), np.uint8))
    d = cv2.distanceTransform(srcm, cv2.DIST_L2, 5)
    sy, sx = np.nonzero(d >= patch + 2)
    if not len(sy):
        return fill_smooth(img, hole)
    hm = (hole > 0.5).astype(np.uint8)
    P = patch + 4
    blob = np.zeros((2 * P + 1, 2 * P + 1), np.uint8)
    cv2.circle(blob, (P, P), patch, 255, -1)
    H, W = hm.shape
    # Punkte im Loch in Rasterabstand abarbeiten
    ys, xs = np.nonzero(hm)
    if not len(ys):
        return img
    pts = set()
    for y, x in zip(ys, xs):
        pts.add((int(y // (patch * 0.8)), int(x // (patch * 0.8))))
    for gy, gx in sorted(pts):
        cy = int(min(H - P - 1, max(P, gy * patch * 0.8 + patch * 0.4)))
        cx = int(min(W - P - 1, max(P, gx * patch * 0.8 + patch * 0.4)))
        j = r.integers(len(sy))
        M = cv2.getRotationMatrix2D((float(sx[j]), float(sy[j])), r.uniform(0, 360), 1.0)
        M[0, 2] += P - sx[j]
        M[1, 2] += P - sy[j]
        piece = cv2.warpAffine(out, M, (2 * P + 1, 2 * P + 1), borderMode=cv2.BORDER_REFLECT)
        try:
            out = cv2.seamlessClone(piece, out, blob, (cx, cy), cv2.NORMAL_CLONE)
        except cv2.error:
            pass
    res = out.astype(np.float32) / 255
    a = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 2)[..., None]
    return img * (1 - a) + res * a


# ---------------------------------------------------------------- auf die Arbeitsfläche
class Frame:
    """Abbildung Quelle → Arbeitsfläche S×S (affin). Kreisrunde Gefäße werden
    dabei entzerrt (Ellipse → Kreis), alles andere maßstäblich eingepasst."""

    def __init__(self, M):
        self.M = M.astype(np.float32)

    @staticmethod
    def circle(cx, cy, rx, ry, ang, r_out=0.47):
        """Ellipse (Teller schräg fotografiert) → Kreis mit Radius r_out·S in der Mitte"""
        cx, cy, rx, ry = cx * K, cy * K, rx * K, ry * K
        a = math.radians(ang)
        R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        A = R @ np.diag([rx, ry]) @ R.T  # Ellipse = A · Einheitskreis (symmetrisch)
        # symmetrische Streckung (keine Drehung des Bildinhalts)
        L = (S * r_out) * (R @ np.diag([1 / rx, 1 / ry]) @ R.T)
        t = np.array([S / 2, S / 2]) - L @ np.array([cx, cy])
        return Frame(np.hstack([L, t[:, None]]))

    @staticmethod
    def fit(x0, y0, x1, y1, fill=0.94, rot=0.0):
        """Rechteck der Quelle (x0, y0)–(x1, y1) einpassen (längere Seite = fill·S), optional gedreht"""
        x0, y0, x1, y1 = x0 * K, y0 * K, x1 * K, y1 * K
        w, h = x1 - x0, y1 - y0
        s = S * fill / max(w, h)
        M = cv2.getRotationMatrix2D(((x0 + x1) / 2, (y0 + y1) / 2), rot, s)
        M[0, 2] += S / 2 - (x0 + x1) / 2
        M[1, 2] += S / 2 - (y0 + y1) / 2
        return Frame(M)

    def img(self, im):
        return cv2.warpAffine(im, self.M, (S, S), flags=cv2.INTER_AREA if self.M[0, 0] < 1 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    def mask(self, m):
        return np.clip(cv2.warpAffine(m.astype(np.float32), self.M, (S, S), flags=cv2.INTER_LINEAR, borderValue=0), 0, 1)


def layer(img_c, mask_c):
    """Bild + Maske (beides auf der Arbeitsfläche) → vormultiplizierte Ebene"""
    a = np.clip(mask_c, 0, 1)
    out = np.zeros((S, S, 4), np.float32)
    out[..., :3] = np.clip(img_c, 0, 1) * a[..., None]
    out[..., 3] = a
    return out


def drop_shadow(mask_c, dx=6, dy=11, blur=13, alpha=0.26):
    sh = cv2.GaussianBlur(mask_c, (0, 0), blur)
    sh = np.roll(np.roll(sh, dy, 0), dx, 1) * alpha
    out = np.zeros((S, S, 4), np.float32)
    out[..., 3] = sh
    out[..., :3] = np.array([0.1, 0.13, 0.2], np.float32) * sh[..., None]
    return out


def contact(mask_c, alpha=0.32, blur=2.5, dy=3):
    """weicher Kontaktschatten unter einer Zutaten-Ebene (sieht beim Auffächern plastisch aus)"""
    sh = cv2.GaussianBlur(mask_c, (0, 0), blur)
    sh = np.roll(sh, dy, 0) * alpha * (1 - mask_c)
    out = np.zeros((S, S, 4), np.float32)
    out[..., 3] = sh
    out[..., :3] = np.array([0.08, 0.1, 0.15], np.float32) * sh[..., None]
    return out


def recolor(img, mask, hue_to=None, sat=1.0, val=1.0, hue_shift=None):
    """Farbe in einer Maske ändern (z. B. Sahnesauce → Currysauce), Licht bleibt"""
    u8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(u8, cv2.COLOR_BGR2HSV).astype(np.float32)
    if hue_to is not None:
        hsv[..., 0] = hue_to
    if hue_shift is not None:
        hsv[..., 0] = (hsv[..., 0] + hue_shift) % 180
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    rc = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32) / 255
    a = np.clip(mask, 0, 1)[..., None]
    return img * (1 - a) + rc * a


# ---------------------------------------------------------------- Teller/Schüssel automatisch
def vessel_pixels(img, lmin=150, cmax=24):
    L, A, B = lab(img)
    return ((L > lmin) & (np.hypot(A, B) < cmax)).astype(np.float32)


def find_vessel(img, lmin=150, cmax=24, hint=None):
    """größte helle, farbarme Fläche (Teller, Schüssel) → Ellipse (cx, cy, rx, ry, Winkel)"""
    if hint is not None:
        return hint
    vp = clean(vessel_pixels(img, lmin, cmax), 5, 25)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(vp.astype(np.uint8))
    i = 1 + int(np.argmax(st[1:, 4]))
    m = fill_holes((lbl == i).astype(np.float32))
    cnts, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = cv2.convexHull(max(cnts, key=cv2.contourArea))
    (cx, cy), (w, h), ang = cv2.fitEllipse(hull)
    return (cx, cy, w / 2, h / 2, ang)


def split_food(img, vessel_ell, lmin=150, cmax=24, inner=0.97, extra_fg=None, min_area=2000):
    """Essen auf dem Gefäß: alles innerhalb der Ellipse, das nicht Gefäßfarbe ist"""
    cx, cy, rx, ry, ang = vessel_ell
    inside = ell(cx, cy, rx * inner, ry * inner, ang, img.shape)
    vp = vessel_pixels(img, lmin, cmax)
    food = clean(inside * (1 - vp), 5, 15, min_area)
    food = fill_holes(food)
    if extra_fg is not None:
        food = np.maximum(food, extra_fg)
    # Kanten an das Foto anpassen
    sure_bg = 1 - ell(cx, cy, rx * 1.02, ry * 1.02, ang, img.shape)
    er = cv2.erode(food.astype(np.uint8), np.ones((25, 25), np.uint8)).astype(np.float32)
    try:
        food = grabcut(img, food, sure_fg=er, sure_bg=sure_bg, iters=3)
    except cv2.error:
        pass
    return fill_holes(clean(food * inside, 3, 9, min_area))


def dilate(m, px):
    return cv2.dilate((m > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px, px))).astype(np.float32)


def decompose(key, hint=None, lmin=150, cmax=24, r_out=0.47, keep_round=True, remove=None):
    """Foto eines Tellers/einer Schüssel → (Frame, Gefäß-Ebene, Essen-Bild, Essen-Maske) auf der Arbeitsfläche.
    remove: Maske (Quelle) von Dingen, die weg sollen (Löffel, Brot …) – dort Gefäß ergänzen"""
    im = load(key)
    e = find_vessel(im, lmin, cmax, hint)
    vessel = ell(*e, im.shape)
    food = split_food(im, e, lmin, cmax)
    if remove is not None:
        food = food * (1 - remove)
    hole = dilate(np.maximum(food, remove if remove is not None else 0), 15) * vessel
    ref = vessel_pixels(im, lmin, cmax) * vessel * (1 - hole)
    vimg = fill_plate(im, hole, ref > 0.5)
    F = Frame.circle(*e, r_out=r_out) if keep_round else Frame.fit(e[0] - e[2], e[1] - e[3], e[0] + e[2], e[1] + e[3])
    vm = soft(F.mask(vessel), 1.0)
    return F, im, over(drop_shadow(vm), layer(F.img(vimg), vm)), F.img(im), soft(F.mask(food), 0.8)


# ---------------------------------------------------------------- Freistellen und Platzieren
def cutout(im, rough, inner=0.62, outer=1.12, remove=None, iters=5, keep=None, holes=True):
    """Objekt im Foto freistellen. rough = Ellipse (cx, cy, rx, ry, Winkel) oder Polygon (Liste von Punkten).
    remove: Maske von Dingen, die sicher nicht dazugehören (Gabel, Brot …). keep: Farbregel (Funktion img → Maske 0/1),
    die zusätzlich gelten muss (z. B. „nicht weiß“)."""
    sh = im.shape
    if isinstance(rough, tuple):
        cx, cy, rx, ry, a = rough
        prob = ell(cx, cy, rx, ry, a, sh)
        sure = ell(cx, cy, rx * inner, ry * inner, a, sh)
        bg = 1 - ell(cx, cy, rx * outer, ry * outer, a, sh)
    else:
        pts = np.asarray(rough, np.float32)
        prob = poly(pts, sh)
        c = pts.mean(0)
        sure = poly(c + (pts - c) * inner, sh)
        bg = 1 - poly(c + (pts - c) * outer, sh)
    if remove is not None:
        bg = np.maximum(bg, remove)
        sure = sure * (1 - dilate(remove, 31))
        prob = prob * (1 - remove)
    if keep is not None:
        k = keep(im)
        sure = sure * k
    m = grabcut(im, prob, sure_fg=sure, sure_bg=bg, iters=iters)
    if keep is not None:
        m = m * clean(keep(im), 0, 5)
    n, lbl, st, _ = cv2.connectedComponentsWithStats((m > 0.5).astype(np.uint8))
    if n > 1:
        i = 1 + int(np.argmax(st[1:, 4]))
        big = st[i, 4]
        keepc = np.zeros(n, bool)
        keepc[1:] = st[1:, 4] > big * 0.02
        m = keepc[lbl].astype(np.float32)
    m = clean(m, 3, 7)
    return fill_holes(m) if holes else m


def bbox(mask):
    ys, xs = np.nonzero(mask > 0.5)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(im, mask, cx, cy, size, rot=0.0, flip=False, by='max', edge=0.9, shadow=0.3):
    """freigestelltes Objekt auf die Arbeitsfläche setzen: Mitte (cx, cy), größte Ausdehnung = size (Pixel)"""
    x0, y0, x1, y1 = bbox(mask)
    w, h = x1 - x0, y1 - y0
    s = size / (max(w, h) if by == 'max' else (w if by == 'w' else h))
    M = cv2.getRotationMatrix2D(((x0 + x1) / 2, (y0 + y1) / 2), rot, s)
    M[0, 2] += cx - (x0 + x1) / 2
    M[1, 2] += cy - (y0 + y1) / 2
    src = im[:, ::-1] if flip else im
    msk = mask[:, ::-1] if flip else mask
    if flip:
        M = M @ np.array([[-1, 0, im.shape[1] - 1], [0, 1, 0], [0, 0, 1]], np.float32)
    flags = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    ci = cv2.warpAffine(src, M, (S, S), flags=flags, borderMode=cv2.BORDER_REPLICATE)
    cm = np.clip(cv2.warpAffine(msk.astype(np.float32), M, (S, S), flags=cv2.INTER_LINEAR, borderValue=0), 0, 1)
    cm = soft(cm, edge)
    lay = layer(ci, cm)
    return over(contact(cm, shadow), lay) if shadow else lay


def lab_shift(img, mask, dL=0.0, da=0.0, db=0.0, kL=1.0, kab=1.0):
    """Farbe in LAB verschieben (Licht und Struktur bleiben): L' = L·kL + dL, a/b ähnlich"""
    u8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    L = cv2.cvtColor(u8, cv2.COLOR_BGR2LAB).astype(np.float32)
    L[..., 0] = np.clip(L[..., 0] * kL + dL * 2.55, 0, 255)
    L[..., 1] = np.clip((L[..., 1] - 128) * kab + 128 + da, 0, 255)
    L[..., 2] = np.clip((L[..., 2] - 128) * kab + 128 + db, 0, 255)
    rc = cv2.cvtColor(L.astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32) / 255
    a = np.clip(mask, 0, 1)[..., None]
    return img * (1 - a) + rc * a


def lab_match(img, mask, target, spread=1.0):
    """Mittelwert der Farbe in der Maske auf target (L, a, b; L 0–100) bringen, Kontrast mit spread"""
    u8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    L = cv2.cvtColor(u8, cv2.COLOR_BGR2LAB).astype(np.float32)
    m = mask > 0.5
    mean = L[m].mean(0)
    t = np.array([target[0] * 2.55, target[1] + 128, target[2] + 128], np.float32)
    L = (L - mean) * spread + t
    rc = cv2.cvtColor(np.clip(L, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32) / 255
    a = np.clip(mask, 0, 1)[..., None]
    return img * (1 - a) + rc * a
