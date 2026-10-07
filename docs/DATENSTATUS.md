# Datenstatus

Automatisch erzeugt mit `npm run data:check -- --md` am 2026-10-07.

**118 bestellbare Produkte in 12 Kategorien.**

## Vor dem Go-Live zwingend klären

- [ ] Liefergebiet bestätigen: 22 PLZ aus dem Lieferando-Shop übernommen, Mindestbestellwert 10,00 € (ohne Getränke) und 0 € Liefergebühr laut bisheriger Website. Lieferando staffelt den Mindestwert je PLZ (11,99–34,99 €) – falls das auch für Direktbestellungen gelten soll, je Zone eintragen.
- [ ] Allergen-Kennzeichnung prüfen: Die Kennzeichnung je Gericht stammt von der bisherigen Website. Deren Legende enthält zwei unterschiedliche Buchstaben-Systeme; I und J sind nur im zweiten System definiert. Vor Go-Live vom Betrieb prüfen lassen.
- [ ] Aufpreise/Auswahl bestätigen (aus dem Lieferando-Shop übernommen): pizza-zutaten, pasta-zutaten, pasta-ueberbacken, salat-dressing, salat-brot, pizzabroetchen-sauce, pizzabroetchen-fuellung, doener-sauce – siehe src/data/options.json.

## Prüfen

- [ ] Preisvergleich „Nichts kostet hier mehr als bei Lieferando – die meisten Gerichte sind sogar günstiger.“ wurde am 2026-10-07 geprüft – regelmäßig nachprüfen oder in home.json abschalten.
- [ ] Bewertungen sind ausgeblendet – aktuelle Werte mit Datum in reviews.json eintragen und "publish": true setzen.
- [ ] Getränkepreise enthalten laut Lieferando-Shop das Pfand („inkl. Pfand“). Nach PAngV § 7 sollte Pfand neben dem Preis und nicht im Gesamtpreis angegeben werden – Darstellung mit Steuerberatung/Rechtsberatung abstimmen.

## Kategorien

| Kategorie | Produkte | ab | Quelle |
|---|---:|---:|---|
| Pizza | 36 | 6,90 € | bisherige Website |
| Party-Pizza | 2 | 29,90 € | bisherige Website |
| Döner | 10 | 5,90 € | bisherige Website |
| Lahmacun | 2 | 5,90 € | bisherige Website |
| Falafel | 5 | 6,90 € | bisherige Website |
| Pasta | 12 | 8,90 € | bisherige Website |
| Pizzabrötchen | 7 | 3,90 € | bisherige Website |
| Salate | 7 | 6,90 € | bisherige Website |
| Snacks | 8 | 3,50 € | bisherige Website |
| Desserts | 4 | 3,90 € | bisherige Website |
| Saucen | 15 | 0,80 € | bisherige Website |
| Getränke | 10 | 2,00 € | bisherige Website |

## Positionen mit Anmerkung oder ohne volle Bestätigung

Keine – alle Produkte und Preise stammen von der bisherigen eigenen Website.
