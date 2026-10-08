"""
Neue Zutaten als einzelne Stücke – im selben Format wie die Pizza-Zutaten
(Kachel tp.W×tp.W, Motiv ≈ 68 %, gerade Farben + Alpha), damit sie mit
place()/scatter() aus base.py verteilt werden können.
"""
import math

import cv2
import numpy as np

from base import tp

W, C, R0, XX, YY, TAU, SS = tp.W, tp.C, tp.R0, tp.XX, tp.YY, tp.TAU, tp.SS
fill, organic, fbm, render, dome, smooth, hexcol, mix, over = tp.fill, tp.organic, tp.fbm, tp.render, tp.dome, tp.smooth, tp.hexcol, tp.mix, tp.over


def _rot(rot):
    c, s = math.cos(rot), math.sin(rot)
    return (XX - C) * c + (YY - C) * s, -(XX - C) * s + (YY - C) * c


def _band(seed, length, width, bend, wav=0.0):
    """gebogener Streifen (Salatstreifen, Kraut, Tagliatelle-Stück)"""
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    px, py = _rot(rot)
    t = px / length
    centre = bend * length * (t**2 - 0.25) + wav * width * np.sin(t * 9 + r.uniform(0, TAU))
    d = py - centre
    m = ((np.abs(t) < 1) & (np.abs(d) < width)).astype(np.float32)
    m = np.clip((smooth(m, 0.8) - 0.5) * 3 + 0.5, 0, 1)
    return m, t, d / width


def iceberg(seed):
    m, t, across = _band(seed, R0 * 0.95, R0 * 0.26, np.random.default_rng(seed).uniform(-0.6, 0.6), 0.18)
    m = np.clip(m * (0.75 + 0.5 * fbm(5, 2, seed + 3)) * 1.4 - 0.2, 0, 1)
    m = np.clip((smooth(m, 0.6) - 0.5) * 3 + 0.5, 0, 1)
    vein = np.clip(1 - np.abs(across) * 3, 0, 1) * 0.35
    alb = mix(hexcol('#d9eaa2'), hexcol('#8fbe57'), np.clip(fbm(12, 2, seed) * 0.6 + np.abs(across) * 0.4 - vein, 0, 1))
    h = np.sqrt(np.clip(1 - across**2, 0, 1)) * 0.4 + fbm(5, 2, seed) * 0.25
    return render(m, h, alb, spec=0.45, shin=40, bump=6, wrap=0.45, shadow=0.3)


def cabbage(seed):
    m, t, across = _band(seed, R0 * 0.85, R0 * 0.09, np.random.default_rng(seed).uniform(-0.8, 0.8), 0.3)
    alb = mix(hexcol('#f6f3dc'), hexcol('#cddc9a'), np.clip(fbm(10, 2, seed) * 0.8, 0, 1))
    h = np.sqrt(np.clip(1 - across**2, 0, 1)) * 0.5
    return render(m, h, alb, spec=0.7, shin=60, bump=5, wrap=0.45, shadow=0.3)


def lettuce(seed, light='#a9cf5c', dark='#4f8a2a'):
    """Blattsalat: gewelltes Blatt mit heller Mittelrippe"""
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 1.0, R0 * 0.72, seed, 0.2, n=72, rot=rot, freq=(5, 9, 13)))
    m = np.clip((smooth(m, 0.7) - 0.5) * 3 + 0.5, 0, 1)
    px, py = _rot(rot)
    rib = np.exp(-(py / (R0 * 0.06)) ** 2) * (np.abs(px) < R0 * 0.9)
    veins = np.clip(np.cos(np.arctan2(py, px - R0) * 14) * 0.5 + 0.5, 0, 1) ** 8 * 0.4
    ruffle = fbm(14, 3, seed + 1)
    alb = mix(hexcol(dark), hexcol(light), np.clip(0.35 + (dome(m, 20, 1.0)) * 0.4 + ruffle * 0.3, 0, 1))
    alb = alb * (1 - rib[..., None] * 0.6) + hexcol('#e9f2c4')[None, None] * rib[..., None] * 0.6
    alb = alb * (1 + veins[..., None] * 0.2)
    h = dome(m, 14, 0.5) * 0.3 + ruffle * 0.5 + rib * 0.15
    return render(m, h, alb, spec=0.4, shin=30, bump=8, wrap=0.45, shadow=0.35)


