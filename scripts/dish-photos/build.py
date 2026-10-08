"""
Gerichte-Bilder der Speisekarte aus echten, frei lizenzierten Fotos.

    python3 scripts/dish-photos/fetch.py      # Quellfotos laden (einmalig, siehe sources.json)
    python3 scripts/dish-photos/build.py      # alle Gerichte
    python3 scripts/dish-photos/build.py doenertasche ketchup

Jedes Gericht besteht aus Ebenen (Gefäß, Beilage, Fleisch, Sauce …), die
sich auf der Speisekarte beim Überfahren auffächern. Ergebnis:
public/dishes/<name>.webp und die Zuordnung in src/data/dish-art.json
(Pizzen haben dort keinen Eintrag – sie entstehen aus den Pizza-Ebenen).
Beschriftet wird nur, was in der Beschreibung der Karte steht.
"""
import hashlib
import json
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dishes as D  # noqa: E402
from photolib import ROOT, save  # noqa: E402
from base import OUTPX  # noqa: E402

OUT = os.path.join(ROOT, 'public/dishes')
ART = os.path.join(ROOT, 'src/data/dish-art.json')

T = 'Hähnchen-Kebab'
TASCHE = {
    'doenertasche': [('tasche-brot', 'Fladenbrot'), ('tasche-fuellung', f'{T} · Salat · Sauce'), ('tasche-deckel', '')],
    'doenertasche-mit-gegrilltem-gemuese': [('tasche-brot', 'Fladenbrot'), ('tasche-gemuese', 'Gegrilltes Gemüse'), ('tasche-fuellung', f'{T} · Salat · Sauce'), ('tasche-deckel', '')],
    'doenertasche-mit-pommes': [('tasche-brot', 'Fladenbrot'), ('tasche-pommes', 'Pommes'), ('tasche-fuellung', f'{T} · Salat · Sauce'), ('tasche-deckel', '')],
    'chilicheese-doenertasche': [('tasche-brot', 'Fladenbrot'), ('tasche-pommes', 'Pommes'), ('tasche-fuellung', f'{T} · Salat · Sauce'), ('tasche-jalapenos', 'Jalapeños'), ('tasche-deckel', '')],
    'sucuk-tasche': [('tasche-brot', 'Fladenbrot'), ('tasche-pommes', 'Pommes'), ('tasche-sucuk', 'Sucuk'), ('tasche-salat', 'Salat · Sauce'), ('tasche-deckel', '')],
    'gemuesetasche': [('tasche-brot', 'Fladenbrot'), ('tasche-gemuese', 'Zucchini · Auberginen · Paprika'), ('tasche-salat', 'Salat · Sauce'), ('tasche-deckel', '')],
    'pommes-tasche': [('tasche-brot', 'Fladenbrot'), ('tasche-pommes', 'Pommes'), ('tasche-salat', 'Salat · Sauce'), ('tasche-deckel', '')],
    'falafeltasche': [('tasche-brot', 'Fladenbrot'), ('tasche-falafel', 'Falafel'), ('tasche-salat', 'Salat · Sauce'), ('tasche-deckel', '')],
    'gemuese-falafeltasche': [('tasche-brot', 'Fladenbrot'), ('tasche-gemuese', 'Gegrilltes Gemüse'), ('tasche-falafel', 'Falafel'), ('tasche-salat', 'Salat · Sauce'), ('tasche-deckel', '')],
}
FLAT = {
    'doener-box': [('box', ''), ('box-pommes', 'Pommes'), ('box-fleisch', T), ('box-sauce', 'Sauce')],
    'doenerteller': [('teller', ''), ('teller-beilage', 'Pommes oder Reis'), ('teller-salat', 'Salat'), ('teller-fleisch', T), ('teller-sauce', 'Sauce')],
    'doener-dueruem': [('duerum-teller', ''), ('duerum-wrap', f'Dürümwrap mit {T}')],
    'lahmacun-doener': [('lahm-teller', ''), ('lahm-boden', 'Lahmacun'), ('lahm-fleisch', T), ('lahm-salat', 'Salat'), ('lahm-sauce', 'Sauce')],
    'lahmacun': [('lahm-teller', ''), ('lahm-boden', 'Lahmacun'), ('lahm-salat', 'Salat'), ('lahm-sauce', 'Sauce')],
    'falafel-dueruem': [('duerum-teller', ''), ('duerum-wrap', 'Dürümwrap'), ('duerum-falafel', 'Falafel')],
    'falafelteller': [('teller', ''), ('teller-beilage', 'Pommes'), ('teller-salat', 'Salat'), ('teller-falafel', 'Falafel'), ('teller-sauce', 'Sauce')],
    'falafel-box': [('box', ''), ('box-pommes', 'Pommes'), ('box-falafel', 'Falafel'), ('box-sauce', 'Sauce')],
    'spaghetti-napoli': [('pasta-teller', ''), ('pasta-nudeln', 'Spaghetti · pikante Tomatensauce')],
    'spaghetti-aglio-olio': [('pasta-teller', ''), ('pasta-nudeln', 'Spaghetti'), ('pasta-belag', 'Knoblauch · Peperoni')],
    'spaghetti-bolognese': [('pasta-teller', ''), ('pasta-nudeln', 'Spaghetti'), ('pasta-sauce', 'Tomaten-Hackfleischsauce')],
    'spaghetti-carbonara': [('pasta-teller', ''), ('pasta-nudeln', 'Spaghetti · Putenschinken · Ei · Käse-Sahnesauce')],
    'penne-arrabiata': [('pasta-teller', ''), ('pasta-nudeln', 'Penne · scharfe Tomatensauce'), ('pasta-belag', 'Chilischoten')],
    'penne-quattro-formaggi': [('pasta-teller', ''), ('pasta-nudeln', 'Penne · Sahnesauce'), ('pasta-belag', 'Vier Käsesorten')],
    'penne-ela': [('pasta-teller', ''), ('pasta-nudeln', 'Penne · Sauce Hollandaise'), ('pasta-belag', 'Hähnchenbrustfilet · Broccoli')],
    'penne-fresh': [('pasta-teller', ''), ('pasta-nudeln', 'Penne · Crème-fraîche-Sahnesauce'), ('pasta-belag', 'Hähnchen · Champignons · Zwiebeln · Spinat')],
    'tagliatelle-mediteran': [('pasta-teller', ''), ('pasta-nudeln', 'Tagliatelle · Sahnesauce'), ('pasta-belag', 'Hähnchenbrustfilet · Spinat')],
    'tagliatelle-orient': [('pasta-teller', ''), ('pasta-nudeln', 'Tagliatelle · Tomaten-Sahnesauce'), ('pasta-belag', T)],
    'tagliatelle-indiano': [('pasta-teller', ''), ('pasta-nudeln', 'Tagliatelle · Curry-Sahnesauce'), ('pasta-belag', 'Hähnchenbrustfilet')],
    'tagliatelle-gamberetti': [('pasta-teller', ''), ('pasta-nudeln', 'Tagliatelle · Rosésauce'), ('pasta-belag', 'Garnelen')],
    'pizzabroetchen': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen')],
    'pizzabroetchen-mit-kaese': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen'), ('pb-kaese', 'Käse')],
    'pizzabroetchen-mit-fuellung-nach-wahl': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen · Füllung nach Wahl'), ('pb-kaese', 'Käse')],
    'pizzabroetchen-speciale': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen'), ('pb-haehnchen', 'Hähnchenbruststreifen'), ('pb-kaese', 'Käse'), ('pb-hollandaise', 'Sauce Hollandaise')],
    'pizzabroetchen-doener': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen'), ('pb-fleisch', T), ('pb-kaese', 'Käse')],
    'pizzabroetchen-doener-spezial': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen'), ('pb-fleisch', T), ('pb-kaese', 'Käse'), ('pb-hollandaise', 'Sauce Hollandaise')],
    'pizzabroetchen-sucuk': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen'), ('pb-sucuk', 'Sucuk'), ('pb-kaese', 'Käse')],
    'pizzabroetchen-nutella': [('pb-teller', ''), ('pb-broetchen', 'Pizzabrötchen'), ('pb-nutella', 'Nutella')],
    'pommes': [('snack-teller', ''), ('snack-pommes', 'Pommes')],
    'chilicheese-pommes': [('snack-teller', ''), ('snack-pommes', 'Pommes'), ('snack-chilicheese', 'Chilicheese-Sauce')],
    'chicken-nuggets': [('snack-teller', ''), ('snack-nuggets', '6 Chicken Nuggets')],
    'kroketten': [('snack-teller', ''), ('snack-kroketten', 'Kroketten')],
    'onion-rings': [('snack-teller', ''), ('snack-onionrings', 'Onion Rings')],
    'mozzarella-sticks': [('snack-teller', ''), ('snack-mozzarella', '6 Mozzarella Sticks')],
    'chili-cheese-nuggets': [('snack-teller', ''), ('snack-ccnuggets', '6 Chili Cheese Nuggets')],
    'suesskartoffeln': [('snack-teller', ''), ('snack-suesskartoffeln', 'Süßkartoffel-Pommes')],
    'tiramisu': [('dessert-teller', ''), ('dessert-tiramisu', 'Mascarpone · Kaffee')],
    'pizza-nutella': [('nutella-boden', 'Pizzateig'), ('nutella-creme', 'Nutella')],
    'zimtschnecken': [('dessert-teller', ''), ('dessert-zimt', 'Zimtschnecken')],
}
SALAD_EXTRA = {
    'insalata-mista': None,
    'insalata-tonno': 'Thunfisch · Mais',
    'insalata-rucola': 'Rucola',
    'insalata-fantasia': 'Schafskäse',
    'insalata-capricciosa': 'Putenschinken · Thunfisch · Ei · Peperoni · Käse · Mais',
    'insalata-mediteran': 'Hähnchenbrustfilet',
    'insalata-gamberetti': 'Garnelen · Knoblauch',
}
for k, extra in SALAD_EXTRA.items():
    FLAT[k] = [('salat-schuessel', ''), ('salat-blaetter', 'Gemischter Salat'), ('salat-gemuese', 'Tomaten · Gurken · Paprika'), ('salat-oliven', 'Oliven')] + ([('salat-extra', extra)] if extra else [])
