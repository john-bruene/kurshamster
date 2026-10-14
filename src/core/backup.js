'use strict';
/**
 * Einlesen (scan) und Sichern (run) aller Kursdateien, Aufzeichnungen und Nachrichten.
 * Läuft im Electron-Hauptprozess (oder in Node für Tests) und meldet Fortschritt per Events.
 */
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { SessionExpired, Cancelled } = require('./client');
const { Opencast } = require('./opencast');
const pages = require('./pages');
const i18n = require('../shared/i18n');
const { categoryOf, passes } = require('../shared/filetypes');
const crypto = require('node:crypto');

// ------------------------------------------------------------------ Helfer

function clean(name, maxlen = 80) {
  let s = String(name ?? '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[ .]+|[ .]+$/g, '');
  s = s.slice(0, maxlen).replace(/[ .]+$/, '');
  if (!s) s = '_';
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = '_' + s; // reservierte Namen unter Windows
  return s;
}

function cleanFilename(name, maxlen = 120) {
  const s = clean(name, 1000);
  if (s.length <= maxlen) return s;
  const dot = s.lastIndexOf('.');
  const ext = dot > 0 ? s.slice(dot + 1) : '';
  if (ext && ext.length <= 10) {
    return s.slice(0, maxlen - ext.length - 1).replace(/[ .]+$/, '') + '.' + ext;
  }
  return s.slice(0, maxlen);
}

function relId(obj, rel) {
  const d = obj && obj.relationships && obj.relationships[rel] && obj.relationships[rel].data;
  return d && !Array.isArray(d) ? d.id : null;
}

function relIds(obj, rel) {
  const d = obj && obj.relationships && obj.relationships[rel] && obj.relationships[rel].data;
  if (Array.isArray(d)) return d.map((x) => x.id);
  return d ? [d.id] : [];
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

/** Sortierschlüssel für Semestertitel wie "WiSe 2017/18" oder "SoSe 2018". */
function semesterKey(title) {
  const m = /(\d{4})/.exec(title || '');
  if (!m) return -1;
  const year = Number(m[1]);
  return /wi(se|nter)/i.test(title) ? year + 0.5 : year;
}

const passthrough = (e) => e instanceof SessionExpired || e instanceof Cancelled;

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function sha1(file) {
  const h = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

async function sameContent(a, b) {
  const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
  if (sa.size !== sb.size) return false;
  return (await sha1(a)) === (await sha1(b));
}

/** Freier Name für die alte Fassung einer Datei: "Folien (Version vom 2021-05-03).pdf" */
async function versionedName(dest, label) {
  const ext = path.extname(dest);
  const stem = dest.slice(0, dest.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${label}${i > 1 ? ` ${i}` : ''})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${stem} (${label} ${Date.now()})${ext}`;
}

/** Zeitstempel in Stud.IP ist neuer als die lokale Datei (Toleranz 2 s für FAT/HFS). */
function remoteIsNewer(chdate, st) {
  const remote = Date.parse(chdate || '');
  return !isNaN(remote) && remote > st.mtimeMs + 2000;
}

async function writeIfChanged(file, content) {
  try {
    if ((await fsp.readFile(file, 'utf8')) === content) return;
  } catch {}
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content, 'utf8');
}

const PAGE_NAMES = i18n.languages.map((l) => i18n.create(l)('file.coursePage'));
const MESSAGE_PAGES = i18n.languages.map((l) => {
  const t = i18n.create(l);
  return [t('dir.messages'), t('file.messagesPage')];
});

/** Kompakte Beschreibung eines Bereichs für die Oberfläche (inkl. Daten für die Live-Filter). */
function summarizeArea(a) {
  return {
    id: a.id,
    kind: a.kind,
    label: a.label,
    title: a.title,
    number: a.number,
    semester: a.semester,
    scanned: a.scanned !== false,
    fileCount: a.files.length,
    bytes: a.bytes || 0,
    errors: a.errors,
    files: a.files.map((f) => [f.size, f.cat]),
    recordings: (a.recordings || [])
      .filter((r) => r.allowed)
      .map((r) => [r.variants.reduce((s, v) => s + (v.high.size || 0), 0), r.variants.reduce((s, v) => s + (v.low.size || 0), 0)]),
  };
}

// ------------------------------------------------------------------ Backup

class Backup extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.opencast = new Opencast(client);
    this.semesterCache = new Map();
    this.nameCache = new Map();
    this.lastEmit = 0;
  }

  progress(data, force = false) {
    const now = Date.now();
    if (force || now - this.lastEmit > 150) {
      this.lastEmit = now;
      this.emit('progress', data);
    }
  }

  async semesterTitle(semId, included) {
    if (!semId) return '_';
    for (const i of included) {
      if (i.type === 'semesters' && i.id === semId) this.semesterCache.set(semId, i.attributes && i.attributes.title);
    }
    if (!this.semesterCache.has(semId)) {
      try {
        const doc = await this.client.getJson(`semesters/${semId}`);
        this.semesterCache.set(semId, doc.data.attributes.title);
      } catch (e) {
        if (passthrough(e)) throw e;
        this.semesterCache.set(semId, null);
      }
    }
    return this.semesterCache.get(semId) || '_';
  }

  async listCourses(uid) {
    let data = [];
    let included = [];
    try {
      ({ data, included } = await this.client.getAllInclude(`users/${uid}/courses`, 'start-semester'));
    } catch (e) {
      if (passthrough(e)) throw e;
    }
    if (!data.length) {
      const res = await this.client.getAllInclude(`users/${uid}/course-memberships`, 'course');
      included = res.included;
      data = included.filter((i) => i.type === 'courses');
    }
    const courses = [];
    for (const c of data) {
      const a = c.attributes || {};
      const number = String(a['course-number'] || '').trim();
      const title = String(a.title || c.id).trim();
      const semester = await this.semesterTitle(relId(c, 'start-semester'), included);
      courses.push({
        id: c.id,
        title,
        number,
        semester,
        label: [number, title].filter(Boolean).join(' ').replace(/\s+/g, ' '),
        subtitle: a.subtitle || '',
        description: a.description || '',
        location: a.location || '',
        miscellaneous: a.miscellaneous || '',
        instituteId: relId(c, 'institute'),
        semTypeId: relId(c, 'sem-type'),
      });
    }
    courses.sort((x, y) => semesterKey(y.semester) - semesterKey(x.semester) || x.title.localeCompare(y.title, 'de'));
    return courses;
  }

  /** Liefert [{ folder, parts }] für alle Ordner unterhalb von startUrl. */
  async walkFolders(startUrl) {
    const { data: flat } = await this.client.getAll(startUrl);
    const byId = new Map(flat.map((f) => [f.id, f]));
    const roots = flat.filter((f) => !byId.has(relId(f, 'parent')));
    const seen = new Set();
    const out = [];
    const visit = async (f, parts) => {
      if (seen.has(f.id)) return;
      seen.add(f.id);
      out.push({ folder: f, parts });
      let subs = [];
      try {
        ({ data: subs } = await this.client.getAll(`folders/${f.id}/folders`));
      } catch (e) {
        if (passthrough(e)) throw e;
      }
      const children = new Map(subs.map((x) => [x.id, x]));
      for (const x of flat) if (relId(x, 'parent') === f.id && !children.has(x.id)) children.set(x.id, x);
      for (const c of children.values()) {
        await visit(c, [...parts, clean((c.attributes && c.attributes.name) || 'Ordner')]);
      }
    };
    for (const r of roots) {
      const a = r.attributes || {};
      const isRoot = a['folder-type'] === 'RootFolder' || !a.name;
      await visit(r, isRoot ? [] : [clean(a.name)]);
    }
    return out;
  }

  /** Liest alle Dateien eines Dateibereichs (Kurs oder „Meine Dateien“) ein. */
  async scanArea(startUrl, entry) {
    let folders;
    try {
      folders = await this.walkFolders(startUrl);
    } catch (e) {
      if (passthrough(e)) throw e;
      entry.errors.push(e.status === 403 ? { key: 'err.areaForbidden' } : { key: 'err.areaUnreadable', vars: { error: e.message } });
      return;
    }
    for (const { folder, parts } of folders) {
      let refs;
      try {
        ({ data: refs } = await this.client.getAll(`folders/${folder.id}/file-refs`));
      } catch (e) {
        if (passthrough(e)) throw e;
        const where = parts.join('/');
        entry.errors.push(
          e.status === 403
            ? { key: 'err.folderForbidden', vars: { folder: where } }
            : { key: 'err.folderUnreadable', vars: { folder: where, error: e.message } }
        );
        continue;
      }
      const used = new Set();
      for (const ref of refs) {
        const a = ref.attributes || {};
        let name = cleanFilename(a.name || ref.id);
        if (used.has(name.toLowerCase())) {
          const dot = name.lastIndexOf('.');
          name = dot > 0 ? `${name.slice(0, dot)} (${ref.id.slice(0, 6)})${name.slice(dot)}` : `${name} (${ref.id.slice(0, 6)})`;
        }
        used.add(name.toLowerCase());
        entry.files.push({
          refId: ref.id,
          parts: [...parts, name],
          size: typeof a.filesize === 'number' ? a.filesize : a.filesize != null && !isNaN(Number(a.filesize)) ? Number(a.filesize) : null,
          chdate: a.chdate || null,
          downloadable: a['is-downloadable'] !== false,
          description: a.description || '',
          cat: categoryOf(name),
        });
      }
    }
  }

  /**
   * Schneller Weg: alle Ordner und alle Dateien eines Bereichs mit je einer (seitenweisen) Anfrage.
   * Ordner ohne Leserecht werden vermerkt. Fällt auf das ordnerweise Einlesen zurück, wenn die
   * Stud.IP-Version die Sammelroute nicht kennt.
   */
  async scanAreaFast(foldersUrl, refsUrl, entry) {
    let folders;
    try {
      ({ data: folders } = await this.client.getAll(foldersUrl));
    } catch (e) {
      if (passthrough(e)) throw e;
      entry.errors.push(e.status === 403 ? { key: 'err.areaForbidden' } : { key: 'err.areaUnreadable', vars: { error: e.message } });
      return;
    }
    const byId = new Map(folders.map((f) => [f.id, f]));
    const paths = new Map();
    const pathOf = (id, depth = 0) => {
      if (!byId.has(id) || depth > 50) return [];
      if (paths.has(id)) return paths.get(id);
      const f = byId.get(id);
      const a = f.attributes || {};
      const parent = relId(f, 'parent');
      const isRoot = a['folder-type'] === 'RootFolder' || !parent || !byId.has(parent);
      const p = isRoot ? [] : [...pathOf(parent, depth + 1), clean(a.name || 'Ordner')];
      paths.set(id, p);
      return p;
    };
    for (const f of folders) {
      if (f.attributes && f.attributes['is-readable'] === false) {
        entry.errors.push({ key: 'err.folderForbidden', vars: { folder: pathOf(f.id).join('/') } });
      }
    }
    let refs;
    try {
      ({ data: refs } = await this.client.getAll(refsUrl));
    } catch (e) {
      if (passthrough(e)) throw e;
      if (e.status === 404) {
        entry.errors = entry.errors.filter((x) => x.key !== 'err.folderForbidden');
        return this.scanArea(foldersUrl, entry); // ältere Stud.IP-Version
      }
      entry.errors.push({ key: 'err.areaUnreadable', vars: { error: e.message } });
      return;
    }
    const used = new Map();
    for (const ref of refs) {
      const a = ref.attributes || {};
      if (a['is-readable'] === false) continue;
      const parent = relId(ref, 'parent');
      if (!used.has(parent)) used.set(parent, new Set());
      const seen = used.get(parent);
      let name = cleanFilename(a.name || ref.id);
      if (seen.has(name.toLowerCase())) {
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)} (${ref.id.slice(0, 6)})${name.slice(dot)}` : `${name} (${ref.id.slice(0, 6)})`;
      }
      seen.add(name.toLowerCase());
      entry.files.push({
        refId: ref.id,
        parts: [...pathOf(parent), name],
        size: typeof a.filesize === 'number' ? a.filesize : a.filesize != null && !isNaN(Number(a.filesize)) ? Number(a.filesize) : null,
        chdate: a.chdate || null,
        downloadable: a['is-downloadable'] !== false,
        description: a.description || '',
        cat: categoryOf(name),
      });
    }
  }

  /**
   * Liest alle Kurse, Dateien und Aufzeichnungen ein, ohne etwas herunterzuladen.
   * Events: 'courses' (Liste sofort nach dem ersten Abruf), 'area' (je fertigem Kurs), 'progress'.
   */
  async scan(uid, { concurrency = 4 } = {}) {
    this.client.resetCancel();
    this.progress({ phase: 'scan', done: 0, total: 0 }, true);
    const courses = await this.listCourses(uid);
    const areas = courses.map((c) => ({ ...c, kind: 'course', files: [], errors: [], recordings: [], scanned: false }));
    areas.push({ id: '__personal', title: '', label: '', number: '', semester: '', kind: 'personal', files: [], errors: [], recordings: [], scanned: false });
    this.emit('courses', areas.map(summarizeArea));

    let ocAvailable = false;
    try {
      ocAvailable = await this.opencast.detect();
    } catch (e) {
      if (passthrough(e)) throw e;
    }

    let done = 0;
    const scanOne = async (a) => {
      if (a.kind === 'course') {
        await this.scanAreaFast(`courses/${a.id}/folders`, `courses/${a.id}/file-refs`, a);
        if (ocAvailable) {
          try {
            a.recordings = await this.opencast.listCourse(a.id);
          } catch (e) {
            if (passthrough(e)) throw e;
          }
        }
      } else {
        await this.scanAreaFast(`users/${uid}/folders`, `users/${uid}/file-refs`, a);
      }
      a.bytes = a.files.reduce((s, f) => s + (f.size || 0), 0);
      a.scanned = true;
      done++;
      this.emit('area', summarizeArea(a));
      this.progress({ phase: 'scan', done, total: areas.length, label: a.label });
    };

    // mehrere Kurse gleichzeitig, aber in Maßen, um den Server zu schonen
    let next = 0;
    const worker = async () => {
      while (next < areas.length) {
        const a = areas[next++];
        await scanOne(a);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, areas.length)) }, worker));

    this.progress({ phase: 'scan', done: areas.length, total: areas.length }, true);
    return {
      uid,
      host: this.client.host,
      scannedAt: new Date().toISOString(),
      opencast: { available: ocAvailable, mediadownload: this.opencast.mediadownload },
      areas: areas.filter((a) => a.kind === 'course' || a.files.length),
    };
  }

  // ---------------------------------------------------------------- Kursdetails

  async cachedName(kind, id) {
    if (!id) return null;
    const key = `${kind}/${id}`;
    if (!this.nameCache.has(key)) {
      try {
        const doc = await this.client.getJson(key);
        const a = (doc.data && doc.data.attributes) || {};
        this.nameCache.set(key, a.name || a.title || null);
      } catch (e) {
        if (passthrough(e)) throw e;
        this.nameCache.set(key, null);
      }
    }
    return this.nameCache.get(key);
  }

  async fetchDetails(area) {
    const d = { lecturers: [], events: [], instituteName: null, typeName: null };
    try {
      const { data, included } = await this.client.getAll(`courses/${area.id}/memberships`, { 'filter[permission]': 'dozent', include: 'user' });
      const names = new Map(included.filter((i) => i.type === 'users').map((i) => [i.id, i.attributes && i.attributes['formatted-name']]));
      d.lecturers = data
        .filter((m) => !m.attributes || !m.attributes.permission || m.attributes.permission === 'dozent')
        .sort((x, y) => ((x.attributes && x.attributes.position) || 0) - ((y.attributes && y.attributes.position) || 0))
        .map((m) => names.get(relId(m, 'user')))
        .filter(Boolean);
    } catch (e) {
      if (passthrough(e)) throw e;
    }
    try {
      const { data } = await this.client.getAll(`courses/${area.id}/events`);
      d.events = data.map((e) => {
        const a = e.attributes || {};
        return {
          start: a.start,
          end: a.end,
          location: a.location || '',
          recurrence: a.recurrence || '',
          categories: a.categories || '',
          title: a.title || '',
          cancelled: !!a['is-cancelled'],
        };
      });
    } catch (e) {
      if (passthrough(e)) throw e;
    }
    d.instituteName = await this.cachedName('institutes', area.instituteId);
    d.typeName = await this.cachedName('sem-types', area.semTypeId);
    return d;
  }

  // ---------------------------------------------------------------- Sichern

  areaDir(area, t) {
    return area.kind === 'personal' ? [t('dir.personal')] : [clean(area.semester), clean(area.label)];
  }

  recordingName(rec, variant, t) {
    const date = String(rec.created || '').slice(0, 10);
    const label = t(`rec.${variant.source}`);
    return cleanFilename(`${date ? date + ' ' : ''}${rec.title} (${label}).${variant.ext}`);
  }

  /**
   * Lädt die ausgewählten Bereiche herunter. Bereits vollständige Dateien werden übersprungen.
   * @param {object} opts { target, areaIds, includeMessages, filter: {categories, maxBytes}, recordings: {quality} | null, lang }
   */
  async run(plan, opts) {
    const { target, areaIds, includeMessages = true, filter = null, recordings = null, lang = 'de' } = opts;
    const t = i18n.create(lang);
    this.client.resetCancel();
    const selected = plan.areas.filter((a) => areaIds.includes(a.id));
    const stats = { downloaded: 0, updated: 0, skipped: 0, failed: 0, filtered: 0, bytes: 0, cancelled: false, sessionExpired: false };
    const errors = [];
    for (const a of selected) for (const e of a.errors) errors.push(`${a.label || t('page.personalHeading')}: ${t.err(e)}`);

    // Aufträge zusammenstellen
    const jobs = [];
    for (const a of selected) {
      const dir = this.areaDir(a, t);
      for (const f of a.files) {
        if (!passes(f, filter)) {
          stats.filtered++;
          continue;
        }
        jobs.push({ kind: 'file', refId: f.refId, rel: [...dir, ...f.parts], size: f.size, chdate: f.chdate, downloadable: f.downloadable });
      }
      if (recordings && a.recordings) {
        for (const rec of a.recordings) {
          if (!rec.allowed) continue;
          for (const v of rec.variants) {
            const m = recordings.quality === 'low' ? v.low : v.high;
            jobs.push({
              kind: 'recording',
              url: this.opencast.downloadUrl(rec.token, v.source, m.key),
              rel: [...dir, t('dir.recordings'), this.recordingName(rec, v, t)],
              size: m.size,
              chdate: rec.created ? rec.created.replace(' ', 'T') : null,
              downloadable: true,
              approximate: true,
            });
          }
        }
      }
    }

    const details = new Map();
    const messageBoxes = [];
    const bytesTotal = jobs.reduce((s, j) => s + (j.size || 0), 0);
    let bytesDone = 0;
    let filesDone = 0;
    const report = (current, force) =>
      this.progress({ phase: 'download', bytesDone, bytesTotal, filesDone, filesTotal: jobs.length, current }, force);

    try {
      // 1. Kursdetails (schnell, damit die Kursseiten auch bei einem Abbruch vollständig sind)
      const courses = selected.filter((a) => a.kind === 'course');
      for (let i = 0; i < courses.length; i++) {
        this.progress({ phase: 'details', done: i, total: courses.length, label: courses[i].label }, i === 0);
        details.set(courses[i].id, await this.fetchDetails(courses[i]));
      }

      // 2. Dateien und Aufzeichnungen
      report('', true);
      for (const j of jobs) {
        const dest = path.join(target, ...j.rel);
        const shown = j.rel.join('/');
        report(shown);
        let st = null;
        try {
          st = await fsp.stat(dest);
        } catch {}
        const complete = st && (j.size == null || j.approximate ? st.size > 0 : st.size === j.size);
        // In Stud.IP geändert? (gleiche Größe, aber neueres Änderungsdatum) – nicht bei Aufzeichnungen
        const changed = complete && !j.approximate && remoteIsNewer(j.chdate, st);
        if (complete && !changed) {
          stats.skipped++;
          bytesDone += j.size || 0;
        } else if (!j.downloadable) {
          stats.failed++;
          errors.push(`${shown}: ${t('err.notDownloadable')}`);
          bytesDone += j.size || 0;
        } else {
          let added = 0;
          try {
            const res = await this.download(j, dest, t, (delta) => {
              added += delta;
              bytesDone += delta;
              report(shown);
            });
            if (res.status === 'same') stats.skipped++;
            else {
              stats[res.status === 'updated' ? 'updated' : 'downloaded']++;
              stats.bytes += res.bytes;
            }
          } catch (e) {
            if (passthrough(e)) throw e;
            stats.failed++;
            errors.push(`${shown}: ${e.message}`);
          }
          if (j.size != null) bytesDone += j.size - added; // an angekündigte Größe angleichen
        }
        filesDone++;
      }
      report('', true);

      // 3. Nachrichten
      if (includeMessages) await this.backupMessages(plan.uid, target, errors, t, messageBoxes);
    } catch (e) {
      if (e instanceof Cancelled) stats.cancelled = true;
      else if (e instanceof SessionExpired) stats.sessionExpired = true;
      else throw e;
    } finally {
      this.progress({ phase: 'pages' }, true);
      await this.writePages(target, plan, selected, details, filter, recordings, messageBoxes, t).catch((e) => errors.push(`Pages: ${e.message}`));
      await this.writeReports(target, selected, errors, t);
    }
    stats.errors = errors;
    stats.overview = path.join(target, t('file.overview'));
    return stats;
  }

  async download(job, dest, t, onBytes) {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const part = dest + '.part';
    let n = 0;
    let status = 'new';
    try {
      const r = job.kind === 'recording' ? await this.client.downloadResponse(job.url) : await this.client.fileResponse(job.refId);
      if (job.kind === 'recording' && /text\/html/i.test(r.headers.get('content-type') || '')) {
        if (r.body) await r.body.cancel().catch(() => {});
        throw new Error(t('err.recordingDenied'));
      }
      if (!r.body) throw new Error(t('err.empty'));
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          n += chunk.length;
          onBytes(chunk.length);
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(r.body), counter, fs.createWriteStream(part));
      if (await exists(dest)) {
        if (await sameContent(part, dest)) {
          // nur Metadaten geändert: Inhalt identisch, nichts aufbewahren
          await fsp.rename(part, dest);
          status = 'same';
        } else {
          // neue Fassung: alte Datei mit ihrem Datum daneben behalten
          const oldStat = await fsp.stat(dest);
          const date = new Date(oldStat.mtimeMs).toISOString().slice(0, 10);
          await fsp.rename(dest, await versionedName(dest, t('file.oldVersion', { date })));
          await fsp.rename(part, dest);
          status = 'updated';
        }
      } else {
        await fsp.rename(part, dest);
      }
    } catch (e) {
      await fsp.rm(part, { force: true });
      if (e && e.name === 'AbortError') throw new Cancelled();
      throw e;
    }
    if (job.chdate) {
      const d = new Date(job.chdate);
      if (!isNaN(d)) await fsp.utimes(dest, d, d).catch(() => {});
    }
    return { bytes: n, status };
  }

  async backupMessages(uid, target, errors, t, boxesOut) {
    for (const box of ['inbox', 'outbox']) {
      const boxTitle = t(box === 'inbox' ? 'dir.inbox' : 'dir.outbox');
      this.progress({ phase: 'messages', box: boxTitle }, true);
      let msgs;
      let included;
      try {
        ({ data: msgs, included } = await this.client.getAllInclude(`users/${uid}/${box}`, 'sender,recipients', 20));
      } catch (e) {
        if (passthrough(e)) throw e;
        errors.push(t('err.messages', { box: boxTitle, error: e.message }));
        continue;
      }
      const names = new Map(included.filter((i) => i.type === 'users').map((i) => [i.id, i.attributes && i.attributes['formatted-name']]));
      const dir = path.join(target, t('dir.messages'), boxTitle);
      await fsp.mkdir(dir, { recursive: true });
      const raw = [];
      const list = [];
      for (const m of msgs) {
        raw.push(JSON.stringify(m));
        const a = m.attributes || {};
        const date = String(a.mkdate || '').slice(0, 16).replace('T', ' ');
        const subject = a.subject || t('page.noSubject');
        const sender = relId(m, 'sender');
        const from = names.get(sender) || sender || t('page.system');
        const to = relIds(m, 'recipients').map((r) => names.get(r) || r).join(', ');
        const text = htmlToText(a.message);
        list.push({ subject, date: a.mkdate, from, to, text });
        const md = `# ${subject}\n\n- ${t('page.date')}: ${date}\n- ${t('page.from')}: ${from}\n- ${t('page.to')}: ${to || '-'}\n\n---\n\n${text}\n`;
        await writeIfChanged(path.join(dir, cleanFilename(`${date.slice(0, 10)} ${subject} [${m.id.slice(0, 6)}].md`)), md);
      }
      await fsp.writeFile(path.join(dir, 'messages.jsonl'), raw.join('\n') + (raw.length ? '\n' : ''), 'utf8');
      boxesOut.push({ title: boxTitle, messages: list });
    }
  }

  // ---------------------------------------------------------------- Offline-Seiten

  async writePages(target, plan, selected, details, filter, recordings, messageBoxes, t) {
    const generatedAt = new Date().toISOString();
    const pageName = t('file.coursePage');
    const overviewName = t('file.overview');

    for (const a of selected) {
      const dir = this.areaDir(a, t);
      const files = [];
      for (const f of a.files) {
        const saved = await exists(path.join(target, ...dir, ...f.parts));
        files.push({ parts: f.parts, size: f.size, saved, reason: t('page.notSaved') });
      }
      const recs = [];
      for (const rec of a.recordings || []) {
        for (const v of rec.variants) {
          const parts = [t('dir.recordings'), this.recordingName(rec, v, t)];
          const saved = await exists(path.join(target, ...dir, ...parts));
          const m = recordings && recordings.quality === 'low' ? v.low : v.high;
          recs.push({ parts, size: m.size, saved, reason: rec.allowed ? t('page.notSaved') : t('err.recordingDenied') });
        }
      }
      const area = a.kind === 'personal' ? { ...a, title: t('page.personalHeading'), label: t('page.personalHeading') } : a;
      const html = pages.coursePage({
        t,
        area,
        details: details.get(a.id),
        files,
        recordings: recs,
        notes: a.errors.map((e) => t.err(e)),
        host: a.kind === 'course' ? plan.host : null,
        generatedAt,
        overviewHref: pages.hrefOf([...dir.map(() => '..'), overviewName]).replace(/%2E%2E/g, '..'),
      });
      await writeIfChanged(path.join(target, ...dir, pageName), html);
    }

    // Übersicht über alle eingelesenen Kurse (auch aus früheren Läufen)
    const bySem = new Map();
    let personal = null;
    for (const a of plan.areas) {
      const dir = this.areaDir(a, t);
      let pageFile = null;
      for (const name of PAGE_NAMES) {
        if (await exists(path.join(target, ...dir, name))) {
          pageFile = name;
          break;
        }
      }
      if (a.kind === 'personal') {
        if (pageFile) personal = { href: pages.hrefOf([...dir, pageFile]), count: a.files.length };
        continue;
      }
      if (!bySem.has(a.semester)) bySem.set(a.semester, []);
      bySem.get(a.semester).push({
        title: a.title,
        number: a.number,
        href: pageFile ? pages.hrefOf([...dir, pageFile]) : null,
        fileCount: a.files.length,
        recCount: (a.recordings || []).filter((r) => r.allowed).length,
      });
    }
    const semesters = [...bySem.entries()]
      .sort((x, y) => semesterKey(y[0]) - semesterKey(x[0]))
      .map(([name, courses]) => ({ name, courses }));

    let messages = null;
    if (messageBoxes.length) {
      const html = pages.messagesPage({ t, boxes: messageBoxes, generatedAt, overviewHref: `../${encodeURIComponent(overviewName)}` });
      await writeIfChanged(path.join(target, t('dir.messages'), t('file.messagesPage')), html);
      messages = { href: pages.hrefOf([t('dir.messages'), t('file.messagesPage')]), count: messageBoxes.reduce((s, b) => s + b.messages.length, 0) };
    } else {
      for (const parts of MESSAGE_PAGES) {
        if (await exists(path.join(target, ...parts))) {
          messages = { href: pages.hrefOf(parts), count: 0 };
          break;
        }
      }
    }

    const html = pages.overviewPage({ t, host: plan.host, generatedAt, semesters, personal, messages });
    await writeIfChanged(path.join(target, overviewName), html);
  }

  async writeReports(target, selected, errors, t) {
    try {
      await fsp.mkdir(target, { recursive: true });
      const index = {
        createdAt: new Date().toISOString(),
        areas: selected.map((a) => ({
          id: a.id,
          title: a.title,
          number: a.number,
          semester: a.semester,
          files: a.files.map((f) => ({ path: [...this.areaDir(a, t), ...f.parts].join('/'), id: f.refId, size: f.size, chdate: f.chdate, description: f.description })),
          recordings: (a.recordings || []).map((r) => ({ token: r.token, title: r.title, created: r.created, allowed: r.allowed })),
        })),
      };
      await fsp.writeFile(path.join(target, '_index.json'), JSON.stringify(index, null, 1), 'utf8');
      await fsp.writeFile(path.join(target, t('file.errors')), errors.join('\n') + '\n', 'utf8');
    } catch {
      /* Berichte sind optional */
    }
  }
}

module.exports = { Backup, summarizeArea, clean, cleanFilename, htmlToText, semesterKey };