def cucumber(seed):
    r = np.random.default_rng(seed)
    rr = R0 * r.uniform(0.9, 1.0)
    m = fill(organic(rr, rr * r.uniform(0.92, 1.0), seed, 0.02, rot=r.uniform(0, TAU)))
    d = np.hypot(XX - C, YY - C) / rr
    skin = np.clip((d - 0.86) / 0.06, 0, 1)
    ang = np.arctan2(YY - C, XX - C)
    seeds = (np.clip(np.cos(ang * 3) * 0.5 + 0.5, 0, 1) ** 2) * np.exp(-((d - 0.36) / 0.14) ** 2)
    alb = mix(hexcol('#d9ecb5'), hexcol('#b5d688'), np.clip(d * 0.6 + fbm(8, 2, seed) * 0.3, 0, 1))
    alb = alb * (1 - seeds[..., None] * 0.25) + hexcol('#f2f6dc')[None, None] * seeds[..., None] * 0.25
    alb = alb * (1 - skin[..., None]) + hexcol('#2f5a1e')[None, None] * skin[..., None]
    h = dome(m, 6, 0.6) * 0.4 + seeds * 0.05
    return render(m, h, alb, spec=0.6, shin=50, bump=5, wrap=0.4, shadow=0.35)


def tomato_slice(seed):
    """Tomatenscheibe (Döner, Salat): Fruchtfleisch, Kammern mit Kernen"""
    r = np.random.default_rng(seed)
    rr = R0 * r.uniform(0.95, 1.05)
    m = fill(organic(rr, rr * r.uniform(0.85, 0.95), seed, 0.04, rot=r.uniform(0, TAU)))
    d = np.hypot(XX - C, YY - C) / rr
    ang = np.arctan2(YY - C, XX - C) + r.uniform(0, TAU)
    walls = np.clip(np.cos(ang * 2.5) * 0.5 + 0.5, 0, 1) ** 6
    loc = np.clip((0.72 - d) / 0.1, 0, 1) * np.clip((d - 0.22) / 0.08, 0, 1) * (1 - walls)
    seeds = np.clip((fbm(3, 1, seed) - 0.62) * 6, 0, 1) * loc
    alb = mix(hexcol('#e8452c'), hexcol('#b81e14'), np.clip(d * 0.6, 0, 1))
    alb = alb * (1 - loc[..., None] * 0.55) + hexcol('#f07a4a')[None, None] * loc[..., None] * 0.55
    alb = alb * (1 - seeds[..., None] * 0.7) + hexcol('#f6d98a')[None, None] * seeds[..., None] * 0.7
    h = dome(m, 6, 0.6) * 0.4 + loc * 0.1
    return render(m, h, alb, spec=0.9, shin=70, bump=6, wrap=0.35, shadow=0.35)


