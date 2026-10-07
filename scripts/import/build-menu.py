"""
Einmaliger Import: baut src/data/menu/*.json aus den gesicherten Quellen
(docs/quelle-alte-website/). Primärquelle für Produkte & Preise ist die eigene
Website (WPPizza); Auswahl-Optionen (Größen-Extras, Saucen, Dressings) stammen
aus dem Lieferando-Shop des Betriebs, weil sie im eigenen Shop nur bei
geöffnetem Laden abrufbar sind.

    python3 scripts/import/build-menu.py

Danach werden die JSON-Dateien redaktionell gepflegt – das Skript ist nur
für den Erst-Import da und überschreibt bestehende Dateien.
"""
import json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'docs' / 'quelle-alte-website'
OUT = ROOT / 'src' / 'data' / 'menu'
own = json.load(open(SRC / 'eigene-website' / 'speisekarte.json'))
lief = json.load(open(SRC / 'lieferando-shop' / 'speisekarte.json'))
lief_items = {re.sub(r'\s*\((vegetarisch|scharf)\)', '', p['name']).strip().lower(): p for c in lief for p in c['products']}

def slug(s):
    s = s.lower().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

FIX = [('RinderSalami', 'Rindersalami'), ('SchafsKäse', 'Schafskäse'), ('Hollaindaise', 'Hollandaise'), ('BBQ- Chicken', 'BBQ-Chicken'),
       ('MezoMix', 'Mezzo Mix'), ('RedBull', 'Red Bull'), ('Chilicheese Dönertasche', 'Chilicheese-Dönertasche'), ('Hähnchen Kebab', 'Hähnchen-Kebab'),
       ('Uludag', 'Uludağ')]

def split_codes(text):
    codes = []
    def grab(m):
        codes.extend([c.strip() for c in m.group(1).split(',') if c.strip()])
        return ''
    clean = re.sub(r'⁽([^⁾]*)⁾', grab, text)
    for a, b in FIX: clean = clean.replace(a, b)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean, codes

def nice_list(desc):
    # „mit A, B, C“ → „mit A, B und C“ (nur wenn noch kein „und“ im Satz)
    if ' und ' in desc or ',' not in desc or desc.startswith('wie '): return desc
    head, _, last = desc.rpartition(', ')
    return f'{head} und {last}'

def parse_title(t):
    m = re.match(r'^(\d+)\.\s*(.*)$', t)
    return (m.group(1), m.group(2)) if m else (None, t)

def euro(p): return float(p.replace('€', '').replace('.', '').replace(',', '.').strip())

CAT = {
    '_pizza': ('01-pizza', 'pizza', 'Pizza', 'pizza', 'Klein mit Ø 25 cm, groß mit Ø 30 cm. Extra-Zutaten nach Wunsch.'),
    '_party_pizza': ('02-party-pizza', 'party-pizza', 'Party-Pizza', 'party', '60 × 40 cm – für volle Tische.'),
    '_doener': ('03-doener', 'doener', 'Döner', 'doener', 'Mit Hähnchen-Kebab. Im Fladenbrot, als Dürüm, Box oder Teller.'),
    '_falafel': ('05-falafel', 'falafel', 'Falafel', 'falafel', 'Kichererbsen-Bällchen. Alles vegetarisch.'),
    '_pasta': ('06-pasta', 'pasta', 'Pasta', 'pasta', 'Spaghetti, Penne und Tagliatelle.'),
    '_panini_pizzabroetchen': ('07-pizzabroetchen', 'pizzabroetchen', 'Pizzabrötchen', 'rolls', 'Gefüllt oder pur – mit Sauce dazu.'),
    '_insalatone': ('08-salate', 'salate', 'Salate', 'salad', 'Alle auf Basis der Insalata Mista, mit Dressing nach Wahl.'),
    '_snacks': ('09-snacks', 'snacks', 'Snacks', 'fries', 'Für nebenbei oder für alle.'),
    '_dessert': ('10-dessert', 'dessert', 'Desserts', 'dessert', 'Zum Schluss was Süßes.'),
    '_saucen': ('11-saucen', 'saucen', 'Saucen', 'dip', 'Zum Dippen, Tunken, Drüberkippen.'),
    '_drinks': ('12-getraenke', 'getraenke', 'Getränke', 'drink', 'Preise inklusive Pfand.'),
}
LAHMACUN = {'Lahmacun', 'Lahmacun Döner'}
VEG = {'Gemüsetasche', 'Pommes-Tasche', 'Falafeltasche', 'Gemüse-Falafeltasche', 'Falafel Dürüm', 'Falafelteller', 'Falafel Box'}
DEPOSIT = {'1,0l': 0.15, '0,33l': 0.25, '0,5l': 0.25, '0,25l': 0.25}
NO_DEPOSIT = {'Ayran', 'Durstlöscher Eistee (Zitrone/Pfirsich)'}
VOL = {'1,0l': 1.0, '0,33l': 0.33, '0,5l': 0.5, '0,25l': 0.25}

