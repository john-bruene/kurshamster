# KursHamster 🐹

**Hamstert alle deine Daten aus Stud.IP.** Eine kleine Desktop-App für Mac und Windows, die **alle eigenen Kursdateien und Stud.IP-Nachrichten** auf den eigenen Rechner sichert – zum Beispiel vor der Exmatrikulation, wenn der Uni-Account bald gelöscht wird.

- **Anmeldung wie gewohnt:** Die App öffnet das Login-Fenster der Hochschule. Das Passwort sieht und speichert die App nicht.
- **Nichts verlässt deinen Rechner:** Die App spricht ausschließlich mit dem Stud.IP deiner Hochschule. Es gibt keinen Server dazwischen.
- **Übersichtlich:** Dateien landen als `Semester/Kurs/Ordner/Datei`, mit originalem Änderungsdatum.
- **Fortsetzbar:** Abgebrochen oder Sitzung abgelaufen? Einfach erneut starten – fertige Dateien werden übersprungen.
- **Für viele Hochschulen:** 28 Stud.IP-Hochschulen sind direkt auswählbar (siehe Karte), jede andere Stud.IP-Adresse (ab Version 4.5, mit JSON:API) lässt sich eintragen.

> Die gesicherten Materialien sind urheberrechtlich geschützt und nur für das persönliche Archiv gedacht. Bitte nicht weitergeben oder veröffentlichen.

## Unterstützte Hochschulen

<!-- unis:start -->
KursHamster kennt 28 Hochschulen und wählt die richtige Adresse automatisch. Jede andere Stud.IP-Installation ab Version 4.5 lässt sich über „Andere Hochschule …“ eintragen.

```geojson
{
 "type": "FeatureCollection",
 "features": [
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Augsburg",
    "Stud_IP": "digicampus.uni-augsburg.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     10.8975,
     48.3334
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Technische Universität Braunschweig",
    "Stud_IP": "studip.tu-braunschweig.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     10.5297,
     52.2735
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Bremen",
    "Stud_IP": "elearning.uni-bremen.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.8522,
     53.1069
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Technische Universität Clausthal",
    "Stud_IP": "studip.tu-clausthal.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     10.3349,
     51.8049
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Evangelische Hochschule Dresden",
    "Stud_IP": "studip.ehs-dresden.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     13.7565,
     51.0458
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule Flensburg",
    "Stud_IP": "elearning.fh-flensburg.de/studip",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.451,
     54.7745
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Katholische Hochschule Freiburg",
    "Stud_IP": "studip.kh-freiburg.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     7.841,
     47.9985
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule Geisenheim",
    "Stud_IP": "studip.hs-gm.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     7.958,
     49.9858
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Justus-Liebig-Universität Gießen",
    "Stud_IP": "studip.uni-giessen.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.677,
     50.58
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Georg-August-Universität Göttingen",
    "Stud_IP": "studip.uni-goettingen.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.9358,
     51.5413
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Martin-Luther-Universität Halle-Wittenberg",
    "Stud_IP": "studip.uni-halle.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     11.969,
     51.486
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Technische Universität Hamburg",
    "Stud_IP": "e-learning.tuhh.de/studip",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.969,
     53.46
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Leibniz Universität Hannover",
    "Stud_IP": "studip.uni-hannover.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.7176,
     52.3822
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Pädagogische Hochschule Heidelberg",
    "Stud_IP": "studip.ph-heidelberg.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.68,
     49.413
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "HAWK Hildesheim/Holzminden/Göttingen",
    "Stud_IP": "studip.hawk.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.965,
     52.143
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule für Wirtschaft und Umwelt Nürtingen-Geislingen",
    "Stud_IP": "neo.hfwu.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.3432,
     48.6264
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Carl von Ossietzky Universität Oldenburg",
    "Stud_IP": "elearning.uni-oldenburg.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.181,
     53.1474
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Osnabrück",
    "Stud_IP": "studip.uni-osnabrueck.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.0444,
     52.2716
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Passau",
    "Stud_IP": "studip.uni-passau.de/studip",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     13.451,
     48.567
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule RheinMain",
    "Stud_IP": "studip.hs-rm.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.217,
     50.096
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Rostock",
    "Stud_IP": "studip.uni-rostock.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     12.1405,
     54.0887
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule Schmalkalden",
    "Stud_IP": "studip.hs-schmalkalden.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     10.456,
     50.723
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Pädagogische Hochschule Schwäbisch Gmünd",
    "Stud_IP": "lms.ph-gmuend.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     9.816,
     48.798
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule Trier",
    "Stud_IP": "studip.hochschule-trier.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     6.651,
     49.753
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Trier",
    "Stud_IP": "studip.uni-trier.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     6.688,
     49.746
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Universität Vechta",
    "Stud_IP": "www.studip.uni-vechta.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     8.287,
     52.726
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Hochschule Wismar",
    "Stud_IP": "studip.hs-wismar.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     11.456,
     53.892
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "name": "Ostfalia Hochschule für angewandte Wissenschaften",
    "Stud_IP": "studip.ostfalia.de",
    "marker-color": "#1f5f7a",
    "marker-symbol": "college"
   },
   "geometry": {
    "type": "Point",
    "coordinates": [
     10.547,
     52.165
    ]
   }
  }
 ]
}
```

<details>
<summary>Alle Hochschulen als Liste</summary>

