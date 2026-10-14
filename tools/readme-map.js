#!/usr/bin/env node
'use strict';
/**
 * Schreibt die Karte und die Tabelle der unterstützten Hochschulen ins README
 * (zwischen <!-- unis:start --> und <!-- unis:end -->). GitHub zeigt den
 * geojson-Block als interaktive Karte an.   Aufruf: npm run readme:map
 */
const fs = require('node:fs');
const path = require('node:path');
const { universities } = require('../src/shared/universities');

const readme = path.join(__dirname, '..', 'README.md');
const geo = {
  type: 'FeatureCollection',
  features: universities.map((u) => ({
    type: 'Feature',
    properties: { name: u.name, Stud_IP: u.url.replace(/^https:\/\//, ''), 'marker-color': '#1f5f7a', 'marker-symbol': 'college' },
    geometry: { type: 'Point', coordinates: [u.lon, u.lat] },
  })),
};

const rows = universities
  .slice()
  .sort((a, b) => a.city.localeCompare(b.city, 'de') || a.name.localeCompare(b.name, 'de'))
  .map((u) => `| ${u.name} | ${u.city} | [${u.url.replace(/^https:\/\//, '')}](${u.url}) |`)
  .join('\n');

const block = `<!-- unis:start -->
KursHamster kennt ${universities.length} Hochschulen und wählt die richtige Adresse automatisch. Jede andere Stud.IP-Installation ab Version 4.5 lässt sich über „Andere Hochschule …“ eintragen.

\`\`\`geojson
${JSON.stringify(geo, null, 1)}
\`\`\`

<details>
<summary>Alle Hochschulen als Liste</summary>

| Hochschule | Ort | Stud.IP |
|---|---|---|
${rows}

</details>

Deine Hochschule fehlt? Eintrag in [\`src/shared/universities.js\`](src/shared/universities.js) ergänzen oder ein Issue anlegen.
<!-- unis:end -->`;

let s = fs.readFileSync(readme, 'utf8');
if (!/<!-- unis:start -->[\s\S]*<!-- unis:end -->/.test(s)) throw new Error('Markierungen im README fehlen');
s = s.replace(/<!-- unis:start -->[\s\S]*<!-- unis:end -->/, block);
fs.writeFileSync(readme, s);
console.log(`README: ${universities.length} Hochschulen eingetragen.`);
