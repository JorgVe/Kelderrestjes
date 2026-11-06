#!/usr/bin/env python3
"""Zet een versie achter elk script van de pagina's, zodat een browser nooit een oud script bij een nieuwe pagina gebruikt.

GitHub Pages laat een browser een bestand 10 minuten bewaren. Wie vlak voor een uitrol de site opende, kreeg daardoor een oud
js/stock.js bij een nieuwe pagina ("canMix is not defined"). Met <script src="js/stock.js?v=1a2b3c4d"> is de naam van het script
anders zodra het script is veranderd, en hoort bij elke pagina precies de versie van de scripts waarmee zij is geschreven.

De versie (acht tekens) is een hash van de inhoud van alle bestanden in js/: verandert er iets in js/, dan krijgen alle scripttags
in alle pagina's een nieuwe versie; verandert er niets, dan blijft alles zoals het was. js/boot.js leest de versie uit zijn eigen
scripttag en zet hem ook achter de scripts die hij zelf laadt (stock.js, cards.js, voorraad.js).

Gebruik:
  python3 scripts/cache-bust.py          zet de versie in alle *.html in de hoofdmap
  python3 scripts/cache-bust.py --check  verandert niets; stopt met een foutmelding (exit 1) als een pagina een oude versie heeft

Draai dit na elke wijziging in js/ en vóór het committen. .githooks/pre-commit controleert het bij elke commit
(aanzetten: git config core.hooksPath .githooks). Alleen scripts uit js/ krijgen een versie; de scripts van Supabase en de
barcode-bibliotheek staan al met een vast versienummer in hun adres.
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TAG = re.compile(r'(<script src="js/[A-Za-z0-9_.-]+\.js)(?:\?v=[0-9a-f]+)?(")')


def version():
    h = hashlib.sha256()
    for f in sorted((ROOT / 'js').glob('*.js')):
        h.update(f.name.encode())
        h.update(b'\0')
        h.update(f.read_bytes())
        h.update(b'\0')
    return h.hexdigest()[:8]


def main():
    check = '--check' in sys.argv[1:]
    v = version()
    stale = []
    for page in sorted(ROOT.glob('*.html')):
        old = page.read_text(encoding='utf-8')
        new = TAG.sub(lambda m: f'{m.group(1)}?v={v}{m.group(2)}', old)
        if new != old:
            stale.append(page.name)
            if not check:
                page.write_text(new, encoding='utf-8')
    if check:
        if stale:
            print(f'Scriptversie verouderd in: {", ".join(stale)}.\nDraai: python3 scripts/cache-bust.py  (en voeg de pagina\'s toe aan de commit)', file=sys.stderr)
            sys.exit(1)
        print(f'Scriptversie klopt (v={v}).')
    else:
        print(f'Versie v={v}: ' + (f'bijgewerkt in {", ".join(stale)}.' if stale else 'al actueel.'))


if __name__ == '__main__':
    main()