DIP_NAMES = {
    'ketchup': 'Ketchup', 'mayonnaise': 'Mayonnaise', 'joppiesauce': 'Joppiesauce mit Zwiebeln', 'bbq-sauce': 'BBQ-Sauce', 'suess-sauer-sauce': 'Süß-Sauer-Sauce',
    'curry-sauce': 'Curry-Sauce', 'knoblauchsauce': 'Knoblauchsauce', 'cocktail-sauce': 'Cocktail-Sauce', 'salsa-sauce': 'Salsa-Sauce', 'chilisauce': 'Chilisauce',
    'chilicheese-sauce': 'Chilicheese-Sauce', 'andalouse': 'Andalouse mit Paprika', 'samurai': 'Samurai', 'kraeuterbutter': 'Kräuterbutter', 'chili-aioli': 'Chili-Aioli',
}
for k, n in DIP_NAMES.items():
    FLAT[k] = [('dip-becher', ''), ('dip-sauce', n)]
DRINK_NAMES = {
    'cola': 'Cola', 'cola-zero': 'Cola Zero', 'fanta': 'Fanta', 'sprite': 'Sprite', 'mezzo-mix': 'Mezzo Mix', 'wasser': 'Wasser',
    'uludag-gazoz': 'Uludağ Gazoz', 'ayran': 'Ayran', 'eistee': 'Eistee Zitrone oder Pfirsich', 'red-bull': 'Red Bull',
}
UP = dict(TASCHE)
# Getränke: vorerst ohne Bild (kommen später als Produktfotos der Flaschen)
LAYOUT = {**{k: (v, False) for k, v in FLAT.items()}, **{k: (v, True) for k, v in UP.items()}}


