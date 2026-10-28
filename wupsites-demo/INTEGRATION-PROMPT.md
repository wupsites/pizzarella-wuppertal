# Auftrag an das WupSites-Vertriebsportal: Referenz-Demo „Pizzarella Wuppertal“ aufnehmen

Kopierfertig für den WupSites-Hauptchat. Im Chat mit dem Entwickler steht dieselbe Fassung, dort zusätzlich mit der Commit-ID des Pakets.

---

Nimm die fertige Kundenwebsite „Pizzarella Wuppertal“ als Referenz-Demo in die Demo-Bibliothek des Vertriebsportals auf. **Integrationsauftrag, kein Nachbau:** Die Website existiert bereits vollständig als eigenes Projekt. Du kopierst ihren Code nicht ins Portal und baust sie nicht nach. Das Portal verlinkt eine eigenständige, geschützte Demo-Instanz und zeigt dafür eine Projektkarte.

**1. Welches Projekt**
Pizzarella Wuppertal, ein Pizza- und Döner-Lieferdienst (Friedrich-Engels-Allee 117, Wuppertal). Neue Website mit Direktbestellung: 3D-Pizza-Hero aus einem echten Foto, Speisekarte mit 118 Gerichten, Pizza-Ersteller, Warenkorb und Kasse mit serverseitig geprüfter Bestellung. Projekt-ID: `pizzarella-wuppertal`.

**2. Wo der Code liegt**
- GitHub-Repo `wupsites/pizzarella-wuppertal` (derzeit **öffentlich**), Branch **`hero-pizza-reference`**. Der Branch `main` enthält nur den ersten Commit. Nimm ihn nicht.
- Stand der Website: Commit `198d585d37619b7d1d7389ea6de8bb81e8353ecf`. Das Demo-Paket liegt im Ordner `wupsites-demo/`. Pinne das Deployment auf den Commit, der diesen Ordner enthält: `git log -1 --format=%H -- wupsites-demo`.
- Arbeitest du in Claude Code: Hänge das Repo `wupsites/pizzarella-wuppertal` an die Sitzung an und lies es dort. Eine Dateiübertragung aus dem Entwickler-Chat gibt es nicht und ist nicht nötig, das Repo ist die Übergabe.

**3. Welche Dateien du brauchst** (alles in `wupsites-demo/`)
- `manifest.json`: alle Daten der Projektkarte. Funktionen mit Prüfstatus, bekannte Fehler, Vorschaubilder, Verkaufsargumente, Vorführ-Skript, Voraussetzungen und fehlende Infos. Unbekanntes ist `null`.
- `preview/*.jpg`: 8 Vorschaubilder; Titelbild ist `cover-desktop.jpg`.
- `README.md`: Deployment, Prüfliste und Testprotokoll.
- `Dockerfile`, `Dockerfile.dockerignore`, `compose.yaml`, `Caddyfile`, `demo.env.example`: die Demo-Instanz.

**4. Wie die Demo funktionsfähig bereitgestellt wird**
- Eigene Instanz, getrennt von der späteren echten Kundenseite: eigene Subdomain, eigener Server oder Container. Im Repo-Wurzelverzeichnis:
  `docker compose -f wupsites-demo/compose.yaml --env-file wupsites-demo/.env up -d --build`
- Der Stack enthält die Website (Node 22, Port 4321) und davor Caddy: Passwortschutz, `X-Robots-Tag: noindex`, Einbetten verboten (außer `PORTAL_ORIGIN` ist gesetzt), HTTPS automatisch.
- Die Demo stellt keine Bestellungen zu: `ORDER_DEV_SINK=true`, Bestellungen bleiben im Container. **Nie** `SMTP_*`, `ORDER_MAIL_*`, `ORDER_WEBHOOK_*` oder `SITE_URL` setzen.
- Getestet wurde das am 28.10.2026 im Container: Website identisch mit dem Original-Build, alle Seiten, komplette Testbestellung, Zugangsschutz (401/200), noindex-Header, WebGL-Hero auf Desktop und Handy.

**5. Registrierung in der Demo-Bibliothek**
- Lege aus `manifest.json` einen Bibliothekseintrag an. Der Inhalt bleibt bei uns im Repo, das Portal speichert Referenz und Kartendaten.
- Projektkarte: Name, Branche, Kurzbeschreibung (`summary`), Titelbild (`preview.cover`) plus Galerie, Funktionen mit Status (nur `verified` und `implemented` als Besonderheiten zeigen), die 5 Verkaufsargumente mit ihren Einschränkungen (`customerSpecific`, `caveat`), Integrationsstatus und Demo-URL.
- Ein Button „Präsentation starten“ öffnet die Demo-URL **in einem neuen Fenster im Vollbild**, ohne Portal-Oberfläche. Das ist ablenkungsfrei und für Scroll-Hero, WebGL und Warenkorb am zuverlässigsten. Kein iframe als Standard: Im iframe würde der Passwortschutz stören.
- Solange `demo.url` `null` ist: Karte mit Status „Demo-Deployment ausstehend“ und deaktiviertem Button. **Keine URL erfinden.**
- Das Demo-Passwort nicht im Portal-Code ablegen. Es gehört in die Geheimnisverwaltung des Portals oder wird Morad direkt mitgeteilt.
- Vorschaubilder: aus dem Repo übernehmen (Raw-URLs unter `preview.rawBaseUrl`, solange das Repo öffentlich ist) oder als Assets ins Portal kopieren.
- Zeig Morad das `demoScript` aus dem Manifest und die Hinweise zu den Öffnungszeiten (`demo.openingHoursBehaviour`): Sofort bestellen geht nur zu Öffnungszeiten, sonst als Wunschzeit; mittwochs ist Ruhetag.

**6. Technische Abhängigkeiten**
- Astro 7 mit `@astrojs/node` (standalone), Node ≥ 22.12 oder Docker. Die Seite braucht die Wurzel einer eigenen (Sub-)Domain, ein Unterpfad im Portal geht nicht.
- Keine externen Dienste für die Demo: keine Datenbank, kein Tracking, keine Cookies, Schriften selbst gehostet. Externe Links nur zu Google und Apple Maps.
- Warenkorb liegt im `localStorage` des Browsers. Bestellungen laufen über `/api/order`, das auch als Healthcheck dient.

**7. Was noch zu tun ist**
1. Freigabe von Pizzarella einholen, die Seite als Referenz zu zeigen (Status unbekannt).
2. Hosting und Demo-Subdomain festlegen, DNS setzen, `wupsites-demo/.env` anlegen (Domain, Benutzer, Passwort-Hash).
3. Stack starten, Prüfliste aus `README.md` abarbeiten, danach die echte Demo-URL ins Manifest bzw. in die Karte eintragen.
4. Am iPhone und Mac einmal prüfen, ob der Hero flüssig läuft (bisher nicht auf echten Geräten gemessen).
5. Entscheiden, ob das Repo öffentlich bleibt. Wird es privat, braucht der Server einen Lesezugang (Deploy-Key), und Vorschaubilder müssen ins Portal kopiert werden.
6. Optional vor Vorführungen beim Entwickler beheben lassen: Darstellung „Ohne Sauce“ im Pizza-Ersteller und den kleinen Versatz zwischen „Name“ und „Telefon“ an der Kasse.

Fehlende Infos, die du bei mir erfragen musst: die Technik der Demo-Bibliothek im Portal, gewünschte Domain und Hoster, und ob ein iframe zwingend gewünscht ist.
