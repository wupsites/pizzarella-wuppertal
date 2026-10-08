"""
Gerichte-Bilder für die Speisekarte: jede Ebene einzeln als WebP.

    python3 scripts/dish-art/build.py            # alle Ebenen
    python3 scripts/dish-art/build.py pocket-*   # nur passende (fnmatch)

Ergebnis: public/dishes/<name>.webp (256×256, Alpha). Welche Ebenen ein
Gericht hat und wie sie beschriftet sind: src/data/dish-art.json.
Voraussetzung: pip install opencv-contrib-python-headless numpy
"""
import fnmatch
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from base import ROOT, save  # noqa: E402
from dishes import components  # noqa: E402

OUT = os.path.join(ROOT, 'public/dishes')


def main(patterns):
    os.makedirs(OUT, exist_ok=True)
    reg = components()
    names = [n for n in reg if not patterns or any(fnmatch.fnmatch(n, p) for p in patterns)]
    t0 = time.time()
    total = 0
    for n in names:
        path = os.path.join(OUT, f'{n}.webp')
        save(path, reg[n]())
        total += os.path.getsize(path)
    print(f'→ public/dishes: {len(names)} Ebenen, {total // 1024} KB, {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main(sys.argv[1:])