categories = {}
def cat(key):
    f, cid, name, icon, intro = CAT[key]
    if cid not in categories:
        categories[cid] = {'file': f, 'id': cid, 'name': name, 'icon': icon, 'intro': intro, 'source': 'own-site', 'products': []}
    return categories[cid]

for key, items in own.items():
    for it in items:
        nr, title = parse_title(it['title'])
        name, tcodes = split_codes(title)
        desc, dcodes = split_codes(it['desc'])
        codes = list(dict.fromkeys(tcodes + dcodes))
        target = cat(key)
        if key == '_doener' and name in LAHMACUN:
            if 'lahmacun' not in categories:
                categories['lahmacun'] = {'file': '04-lahmacun', 'id': 'lahmacun', 'name': 'Lahmacun', 'icon': 'lahmacun', 'intro': 'Der dünne Fladen – pur mit Salat oder mit Döner gefüllt.', 'source': 'own-site', 'products': []}
            target = categories['lahmacun']
        p = {'id': slug(name), 'nr': nr, 'name': name}
        if target['id'] == 'pizza' and name.startswith('Pizza '): p['listName'] = name[6:]
        if desc:
            desc = desc[0].lower() + desc[1:] if desc.startswith(('Mit ', 'Sauce Hollandaise')) and not desc.startswith('Sauce') else desc
            if desc.startswith('Sauce Hollandaise'): desc = 'mit ' + desc
            p['description'] = nice_list(desc)
        li = lief_items.get(name.lower()) or lief_items.get(name.lower().replace('-', ' '))
        if not desc and li and li['desc'] and key in ('_snacks', '_saucen', '_dessert'):
            p['description'] = li['desc']
            p['descriptionSource'] = 'lieferando-site'
        allergens = [c for c in codes if not c.isdigit()]
        additives = [c for c in codes if c.isdigit()]
        if allergens: p['allergens'] = allergens
        if additives: p['additives'] = additives
        prices = [(euro(pr), sz) for pr, sz in it['prices']]
        if target['id'] == 'pizza':
            m = {('Klein (∅25cm)'): 'klein', 'Groß (∅30cm)': 'gross'}
            p['prices'] = {m[sz]: pr for pr, sz in prices}
        elif target['id'] == 'getraenke':
            vs = []
            for pr, sz in prices:
                v = {'id': slug(sz), 'label': sz.replace('l', ' l').replace('  ', ' '), 'price': pr, 'volume': VOL.get(sz)}
                if name not in NO_DEPOSIT and sz in DEPOSIT: v['deposit'] = DEPOSIT[sz]
                vs.append(v)
            if len(vs) == 1:
                p['description'] = vs[0]['label']
            p['variants'] = vs
        elif target['id'] == 'party-pizza':
            p['variants'] = [{'id': '60x40', 'label': '60 × 40 cm', 'price': prices[0][0]}]
        else:
            p['price'] = prices[0][0]
        if name in VEG: p['tags'] = ['vegetarisch']
        if name == 'Penne Arrabiata': p['tags'] = ['scharf']
        p['confidence'] = 'high'
        target['products'].append(p)

