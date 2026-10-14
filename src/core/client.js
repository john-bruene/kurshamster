'use strict';
/**
 * Minimaler Client für die Stud.IP-JSON:API (ab Stud.IP 4.5).
 * Die fetch-Funktion wird von außen übergeben: In der App ist das die
 * Electron-Sitzung des Login-Fensters, in den Tests ein Mock.
 */

class SessionExpired extends Error {
  constructor() {
    super('Die Stud.IP-Sitzung ist abgelaufen oder ungültig.');
    this.name = 'SessionExpired';
  }
}

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

class Cancelled extends Error {
  constructor() {
    super('Abgebrochen');
    this.name = 'Cancelled';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class StudipClient {
  /**
   * @param {string} host  z. B. https://studip.uni-goettingen.de
   * @param {(url: string, init?: object) => Promise<Response>} fetchFn
   */
  constructor(host, fetchFn, { pause = 150, pageLimit = 100, timeoutMs = 180000, retryDelayMs = 10000 } = {}) {
    this.host = normalizeHost(host);
    this.api = this.host + '/jsonapi.php/v1/';
    this.fetch = fetchFn;
    this.pause = pause;
    this.pageLimit = pageLimit;
    this.timeoutMs = timeoutMs;
    this.retryDelayMs = retryDelayMs;
    this.abort = new AbortController();
  }

  cancel() {
    this.abort.abort();
  }

  resetCancel() {
    this.abort = new AbortController();
  }

  checkCancelled() {
    if (this.abort.signal.aborted) throw new Cancelled();
  }

  abs(url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return this.host + url;
    return this.api + url;
  }

  signal(timeoutMs = this.timeoutMs) {
    return AbortSignal.any([this.abort.signal, AbortSignal.timeout(timeoutMs)]);
  }

  async getJson(url, params = null, tries = 4) {
    const u = new URL(this.abs(url));
    if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    for (let attempt = 1; attempt <= tries; attempt++) {
      this.checkCancelled();
      if (this.pause) await sleep(this.pause);
      let r;
      try {
        r = await this.fetch(u.toString(), {
          headers: { Accept: 'application/vnd.api+json' },
          signal: this.signal(),
        });
      } catch (e) {
        this.checkCancelled();
        if (attempt === tries) throw e;
        await sleep(this.retryDelayMs * attempt);
        continue;
      }
      const ct = r.headers.get('content-type') || '';
      if (r.status === 401 || ct.includes('text/html')) throw new SessionExpired();
      if ([502, 503, 504].includes(r.status) && attempt < tries) {
        await sleep(this.retryDelayMs * attempt);
        continue;
      }
      if (!r.ok) throw new HttpError(r.status, u.toString());
      return r.json();
    }
    throw new Error('unreachable');
  }

  /** Holt alle Seiten einer Liste. Gibt { data, included } zurück. */
  async getAll(url, params = null, limit = this.pageLimit) {
    let p = { 'page[limit]': limit, 'page[offset]': 0, ...(params || {}) };
    const data = [];
    const included = [];
    let followedNext = false;
    for (;;) {
      const doc = await this.getJson(url, p);
      let batch = doc.data || [];
      if (!Array.isArray(batch)) batch = [batch];
      data.push(...batch);
      included.push(...(doc.included || []));
      const next = doc.links && doc.links.next;
      const total = doc.meta && doc.meta.page && doc.meta.page.total;
      if (next && batch.length) {
        url = next;
        p = null;
        followedNext = true;
        continue;
      }
      if (!followedNext && batch.length && total != null && data.length < total) {
        p['page[offset]'] = data.length;
        continue;
      }
      return { data, included };
    }
  }

  /** Wie getAll, versucht aber zuerst mit ?include=…, bei Fehler ohne. */
  async getAllInclude(url, include, limit = this.pageLimit) {
    try {
      return await this.getAll(url, { include }, limit);
    } catch (e) {
      if (e instanceof SessionExpired || e instanceof Cancelled) throw e;
      return this.getAll(url, null, limit);
    }
  }

  async me() {
    const doc = await this.getJson('users/me', null, 1);
    return doc.data;
  }

  /**
   * JSON von einer Plugin-Schnittstelle (z. B. /plugins.php/opencastv3/api/…).
   * Gibt null zurück, wenn das Plugin fehlt oder den Zugriff verweigert.
   */
  async getPluginJson(pathAndQuery, tries = 3) {
    const url = this.host + pathAndQuery;
    for (let attempt = 1; attempt <= tries; attempt++) {
      this.checkCancelled();
      if (this.pause) await sleep(this.pause);
      let r;
      try {
        r = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: this.signal() });
      } catch (e) {
        this.checkCancelled();
        if (attempt === tries) throw e;
        await sleep(this.retryDelayMs * attempt);
        continue;
      }
      if (r.status === 401) throw new SessionExpired();
      if ([502, 503, 504].includes(r.status) && attempt < tries) {
        await sleep(this.retryDelayMs * attempt);
        continue;
      }
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !/json/i.test(ct)) return null;
      try {
        return await r.json();
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Startet den Download einer Datei; gibt die Response zurück. */
  async fileResponse(refId) {
    return this.downloadResponse(this.abs(`file-refs/${refId}/content`));
  }

  async downloadResponse(url) {
    this.checkCancelled();
    if (this.pause) await sleep(this.pause);
    const r = await this.fetch(this.abs(url), {
      headers: { Accept: '*/*' },
      signal: this.abort.signal,
    });
    if (r.status === 401 || /\/login\b|dispatch\.php\/login/i.test(r.url || '')) throw new SessionExpired();
    if (!r.ok) throw new HttpError(r.status, this.abs(url));
    return r;
  }
}

function normalizeHost(host) {
  let h = String(host || '').trim();
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  const u = new URL(h);
  // Pfade wie /studip/ bleiben erhalten (manche Hochschulen hosten Stud.IP in einem Unterordner)
  let path = u.pathname.replace(/\/(index\.php|dispatch\.php.*|jsonapi\.php.*)$/i, '').replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${path}`;
}

module.exports = { StudipClient, SessionExpired, HttpError, Cancelled, normalizeHost, sleep };