def falafel(seed, half=False):
    r = np.random.default_rng(seed)
    rr = R0 * r.uniform(0.9, 1.0)
    m = fill(organic(rr, rr, seed, 0.06, rot=r.uniform(0, TAU), freq=(3, 5, 8)))
    m = np.clip((smooth(m, 0.6) - 0.5) * 3 + 0.5, 0, 1)
    crumb = fbm(4, 2, seed)
    d = np.hypot(XX - C, YY - C) / rr
    if half:
        # aufgeschnitten: grün-beige Innenseite, knuspriger Rand
        inner = np.clip((0.82 - d) / 0.08, 0, 1)
        alb = mix(hexcol('#6e3c17'), hexcol('#9b5a24'), crumb)
        green = mix(hexcol('#a9b05a'), hexcol('#6f8a35'), np.clip(fbm(5, 2, seed + 1) * 1.2, 0, 1))
        alb = alb * (1 - inner[..., None]) + green * inner[..., None]
        h = dome(m, 10, 0.4) * 0.4 + crumb * 0.2 * (1 - inner)
        return render(m, h, alb, spec=0.2, shin=16, bump=8, wrap=0.3, shadow=0.45)
    alb = mix(hexcol('#a4602a'), hexcol('#5a2f12'), np.clip(crumb * 0.9 + d * 0.3, 0, 1))
    h = np.sqrt(np.clip(1 - d**2, 0, 1)) * m + crumb * 0.35
    return render(m, h, alb, spec=0.3, shin=22, bump=12, wrap=0.25, shadow=0.5)


def grilled(seed, kind='zucchini'):
    """gegrillte Scheibe Zucchini/Aubergine mit Grillstreifen"""
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    rx, ry = R0 * 1.0, R0 * (0.62 if kind == 'aubergine' else 0.5)
    m = fill(organic(rx, ry, seed, 0.05, rot=rot))
    px, py = _rot(rot)
    d = np.hypot(px / rx, py / ry)
    skin = np.clip((d - 0.86) / 0.07, 0, 1)
    marks = np.clip(np.cos((px * 0.7 + py * 0.7) / (R0 * 0.09) * math.pi) * 0.5 + 0.5, 0, 1) ** 6 * (d < 0.9)
    if kind == 'zucchini':
        flesh = mix(hexcol('#eae2b4'), hexcol('#cfc58a'), fbm(8, 2, seed))
        skin_c = hexcol('#3d5d1f')
    else:
        flesh = mix(hexcol('#e3c79a'), hexcol('#b79060'), fbm(8, 2, seed))
        skin_c = hexcol('#3a1d33')
    alb = flesh * (1 - skin[..., None]) + skin_c[None, None] * skin[..., None]
    alb = alb * (1 - marks[..., None] * 0.7) + hexcol('#4a2c16')[None, None] * marks[..., None] * 0.7
    h = dome(m, 8, 0.6) * 0.35 - marks * 0.05
    return render(m, h, alb, spec=0.5, shin=30, bump=6, wrap=0.35, shadow=0.35)


