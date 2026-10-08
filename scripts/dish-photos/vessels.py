"""Echte Gefäße (Teller, Box, Schüssel, Dip-Becher, Glas), leer geräumt."""
import functools

import numpy as np

import photolib as P
from photolib import Frame, cutout, ell, fill_plate, over, poly


def _clean_vessel(im, vmask, content, lmin=150, cmax=26, grow=15):
    hole = P.dilate(content, grow) * vmask
    ref = (P.vessel_pixels(im, lmin, cmax) * vmask * (1 - hole)) > 0.5
    return fill_plate(im, hole, ref)


def _layer(F, im, vmask, shadow=True):
    vm = P.soft(F.mask(vmask), 1.0)
    lay = P.layer(F.img(im), vm)
    return over(P.drop_shadow(vm), lay) if shadow else lay


@functools.lru_cache(None)
def box():
    """weiße Pappbox (fries-cheese), leer geräumt → (Ebene, Innenfläche auf der Arbeitsfläche)"""
    im = P.load('fries-cheese')
    outer = P.rrect(228, 62, 1985, 1805, 230, im.shape)
    inner = P.rrect(330, 175, 1880, 1700, 170, im.shape)
    content = P.clean((1 - P.vessel_pixels(im, 160, 28)) * outer, 3, 11, 300)
    clean_img = _clean_vessel(im, outer, P.fill_holes(content * inner) + content, 160, 28, 21)
    F = Frame.fit(228, 62, 1985, 1805, fill=0.9)
    return _layer(F, clean_img, outer), P.soft(F.mask(inner), 3)


@functools.lru_cache(None)
def bowl():
    """weiße Schüssel mit blauem Rand (salad-bowl) → (Ebene, Innenfläche)"""
    E = (768, 1295, 762, 741, 0)
    im = P.load('salad-bowl')
    v = ell(*E, im.shape)
    inner = ell(768, 1295, 640, 620, 0, im.shape)
    content = P.clean((1 - P.vessel_pixels(im, 150, 26)) * inner, 3, 15, 800)
    content = np.maximum(content, P.poly([(0, 1050), (300, 1000), (500, 1080), (300, 1200), (0, 1200)], im.shape) * v)  # Löffelstiel
    clean_img = _clean_vessel(im, v, P.fill_holes(content), 150, 26, 25)
    F = Frame.circle(*E, r_out=0.47)
    return _layer(F, clean_img, v), P.soft(F.mask(ell(768, 1300, 560, 540, 0, im.shape)), 4)


@functools.lru_cache(None)
def round_plate(key='fritters-dip'):
    if key == 'onion-rings':
        E = (900, 1068, 900, 951, 0)
        rough = [(88, 234), (1404, 234), (1404, 1570), (88, 1570)]
    else:  # fritters-dip
        E = (1031, 1002, 973, 870, 0)
        rough = [(150, 250), (1900, 250), (1900, 1700), (150, 1700)]
    im = P.load(key)
    v = ell(*E, im.shape)
    content = P.clean((1 - P.vessel_pixels(im, 150, 30)) * ell(E[0], E[1], E[2] * 0.93, E[3] * 0.93, 0, im.shape), 3, 21, 1500)
    clean_img = _clean_vessel(im, v, P.fill_holes(content), 150, 30, 25)
    F = Frame.circle(*E, r_out=0.47)
    return _layer(F, clean_img, v)


@functools.lru_cache(None)
def dip_cup():
    """Dip-Schälchen (onion-rings) → (Becher-Ebene leer, Sauce-Bild auf der Arbeitsfläche, Sauce-Maske)"""
    im = P.load('onion-rings')
    cup = ell(1068, 1214, 330, 325, 0, im.shape)
    sauce = P.clean((P.lab(im)[1] > 6).astype(np.float32) * ell(1068, 1214, 250, 245, 0, im.shape), 3, 15, 1000)
    sauce = P.fill_holes(sauce)
    clean_img = _clean_vessel(im, cup, sauce, 150, 30, 9)
    F = Frame.circle(1068, 1214, 330, 325, 0, r_out=0.44)
    return _layer(F, clean_img, cup), F.img(im), P.soft(F.mask(sauce), 1.5)


@functools.lru_cache(None)
def glass():
    """Trinkglas (juice-glass): Glas ohne Inhalt + Flüssigkeit getrennt (aufrecht)"""
    im = P.load('juice-glass')
    rough = [(100, 480), (230, 380), (640, 350), (1060, 380), (1190, 480), (1080, 1700), (1000, 1800), (640, 1830), (300, 1800), (220, 1700)]
    g = cutout(im, rough, inner=0.75, outer=1.06)
    L, A, B = P.lab(im)
    liquid = P.fill_holes(P.clean(((A > 8) & (B > 55)).astype(np.float32) * g, 3, 15, 2000))
    F = Frame.fit(80, 330, 1210, 1850, fill=0.9)
    gm = F.mask(g)
    lm = P.soft(F.mask(liquid), 1.0)
    gi = F.img(im)
    # Glas: nur Kanten und Glanz (hell vor dunklem Grund), innen fast durchsichtig
    Lg = P.lab(gi)[0] / 255
    alpha = np.clip((Lg - 0.32) * 1.6, 0, 0.85) * gm
    alpha = np.maximum(alpha, 0.1 * gm)
    alpha = alpha * (1 - 0.85 * lm)
    glass_l = np.zeros((P.S, P.S, 4), np.float32)
    col = np.clip(gi * 0.4 + 0.6, 0, 1)
    glass_l[..., :3] = col * alpha[..., None]
    glass_l[..., 3] = alpha
    return glass_l, gi, lm, P.soft(gm, 1.0)
