"""Quellfotos der Gerichte-Bilder laden (frei lizenziert, siehe sources.json)."""
import json
import os
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'source')
UA = 'PizzarellaSiteBuilder/1.0 (dish images)'


def main():
    os.makedirs(OUT, exist_ok=True)
    src = json.load(open(os.path.join(HERE, 'sources.json')))
    for key, s in src.items():
        path = os.path.join(OUT, f'{key}.jpg')
        if os.path.exists(path):
            continue
        for t in range(5):
            try:
                req = urllib.request.Request(s['download'], headers={'User-Agent': UA})
                open(path, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
                break
            except Exception as e:  # Wikimedia drosselt: kurz warten
                print(key, e)
                time.sleep(20 * (t + 1))
        print(key, s['license'])
        time.sleep(3 if 'wikimedia' in s['download'] else 0.5)


if __name__ == '__main__':
    main()
