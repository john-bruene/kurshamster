'use strict';
/**
 * Updates über GitHub-Releases.
 *  - Windows: vollautomatisch mit electron-updater (lädt im Hintergrund, installiert beim Neustart).
 *  - Mac/Linux: Hinweis auf die neue Version mit Download-Link. Automatisches Installieren
 *    verlangt auf dem Mac eine Apple-Signatur (Developer ID), die das Projekt noch nicht hat.
 */
const { app, net, shell } = require('electron');

function cmpVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

class Updater {
  constructor({ repo, send }) {
    this.repo = repo || '';
    this.send = send;
    this.state = { status: 'idle' };
    this.manual = false;
    this.wired = false;
  }

  enabled() {
    return app.isPackaged && /^[\w.-]+\/[\w.-]+$/.test(this.repo) && !/^OWNER\//.test(this.repo);
  }

  emit(state) {
    this.state = state;
    this.send(state);
  }

  async check({ manual = false } = {}) {
    this.manual = manual;
    if (!this.enabled()) {
      if (manual) this.emit({ status: 'none' });
      return;
    }
    if (process.platform === 'win32') return this.checkWindows();
    return this.checkGithub();
  }

  async checkGithub() {
    try {
      const r = await net.fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KursHamster' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rel = await r.json();
      const version = String(rel.tag_name || '').replace(/^v/i, '');
      if (version && cmpVersions(version, app.getVersion()) > 0) {
        const pattern = process.platform === 'darwin' ? /\.dmg$/i : /\.AppImage$/i;
        const asset = (rel.assets || []).find((a) => pattern.test(a.name));
        this.emit({ status: 'available', version, url: asset ? asset.browser_download_url : rel.html_url });
      } else if (this.manual) {
        this.emit({ status: 'none' });
      }
    } catch {
      if (this.manual) this.emit({ status: 'error' });
    }
  }

  checkWindows() {
    const { autoUpdater } = require('electron-updater');
    if (!this.wired) {
      this.wired = true;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('update-available', (info) => this.emit({ status: 'downloading', version: info.version, percent: 0 }));
      autoUpdater.on('download-progress', (p) => this.emit({ status: 'downloading', version: this.state.version, percent: Math.round(p.percent || 0) }));
      autoUpdater.on('update-downloaded', (info) => this.emit({ status: 'ready', version: info.version }));
      autoUpdater.on('update-not-available', () => this.manual && this.emit({ status: 'none' }));
      autoUpdater.on('error', () => this.manual && this.emit({ status: 'error' }));
    }
    autoUpdater.checkForUpdates().catch(() => this.manual && this.emit({ status: 'error' }));
  }

  /** Klick auf den Knopf im Update-Hinweis. */
  act() {
    if (this.state.status === 'ready' && process.platform === 'win32') {
      require('electron-updater').autoUpdater.quitAndInstall();
    } else if (this.state.status === 'available' && this.state.url) {
      shell.openExternal(this.state.url);
    }
  }
}

module.exports = { Updater, cmpVersions };
