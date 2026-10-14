'use strict';
// Tests der Kernlogik gegen ein nachgebautes Stud.IP.  Ausführen: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StudipClient, SessionExpired, normalizeHost } = require('../src/core/client');
const { Backup, clean, cleanFilename, semesterKey } = require('../src/core/backup');
const { richText, sanitizeHtml } = require('../src/core/pages');
const { categoryOf, passes, formatBytes } = require('../src/shared/filetypes');
const i18n = require('../src/shared/i18n');
const { createData, fakeFetch } = require('./mockStudip');

const HOST = 'https://studip.example.org';
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kurshamster-'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

async function setup(opts) {
  const data = createData();
  const fetchFn = fakeFetch(data, opts);
  const client = new StudipClient(HOST, fetchFn, { pause: 0, retryDelayMs: 0 });
  const backup = new Backup(client);
  return { data, fetchFn, client, backup };
}

test('Helfer: Namen, Semester, Host, Dateitypen, Übersetzungen', () => {
  assert.strictEqual(clean('a/b:c   d. '), 'a_b_c d');
  assert.strictEqual(clean('CON'), '_CON');
  assert.strictEqual(cleanFilename('x'.repeat(200) + '.pdf').length, 120);
  assert.ok(semesterKey('WiSe 2017/18') > semesterKey('SoSe 2017'));
  assert.strictEqual(normalizeHost('studip.uni-goettingen.de/'), 'https://studip.uni-goettingen.de');
  assert.strictEqual(normalizeHost('https://x.de/studip/dispatch.php/start'), 'https://x.de/studip');
  assert.strictEqual(categoryOf('Folien.PPTX'), 'slides');
  assert.strictEqual(categoryOf('a.Rmd'), 'code');
  assert.strictEqual(categoryOf('ohne-endung'), 'other');
  assert.ok(passes({ cat: 'documents', size: 10 }, { categories: ['documents'], maxBytes: 20 }));
  assert.ok(!passes({ cat: 'documents', size: 30 }, { categories: ['documents'], maxBytes: 20 }));
  assert.ok(!passes({ cat: 'videos', size: 1 }, { categories: ['documents'] }));
  assert.strictEqual(formatBytes(1.5e9, 'en-GB'), '1.5 GB');
  const de = i18n.create('de');
  const en = i18n.create('en');
  assert.strictEqual(de.n('file', 1), '1 Datei');
  assert.strictEqual(en.n('file', 2), '2 files');
  assert.strictEqual(en.err({ key: 'err.folderForbidden', vars: { folder: '' } }), 'Folder “main folder” is only visible to teachers');
  assert.strictEqual(i18n.pickLanguage('de-AT'), 'de');
  assert.strictEqual(i18n.pickLanguage('it-IT'), 'en');
  // Beide Sprachen haben dieselben Schlüssel
  assert.deepStrictEqual(Object.keys(i18n.strings.en).sort(), Object.keys(i18n.strings.de).sort());
});

test('Beschreibungen werden sicher als HTML dargestellt', () => {
  const plain = richText('Hallo\n\nSiehe <https://a.de/x> und [Skript]https://b.de\n<script>alert(1)</script>');
  assert.match(plain, /<a href="https:\/\/a\.de\/x"/);
  assert.match(plain, /<a href="https:\/\/b\.de"[^>]*>Skript<\/a>/);
  assert.ok(!/<script/i.test(plain));
  const html = sanitizeHtml('<p onclick="x()">Hi <a href="javascript:alert(1)">bad</a> <a href="https://ok.de">ok</a><script>evil()</script><img src=x onerror=alert(1)></p>');
  assert.ok(!/onclick|javascript:|<script|<img|evil/i.test(html), html);
  assert.match(html, /<a href="https:\/\/ok\.de" target="_blank" rel="noopener">ok<\/a>/);
});

