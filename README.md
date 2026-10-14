# KursHamster 🐹

**Hamstert alle deine Daten aus Stud.IP.** Eine kleine Desktop-App für Mac und Windows, die **alle eigenen Kursdateien und Stud.IP-Nachrichten** auf den eigenen Rechner sichert – zum Beispiel vor der Exmatrikulation, wenn der Uni-Account bald gelöscht wird.

- **Anmeldung wie gewohnt:** Die App öffnet das Login-Fenster der Hochschule. Das Passwort sieht und speichert die App nicht.
- **Nichts verlässt deinen Rechner:** Die App spricht ausschließlich mit dem Stud.IP deiner Hochschule. Es gibt keinen Server dazwischen.
- **Übersichtlich:** Dateien landen als `Semester/Kurs/Ordner/Datei`, mit originalem Änderungsdatum.
- **Fortsetzbar:** Abgebrochen oder Sitzung abgelaufen? Einfach erneut starten – fertige Dateien werden übersprungen.
- **Für jede Stud.IP-Hochschule:** Göttingen ist voreingestellt, jede andere Stud.IP-Adresse (ab Version 4.5, mit JSON:API) lässt sich eintragen.

> Die gesicherten Materialien sind urheberrechtlich geschützt und nur für das persönliche Archiv gedacht. Bitte nicht weitergeben oder veröffentlichen.

## Funktionen

- **Alle Kursdateien** mit Ordnerstruktur und originalem Änderungsdatum
- **Fortsetzen und Aktualisieren:** Vorhandene Dateien werden übersprungen. Wurde eine Datei in Stud.IP geändert, lädt KursHamster die neue Fassung und behält die alte daneben (`Folien (Version vom 2021-05-03).pdf`)
- **Kursinfo-Seite pro Veranstaltung:** Beschreibung, Lehrende, Einrichtung, regelmäßige Termine und alle Einzeltermine mit Raum, dazu eine Dateiliste mit Links
- **Übersicht (`_Übersicht.html`):** alle Semester und Kurse auf einen Blick – funktioniert offline in jedem Browser
- **Vorlesungsaufzeichnungen (Opencast)**, optional und standardmäßig aus, in hoher oder niedriger Qualität – nur wo die Lehrenden den Download erlauben
- **Filter:** Dateitypen (Dokumente, Folien, Videos, …) und maximale Dateigröße
- **Stud.IP-Nachrichten** als Markdown und als lesbare HTML-Seite
- **Deutsch und Englisch**
- **Automatische Updates** über GitHub-Releases (Windows vollautomatisch, Mac mit Hinweis und Download-Link)

## Installation

Lade die passende Datei von der [Release-Seite](https://github.com/john-bruene/kurshamster/releases/latest) herunter:

| System | Datei |
|---|---|
| Windows | `KursHamster-…-Windows-Setup.exe` – doppelklicken und dem Installer folgen |
| Mac (Apple-Chip und Intel) | `KursHamster-…-Mac.dmg` |

**Windows:** Erscheint „Der Computer wurde durch Windows geschützt“, auf „Weitere Informationen“ → „Trotzdem ausführen“ klicken.

**Mac:** DMG öffnen, „KursHamster“ in den Ordner *Programme* ziehen und öffnen. Meldet macOS, dass die App nicht überprüft werden konnte: auf „Fertig“ klicken, dann *Systemeinstellungen → Datenschutz & Sicherheit* öffnen, nach unten scrollen und bei „KursHamster“ auf „Dennoch öffnen“ klicken. Das ist nur beim ersten Start nötig.

Die Warnungen erscheinen, weil die App (noch) nicht mit einem kostenpflichtigen Entwicklerzertifikat signiert ist.

## Was gesichert wird

| Inhalt | Ablage |
|---|---|
| Übersicht über alle Kurse | `_Übersicht.html` |
| Dateien aller Veranstaltungen | `<Semester>/<Nr. Kurstitel>/<Ordner>/…` |
| Kursinfo-Seite | `<Semester>/<Nr. Kurstitel>/_Kursinfo.html` |
| Vorlesungsaufzeichnungen | `<Semester>/<Nr. Kurstitel>/_Aufzeichnungen/…` |
| „Meine Dateien“ | `_Meine Dateien/…` |
| Nachrichten (Posteingang, Postausgang) | `_Nachrichten/Nachrichten.html`, einzeln als Markdown plus Rohdaten (`messages.jsonl`) |
| Übersicht aller Dateien mit Metadaten | `_index.json` |
| Was nicht geladen werden konnte | `_fehler.txt` |

Ordner, die nur Lehrende sehen dürfen (z. B. Abgabeordner), werden übersprungen und in `_fehler.txt` vermerkt.

## Entwicklung

Voraussetzung: [Node.js](https://nodejs.org) 22 oder neuer.

```bash
npm install        # einmalig
npm start          # App starten
npm test           # Tests der Kernlogik gegen ein nachgebautes Stud.IP (test/mockStudip.js)
npm run test:e2e   # komplette App gegen den nachgebauten Server (Linux ohne Bildschirm: xvfb-run)
npm run dist       # Installer für das aktuelle System bauen (landet in dist/)
```

### Aufbau

```
src/core/client.js     JSON:API-Client: Paging, Wiederholungen, Abbrechen
src/core/backup.js     Einlesen der Kurse/Ordner/Dateien, Kursdetails und Herunterladen
src/core/opencast.js   Vorlesungsaufzeichnungen über das Opencast-Plugin (OpencastV3)
src/core/pages.js      Offline-Seiten: Übersicht, Kursinfo, Nachrichten
src/shared/            Übersetzungen (DE/EN) und Dateikategorien, für App und Oberfläche
src/main/updater.js    Updates über GitHub-Releases
src/main/main.js       Electron-Hauptprozess: Fenster, Login-Sitzung, IPC
src/main/preload.js    Sichere Brücke zur Oberfläche
src/renderer/          Oberfläche (HTML/CSS/JS, ohne Framework)
tools/studip_backup.py Ursprüngliches Kommandozeilen-Skript
```

Der Login läuft in einem eigenen Fenster mit einer dauerhaften, von der App getrennten Browser-Sitzung (`persist:studip`). Alle API-Aufrufe und Downloads nutzen genau diese Sitzung. „Abmelden“ löscht sie vollständig.

### Updates

Die App prüft beim Start die neueste Version auf der Release-Seite dieses Repositorys (`kurshamster.updateRepo` und `build.publish` in `package.json`).

### Builds und Signierung

`.github/workflows/build.yml` baut bei jedem Tag `v*` einen Mac-DMG und einen Windows-Installer und veröffentlicht sie als GitHub-Release. Neue Version: `version` in `package.json` erhöhen, dann `git tag v0.2.0 && git push --tags`. Ohne Zertifikat sind diese Builds unsigniert:

- **Mac:** Beim ersten Öffnen Rechtsklick → „Öffnen“. Für die Verteilung an alle: Apple Developer Program (Developer ID + Notarisierung) als Secrets ergänzen.
- **Windows:** SmartScreen warnt. Für Open-Source-Projekte bietet die [SignPath Foundation](https://signpath.org) kostenlose Signierung an.

## Lizenz

MIT – siehe [LICENSE](LICENSE). KursHamster ist ein inoffizielles Werkzeug und nicht mit dem Stud.IP e.V., der data-quest GmbH oder einer Hochschule verbunden. „Stud.IP“ ist der Name des gleichnamigen Lernmanagementsystems.
