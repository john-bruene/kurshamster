'use strict';
/**
 * Videos aus dem Reiter „Medien“ (Stud.IP-Plugin „MediaCast“ von data-quest).
 * In Göttingen liegen dort die meisten Vorlesungsaufzeichnungen der Jahre 2017–2023.
 *
 * Das Plugin hat keine JSON-Schnittstelle; die Liste kommt aus der Seite
 *   /plugins.php/mediacastplugin/media/index?cid=…
 * Einen Download-Link („Herunterladen“) zeigt Stud.IP nur bei Videos, die die Lehrenden
 * dafür freigegeben haben. Genau diese – und nur diese – lädt KursHamster herunter.
 * Alle anderen werden mit Titel, Datum und Link zum Abspielen auf der Kursseite aufgeführt.
 */

const BASE = '/plugins.php/mediacastplugin';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

const stripTags = (s) =>
  decodeEntities(
    String(s || '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();

function toBytes(num, unit) {
  const n = Number(String(num).replace(',', '.'));
  if (isNaN(n)) return null;
  return Math.round(n * ({ KB: 1e3, MB: 1e6, GB: 1e9 }[unit.toUpperCase()] || 1e6));
}

/** dd.mm.yyyy → yyyy-mm-dd (andere Formate bleiben leer) */
function isoDate(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Liest die Medienliste eines Kurses aus dem HTML der Plugin-Seite. */
function parseMediaIndex(html, host, courseId) {
  const out = [];
  const seen = new Set();
  for (const chunk of String(html || '').split('class="thumb-container"').slice(1)) {
    // Abspielbare Videos haben einen Player-Link, reine Download-Dateien (z. B. .avi) nur Info- und Download-Link
    const mid = (/\/media\/(?:player|meta)\/([0-9a-f]{32})/.exec(chunk) || /\/media\/check\/[0-9a-f]+\/([0-9a-f]{32})\//.exec(chunk) || [])[1];
    if (!mid || seen.has(mid)) continue;
    seen.add(mid);
    const titleMatch = /class="media-table-infos">\s*<div>([\s\S]*?)<a [^>]*href="[^"]*\/media\/meta\//.exec(chunk);
    const title = (titleMatch && stripTags(titleMatch[1])) || mid;
    const dateText = (/<div>\s*(\d{1,2}[./]\d{1,2}[./]\d{4})\s*<\/div>/.exec(chunk) || [])[1] || '';
    const duration = (/(\d+(?::\d{2}){1,2})\s*Min/.exec(chunk) || [])[1] || '';
    const sizeMatch = /([\d.,]+)\s*(KB|MB|GB)\b/.exec(chunk);
    const size = sizeMatch ? toBytes(sizeMatch[1], sizeMatch[2]) : null;
    const dl = /<a href="([^"]*\/media\/check\/[^"]+)"\s+download/.exec(chunk);
    let downloadUrl = null;
    let ext = 'mp4';
    if (dl) {
      downloadUrl = decodeEntities(dl[1]);
      if (downloadUrl.startsWith('/')) downloadUrl = host + downloadUrl;
      const v = /[?&]v=([^&]+)/.exec(downloadUrl);
      const fromName = /\.([a-z0-9]{2,5})$/i.exec(v ? decodeURIComponent(v[1]) : '') || /\.([a-z0-9]{2,5})$/i.exec(title);
      if (fromName) ext = fromName[1].toLowerCase();
    } else {
      const fromTitle = /\.(mp4|m4v|mov|avi|mkv|webm|mp3|m4a|wav)$/i.exec(title);
      if (fromTitle) ext = fromTitle[1].toLowerCase();
    }
    const variant = { key: 'media', size, url: downloadUrl, downloadUrl };
    out.push({
      provider: 'mediacast',
      token: mid,
      title,
      created: isoDate(dateText),
      dateText,
      duration,
      allowed: !!downloadUrl,
      streamUrl: `${host}${BASE}/media/player/${mid}?cid=${encodeURIComponent(courseId)}`,
      variants: [{ source: 'media', low: variant, high: variant, ext }],
    });
  }
  return out;
}

class MediaCast {
  constructor(client) {
    this.client = client;
    this.installed = true; // bis eine Anfrage 404 („Plugin gibt es hier nicht“) liefert
  }

  async listCourse(courseId) {
    if (!this.installed) return [];
    const res = await this.client.getPluginText(`${BASE}/media/index?cid=${encodeURIComponent(courseId)}`);
    if (!res) return [];
    if (res.status === 404) {
      this.installed = false;
      return [];
    }
    if (res.status !== 200 || !res.text.includes('thumb-container')) return [];
    return parseMediaIndex(res.text, this.client.host, courseId);
  }
}

module.exports = { MediaCast, parseMediaIndex, isoDate };
