"""
Textur für die 3D-Hero-Pizza aus einem Foto (Draufsicht oder schräg von oben).

    python3 scripts/hero/build-pizza3d.py [foto.jpg]

Schritte: Pizza über die Farbtemperatur vom Teller trennen (Teig ist warm,
Teller kühl), Umriss im Polarraster glätten, Ellipse → Kreis entzerren,
Rand nach außen farbrein fortsetzen.

Ergebnis:
  src/assets/hero/pizza-top.png   2048×2048, RGB (Kreis, Radius 0.47 der Kante, Farbe nach außen fortgesetzt)
  src/assets/hero/pizza-top.json  Umrissprofil (256 Radien), Randbreite

Voraussetzung: pip install opencv-contrib-python-headless numpy
"""
import json
import os
import sys

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'scripts/hero/source/pepperoni-wordpress-photos-cc0.jpg')
OUT = os.path.join(ROOT, 'src/assets/hero')
SIZE = 2048
RADIUS = 0.47 * SIZE  # Pizza-Radius in der Textur
BINS = 256
# Startellipse der Pizza im Foto: Mitte, Halbachsen, Drehung (für das Standardfoto)
INIT = ((1080, 762), (888, 738), 0.0)


def cyclic_smooth(v, median=9, sigma=4.0):
    n = len(v)
    pad = np.concatenate([v[-median:], v, v[:median]])
    med = np.array([np.median(pad[i : i + median]) for i in range(n + median)])[median // 2 : median // 2 + n]
    k = np.exp(-0.5 * (np.arange(-3 * int(sigma), 3 * int(sigma) + 1) / sigma) ** 2)
    k /= k.sum()
    r = len(k) // 2
    pad = np.concatenate([med[-r:], med, med[:r]])
    return np.convolve(pad, k, mode='valid')


def polar_profile(mask, cx, cy, bins):
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)[:, 0, :].astype(np.float32)
    ang = np.arctan2(c[:, 1] - cy, c[:, 0] - cx)
    rad = np.hypot(c[:, 0] - cx, c[:, 1] - cy)
    idx = ((ang + np.pi) / (2 * np.pi) * bins).astype(int) % bins
    prof = np.full(bins, np.nan)
    for i in range(bins):
        sel = rad[idx == i]
        if len(sel):
            prof[i] = sel.max()
    ok = ~np.isnan(prof)
    prof[~ok] = np.interp(np.nonzero(~ok)[0], np.nonzero(ok)[0], prof[ok], period=bins)
    return prof


