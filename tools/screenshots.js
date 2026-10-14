'use strict';
/**
 * Erzeugt die Bilder fürs README (docs/*.png) mit erfundenen Beispieldaten.
 * Aufruf: npx electron tools/screenshots.js   (Linux ohne Bildschirm: xvfb-run npx electron …)
 */
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDemoData, respond } = require('../test/mockStudip');

const OUT = path.join(__dirname, '..', 'docs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kurshamster-shots-'));
app.setPath('userData', path.join(tmp, 'user'));
app.setPath('documents', path.join(tmp, 'docs'));
fs.mkdirSync(path.join(tmp, 'user'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'user', 'settings.json'), JSON.stringify({ lang: process.env.KH_LANG || 'de', autoUpdate: false }));
const FAKE_HOST = 'studip.beispiel-uni.de';
const FAKE_DIR = '/Users/mia/Documents/KursHamster';

const data = createDemoData();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const loggedIn = /(^|;\s*)Studip_Session=geheim/.test(req.headers.cookie || '');
  if (u.pathname === '/') {
    res.writeHead(302, { location: '/dispatch.php/login' });
    return res.end();
  }
  if (u.pathname === '/dispatch.php/login') {
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'Studip_Session=geheim; Path=/; HttpOnly; SameSite=Lax' });
    return res.end('<html><head><meta http-equiv="refresh" content="0;url=/dispatch.php/start"></head></html>');
  }
  if (u.pathname.startsWith('/dispatch.php/')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<html><body>Start</body></html>');
  }
  const r = respond(data, u, { loggedIn, pageSize: 100 });
  res.writeHead(r.status, r.headers);
  res.end(r.body);
});

require('../src/main/main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return;
    await sleep(200);
  }
  throw new Error('Zeitüberschreitung');
}

app.whenReady().then(async () => {
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const host = `http://127.0.0.1:${server.address().port}`;
    await waitFor(() => BrowserWindow.getAllWindows().length > 0);
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1080, 1180);
    if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (w, name) => {
      await sleep(500);
      fs.writeFileSync(path.join(OUT, name), (await w.webContents.capturePage()).toPNG());
      console.log('→ docs/' + name);
    };
    fs.mkdirSync(OUT, { recursive: true });
    const suffix = process.env.KH_LANG === 'en' ? '-en' : '';

    await js(`(() => { const s = document.getElementById('hostSelect'); s.value = 'custom'; s.dispatchEvent(new Event('change'));
      document.getElementById('customHost').value = ${JSON.stringify(host)}; document.getElementById('loginBtn').click(); return true; })()`);
    await waitFor(() => js(`!document.getElementById('selection').hidden && !document.getElementById('scanBtn').disabled`));
    // Anzeige wie bei einer echten Hochschule
    await js(`(() => {
      const ok = document.getElementById('loginOk'); ok.textContent = ok.textContent.replace(/\\(127\\.0\\.0\\.1:\\d+\\)/, '(${FAKE_HOST})');
      document.getElementById('targetPath').textContent = ${JSON.stringify(FAKE_DIR)};
      document.querySelectorAll('.semester')[0].open = true;
      document.querySelector('.footer, footer').style.display = 'none';
      return true; })()`);
    await shot(win, `app${suffix}.png`);

    if (!suffix) {
      await js(`document.getElementById('startBtn').click(), true`);
      await waitFor(() => js(`!document.getElementById('resultBox').hidden`), 30000);
      const target = path.join(tmp, 'docs', 'KursHamster');
      const viewer = new BrowserWindow({ width: 1000, height: 820, show: true });
      const fix = `document.body.innerHTML = document.body.innerHTML.replace(/127\\.0\\.0\\.1:\\d+/g, '${FAKE_HOST}'); true`;
      await viewer.loadFile(path.join(target, '_Übersicht.html'));
      await viewer.webContents.executeJavaScript(fix);
      await shot(viewer, 'uebersicht.png');
      await viewer.loadFile(path.join(target, 'WiSe 2021_22', '800123 Ökonometrie I', '_Kursinfo.html'));
      await viewer.webContents.executeJavaScript(fix);
      await shot(viewer, 'kursseite.png');
      viewer.destroy();
    }
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