test('Login-Prüfung erkennt fehlende Sitzung', async () => {
  const { client } = await setup({ loggedIn: false });
  await assert.rejects(client.me(), SessionExpired);
});

test('Einlesen: Ordnerbaum, Paging, doppelte Namen, gesperrte Kurse, Aufzeichnungen', async () => {
  const { client, backup } = await setup();
  const me = await client.me();
  const plan = await backup.scan(me.id);
  assert.strictEqual(plan.opencast.available, true);

  const c1 = plan.areas.find((a) => a.id === 'c1');
  assert.strictEqual(c1.label, '4711 Statistik I');
  assert.strictEqual(c1.semester, 'WiSe 2020/21');
  assert.deepStrictEqual(c1.files.map((f) => f.parts.join('/')).sort(), ['Folien_Teil 1/x (f3abcd).pdf', 'Folien_Teil 1/x.pdf', 'intro.mp4', 'syllabus.pdf'].sort());
  assert.strictEqual(c1.files.find((f) => f.parts.at(-1) === 'intro.mp4').cat, 'videos');

  // Aufzeichnungen: v1 erlaubt, v2 ohne Downloads ausgelassen, v3 in gesperrter Liste
  assert.deepStrictEqual(c1.recordings.map((r) => [r.token, r.allowed]), [['v1', true], ['v3', false]]);
  const v1 = c1.recordings[0];
  assert.deepStrictEqual(v1.variants.map((v) => [v.source, v.low.key, v.high.key]), [['presentation', '2000', '2000'], ['presenter', '1000', '5000']]);

  const c3 = plan.areas.find((a) => a.id === 'c3');
  assert.deepStrictEqual(c3.errors, [{ key: 'err.areaForbidden' }]);
  const c2 = plan.areas.find((a) => a.id === 'c2');
  assert.deepStrictEqual(c2.errors, [{ key: 'err.folderForbidden', vars: { folder: 'Abgaben' } }]);
  assert.ok(!plan.areas.some((a) => a.id === '__personal'), 'leere "Meine Dateien" werden ausgeblendet');
});

test('Schnelles Einlesen: Sammelrouten, Live-Ereignisse und Rückfallweg', async () => {
  const { data, fetchFn, backup } = await setup();
  const seen = { courses: null, areas: [] };
  backup.on('courses', (list) => (seen.courses = list));
  backup.on('area', (a) => seen.areas.push(a));
  await backup.scan('u1', { concurrency: 3 });
  // Überblick kommt sofort, bevor ein Kurs eingelesen ist
  assert.deepStrictEqual(seen.courses.map((a) => [a.id, a.scanned]), [['c1', false], ['c3', false], ['c2', false], ['__personal', false]]);
  assert.strictEqual(seen.areas.length, 4);
  assert.ok(seen.areas.every((a) => a.scanned));
  assert.deepStrictEqual(seen.areas.find((a) => a.id === 'c1').files.length, 4);
  // keine Anfragen pro Ordner
  assert.ok(!fetchFn.calls.some((c) => /\/folders\/\w+\/(folders|file-refs)/.test(c)), fetchFn.calls.join('\n'));

  // Ältere Stud.IP-Version ohne Sammelroute: ordnerweise wie bisher
  delete data.lists['courses/c1/file-refs'];
  const plan = await backup.scan('u1');
  const c1 = plan.areas.find((a) => a.id === 'c1');
  assert.deepStrictEqual(c1.files.map((f) => f.parts.join('/')).sort(), ['Folien_Teil 1/x (f3abcd).pdf', 'Folien_Teil 1/x.pdf', 'intro.mp4', 'syllabus.pdf'].sort());
});