| Hochschule | Ort | Stud.IP |
|---|---|---|
| Universität Augsburg | Augsburg | [digicampus.uni-augsburg.de](https://digicampus.uni-augsburg.de) |
| Technische Universität Braunschweig | Braunschweig | [studip.tu-braunschweig.de](https://studip.tu-braunschweig.de) |
| Universität Bremen | Bremen | [elearning.uni-bremen.de](https://elearning.uni-bremen.de) |
| Technische Universität Clausthal | Clausthal-Zellerfeld | [studip.tu-clausthal.de](https://studip.tu-clausthal.de) |
| Evangelische Hochschule Dresden | Dresden | [studip.ehs-dresden.de](https://studip.ehs-dresden.de) |
| Hochschule Flensburg | Flensburg | [elearning.fh-flensburg.de/studip](https://elearning.fh-flensburg.de/studip) |
| Katholische Hochschule Freiburg | Freiburg im Breisgau | [studip.kh-freiburg.de](https://studip.kh-freiburg.de) |
| Hochschule Geisenheim | Geisenheim | [studip.hs-gm.de](https://studip.hs-gm.de) |
| Justus-Liebig-Universität Gießen | Gießen | [studip.uni-giessen.de](https://studip.uni-giessen.de) |
| Georg-August-Universität Göttingen | Göttingen | [studip.uni-goettingen.de](https://studip.uni-goettingen.de) |
| Martin-Luther-Universität Halle-Wittenberg | Halle (Saale) | [studip.uni-halle.de](https://studip.uni-halle.de) |
| Technische Universität Hamburg | Hamburg | [e-learning.tuhh.de/studip](https://e-learning.tuhh.de/studip) |
| Leibniz Universität Hannover | Hannover | [studip.uni-hannover.de](https://studip.uni-hannover.de) |
| Pädagogische Hochschule Heidelberg | Heidelberg | [studip.ph-heidelberg.de](https://studip.ph-heidelberg.de) |
| HAWK Hildesheim/Holzminden/Göttingen | Hildesheim | [studip.hawk.de](https://studip.hawk.de) |
| Hochschule für Wirtschaft und Umwelt Nürtingen-Geislingen | Nürtingen | [neo.hfwu.de](https://neo.hfwu.de) |
| Carl von Ossietzky Universität Oldenburg | Oldenburg | [elearning.uni-oldenburg.de](https://elearning.uni-oldenburg.de) |
| Universität Osnabrück | Osnabrück | [studip.uni-osnabrueck.de](https://studip.uni-osnabrueck.de) |
| Universität Passau | Passau | [studip.uni-passau.de/studip](https://studip.uni-passau.de/studip) |
| Universität Rostock | Rostock | [studip.uni-rostock.de](https://studip.uni-rostock.de) |
| Hochschule Schmalkalden | Schmalkalden | [studip.hs-schmalkalden.de](https://studip.hs-schmalkalden.de) |
| Pädagogische Hochschule Schwäbisch Gmünd | Schwäbisch Gmünd | [lms.ph-gmuend.de](https://lms.ph-gmuend.de) |
| Hochschule Trier | Trier | [studip.hochschule-trier.de](https://studip.hochschule-trier.de) |
| Universität Trier | Trier | [studip.uni-trier.de](https://studip.uni-trier.de) |
| Universität Vechta | Vechta | [www.studip.uni-vechta.de](https://www.studip.uni-vechta.de) |
| Hochschule RheinMain | Wiesbaden | [studip.hs-rm.de](https://studip.hs-rm.de) |
| Hochschule Wismar | Wismar | [studip.hs-wismar.de](https://studip.hs-wismar.de) |
| Ostfalia Hochschule für angewandte Wissenschaften | Wolfenbüttel | [studip.ostfalia.de](https://studip.ostfalia.de) |

</details>

Deine Hochschule fehlt? Eintrag in [`src/shared/universities.js`](src/shared/universities.js) ergänzen oder ein Issue anlegen.
<!-- unis:end -->

## Funktionen

- **Schnell:** Die Kursliste steht nach einer Sekunde, 120 Kurse sind in etwa einer halben Minute eingelesen
- **Alle Kursdateien** mit Ordnerstruktur und originalem Änderungsdatum
- **Fortsetzen und Aktualisieren:** Vorhandene Dateien werden übersprungen. Wurde eine Datei in Stud.IP geändert, lädt KursHamster die neue Fassung und behält die alte daneben (`Folien (Version vom 2021-05-03).pdf`)
- **Kursinfo-Seite pro Veranstaltung:** Beschreibung, Lehrende, Einrichtung, regelmäßige Termine und alle Einzeltermine mit Raum, dazu eine Dateiliste mit Links
- **Übersicht (`_Übersicht.html`):** alle Semester und Kurse auf einen Blick – funktioniert offline in jedem Browser
- **Vorlesungsaufzeichnungen** aus Opencast und dem Reiter „Medien“ (MediaCast), optional und standardmäßig aus – geladen wird nur, was Stud.IP zum Download anbietet. Alle übrigen Videos stehen mit Titel, Datum und Link zum Anschauen auf der Kursseite
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

`.github/workflows/build.yml` veröffentlicht neue Versionen automatisch: `version` in `package.json` erhöhen und auf `main` pushen. Gibt es zu dieser Version noch kein Release, baut GitHub einen Mac-DMG und einen Windows-Installer und stellt sie auf die Release-Seite. Ohne Zertifikat sind diese Builds unsigniert:

- **Mac:** Beim ersten Öffnen Rechtsklick → „Öffnen“. Für die Verteilung an alle: Apple Developer Program (Developer ID + Notarisierung) als Secrets ergänzen.
- **Windows:** SmartScreen warnt. Für Open-Source-Projekte bietet die [SignPath Foundation](https://signpath.org) kostenlose Signierung an.

## Lizenz

MIT – siehe [LICENSE](LICENSE). KursHamster ist ein inoffizielles Werkzeug und nicht mit dem Stud.IP e.V., der data-quest GmbH oder einer Hochschule verbunden. „Stud.IP“ ist der Name des gleichnamigen Lernmanagementsystems.
