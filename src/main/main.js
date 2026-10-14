'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, session, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { StudipClient, SessionExpired, Cancelled, normalizeHost } = require('../core/client');
const { Backup } = require('../core/backup');
const { Updater } = require('./updater');
const i18n = require('../shared/i18n');
const pkg = require('../../package.json');

// Eigene, dauerhafte Browser-Sitzung nur für Stud.IP (getrennt vom App-Fenster)
const PARTITION = 'persist:studip';
const ses = () => session.fromPartition(PARTITION);

let mainWin = null;
let loginWin = null;
let cookieMode = 'session';
const state = { client: null, me: null, plan: null, backup: null, running: false };
let updater = null;

// ------------------------------------------------------------------ Einstellungen

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}
function currentLang() {
  const l = loadSettings().lang;
  return i18n.languages.includes(l) ? l : i18n.pickLanguage(app.getLocale());
}
const tr = () => i18n.create(currentLang());

function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
  } catch {}
  return s;
}

// ------------------------------------------------------------------ Netzwerk über die Login-Sitzung

/**
 * Alle API-Anfragen laufen über die Sitzung des Login-Fensters.
 * Normalerweise sendet Chromium die Cookies selbst ("session"); falls eine
 * Electron-Version das nicht tut, setzen wir den Cookie-Header selbst ("manual").
 */
