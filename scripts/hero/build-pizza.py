"""
Hero-Pizza aus einem Foto erzeugen: freistellen, 2× hochrechnen, Kanten
weich und farbrein machen, zuschneiden.

    python3 scripts/hero/build-pizza.py [foto.jpg]

Ergebnis: src/assets/hero/pizza.png (RGBA) + src/assets/hero/pizza.json
(Bildmaße und Lage der Pizza im Bild – vom Hero-Skript für Tiefe und
Hotspots benutzt).

Voraussetzungen: pip install opencv-contrib-python-headless numpy
Das EDSR-Modell (≈ 38 MB, Apache-2.0) wird beim ersten Lauf nach
scripts/hero/.cache/ geladen. Ohne Modell wird mit Lanczos hochgerechnet.

Für ein eigenes Foto gilt: Pizza vollständig im Bild, Blick schräg von
vorn (wie das Standardfoto), ruhiger Hintergrund. Die Startwerte für die
Freistellung (INIT_*) beziehen sich auf eine Bildbreite von 1024 px und
müssen bei einem anderen Foto ggf. angepasst werden.
"""
import json
import os
import sys
import urllib.request

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'scripts/hero/source/whole-pizza-isorepublic-cc0.jpg')
OUT_DIR = os.path.join(ROOT, 'src/assets/hero')
CACHE = os.path.join(ROOT, 'scripts/hero/.cache')
EDSR_URL = 'https://raw.githubusercontent.com/Saafke/EDSR_Tensorflow/master/models/EDSR_x2.pb'

# Startwerte der Freistellung (bei 1024 px Breite): wahrscheinliche Pizza als
# Hülle aus Oberseite und Unterkante, sicherer Kern innen.
INIT_TOP = ((527, 388), (452, 140))
INIT_BOTTOM = ((527, 430), (450, 120))
INIT_CORE = ((527, 400), (400, 95))
SHADOW_V = 70  # Helligkeit, unter der Pixel an der Unterkante als Tischschatten gelten


def segment(img):
    """Maske der Pizza (uint8 0/255) in Arbeitsauflösung."""
    h, w = img.shape[:2]
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    pf = np.zeros((h, w), np.uint8)
    cv2.ellipse(pf, INIT_TOP[0], INIT_TOP[1], 0, 0, 360, 255, -1)
    cv2.ellipse(pf, INIT_BOTTOM[0], INIT_BOTTOM[1], 0, 0, 360, 255, -1)
    mask[pf > 0] = cv2.GC_PR_FGD
    core = np.zeros((h, w), np.uint8)
    cv2.ellipse(core, INIT_CORE[0], INIT_CORE[1], 0, 0, 360, 255, -1)
    mask[core > 0] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    m = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)

    # Kontaktschatten auf dem Tisch: von der Unterkante aufwärts dunkle Pixel weg
    V = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 2].astype(int)
    for x in range(w):
        col = np.nonzero(m[:, x])[0]
        if not len(col):
            continue
        y = col.max()
        while y > col.min() and V[y, x] < SHADOW_V:
            m[y, x] = False
            y -= 1
    mu = m.astype(np.uint8) * 255
    band = (mu > 0) & (cv2.erode(mu, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) == 0)
    lower = np.arange(h)[:, None] > INIT_TOP[0][1]
    m[band & lower & (V < SHADOW_V + 25)] = False

    mu = m.astype(np.uint8) * 255
    mu = cv2.morphologyEx(mu, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mu)
    k = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    mu = np.where(lab == k, 255, 0).astype(np.uint8)
    cnts, _ = cv2.findContours(mu, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(mu)
    cv2.drawContours(filled, cnts, -1, 255, -1)
    return filled


def upscale(img):
    path = os.path.join(CACHE, 'EDSR_x2.pb')
    try:
        if not os.path.exists(path):
            os.makedirs(CACHE, exist_ok=True)
            print('lade EDSR-Modell …')
            urllib.request.urlretrieve(EDSR_URL, path)
        sr = cv2.dnn_superres.DnnSuperResImpl_create()
        sr.readModel(path)
        sr.setModel('edsr', 2)
        print('rechne 2× hoch (EDSR, dauert einige Minuten) …')
        return sr.upsample(img)
    except Exception as e:  # noqa: BLE001
        print('EDSR nicht verfügbar, nutze Lanczos:', e)
        h, w = img.shape[:2]
        return cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_LANCZOS4)


