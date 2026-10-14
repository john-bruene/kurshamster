'use strict';
/**
 * Ende-zu-Ende-Test der kompletten App gegen einen lokalen Schein-Stud.IP-Server:
 * Login-Fenster setzt den Sitzungs-Cookie, danach Einlesen, Filter, Aufzeichnungen,
 * Sichern, Kursseiten und Sprachwechsel über die echte Oberfläche.
 * Ausführen:  npm run test:e2e   (unter Linux ohne Bildschirm: xvfb-run npm run test:e2e)
 */
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createData, respond } = require('./mockStudip');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kurshamster-e2e-'));
app.setPath('userData', path.join(tmp, 'user'));
app.setPath('documents', path.join(tmp, 'docs'));
const SHOTS = process.env.KH_SCREENSHOTS || tmp;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(tmp, 'user'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'user', 'settings.json'), JSON.stringify({ lang: 'de' }));

// ------------------------------------------------------------ Schein-Stud.IP über HTTP

const data = createData();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const loggedIn = /(^|;\s*)Studip_Session=geheim/.test(req.headers.cookie || '');
  if (u.pathname === '/') {
    res.writeHead(302, { location: '/dispatch.php/login' });
    return res.end();
  }
  if (u.pathname === '/dispatch.php/login') {
    // simuliert das SSO: setzt den Sitzungs-Cookie und leitet weiter
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'Studip_Session=geheim; Path=/; HttpOnly; SameSite=Lax' });
    return res.end('<html><head><meta http-equiv="refresh" content="1;url=/dispatch.php/start"></head><body>Anmeldung …</body></html>');
  }
  if (u.pathname.startsWith('/dispatch.php/')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<html><body>Start</body></html>');
  }
  const r = respond(data, u, { loggedIn });
  // etwas Verzögerung beim Einlesen, damit der Live-Überblick sichtbar wird
  const delay = /\/file-refs$/.test(u.pathname) ? 700 : 0;
  setTimeout(() => {
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  }, delay);
});

// ------------------------------------------------------------ Test

require('../src/main/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 20000, what = 'Bedingung') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return;
    await sleep(200);
  }
  throw new Error('Zeitüberschreitung: ' + what);
}
function fail(msg) {
  console.error('E2E FEHLGESCHLAGEN:', msg);
  app.exit(1);
}

app.whenReady().then(async () => {
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const host = `http://127.0.0.1:${server.address().port}`;
    await waitFor(() => BrowserWindow.getAllWindows().length > 0, 10000, 'Hauptfenster');
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1100, 1000);
    if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (name) => {
      await sleep(400);
      fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG());
    };
    await sleep(300);

    await js(`(() => { const s = document.getElementById('hostSelect'); s.value = 'custom'; s.dispatchEvent(new Event('change'));
      document.getElementById('customHost').value = ${JSON.stringify(host)}; document.getElementById('loginBtn').click(); return true; })()`);
    await waitFor(() => js(`!document.getElementById('loginOk').hidden`), 20000, 'Login');
    console.log('Login:', await js(`document.getElementById('loginOk').textContent`));

    // Nach dem Login wird automatisch eingelesen – der Überblick erscheint sofort
    await waitFor(() => js(`!document.getElementById('selection').hidden`), 20000, 'Überblick');
    console.log('Überblick:', await js(`[...document.querySelectorAll('.course .meta:not(.size)')].map(e => e.textContent).join(' | ')`));
    await js(`document.getElementById('expandAll').click(), true`);
    await shot('ueberblick.png');
    await js(`document.getElementById('expandAll').click(), true`);
    await waitFor(() => js(`!document.getElementById('selection').hidden && !document.getElementById('scanBtn').disabled`), 20000, 'Einlesen');
    console.log('Auswahl:', await js(`document.getElementById('selSummary').textContent`));

    // Filter: Videos abwählen, Aufzeichnungen einschalten
    await js(`(() => { const chip = [...document.querySelectorAll('.chip-check')].find(c => /Videos/.test(c.textContent)); chip.querySelector('input').click();
      const r = document.getElementById('includeRecordings'); r.click(); document.getElementById('expandAll').click(); return true; })()`);
    console.log('Mit Filter:', await js(`document.getElementById('selSummary').textContent`));
    console.log('Gefiltert:', await js(`document.getElementById('filteredNote').textContent`));
    console.log('Aufzeichnungen:', await js(`document.getElementById('recordingsInfo').textContent`));
    await js('document.getElementById("semesterList").scrollIntoView(), true');
    await shot('auswahl.png');

    await js(`document.getElementById('startBtn').click(), true`);
    await waitFor(() => js(`!document.getElementById('resultBox').hidden`), 30000, 'Sicherung');
    console.log('Ergebnis:', await js(`document.getElementById('resultText').textContent`));
    await shot('ergebnis.png');

    const target = path.join(tmp, 'docs', 'KursHamster');
    const course = path.join(target, 'WiSe 2020_21', '4711 Statistik I');
    const expect = [
      path.join(course, 'syllabus.pdf'),
      path.join(course, '_Kursinfo.html'),
      path.join(course, '_Aufzeichnungen', '2021-04-20 Sitzung 1 (Vortrag).mp4'),
      path.join(target, 'SoSe 2019', '0815 Ökonometrie', 'daten.csv'),
      path.join(target, '_Übersicht.html'),
      path.join(target, '_Nachrichten', 'Nachrichten.html'),
    ];
    for (const p of expect) if (!fs.existsSync(p)) return fail('fehlt: ' + path.relative(target, p));
    if (fs.existsSync(path.join(course, 'intro.mp4'))) return fail('Video trotz Filter geladen');

    // Kursseite und Übersicht im Fenster ansehen (für Screenshots)
    const viewer = new BrowserWindow({ width: 1000, height: 1000, show: true });
    const vshot = async (name) => { await sleep(500); fs.writeFileSync(path.join(SHOTS, name), (await viewer.webContents.capturePage()).toPNG()); };
    await viewer.loadFile(path.join(course, '_Kursinfo.html'));
    await vshot('kursseite.png');
    await viewer.loadFile(path.join(target, '_Übersicht.html'));
    await vshot('uebersicht.png');
    viewer.destroy();

    // Sprachwechsel
    await js(`document.querySelector('.lang-btn[data-lang="en"]').click(), true`);
    await sleep(300);
    const en = await js(`document.getElementById('startBtn').textContent + ' | ' + document.getElementById('selSummary').textContent`);
    console.log('Englisch:', en);
    if (!/Start backup/.test(en)) return fail('Sprachwechsel hat nicht funktioniert');
    await js('window.scrollTo(0, 0), true');
    await shot('englisch.png');

    console.log('E2E OK – Archiv unter', target);
    console.log('Screenshots:', SHOTS);
    app.exit(0);
  } catch (e) {
    fail(e.stack || e.message);
  }
});