test('Sichern mit Filter, Aufzeichnungen, Kursseiten, Übersicht und Fortsetzen', async () => {
  const { fetchFn, client, backup } = await setup();
  const plan = await backup.scan('u1');
  const target = tmpdir();
  const events = [];
  backup.on('progress', (p) => events.push(p));
  const stats = await backup.run(plan, {
    target,
    areaIds: ['c1', 'c2', 'c3'],
    includeMessages: true,
    filter: { categories: ['documents', 'sheets', 'slides'], maxBytes: 4 },
    recordings: { quality: 'low' },
    lang: 'de',
  });
  // syllabus.pdf (5 B) ist zu groß, intro.mp4 ist ein Video → beide gefiltert
  assert.strictEqual(stats.filtered, 2);
  assert.strictEqual(stats.failed, 0);
  const course = path.join(target, 'WiSe 2020_21', '4711 Statistik I');
  assert.ok(!fs.existsSync(path.join(course, 'syllabus.pdf')));
  assert.strictEqual(read(course, 'Folien_Teil 1', 'x (f3abcd).pdf'), 'abcd');
  assert.strictEqual(read(target, 'SoSe 2019', '0815 Ökonometrie', 'daten.csv'), 'a;b\n');

  // Aufzeichnungen in niedriger Qualität; v3 (gesperrt) wurde nicht angefragt
  assert.strictEqual(read(course, '_Aufzeichnungen', '2021-04-20 Sitzung 1 (Vortrag).mp4'), 'v1-presenter-1000');
  assert.strictEqual(read(course, '_Aufzeichnungen', '2021-04-20 Sitzung 1 (Bildschirm).mp4'), 'v1-presentation-2000');
  assert.ok(!fetchFn.calls.some((c) => c.includes('/download/v3/')));

  // Kursseite mit Details
  const page = read(course, '_Kursinfo.html');
  assert.match(page, /Prof\. Dr\. Erika Muster/);
  assert.match(page, /Professur für Statistik/);
  assert.match(page, /Vorlesung/);
  assert.match(page, /Di\. 16:00 - 18:00, ZHG 011/);
  assert.match(page, /fällt aus/);
  assert.match(page, /href="https:\/\/example\.org\/info"/);
  assert.ok(!/<script/i.test(page));
  assert.match(page, /<a href="Folien_Teil%201\/x%20\(f3abcd\)\.pdf">/);
  assert.match(page, /syllabus\.pdf <span class="size">[^<]+<\/span> <span class="badge">nicht gesichert/);
  assert.match(page, /Geheime Sitzung[^]*Aufzeichnung darf nicht heruntergeladen werden/);
  assert.match(page, /href="\.\.\/\.\.\/_%C3%9Cbersicht\.html"/);
  const page2 = read(target, 'SoSe 2019', '0815 Ökonometrie', '_Kursinfo.html');
  assert.match(page2, /<strong>HTML<\/strong>/);
  assert.ok(!/<script|onerror/i.test(page2));

  // Übersicht und Nachrichten
  const overview = read(target, '_Übersicht.html');
  assert.match(overview, /href="WiSe%202020_21\/4711%20Statistik%20I\/_Kursinfo\.html"/);
  assert.match(overview, /_Nachrichten\/Nachrichten\.html/);
  assert.match(read(target, '_Nachrichten', 'Nachrichten.html'), /Text&amp;mehr/);
  assert.match(read(target, '_fehler.txt'), /Gesperrt: Dateibereich ist für dich nicht freigegeben/);
  assert.strictEqual(stats.overview, path.join(target, '_Übersicht.html'));

  const last = events.filter((e) => e.phase === 'download').pop();
  assert.strictEqual(last.filesTotal, 5); // 2 Dateien c1 + 1 Datei c2 + 2 Aufzeichnungsspuren
  assert.ok(events.some((e) => e.phase === 'details'));

  // Zweiter Lauf: nichts wird neu geladen
  fetchFn.calls.length = 0;
  const again = await backup.run(plan, { target, areaIds: ['c1', 'c2'], includeMessages: false, filter: { categories: ['documents', 'sheets'], maxBytes: 4 }, recordings: { quality: 'low' } });
  assert.strictEqual(again.downloaded, 0);
  assert.strictEqual(again.skipped, 5);
  assert.ok(!fetchFn.calls.some((r) => r.includes('/content') || r.includes('/download/')));
  // Übersicht verlinkt die Nachrichten weiterhin
  assert.match(read(target, '_Übersicht.html'), /_Nachrichten\/Nachrichten\.html/);
});