def main():
    img = cv2.imread(SRC)
    if img is None:
        sys.exit(f'Foto nicht gefunden: {SRC}')
    if img.shape[1] != 1024:
        s = 1024 / img.shape[1]
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    mask = segment(img)

    up_cache = os.path.join(CACHE, 'up2-' + os.path.basename(SRC) + '.png')
    if os.path.exists(up_cache):
        up = cv2.imread(up_cache)
    else:
        up = upscale(img)
        os.makedirs(CACHE, exist_ok=True)
        cv2.imwrite(up_cache, up)
    H, W = up.shape[:2]

    # glatte Kontur in Zielauflösung
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 2.5)
    soft = cv2.resize(soft, (W, H), interpolation=cv2.INTER_CUBIC)
    binary = (soft > 0.5).astype(np.uint8)

    # Alpha über den Abstand zur Kante: 1 px nach innen, hinten (oben) weicher
    # wie die Schärfentiefe des Fotos, vorne knackig.
    d_in = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    d_out = cv2.distanceTransform(1 - binary, cv2.DIST_L2, 5)
    sd = d_in - d_out - 1.0
    ys, xs = np.nonzero(binary)
    top, bottom = ys.min(), ys.max()
    yy = np.arange(H, dtype=np.float32)[:, None]
    far = np.clip((top + (bottom - top) * 0.45 - yy) / ((bottom - top) * 0.45), 0, 1)
    feather = 1.1 + 2.6 * far
    alpha = np.clip(0.5 + sd / (2 * feather), 0, 1)

    # Farbe am Rand von innen nach außen fortsetzen (kein heller Saum vom Hintergrund)
    inner = cv2.erode(binary, np.ones((5, 5), np.uint8)).astype(np.float32)
    f = up.astype(np.float32)
    num = cv2.GaussianBlur(f * inner[..., None], (0, 0), 4)
    den = cv2.GaussianBlur(inner, (0, 0), 4)[..., None]
    ext = num / np.maximum(den, 1e-4)
    edge_w = np.clip(1 - d_in / 4.0, 0, 1)[..., None] * (den > 1e-3)
    color = f * (1 - edge_w) + ext * edge_w

    # dezente Food-Gradation: etwas mehr Tiefe in den Mitten, warm, nicht bunt
    lab = cv2.cvtColor(np.clip(color, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[..., 0] / 255
    L = L + 0.06 * np.sin(np.pi * L) * (L - 0.5) * 2  # leichte S-Kurve
    lab[..., 0] = np.clip(L, 0, 1) * 255
    lab[..., 1:] = (lab[..., 1:] - 128) * 1.04 + 128
    color = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

    # zuschneiden mit Rand
    pad = 24
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, W - 1)
    y0, y1 = max(top - pad, 0), min(bottom + pad, H - 1)
    rgba = np.dstack([color, (alpha * 255).round().astype(np.uint8)])[y0 : y1 + 1, x0 : x1 + 1]
    os.makedirs(OUT_DIR, exist_ok=True)
    cv2.imwrite(os.path.join(OUT_DIR, 'pizza.png'), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 9])

    # Geometrie für das Hero-Skript (normiert auf das zugeschnittene Bild)
    a = rgba[..., 3] > 127
    h, w = a.shape
    cols = np.nonzero(a.any(axis=0))[0]
    rows = np.nonzero(a.any(axis=1))[0]
    center_col = a[:, w // 2]
    cy = np.nonzero(center_col)[0]
    meta = {
        'width': int(w),
        'height': int(h),
        'source': os.path.basename(SRC),
        'bbox': [round(cols.min() / w, 4), round(rows.min() / h, 4), round(cols.max() / w, 4), round(rows.max() / h, 4)],
        'farRim': round(cy.min() / h, 4),
        'nearEdge': round(cy.max() / h, 4),
    }
    with open(os.path.join(OUT_DIR, 'pizza.json'), 'w') as fh:
        json.dump(meta, fh, indent=2)
    print('→ src/assets/hero/pizza.png', w, 'x', h, meta)


if __name__ == '__main__':
    main()