def sweet_fries(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    px, py = _rot(rot)
    L, w = R0 * 1.0, R0 * 0.21
    m = ((np.abs(px) < L) & (np.abs(py) < w)).astype(np.float32)
    m = np.clip((smooth(m, 0.8) - 0.5) * 3 + 0.5, 0, 1)
    end = np.clip((np.abs(px) - L * 0.7) / (L * 0.3), 0, 1)
    alb = mix(hexcol('#ef8a2c'), hexcol('#a0441a'), np.clip(end * 0.85 + fbm(10, 2, seed) * 0.35, 0, 1))
    h = np.sqrt(np.clip(1 - (py / w) ** 2, 0, 1)) * m * 0.8 + fbm(6, 2, seed) * 0.1
    return render(m, h, alb, spec=0.3, shin=22, bump=7)


def croquette(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    px, py = _rot(rot)
    L, w = R0 * 0.95, R0 * 0.38
    t = np.clip(np.abs(px) - (L - w), 0, None)
    m = ((t**2 + py**2) < w**2).astype(np.float32)
    m = np.clip((smooth(m, 0.8) - 0.5) * 3 + 0.5, 0, 1)
    crumb = fbm(3, 2, seed)
    alb = mix(hexcol('#e2a34e'), hexcol('#9c5a1e'), np.clip(crumb * 0.8 + (1 - dome(m, 12, 1)) * 0.4, 0, 1))
    h = np.sqrt(np.clip(1 - (py / w) ** 2, 0, 1)) * m * 0.9 + crumb * 0.3
    return render(m, h, alb, spec=0.2, shin=16, bump=10, wrap=0.3, shadow=0.45)


def onion_ring(seed):
    r = np.random.default_rng(seed)
    ro = R0 * r.uniform(0.95, 1.02)
    m = fill(organic(ro, ro * r.uniform(0.82, 0.95), seed, 0.05, rot=r.uniform(0, TAU)))
    hole = fill(organic(ro * 0.55, ro * 0.5, seed + 1, 0.06, rot=r.uniform(0, TAU)))
    m = np.clip(m - hole, 0, 1)
    m = np.clip((smooth(m, 0.7) - 0.5) * 3 + 0.5, 0, 1)
    crumb = fbm(3, 2, seed)
    alb = mix(hexcol('#ebb35a'), hexcol('#a8661f'), np.clip(crumb * 0.8, 0, 1))
    h = dome(m, 14, 0.5) * 0.6 + crumb * 0.3
    return render(m, h, alb, spec=0.25, shin=18, bump=10, wrap=0.3, shadow=0.45)


def mozzarella_stick(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    px, py = _rot(rot)
    L, w = R0 * 1.0, R0 * 0.26
    t = np.clip(np.abs(px) - (L - w * 0.6), 0, None)
    m = ((t**2 * 2 + py**2) < w**2).astype(np.float32)
    m = np.clip((smooth(m, 0.8) - 0.5) * 3 + 0.5, 0, 1)
    crumb = fbm(3, 2, seed)
    alb = mix(hexcol('#e7a547'), hexcol('#a35a1b'), np.clip(crumb * 0.8 + (1 - dome(m, 10, 1)) * 0.3, 0, 1))
    out = render(m, np.sqrt(np.clip(1 - (py / w) ** 2, 0, 1)) * m * 0.9 + crumb * 0.3, alb, spec=0.2, shin=16, bump=10, wrap=0.3, shadow=0.45)
    # Käse quillt an einem Ende heraus
    ooze = fill(organic(w * 0.55, w * 0.5, seed + 2, 0.15, cx=C + math.cos(rot) * L * 0.95, cy=C + math.sin(rot) * L * 0.95))
    return over(out, render(ooze, dome(ooze, 6, 0.5), mix(hexcol('#fff6dc'), hexcol('#f1d99a'), fbm(6, 2, seed)), spec=0.7, shin=40, bump=6, shadow=0.2))


def dough_roll(seed):
    """Pizzabrötchen: runder, goldener Teigling mit Glanz"""
    r = np.random.default_rng(seed)
    rr = R0 * r.uniform(0.95, 1.02)
    m = fill(organic(rr, rr * r.uniform(0.9, 1.0), seed, 0.05, rot=r.uniform(0, TAU)))
    d = np.hypot(XX - C, YY - C) / rr
    # oben goldbraun gebacken, zum Rand hin heller (dort hat sich der Teig gedehnt)
    bake = np.clip((fbm(16, 2, seed) - 0.4) * 1.0 + (1 - d) * 0.9, 0, 1)
    alb = mix(hexcol('#f0cf92'), hexcol('#b8692a'), bake)
    h = np.sqrt(np.clip(1 - d**2, 0, 1)) * m * 1.0 + fbm(10, 2, seed + 1) * 0.05
    return render(m, h, alb, spec=0.45, shin=22, bump=22, wrap=0.3, ao=0.5, shadow=0.5)


def cinnamon_roll(seed):
    r = np.random.default_rng(seed)
    rr = R0 * r.uniform(0.95, 1.0)
    m = fill(organic(rr, rr * 0.95, seed, 0.04, rot=r.uniform(0, TAU)))
    d = np.hypot(XX - C, YY - C)
    ang = np.arctan2(YY - C, XX - C)
    # Spirale: Abstand zur archimedischen Linie
    turns = 3.2
    phase = (d / rr * turns - ang / TAU) % 1.0
    groove = np.exp(-((phase - 0.5) / 0.09) ** 2)
    alb = mix(hexcol('#e7b673'), hexcol('#a35e25'), np.clip(groove * 0.9 + fbm(12, 2, seed) * 0.3, 0, 1))
    h = np.sqrt(np.clip(1 - (d / rr) ** 2, 0, 1)) * m * 0.6 - groove * 0.25
    return render(m, h, alb, spec=0.45, shin=26, bump=10, wrap=0.35, shadow=0.45)


def garlic_slice(seed):
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    m = fill(organic(R0 * 0.8, R0 * 0.55, seed, 0.06, rot=rot))
    alb = mix(hexcol('#f7efd2'), hexcol('#e5cf95'), np.clip(fbm(8, 2, seed) * 0.6 + (1 - dome(m, 6, 1)) * 0.5, 0, 1))
    return render(m, dome(m, 8, 0.6) * 0.3, alb, spec=0.5, shin=40, bump=5, wrap=0.4, shadow=0.3)


def chili_ring(seed):
    return tp.ring_slice(seed, '#c3170d', '#e8432c', '#f5d690', 0.9)


def egg_slice(seed):
    """gekochtes Ei, in Scheiben"""
    r = np.random.default_rng(seed)
    rr = R0 * r.uniform(0.95, 1.0)
    m = fill(organic(rr, rr * 0.78, seed, 0.03, rot=r.uniform(0, TAU)))
    d = np.hypot(XX - C, YY - C) / rr
    yolk = np.clip((0.5 - d) / 0.05, 0, 1)
    alb = mix(hexcol('#fbfaf3'), hexcol('#e9e4d4'), np.clip(d * 0.5, 0, 1))
    alb = alb * (1 - yolk[..., None]) + mix(hexcol('#f5c542'), hexcol('#e6a51e'), fbm(6, 2, seed)) * yolk[..., None]
    return render(m, dome(m, 8, 0.6) * 0.4 + yolk * 0.05, alb, spec=0.5, shin=40, bump=5, wrap=0.4, shadow=0.35)


def cheese_strip(seed):
    m, t, across = _band(seed, R0 * 0.9, R0 * 0.12, np.random.default_rng(seed).uniform(-0.3, 0.3))
    alb = mix(hexcol('#f8dc84'), hexcol('#eabf4f'), fbm(8, 2, seed) * 0.7)
    return render(m, np.sqrt(np.clip(1 - across**2, 0, 1)) * 0.4, alb, spec=0.4, shin=30, bump=5, wrap=0.4, shadow=0.3)


def penne(seed):
    """Penne rigate: Röhre mit schrägen Enden und Rillen"""
    r = np.random.default_rng(seed)
    rot = r.uniform(0, TAU)
    px, py = _rot(rot)
    L, w = R0 * 1.0, R0 * 0.3
    sk = 0.55
    m = ((np.abs(px + py * sk) < L) & (np.abs(py) < w)).astype(np.float32)
    m = np.clip((smooth(m, 0.7) - 0.5) * 3 + 0.5, 0, 1)
    ridges = np.clip(np.cos(py / w * 7 * math.pi) * 0.5 + 0.5, 0, 1)
    across = np.clip(py / w, -1, 1)
    alb = mix(hexcol('#f6d98f'), hexcol('#dcae5a'), np.clip(ridges * 0.4 + fbm(8, 2, seed) * 0.3, 0, 1))
    end = np.clip((np.abs(px + py * sk) - L * 0.9) / (L * 0.1), 0, 1)
    alb = alb * (1 - end[..., None] * 0.25)
    h = np.sqrt(np.clip(1 - across**2, 0, 1)) * m * 0.9 + ridges * 0.06
    return render(m, h, alb, spec=0.45, shin=30, bump=8, wrap=0.4, shadow=0.4)
