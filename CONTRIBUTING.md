# KursHamster entwickeln

KursHamster ist eine Electron-App in reinem JavaScript, ohne Framework und ohne Build-Schritt für die Oberfläche.

## Loslegen

Voraussetzung ist [Node.js](https://nodejs.org) 22 oder neuer.

```bash
npm install         # einmalig
npm start           # App starten
npm test            # Tests der Kernlogik gegen ein nachgebautes Stud.IP
npm run test:e2e    # die ganze App gegen den nachgebauten Server (Linux ohne Bildschirm: xvfb-run npm run test:e2e)
npm run dist        # Installer für das eigene System bauen, landet in dist/
```

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/core/client.js` | Zugriff auf die Stud.IP-JSON:API: Seiten nachladen, Wiederholungen, Abbrechen |
| `src/core/backup.js` | Kurse und Dateien einlesen, Kursdetails, Herunterladen, Seiten und Berichte schreiben |
| `src/core/opencast.js` | Aufzeichnungen aus dem Opencast-Plugin (OpencastV3) |
| `src/core/mediacast.js` | Aufzeichnungen aus dem Reiter „Medien“ (MediaCast); liest die HTML-Seite des Plugins |
| `src/core/pages.js` | Offline-Seiten: Übersicht, Kursinfo, Nachrichten |
| `src/shared/` | Übersetzungen (DE/EN), Dateikategorien, Hochschulliste – für App und Oberfläche |
| `src/main/` | Electron-Hauptprozess: Fenster, Login-Sitzung, Updates |
| `src/renderer/` | Oberfläche (HTML, CSS, JavaScript) |
| `test/` | Tests und das nachgebaute Stud.IP (`mockStudip.js`) |
| `tools/` | README-Karte, Screenshots, das ursprüngliche Python-Skript |

Der Login läuft in einem eigenen Fenster mit einer dauerhaften, von der App getrennten Browser-Sitzung (`persist:studip`). Alle Anfragen und Downloads nutzen diese Sitzung. „Abmelden“ löscht sie.

Zum Einlesen braucht die App pro Kurs zwei Anfragen: alle Ordner (`courses/{id}/folders`) und alle Dateien (`courses/{id}/file-refs`). Ältere Stud.IP-Versionen ohne die zweite Route werden ordnerweise eingelesen.

## Grundsätze

- Es wird nur geladen, was Stud.IP der angemeldeten Person selbst zum Download anbietet. Insbesondere werden keine Aufzeichnungen heruntergeladen, die nur zum Anschauen freigegeben sind.
- Keine Daten an Dritte. Außer dem Stud.IP der Hochschule kontaktiert die App nur GitHub, um nach Updates zu suchen, und das lässt sich abschalten.
- Den Server schonen: kurze Pausen zwischen den Anfragen, höchstens vier Kurse gleichzeitig.

## Hochschule hinzufügen

Eintrag in `src/shared/universities.js` ergänzen (Name, Ort, Adresse, Koordinaten), dann `npm run readme:map` ausführen. Das aktualisiert Karte und Liste in beiden READMEs.

## Screenshots

`xvfb-run npx electron tools/screenshots.js` (und mit `KH_LANG=en` für die englische Fassung) erzeugt die Bilder in `docs/` aus erfundenen Beispieldaten.

## Neue Version veröffentlichen

1. `version` in `package.json` erhöhen.
2. In `CHANGELOG.md` einen Abschnitt `## <version>` mit den Änderungen ergänzen, in einfachen Worten für Studierende.
3. Auf `main` pushen.

Gibt es zu der Version noch kein Release, baut GitHub Actions den Mac- und den Windows-Installer und veröffentlicht sie zusammen mit dem Text aus dem Changelog. Die Download-Links im README zeigen immer auf die neueste Version.

## Signieren

Ohne Zertifikate warnen Windows und macOS beim ersten Start. Der Workflow ist vorbereitet:

**Mac (Apple Developer Program, 99 US-Dollar im Jahr):** Ein Zertifikat vom Typ „Developer ID Application“ erstellen, als `.p12` exportieren und diese Secrets im Repository anlegen (Settings → Secrets and variables → Actions):

| Secret | Inhalt |
|---|---|
| `MAC_CERT_P12_BASE64` | das `.p12`-Zertifikat, base64-kodiert (`base64 -i cert.p12 \| pbcopy`) |
| `MAC_CERT_PASSWORD` | Passwort des `.p12` |
| `APPLE_ID` | Apple-ID des Entwicklerkontos |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-spezifisches Passwort von appleid.apple.com |
| `APPLE_TEAM_ID` | Team-ID aus dem Entwicklerkonto |

Sind sie vorhanden, signiert und notarisiert der Workflow die Mac-App automatisch.

**Windows:** Für Open-Source-Projekte signiert die [SignPath Foundation](https://signpath.org) kostenlos. Voraussetzungen sind unter anderem eine Seite zur Signatur-Richtlinie im Repository, Zwei-Faktor-Anmeldung für alle mit Schreibrechten und eine manuelle Freigabe jeder signierten Version. Nach der Aufnahme wird der Signaturschritt in `.github/workflows/build.yml` ergänzt.