def encode(layer):
    small = cv2.resize(layer, (OUTPX, OUTPX), interpolation=cv2.INTER_AREA)
    return hashlib.sha1(np.round(small * 255).astype(np.uint8).tobytes()).hexdigest()


def main(only):
    os.makedirs(OUT, exist_ok=True)
    art = json.load(open(ART)) if os.path.exists(ART) else {}
    seen = {}  # Inhalt → Dateiname (gleiche Teller, Gläser … nur einmal speichern)
    t0 = time.time()
    for pid, (layers, up) in LAYOUT.items():
        if only and pid not in only:
            continue
        res = D.ALL[pid]()
        entry = []
        for key, label in layers:
            if key not in res:
                if key == 'drink-perlen':
                    continue
                if key == 'teller-beilage':
                    lay = res['teller-pommes'] if 'teller-reis' not in res else D.over(res['teller-pommes'], res['teller-reis'])
                else:
                    raise KeyError(f'{pid}: Ebene {key} fehlt ({list(res)})')
            else:
                lay = res[key]
            h = encode(lay)
            name = seen.get(h)
            if not name:
                name = f'{pid}--{key}' if key not in ('pasta-teller', 'snack-teller', 'pb-teller', 'dessert-teller', 'salat-schuessel', 'dip-becher', 'drink-glas', 'box', 'teller', 'duerum-teller', 'lahm-teller') else key
                if name in seen.values():
                    name = f'{pid}--{key}'
                save(os.path.join(OUT, f'{name}.webp'), lay)
                seen[h] = name
            entry.append([name, label])
        art[pid] = {'up': True, 'layers': entry} if up else entry
        print(f'{pid}: {len(entry)} Ebenen ({time.time() - t0:.0f} s)', flush=True)
    art['$comment'] = ('Bild-Ebenen je Gericht (von unten nach oben): [Datei in public/dishes/ ohne .webp, Beschriftung]. '
                       'Beschriftet wird nur, was in der Beschreibung der Karte steht; leere Beschriftung = Gefäß/Unterlage. '
                       '{"up": true, ...} = Seitenansicht, Ebenen gehen senkrecht auseinander. Erzeugt von scripts/dish-photos/build.py '
                       '(Party-Pizza: scripts/dish-art/build.py).')
    for k in DRINK_NAMES:
        art.pop(k, None)
    json.dump(dict(sorted(art.items(), key=lambda kv: (kv[0] != '$comment', kv[0]))), open(ART, 'w'), ensure_ascii=False, indent=1)
    # Dateien, die nirgends mehr gebraucht werden, entfernen
    used = set()
    for v in art.values():
        if isinstance(v, str):
            continue
        for f, _ in (v['layers'] if isinstance(v, dict) else v):
            used.add(f)
    if not only:
        for f in os.listdir(OUT):
            if f.endswith('.webp') and f[:-5] not in used:
                os.remove(os.path.join(OUT, f))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'→ public/dishes: {len(os.listdir(OUT))} Dateien, {total // 1024} KB, {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