async function studipFetch(url, init = {}) {
  if (cookieMode === 'session') return ses().fetch(url, { ...init, credentials: 'include' });
  const cookies = await ses().cookies.get({ url });
  const headers = { ...(init.headers || {}), Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
  return ses().fetch(url, { ...init, credentials: 'omit', headers });
}

async function probeLogin(client) {
  for (const mode of ['session', 'manual']) {
    cookieMode = mode;
    try {
      const me = await client.me();
      if (process.env.STUDIP_DEBUG) console.log(`[studip] angemeldet, Cookie-Modus: ${mode}`);
      return me;
    } catch {}
  }
  cookieMode = 'session';
  return null;
}

/** Ein normaler Chrome-User-Agent, damit Anmeldeseiten (SSO) die App nicht ablehnen. */
function browserUserAgent() {
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}

/** Erlaubt sind https-Seiten; http nur für lokale Testserver. */
function isAllowedUrl(url) {
  return /^https:\/\//i.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url);
}

function send(channel, payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

/** IPC-Handler, die Fehler als { ok:false } zurückgeben statt zu werfen. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      const code = e instanceof SessionExpired ? 'session' : e instanceof Cancelled ? 'cancelled' : e.code || 'error';
      return { ok: false, code, error: e.message || String(e) };
    }
  });
}

// ------------------------------------------------------------------ Fenster

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: 'KursHamster',
    backgroundColor: '#f6f5f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWin.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWin.on('close', (e) => {
    if (!state.running) return;
    const t = tr();
    const choice = dialog.showMessageBoxSync(mainWin, {
      type: 'question',
      buttons: [t('step3.keepRunning'), t('step3.quit')],
      defaultId: 0,
      cancelId: 0,
      message: t('step3.runningClose'),
      detail: t('step3.runningCloseDetail'),
    });
    if (choice === 0) e.preventDefault();
    else state.client && state.client.cancel();
  });
  mainWin.on('closed', () => {
    mainWin = null;
  });
}

function openLoginWindow(host) {
  return new Promise((resolve, reject) => {
    let done = false;
    loginWin = new BrowserWindow({
      parent: mainWin,
      modal: process.platform !== 'darwin',
      width: 940,
      height: 780,
      title: tr()('login.windowTitle'),
      webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const wc = loginWin.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (isAllowedUrl(url)) wc.loadURL(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (!isAllowedUrl(url)) e.preventDefault();
    });
    let checking = false;
    const check = async () => {
      if (done || checking) return;
      checking = true;
      const me = await probeLogin(state.client).finally(() => {
        checking = false;
      });
      if (me && !done) {
        done = true;
        clearInterval(timer);
        resolve(me);
        if (loginWin && !loginWin.isDestroyed()) loginWin.close();
      }
    };
    const timer = setInterval(check, 4000);
    wc.on('did-finish-load', check);
    wc.on('did-navigate-in-page', check);
    loginWin.on('closed', () => {
      clearInterval(timer);
      loginWin = null;
      if (!done) {
        done = true;
        const err = new Error(tr()('login.aborted'));
        err.code = 'aborted';
        reject(err);
      }
    });
    loginWin.loadURL(host + '/');
  });
}

// ------------------------------------------------------------------ IPC

handle('version', () => pkg.version);
handle('settings', () => ({ ...loadSettings(), lang: currentLang() }));
handle('set-language', (lang) => {
  if (!i18n.languages.includes(lang)) throw new Error('unknown language');
  saveSettings({ lang });
  return lang;
});

handle('login', async (host) => {
  host = normalizeHost(host);
  saveSettings({ host });
  state.client = new StudipClient(host, studipFetch);
  state.plan = null;
  let me = await probeLogin(state.client);
  if (!me) me = await openLoginWindow(host);
  state.me = me;
  return { id: me.id, name: (me.attributes && me.attributes['formatted-name']) || me.id, host };
});

handle('logout', async () => {
  if (state.client) state.client.cancel();
  await ses().clearStorageData();
  Object.assign(state, { client: null, me: null, plan: null, backup: null });
  return true;
});

handle('scan', async () => {
  if (!state.client || !state.me) throw new SessionExpired();
  const backup = new Backup(state.client);
  backup.on('progress', (p) => send('progress', p));
  state.plan = await backup.scan(state.me.id);
  return {
    opencast: state.plan.opencast,
    areas: state.plan.areas.map((a) => ({
      id: a.id,
      kind: a.kind,
      label: a.label,
      title: a.title,
      number: a.number,
      semester: a.semester,
      fileCount: a.files.length,
      bytes: a.bytes,
      errors: a.errors,
      // kompakt für die Live-Berechnung der Filter: [Größe, Kategorie]
      files: a.files.map((f) => [f.size, f.cat]),
      recordings: (a.recordings || [])
        .filter((r) => r.allowed)
        .map((r) => [
          r.variants.reduce((s, v) => s + (v.high.size || 0), 0),
          r.variants.reduce((s, v) => s + (v.low.size || 0), 0),
        ]),
    })),
  };
});

handle('start', async ({ areaIds, includeMessages, target, filter, recordings }) => {
  const t = tr();
  if (!state.client || !state.plan) throw new Error(t('step3.scanFirst'));
  if (state.running) throw new Error(t('step3.alreadyRunning'));
  saveSettings({ target, filter, recordings, includeMessages });
  const backup = new Backup(state.client);
  backup.on('progress', (p) => send('progress', p));
  state.running = true;
  const blocker = powerSaveBlocker.start('prevent-app-suspension');
  try {
    const stats = await backup.run(state.plan, { target, areaIds, includeMessages, filter, recordings, lang: currentLang() });
    return { ...stats, errorCount: stats.errors.length, errors: stats.errors.slice(0, 300) };
  } finally {
    state.running = false;
    powerSaveBlocker.stop(blocker);
  }
});

handle('cancel', () => {
  if (state.client) state.client.cancel();
  return true;
});

handle('default-folder', () => loadSettings().target || path.join(app.getPath('documents'), 'KursHamster'));

handle('choose-folder', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: tr()('step3.chooseTitle'),
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

handle('open-folder', async (p) => {
  fs.mkdirSync(p, { recursive: true });
  const err = await shell.openPath(p);
  if (err) throw new Error(err);
  return true;
});

handle('open-file', async (p) => {
  if (!/\.html$/i.test(p) || !fs.existsSync(p)) throw new Error('not found');
  const err = await shell.openPath(p);
  if (err) throw new Error(err);
  return true;
});

handle('check-updates', async () => {
  if (updater) await updater.check({ manual: true });
  return true;
});
handle('update-action', () => {
  if (updater) updater.act();
  return true;
});

handle('open-link', async (url) => {
  if (!/^https:\/\//i.test(url)) throw new Error('Nur https-Links');
  await shell.openExternal(url);
  return true;
});

// ------------------------------------------------------------------ App-Lebenszyklus

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.whenReady().then(() => {
    ses().setUserAgent(browserUserAgent());
    createMainWindow();
    updater = new Updater({ repo: (pkg.kurshamster && pkg.kurshamster.updateRepo) || '', send: (s) => send('update', s) });
    setTimeout(() => updater.check().catch(() => {}), 8000);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