json.dump(categories, open('/tmp/claude-0/-home-user-pizzarella-wuppertal/4818aa3a-2c3b-53b0-851a-316b19f7e70a/scratchpad/categories-draft.json', 'w'), ensure_ascii=False, indent=1)
for c in categories.values():
    print(c['file'], c['name'], len(c['products']))
    for p in c['products']:
        print('   ', p.get('nr'), p['id'], '|', p['name'], '|', p.get('description', ''), '|', p.get('prices') or p.get('price') or p.get('variants'), p.get('allergens', ''), p.get('additives', ''), p.get('tags', ''))

# ---------------------------------------------------------------------------
# Optionen aus dem Lieferando-Shop → src/data/options.json
# ---------------------------------------------------------------------------
lopts = json.load(open(SRC / 'lieferando-shop' / 'optionen.json'))
def zutaten(entries):
    return {slug(n): (n, p) for n, p in entries}
marg = lopts['Pizza Margherita']
klein = zutaten(marg[0]['gruppen'][0]['optionen'])
gross = zutaten(marg[1]['gruppen'][0]['optionen'])
def label(n):
    n = n.replace('mit ', '', 1) if n.startswith('mit ') else n
    n = n.replace('Frutti Di Mare', 'Frutti di Mare').replace('Broccoli', 'Brokkoli')
    return n[0].upper() + n[1:]
order = [k for k in klein]  # Reihenfolge wie im Shop (Käse zuerst)
pizza_choices = [{'id': k, 'label': label(klein[k][0]), 'prices': {'klein': klein[k][1], 'gross': gross[k][1]}} for k in order if k in gross]
pasta_list = lopts['Penne Ela'][0]['gruppen'][0]['optionen']
pasta_choices = [{'id': slug(n), 'label': label(n), 'price': p} for n, p in pasta_list]
pb = lopts['Pizzabrötchen nach Wahl'][0]['gruppen'][0]['optionen']
pb_choices = [{'id': slug(n), 'label': label(n), 'price': p} for n, p in pb]
options = {
  '$comment': 'Wiederverwendbare Auswahl-Gruppen. Quelle der Aufpreise: Lieferando-Shop des Betriebs (07.10.2026) – im eigenen Shop sind Extras nur bei geöffnetem Laden abrufbar. Vor Go-Live mit den eigenen Extra-Preisen abgleichen (docs/GO-LIVE.md).',
  'pizza-zutaten': {'label': 'Extra-Zutaten', 'type': 'multi', 'required': False, 'max': 10, 'status': 'unconfirmed', 'choices': pizza_choices},
  'pasta-zutaten': {'label': 'Extra-Zutaten', 'type': 'multi', 'required': False, 'max': 10, 'status': 'unconfirmed', 'choices': pasta_choices},
  'pasta-ueberbacken': {'label': 'Überbacken', 'type': 'multi', 'required': False, 'status': 'unconfirmed', 'choices': [{'id': 'mit-kaese-ueberbacken', 'label': 'Mit Käse überbacken', 'price': 3.0}]},
  'salat-dressing': {'label': 'Dressing', 'type': 'single', 'required': True, 'status': 'unconfirmed', 'choices': [{'id': 'honig-senf', 'label': 'Honig-Senf', 'price': 0}, {'id': 'joghurt', 'label': 'Joghurt-Dressing', 'price': 0}, {'id': 'balsamico', 'label': 'Balsamico-Essig', 'price': 0}]},
  'salat-brot': {'label': 'Dazu', 'type': 'multi', 'required': False, 'status': 'unconfirmed', 'choices': [{'id': '6-pizzabroetchen', 'label': '6 Pizzabrötchen', 'price': 2.0}]},
  'pizzabroetchen-sauce': {'label': 'Sauce dazu', 'type': 'single', 'required': True, 'status': 'unconfirmed', 'choices': [{'id': 'chili-aioli', 'label': 'Chili-Aioli', 'price': 0}, {'id': 'kraeuterbutter', 'label': 'Kräuterbutter', 'price': 0}]},
  'pizzabroetchen-fuellung': {'label': 'Füllung', 'type': 'multi', 'required': True, 'max': 6, 'status': 'unconfirmed', 'choices': pb_choices},
  'doener-sauce': {'label': 'Sauce', 'type': 'multi', 'required': False, 'max': 3, 'status': 'unconfirmed', 'choices': [{'id': 'knoblauch', 'label': 'Knoblauch', 'price': 0}, {'id': 'scharf', 'label': 'Scharfe Sauce', 'price': 0}, {'id': 'cocktail', 'label': 'Cocktail', 'price': 0}]},
  'teller-beilage': {'label': 'Beilage', 'type': 'single', 'required': True, 'status': 'confirmed', 'choices': [{'id': 'pommes', 'label': 'Pommes', 'price': 0}, {'id': 'reis', 'label': 'Reis', 'price': 0}]},
  'eistee-sorte': {'label': 'Sorte', 'type': 'single', 'required': True, 'status': 'confirmed', 'choices': [{'id': 'zitrone', 'label': 'Zitrone', 'price': 0}, {'id': 'pfirsich', 'label': 'Pfirsich', 'price': 0}]},
}
json.dump(options, open(ROOT / 'src' / 'data' / 'options.json', 'w'), ensure_ascii=False, indent=2)

