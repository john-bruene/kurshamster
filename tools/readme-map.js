#!/usr/bin/env node
'use strict';
/**
 * Schreibt Karte und Liste der Hochschulen in README.md und README.en.md
 * (zwischen <!-- unis:start --> und <!-- unis:end -->). GitHub zeigt den
 * geojson-Block als Karte an. Aufruf: npm run readme:map
 */
const fs = require('node:fs');
const path = require('node:path');
const { universities } = require('../src/shared/universities');

const geo = {
  type: 'FeatureCollection',
  features: universities.map((u) => ({
    type: 'Feature',
    properties: { name: u.name, 'Stud.IP': u.url.replace(/^https:\/\//, ''), 'marker-color': '#1f5f7a', 'marker-symbol': 'college' },
    geometry: { type: 'Point', coordinates: [u.lon, u.lat] },
  })),
};
const sorted = universities.slice().sort((a, b) => a.city.localeCompare(b.city, 'de') || a.name.localeCompare(b.name, 'de'));
const table = (head) =>
  [head, '|---|---|---|', ...sorted.map((u) => `| ${u.name} | ${u.city} | [${u.url.replace(/^https:\/\//, '')}](${u.url}) |`)].join('\n');

const TEXT = {
  de: {
    intro: `Diese ${universities.length} Hochschulen kannst du in KursHamster direkt auswählen. Andere Hochschulen mit Stud.IP funktionieren meistens auch: Wähl in der App **Andere Hochschule …** und gib die Stud.IP-Adresse ein.`,
    summary: 'Alle Hochschulen als Liste',
    head: '| Hochschule | Ort | Stud.IP |',
  },
  en: {
    intro: `You can pick these ${universities.length} universities directly in KursHamster. Other universities with Stud.IP usually work too: choose **Other university …** in the app and enter the Stud.IP address.`,
    summary: 'All universities as a list',
    head: '| University | City | Stud.IP |',
  },
};

function block(lang) {
  const t = TEXT[lang];
  return `<!-- unis:start -->
${t.intro}

\`\`\`geojson
${JSON.stringify(geo)}
\`\`\`

<details>
<summary>${t.summary}</summary>

${table(t.head)}

</details>
<!-- unis:end -->`;
}

for (const [file, lang] of [['README.md', 'de'], ['README.en.md', 'en']]) {
  const p = path.join(__dirname, '..', file);
  let s = fs.readFileSync(p, 'utf8');
  if (!/<!-- unis:start -->[\s\S]*<!-- unis:end -->/.test(s)) throw new Error(`Markierungen fehlen in ${file}`);
  s = s.replace(/<!-- unis:start -->[\s\S]*<!-- unis:end -->/, block(lang));
  fs.writeFileSync(p, s);
  console.log(`${file}: ${universities.length} Hochschulen eingetragen.`);
}
