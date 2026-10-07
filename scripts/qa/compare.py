"""Pixelvergleich zweier Screenshot-Ordner: python3 scripts/qa/compare.py <vorher> <nachher>"""
import os
import sys

from PIL import Image, ImageChops

a, b = sys.argv[1], sys.argv[2]
bad = 0
for f in sorted(os.listdir(a)):
    pb = os.path.join(b, f)
    if not os.path.exists(pb):
        print('FEHLT', f)
        bad += 1
        continue
    x, y = Image.open(os.path.join(a, f)).convert('RGB'), Image.open(pb).convert('RGB')
    if x.size != y.size:
        print('GRÖSSE', f, x.size, y.size)
        bad += 1
        continue
    diff = ImageChops.difference(x, y).convert('L')
    px = sum(1 for v in diff.getdata() if v > 24)
    if px:
        print('ANDERS', f, diff.getbbox(), f'{px} px')
        bad += 1
print('identisch' if not bad else f'{bad} Abweichungen')