# ---------------------------------------------------------------------------
# Feinschliff & Schreiben der Kategorien
# ---------------------------------------------------------------------------
EDIT = {
  'sucuk-tasche': {'description': 'mit Sucuk, Pommes, Salat und Sauce'},
  'doenertasche-mit-gegrilltem-gemuese': {'description': 'wie Dönertasche, zusätzlich mit gegrilltem Gemüse'},
  'doenertasche-mit-pommes': {'description': 'wie Dönertasche, zusätzlich mit Pommes'},
  'chilicheese-doenertasche': {'description': 'wie Dönertasche, zusätzlich mit Pommes und Jalapeños'},
  'party-pizza': {'name': 'Party-Pizza nach Wahl', 'id': 'party-pizza-nach-wahl', 'description': 'mit einem Belag nach Wahl', 'noteRequired': True, 'notePrompt': 'Welcher Belag?'},
  'durstloescher-eistee-zitrone-pfirsich': {'name': 'Durstlöscher Eistee', 'id': 'eistee', 'description': '0,5 l · Zitrone oder Pfirsich', 'optionSets': ['eistee-sorte']},
  'chili-aioli': {'description': 'Scharfe Knoblauch-Mayonnaise', 'descriptionSource': 'lieferando-site'},
  'pizzabroetchen-mit-fuellung-nach-wahl': {'description': 'mit Käse und Füllung nach Wahl', 'optionSets': ['pizzabroetchen-fuellung', 'pizzabroetchen-sauce']},
  'doenerteller': {'optionSets': ['teller-beilage', 'doener-sauce']},
  'chicken-nuggets-6-stueck': {'id': 'chicken-nuggets'},
  'onion-rings-6-stueck': {'id': 'onion-rings'},
  'mozzarella-sticks-6-stueck': {'id': 'mozzarella-sticks'},
  'chili-cheese-nuggets-6-stueck': {'id': 'chili-cheese-nuggets'},
  'spaghetti-aglio-olio-e-peperoncino': {'id': 'spaghetti-aglio-olio'},
}
CAT_OPTS = {'pizza': ['pizza-zutaten'], 'pasta': ['pasta-zutaten', 'pasta-ueberbacken'], 'salate': ['salat-dressing', 'salat-brot'],
            'pizzabroetchen': ['pizzabroetchen-sauce'], 'doener': ['doener-sauce'], 'lahmacun': ['doener-sauce']}
for f in OUT.glob('*.json'): f.unlink()
for c in categories.values():
    prods = []
    for p in c['products']:
        p.update(EDIT.get(p['id'], {}))
        prods.append(p)
    def key(p): return int(p['nr']) if p.get('nr') else 999
    prods.sort(key=key)
    for p in prods:
        if not p.get('nr'): p.pop('nr', None)
    data = {'id': c['id'], 'name': c['name'], 'icon': c['icon'], 'intro': c['intro'], 'source': c['source']}
    if c['id'] in CAT_OPTS: data['optionSets'] = CAT_OPTS[c['id']]
    if c['id'] == 'pizza':
        data['variants'] = [{'id': 'klein', 'label': 'Klein', 'detail': 'Ø 25 cm'}, {'id': 'gross', 'label': 'Groß', 'detail': 'Ø 30 cm'}]
    data['products'] = prods
    path = OUT / f"{c['file']}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('→', path.name, len(prods))
