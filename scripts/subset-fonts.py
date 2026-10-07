"""
Erzeugt die selbst gehosteten, verkleinerten Webfonts in public/fonts/.

Quelle: @fontsource-variable/fraunces und @fontsource-variable/instrument-sans
(beide SIL Open Font License 1.1). Aufruf aus dem Projektordner:

    pip install fonttools brotli
    python3 scripts/subset-fonts.py

Fraunces wird auf die Achsen begrenzt, die das Design nutzt (SOFT=100, WONK=0,
opsz 96, wght 600–900; Italic wght 600–800). Instrument Sans: Normalbreite mit wght 400–700, dazu ein statischer
Schmalschnitt (wdth 75, wght 600) für Labels im Stil einer Imbiss-Menütafel.
Zeichensatz: Basis-Latein + Latin-1 (Umlaute, ß, Ø, ·) + typografische Zeichen.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "public" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + [0x152, 0x153, 0x2009, 0x200A, 0x2011, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A,
       0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x202F, 0x2039, 0x203A, 0x20AC, 0x2192,
       0x2212, 0x2190, 0x2191, 0x2193, 0x2715, 0x2713]
)

JOBS = [
    ("fraunces/files/fraunces-latin-full-normal.woff2", "fraunces-display.woff2",
     {"SOFT": 100, "WONK": 0, "opsz": 96, "wght": (600, 900)}),
    ("fraunces/files/fraunces-latin-full-italic.woff2", "fraunces-display-italic.woff2",
     {"SOFT": 100, "WONK": 1, "opsz": 96, "wght": (600, 800)}),
    ("instrument-sans/files/instrument-sans-latin-standard-normal.woff2", "instrument-sans.woff2",
     {"wdth": 100, "wght": (400, 700)}),
    ("instrument-sans/files/instrument-sans-latin-standard-normal.woff2", "instrument-sans-condensed.woff2",
     {"wdth": 75, "wght": 600}),
]

for src, dst, limits in JOBS:
    font = TTFont(SRC / src)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum", "lnum", "case", "frac"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    font = instancer.instantiateVariableFont(font, limits)
    font.flavor = "woff2"
    target = OUT / dst
    font.save(target)
    print(f"{dst}: {target.stat().st_size // 1024} KB")
