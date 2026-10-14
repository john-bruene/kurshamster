'use strict';
/**
 * Vorlesungsaufzeichnungen aus dem Stud.IP-Opencast-Plugin (elan-ev, „OpencastV3“).
 *
 * - Plugin vorhanden?          GET /plugins.php/opencastv3/api/config/simple
 * - Wiedergabelisten des Kurses GET /plugins.php/opencastv3/api/courses/{cid}/playlists
 * - Videos einer Liste         GET /plugins.php/opencastv3/api/playlists/{token}/videos?cid=…
 * - Download                   GET /plugins.php/opencastv3/redirect/download/{token}/{quelle}/{index}
 *
 * Downloads werden nur angeboten, wenn sie erlaubt sind: global (OPENCAST_MEDIADOWNLOAD)
 * und pro Wiedergabeliste (allow_download) – genau wie in der Stud.IP-Oberfläche.
 */
const { SessionExpired, Cancelled } = require('./client');

const BASE = '/plugins.php/opencastv3';
const SOURCES = ['presentation', 'presenter'];

function truthy(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return null;
}

class Opencast {
  constructor(client) {
    this.client = client;
    this.available = false;
    this.mediadownload = 'allow';
  }

  async detect() {
    const cfg = await this.client.getPluginJson(`${BASE}/api/config/simple`);
    this.available = !!(cfg && typeof cfg === 'object' && (cfg.server || cfg.settings));
    const md = cfg && cfg.settings && cfg.settings.OPENCAST_MEDIADOWNLOAD;
    if (md) this.mediadownload = String(md);
    return this.available;
  }

  isAllowed(playlistSetting, video) {
    if (video && (video.perm === 'owner' || video.perm === 'write')) return true;
    if (this.mediadownload === 'never') return false;
    const p = truthy(playlistSetting);
    if (p !== null) return p;
    return this.mediadownload === 'allow';
  }

  async paged(path, courseId) {
    const out = [];
    for (let offset = 0; offset < 5000; ) {
      const sep = path.includes('?') ? '&' : '?';
      const doc = await this.client.getPluginJson(`${path}${sep}cid=${encodeURIComponent(courseId)}&offset=${offset}&limit=50`);
      const vids = (doc && Array.isArray(doc.videos) && doc.videos) || [];
      out.push(...vids);
      const count = Number(doc && doc.count) || 0;
      offset += vids.length;
      if (!vids.length || offset >= count) break;
    }
    return out;
  }

  /** Alle Aufzeichnungen eines Kurses mit Download-Varianten. */
  async listCourse(courseId) {
    if (!this.available) return [];
    const byToken = new Map();
    const add = (v, allowed, playlist) => {
      if (!v || !v.token) return;
      const prev = byToken.get(v.token);
      if (prev) {
        prev.allowed = prev.allowed || allowed;
        return;
      }
      byToken.set(v.token, { video: v, allowed, playlist });
    };

    let lists = null;
    try {
      const pl = await this.client.getPluginJson(`${BASE}/api/courses/${courseId}/playlists`);
      lists = pl && (Array.isArray(pl) ? pl : Array.isArray(pl.playlists) ? pl.playlists : null);
    } catch (e) {
      if (e instanceof SessionExpired || e instanceof Cancelled) throw e;
    }
    if (lists) {
      for (const p of lists) {
        if (p.videos_count != null && Number(p.videos_count) === 0) continue;
        const vids = await this.paged(`${BASE}/api/playlists/${encodeURIComponent(p.token)}/videos`, courseId);
        for (const v of vids) add(v, this.isAllowed(p.allow_download, v), p.title);
      }
    } else {
      const vids = await this.paged(`${BASE}/api/courses/${courseId}/videos`, courseId);
      for (const v of vids) add(v, this.isAllowed(null, v), null);
    }

    const out = [];
    for (const { video: v, allowed } of byToken.values()) {
      if (v.trashed === true || v.trashed === '1' || v.video_user_available === false || truthy(v.available) === false) continue;
      let pub = v.publication;
      if (typeof pub === 'string') {
        try {
          pub = JSON.parse(pub);
        } catch {
          pub = null;
        }
      }
      const downloads = pub && pub.downloads;
      if (!downloads) continue; // noch nicht verarbeitet oder defekt
      const variants = [];
      for (const source of SOURCES) {
        const d = downloads[source];
        if (!d || typeof d !== 'object') continue;
        const entries = Object.entries(d)
          .map(([key, m]) => ({ key, size: Number(key) || null, url: m && m.url, info: (m && m.info) || '' }))
          .filter((m) => m.url);
        if (!entries.length) continue;
        entries.sort((a, b) => (a.size || 0) - (b.size || 0));
        const ext = (/\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(entries[0].url) || [])[1] || 'mp4';
        variants.push({ source, low: entries[0], high: entries[entries.length - 1], ext: ext.toLowerCase() });
      }
      if (!variants.length) continue;
      out.push({
        token: v.token,
        title: String(v.title || v.token).trim(),
        created: v.created || null,
        presenters: v.presenters || '',
        duration: Number(v.duration) || null,
        allowed,
        variants,
      });
    }
    out.sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
    return out;
  }

  downloadUrl(token, source, key) {
    return `${this.client.host}${BASE}/redirect/download/${encodeURIComponent(token)}/${encodeURIComponent(source)}/${encodeURIComponent(key)}`;
  }
}

/** Gesamtgröße einer Aufzeichnung in der gewählten Qualität. */
function recordingSize(rec, quality) {
  return rec.variants.reduce((s, v) => s + ((quality === 'low' ? v.low : v.high).size || 0), 0);
}

module.exports = { Opencast, recordingSize };
