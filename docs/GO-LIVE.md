# Go-Live-Checkliste

Stand: 07.10.2026. Was vor dem Livegang **vom Betrieb bestätigt oder eingerichtet** werden muss. Die Website erfindet keine Geschäftsdaten: Alles, was nicht aus einer direkten Quelle belegt ist, ist hier aufgeführt und im Code als `"status": "unconfirmed"` markiert.

Die datenbezogenen Punkte erzeugt `npm run data:check` automatisch, mit Details in [DATENSTATUS.md](DATENSTATUS.md). Sobald ein Punkt bestätigt ist, wird der Status in der JSON-Datei auf `"confirmed"` gesetzt und der Punkt verschwindet aus der Liste.

---

## A. Ohne diese Punkte keine Online-Bestellung

- [ ] **Bestellkanal einrichten.** Mindestens E-Mail (SMTP) oder Webhook, siehe [README → Bestellungen empfangen](../README.md#bestellungen-empfangen). Ohne Kanal zeigt die Kasse nur „bitte anrufen“.
  - Empfänger-Adresse festlegen, die im Laden **während der Öffnungszeit sicher gelesen wird** (Tablet/Handy mit Benachrichtigung). Eine Bestellung, die niemand sieht, ist schlimmer als keine.
  - Für die Absenderadresse SPF/DKIM beim Mail-Anbieter einrichten, sonst landen Bestätigungen an Kund:innen im Spam.
- [ ] **Hosting mit Node.js.** Die Bestell-Schnittstelle `/api/order` braucht einen laufenden Node-Prozess (≥ 22.12). Das bisherige WordPress-Shared-Hosting kann das in der Regel nicht. Siehe [README → Veröffentlichen](../README.md#veröffentlichen).
- [ ] **Testbestellung im Livebetrieb.** Nach dem Umzug eine echte Bestellung (Lieferung und Abholung) aufgeben und prüfen, dass sie im Laden ankommt.

## B. Geschäftsdaten bestätigen

| Punkt | Aktueller Stand auf der Website | Quelle | Datei |
|---|---|---|---|
| **Liefergebiet** | 22 PLZ (42103–42389) | Lieferando-Shop des Betriebs | `ordering.json` |
| **Mindestbestellwert** | 10,00 € (Getränke zählen nicht mit), Abholung ohne Mindestwert | bisherige Website | `ordering.json` |
| **Liefergebühr** | 0 € | bisherige Website und Lieferando-Shop | `ordering.json` |
| **Bestellschluss** | 15 Minuten vor Ladenschluss | Lieferando-Shop (Bestellzeiten enden jeweils 15 Min. vor Schluss) | `business.json` → `lastOrderMinutesBeforeClose` |
| **Extras & Aufpreise** | Zutaten, Dressings, Saucen, Beilagen mit Aufpreisen je Größe | Lieferando-Shop (auf der alten Website nicht vorhanden) | `options.json` |
| **Zahlungsarten** | nur Barzahlung | Kasse und Footer der bisherigen Website („BAR“) | `ordering.json` |

**Zum Mindestbestellwert:** Der Lieferando-Shop staffelt ihn je PLZ von 11,99 € bis 34,99 €. Die bisherige eigene Website verlangte einheitlich 10 €. Übernommen ist der Wert der eigenen Website. Falls je Stadtteil unterschiedliche Werte gelten sollen, werden einfach mehrere Zonen angelegt (Beispiel im README).

**Zu den Zahlungsarten:** Im Lieferando-Shop ist PayPal hinterlegt, im alten Shop der eigenen Website nur Barzahlung. Online-Zahlung (PayPal, Karte) ist **nicht** eingebaut. Das wäre ein eigenes Projekt mit Zahlungsanbieter-Vertrag.

## C. Kennzeichnung & Preisangaben

- [ ] **Allergene und Zusatzstoffe prüfen.** Die Kennzeichnung je Gericht stammt von der alten Website. Deren Legende mischt zwei Buchstaben-Systeme: „I“ und „J“ sind nur im zweiten System erklärt. Die Website zeigt die Legende so wie bisher und weist auf die Unstimmigkeit hin. Der Betrieb sollte die Codes je Gericht einmal mit den tatsächlichen Zutaten abgleichen. → `allergens.json`, `menu/*.json`
- [ ] **Pfand-Darstellung.** Getränkepreise enthalten laut Lieferando-Shop das Pfand. Die Preisangabenverordnung (§ 7 PAngV) verlangt, das Pfand **neben** dem Preis anzugeben, nicht eingerechnet. Ob die Preise auf Endpreis ohne Pfand umgestellt werden, mit Steuerberatung klären. Technisch reicht dann eine Änderung der `price`-Werte in `menu/12-getraenke.json`.
- [ ] **Preisvergleich mit Lieferando.** Die Startseite sagt: „Nichts kostet hier mehr als bei Lieferando – die meisten Gerichte sind sogar günstiger.“ Am 07.10.2026 wurde jeder Preis mit dem Lieferando-Shop verglichen: 94 Preise sind direkt günstiger, 36 gleich und keiner teurer; 10 Positionen gibt es nur auf einer der beiden Karten. Ändern sich Preise auf einer der beiden Seiten, kann die Aussage falsch und damit wettbewerbswidrig werden. Bei jeder Preisänderung erneut prüfen oder in `home.json` unter `directPrice` den Wert `"enabled": false` setzen.

## D. Rechtstexte

Die Rechtstexte sind sorgfältig formuliert, ersetzen aber **keine Rechtsberatung**. Vor dem Livegang einmal prüfen lassen:

- [ ] **Impressum**: Die Angaben stammen aus dem bisherigen Impressum und sind auf § 5 DDG aktualisiert (vorher TMG). Den Link zur EU-Streitbeilegungsplattform gibt es nicht mehr, weil die Plattform eingestellt wurde. Falls vorhanden, Umsatzsteuer-ID ergänzen; auf der alten Seite war keine angegeben.
- [ ] **Datenschutzerklärung**: Sie beschreibt die tatsächliche Technik: keine Cookies, kein Tracking, Warenkorb nur im Browser, Server-Logfiles, Bestellübermittlung per E-Mail/Webhook.
  - Hosting- und Mail-Anbieter **namentlich ergänzen**.
  - Mit beiden einen Auftragsverarbeitungsvertrag (Art. 28 DSGVO) abschließen.
  - Ändert sich die Technik, etwa durch eine Karten-Einbettung, Analyse-Tools oder Online-Zahlung, muss der Text angepasst werden.
- [ ] **Bestellinformationen** (Vertragsschluss, Preise, Lieferung, kein Widerrufsrecht nach § 312g Abs. 2 Nr. 2 BGB für Speisen) mit dem tatsächlichen Ablauf im Laden abgleichen: Wie wird bestätigt? Was passiert bei Nicht-Abholung?
- [ ] Der Bestellknopf heißt „Zahlungspflichtig bestellen“ (§ 312j Abs. 3 BGB). Nicht umbenennen.

## E. Marke & Inhalte

- [ ] **Logo**: Es ist nach dem Original nachgezeichnet (Pizzastück mit Dampf, Schriftzug in Rostrot) und als sauberes SVG umgesetzt. Bitte vom Betrieb freigeben lassen. Das Original liegt unter `docs/quelle-alte-website/eigene-website/logo-original-512.png`.
- [ ] **Fotos**: Auf der Website gibt es bewusst **keine Stockfotos**. Das Kopfbild der alten Seite war ein Stockfoto mit dem Slogan „Original italienisch“, der zum heutigen Angebot (Döner, Lahmacun, Falafel) nicht mehr passt. Die Pizza auf der Startseite ist eine eigens erzeugte Illustration. **Empfehlung:** ein kurzes Foto-Shooting der echten Gerichte. Im Datenmodell ist dafür je Produkt bereits ein Feld `"image"` vorgesehen; die Anzeige auf der Karte müsste dann noch eingebaut werden.
- [ ] **Bewertungen** sind ausgeblendet. Es werden nur öffentlich nachprüfbare Bewertungen gezeigt, mit Quelle und Abrufdatum. Werte in `reviews.json` eintragen und `"publish": true` setzen.
- [ ] **Öffnungszeiten an Feiertagen**: Ausnahmen in `business.json → hours.exceptions` eintragen (Beispiel im README).

## F. Umzug der Domain

- [ ] Website auf dem neuen Hosting unter einer Test-Adresse prüfen, dann die Domain umstellen.
- [ ] Alte Adressen werden per 301 weitergeleitet (`/pizza`, `/doener`, `/drinks`, `/insalatone`, `/warenkorb` …). Nach dem Umzug stichprobenartig prüfen.
- [ ] Google Search Console: Domain bestätigen, `https://pizzarella-wuppertal.de/sitemap-index.xml` einreichen.
- [ ] Google-Unternehmensprofil: Website-Link auf `/speisekarte/` setzen und Öffnungszeiten abgleichen.
- [ ] Den alten WordPress-Shop abschalten, damit keine Bestellungen mehr über das alte System eingehen.