test('Geänderte Dateien werden neu geladen, die alte Fassung bleibt erhalten', async () => {
  const { data, backup } = await setup();
  let plan = await backup.scan('u1');
  const target = tmpdir();
  const first = await backup.run(plan, { target, areaIds: ['c1'], includeMessages: false });
  assert.strictEqual(first.downloaded, 4);
  const dir = path.join(target, 'WiSe 2020_21', '4711 Statistik I', 'Folien_Teil 1');

  // Lehrende ersetzt x.pdf durch neue Fassung gleicher Größe; bei syllabus.pdf ändert sich nur die Beschreibung
  const refsA = data.lists['folders/a/file-refs'];
  refsA[0].attributes.chdate = '2021-06-01T09:00:00+02:00';
  data.contents.f2 = 'xyz';
  data.lists['folders/r1/file-refs'][0].attributes.chdate = '2021-06-02T09:00:00+02:00';

  plan = await backup.scan('u1');
  const second = await backup.run(plan, { target, areaIds: ['c1'], includeMessages: false });
  assert.strictEqual(second.updated, 1);
  assert.strictEqual(second.downloaded, 0);
  assert.strictEqual(second.skipped, 3);
  assert.strictEqual(read(dir, 'x.pdf'), 'xyz');
  assert.strictEqual(read(dir, 'x (Version vom 2021-05-03).pdf'), 'abc');
  // nur Metadaten geändert → keine zusätzliche Kopie
  const names = fs.readdirSync(path.join(target, 'WiSe 2020_21', '4711 Statistik I'));
  assert.ok(!names.some((n) => /syllabus \(Version/.test(n)), names.join(', '));
  assert.strictEqual(fs.statSync(path.join(dir, 'x.pdf')).mtime.toISOString(), '2021-06-01T07:00:00.000Z');

  // dritter Lauf: alles aktuell
  const third = await backup.run(plan, { target, areaIds: ['c1'], includeMessages: false });
  assert.strictEqual(third.updated + third.downloaded, 0);
});

test('Englische Ausgabe verwendet englische Ordner- und Seitennamen', async () => {
  const { backup } = await setup();
  const plan = await backup.scan('u1');
  const target = tmpdir();
  await backup.run(plan, { target, areaIds: ['c1'], includeMessages: true, recordings: { quality: 'high' }, lang: 'en' });
  const course = path.join(target, 'WiSe 2020_21', '4711 Statistik I');
  assert.ok(fs.existsSync(path.join(course, '_Course info.html')));
  assert.strictEqual(read(course, '_Recordings', '2021-04-20 Sitzung 1 (presenter).mp4'), 'v1-presenter-5000');
  assert.ok(fs.existsSync(path.join(target, '_Overview.html')));
  assert.ok(fs.existsSync(path.join(target, '_Messages', 'Inbox')));
  assert.match(read(course, '_Course info.html'), /Teachers/);
});

test('Abbrechen beendet den Lauf sauber und schreibt trotzdem die Seiten', async () => {
  const { client, backup } = await setup();
  const plan = await backup.scan('u1');
  const target = tmpdir();
  backup.on('progress', (p) => {
    if (p.phase === 'download') client.cancel();
  });
  const stats = await backup.run(plan, { target, areaIds: ['c1'], includeMessages: true });
  assert.strictEqual(stats.cancelled, true);
  assert.ok(stats.downloaded < 4);
  assert.ok(fs.existsSync(path.join(target, '_Übersicht.html')));
});