def retouch_char(tex, binary, tprof):
    """Große Brandflecken am Rand durch Kruste aus einem anderen Winkel ersetzen.

    Im Foto stören sie nicht, auf der 3D-Randwand vorn lesen sie sich aber wie
    ein Loch im Umriss. Quelle: dieselbe Pizza, um den Mittelpunkt gedreht und
    am Umriss ausgerichtet (Kruste landet wieder auf Kruste).
    """
    bins = len(tprof)
    c = SIZE / 2

    def outl(th):
        f = ((th + np.pi) / (2 * np.pi) * bins - 0.5) % bins
        i = np.floor(f).astype(int)
        u = f - i
        return tprof[i % bins] * (1 - u) + tprof[(i + 1) % bins] * u

    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    th = np.arctan2(yy - c, xx - c)
    rho = np.hypot(xx - c, yy - c) / (RADIUS * outl(th))
    lab = cv2.cvtColor(tex, cv2.COLOR_BGR2LAB).astype(np.float32)
    inside = binary > 0
    dark = ((lab[..., 0] < 70) & inside & (rho > 0.75)).astype(np.uint8)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(dark, 8)
    out = tex.astype(np.float32)
    for i in range(1, n):
        if st[i, 4] < 20000:
            continue
        m = cv2.dilate((lbl == i).astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (45, 45)))
        soft = np.clip(cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 10) * 1.5, 0, 1)
        ys, xs = np.nonzero(soft > 0.01)
        sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        ring = ((soft > 0.05) & inside)[sl]
        nb = (cv2.dilate(m, np.ones((81, 81), np.uint8)) > 0) & (m == 0) & inside & (rho > 0.8) & (lab[..., 0] > 90)
        ref = lab[nb].mean(0)
        best = None
        for d in np.deg2rad(np.arange(-120, 121, 2)):
            if abs(d) < np.deg2rad(18):
                continue
            ths = th[sl] - d
            rs = rho[sl] * RADIUS * outl(ths)
            patch = cv2.remap(out, (c + rs * np.cos(ths)).astype(np.float32), (c + rs * np.sin(ths)).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            pl = cv2.cvtColor(np.clip(patch, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)[ring]
            # wenig Schwarz, gleiche Farbe wie die Kruste ringsum, keine Tomate
            score = (pl[:, 0] < 90).mean() * 2 + np.abs(pl.mean(0) - ref).sum() / 60 + (pl[:, 1] > 150).mean()
            if best is None or score < best[0]:
                best = (score, patch)
        sf = soft[sl][..., None]
        out[sl] = out[sl] * (1 - sf) + best[1] * sf
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    img = cv2.imread(SRC)
    if img is None:
        sys.exit(f'Foto nicht gefunden: {SRC}')
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a, b = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128

    # Teig/Belag: warm (b*) und hell genug; Tomate/Salami: stark rot (a*).
    # Teller (kühl, b* klein) und Holz (dunkel) fallen heraus.
    pizza = ((((b > 24) & (L > 95)) | ((a > 24) & (L > 60))).astype(np.uint8)) * 255
    pizza = cv2.morphologyEx(pizza, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))

    # Suche je Winkel entlang des Strahls nur in einem Band um die Startellipse
    (ecx, ecy), (eax, eay), eang = INIT
    th = -np.pi + (np.arange(720) + 0.5) * 2 * np.pi / 720
    t0 = np.deg2rad(eang)
    prof = np.zeros(720)
    for i, a_ in enumerate(th):
        dx, dy = np.cos(a_), np.sin(a_)
        # Radius der Startellipse in dieser Richtung
        lx, ly = dx * np.cos(t0) + dy * np.sin(t0), -dx * np.sin(t0) + dy * np.cos(t0)
        re = 1 / np.sqrt((lx / eax) ** 2 + (ly / eay) ** 2)
        rs = np.arange(0.88 * re, 1.06 * re, 1.0)
        xs = np.clip((ecx + dx * rs).astype(int), 0, w - 1)
        ys = np.clip((ecy + dy * rs).astype(int), 0, h - 1)
        hit = np.nonzero(pizza[ys, xs])[0]
        prof[i] = rs[hit.max()] if len(hit) else re
    prof = cyclic_smooth(prof, median=21, sigma=6)
    pts = np.stack([ecx + prof * np.cos(th), ecy + prof * np.sin(th)], 1).astype(np.float32)
    smooth = np.zeros((h, w), np.uint8)
    cv2.fillPoly(smooth, [pts.astype(np.int32)], 255)
    (ex, ey), (d1, d2), ang = cv2.fitEllipse(pts)

    # Affine Entzerrung: Ellipse → Kreis mit RADIUS in der Texturmitte
    t = np.deg2rad(ang)
    R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    S = np.diag([2 * RADIUS / d1, 2 * RADIUS / d2])
    A = R @ S @ R.T
    off = np.array([SIZE / 2, SIZE / 2]) - A @ np.array([ex, ey])
    Maff = np.hstack([A, off[:, None]]).astype(np.float32)
    tex = cv2.warpAffine(img, Maff, (SIZE, SIZE), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    msk = cv2.warpAffine(smooth, Maff, (SIZE, SIZE), flags=cv2.INTER_LINEAR)

    # Profil in Texturkoordinaten (normiert auf RADIUS)
    binary = (msk > 127).astype(np.uint8) * 255
    tprof = polar_profile(binary, SIZE / 2, SIZE / 2, BINS) / RADIUS
    tprof = cyclic_smooth(tprof, median=9, sigma=4.0)
    tex = retouch_char(tex, binary, tprof)

    # Farbe über den Rand hinaus fortsetzen (Mip-Stufen ziehen sonst Teller-Weiß herein)
    inner = cv2.erode(binary, np.ones((7, 7), np.uint8)).astype(np.float32) / 255
    f = tex.astype(np.float32)

    def normconv(sigma):
        num = cv2.GaussianBlur(f * inner[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(inner, (0, 0), sigma)[..., None]
        return num / np.maximum(den, 1e-6), den

    near, den_near = normconv(4)
    mid, den_mid = normconv(14)
    far, _ = normconv(60)
    outside = np.where(den_near > 0.02, near, np.where(den_mid > 0.01, mid, far))
    d_in = cv2.distanceTransform(binary // 255, cv2.DIST_L2, 5)
    edge = np.clip(1 - d_in / 3.0, 0, 1)[..., None]
    color = np.where(binary[..., None] > 0, f * (1 - edge) + near * edge, outside)

    # ohne Alpha speichern: WebP/Browser verwerfen Farben unter Alpha 0, die
    # 3D-Kante würde dort Schwarz lesen (sichtbar als Zacken am Umriss)
    os.makedirs(OUT, exist_ok=True)
    cv2.imwrite(os.path.join(OUT, 'pizza-top.png'), np.clip(color, 0, 255).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    meta = {
        'source': os.path.basename(SRC),
        'size': SIZE,
        'radius': round(RADIUS / SIZE, 4),
        'profile': [round(float(v), 4) for v in tprof],
    }
    with open(os.path.join(OUT, 'pizza-top.json'), 'w') as fh:
        json.dump(meta, fh)
    print('→ src/assets/hero/pizza-top.png', SIZE, 'Profil min/max', round(float(tprof.min()), 3), round(float(tprof.max()), 3), 'Ellipse', round(d1), round(d2), round(ang, 1))


if __name__ == '__main__':
    main()
