'use strict';
/**
 * Nachgebautes Stud.IP (JSON:API + Opencast-Plugin) für Tests.
 * Die Antworten entsprechen in Aufbau und Feldnamen dem echten Stud.IP 6.2 der Uni Göttingen.
 */

const folder = (id, name, parent, type) => ({ id, type: 'folders', attributes: { name, 'folder-type': type }, relationships: { parent: { data: parent ? { id: parent } : null } } });
const file = (id, name, size) => ({ id, type: 'file-refs', attributes: { name, filesize: size, chdate: '2021-05-03T10:00:00+02:00' } });
const course = (id, title, number, sem, extra = {}) => ({
  id,
  type: 'courses',
  attributes: { 'course-number': number, title, subtitle: null, 'course-type': 1, description: null, location: null, miscellaneous: null, ...extra },
  relationships: {
    'start-semester': { data: { id: sem, type: 'semesters' } },
    institute: { data: { id: 'inst1', type: 'institutes' } },
    'sem-type': { data: { id: '1', type: 'sem-types' } },
  },
});

function video(token, title, { publication = true, created = '2021-04-20 10:00:00' } = {}) {
  return {
    id: token,
    token,
    title,
    created,
    presenters: 'Prof. Muster',
    duration: 3600000,
    available: '1',
    trashed: false,
    perm: 'read',
    video_user_available: true,
    publication: publication
      ? {
          downloads: {
            presenter: { 1000: { url: `https://media.example/${token}/cam-low.mp4`, info: '640 * 360' }, 5000: { url: `https://media.example/${token}/cam-high.mp4`, info: '1920 * 1080' } },
            presentation: { 2000: { url: `https://media.example/${token}/screen.mp4`, info: '1920 * 1080' } },
            audio: {},
          },
          track_link: null,
        }
      : null,
  };
}

function createData() {
  return {
    lists: {
      'users/u1/courses': [
        course('c1', 'Statistik I', '4711    ', 's1', {
          subtitle: 'Grundlagen',
          description: 'Willkommen!\n\nInfos unter <https://example.org/info> und [Skript]https://example.org/skript.\n<script>alert(1)</script>',
        }),
        course('c2', 'Ökonometrie', '0815', 's2', { description: '<p>Kurs mit <strong>HTML</strong>-Beschreibung<script>alert(1)</script></p><img src=x onerror=alert(1)>' }),
        course('c3', 'Gesperrt', '', 's2'),
      ],
      'courses/c1/folders': [folder('r1', '', null, 'RootFolder'), folder('a', 'Folien/Teil 1', 'r1')],
      'courses/c2/folders': [folder('r2', '', null, 'RootFolder')],
      'folders/r1/folders': [folder('a', 'Folien/Teil 1', 'r1')],
      'folders/a/folders': [folder('b', 'Alt', 'a')],
      'folders/b/folders': [],
      'folders/r2/folders': [],
      'folders/r1/file-refs': [file('f1', 'syllabus.pdf', 5), file('fv', 'intro.mp4', 9)],
      'folders/a/file-refs': [file('f2', 'x.pdf', 3), file('f3abcdef', 'x.pdf', 4)],
      'folders/b/file-refs': [],
      'folders/r2/file-refs': [file('f4', 'daten.csv', 4)],
      'users/u1/folders': [],
      'users/u1/inbox': [
        { id: 'm1abcdef', type: 'messages', attributes: { subject: 'Hallo', message: '<p>Text&amp;mehr</p>', mkdate: '2020-01-02T03:04:05+01:00' }, relationships: { sender: { data: { id: 'u2' } } } },
      ],
      'users/u1/outbox': [],
      'courses/c1/memberships': [
        { id: 'c1_l', type: 'course-memberships', attributes: { permission: 'dozent', position: 0 }, relationships: { user: { data: { id: 'l1', type: 'users' } } } },
      ],
      'courses/c2/memberships': [],
      'courses/c1/events': [
        { id: 'e1', type: 'course-events', attributes: { start: '2021-04-13T16:00:00+02:00', end: '2021-04-13T18:00:00+02:00', location: 'ZHG 011', recurrence: 'Di. 16:00 - 18:00', categories: 'Sitzung', title: 'Vorlesung: Statistik I', 'is-cancelled': false } },
        { id: 'e2', type: 'course-events', attributes: { start: '2021-04-20T16:00:00+02:00', end: '2021-04-20T18:00:00+02:00', location: 'ZHG 011', recurrence: 'Di. 16:00 - 18:00', categories: 'Sitzung', title: 'Vorlesung: Statistik I', 'is-cancelled': true } },
      ],
      'courses/c2/events': [],
    },
    included: {
      'users/u1/courses': [
        { id: 's1', type: 'semesters', attributes: { title: 'WiSe 2020/21' } },
        { id: 's2', type: 'semesters', attributes: { title: 'SoSe 2019' } },
      ],
      'courses/c1/memberships': [{ id: 'l1', type: 'users', attributes: { 'formatted-name': 'Prof. Dr. Erika Muster' } }],
    },
    single: {
      'users/me': { data: { id: 'u1', type: 'users', attributes: { 'formatted-name': 'Erika Mustermann' } } },
      'institutes/inst1': { data: { id: 'inst1', type: 'institutes', attributes: { name: 'Professur für Statistik' } } },
      'sem-types/1': { data: { id: '1', type: 'sem-types', attributes: { name: 'Vorlesung' } } },
    },
    forbidden: new Set(['courses/c3/folders']),
    contents: { f1: 'hello', fv: '123456789', f2: 'abc', f3abcdef: 'abcd', f4: 'a;b\n' },
    opencast: {
      config: { server: { 1: { name: 'https://media.example' } }, settings: { OPENCAST_MEDIADOWNLOAD: 'allow' } },
      playlists: {
        c1: [
          { token: 'pl1', title: 'Vorlesung', allow_download: null, videos_count: 2 },
          { token: 'pl2', title: 'Gesperrt', allow_download: '0', videos_count: 1 },
        ],
        c2: [],
        c3: [],
      },
      playlistVideos: {
        pl1: [video('v1', 'Sitzung 1'), video('v2', 'Sitzung 2 (defekt)', { publication: false })],
        pl2: [video('v3', 'Geheime Sitzung')],
      },
    },
  };
}

/** Antwort-Funktion für einen Pfad wie /jsonapi.php/v1/… oder /plugins.php/… */
function respond(data, u, { loggedIn = true, pageSize = 1 } = {}) {
  const json = (body, status = 200, ct = 'application/vnd.api+json') => ({ status, headers: { 'content-type': ct }, body: JSON.stringify(body) });
  if (!loggedIn) return { status: 401, headers: { 'content-type': 'text/html' }, body: '<html>login</html>' };

  if (u.pathname.startsWith('/plugins.php/opencastv3/')) {
    const p = u.pathname.slice('/plugins.php/opencastv3'.length);
    const oc = data.opencast;
    const pj = (b) => json(b, 200, 'application/json');
    if (p === '/api/config/simple') return pj(oc.config);
    let m = /^\/api\/courses\/(\w+)\/playlists$/.exec(p);
    if (m) return pj({ playlists: oc.playlists[m[1]] || [], count: String((oc.playlists[m[1]] || []).length) });
    m = /^\/api\/playlists\/(\w+)\/videos$/.exec(p);
    if (m) {
      const all = oc.playlistVideos[m[1]] || [];
      const off = Number(u.searchParams.get('offset') || 0);
      const lim = Math.min(1, Number(u.searchParams.get('limit') || 20)); // absichtlich kleine Seiten
      return pj({ videos: all.slice(off, off + lim), count: String(all.length) });
    }
    m = /^\/redirect\/download\/(\w+)\/(\w+)\/(\w+)$/.exec(p);
    if (m) {
      const [, token, source, key] = m;
      if (token === 'v3') return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>Zugriff verweigert</html>' };
      return { status: 200, headers: { 'content-type': 'video/mp4' }, body: `${token}-${source}-${key}` };
    }
    return { status: 404, headers: { 'content-type': 'application/json' }, body: '{}' };
  }

  if (!u.pathname.startsWith('/jsonapi.php/v1/')) return { status: 404, headers: { 'content-type': 'text/html' }, body: '' };
  const route = u.pathname.slice('/jsonapi.php/v1/'.length);
  if (route in data.single) return json(data.single[route]);
  if (data.forbidden.has(route)) return json({ errors: [{ status: '403' }] }, 403);
  const fm = /^file-refs\/(\w+)\/content$/.exec(route);
  if (fm) return { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: data.contents[fm[1]] };
  if (!(route in data.lists)) return json({ errors: [{ status: '404' }] }, 404);
  let all = data.lists[route];
  const perm = u.searchParams.get('filter[permission]');
  if (perm) all = all.filter((m) => m.attributes.permission === perm);
  const off = Number(u.searchParams.get('page[offset]') || 0);
  const inc = u.searchParams.get('include') ? data.included[route] || [] : route === 'users/u1/courses' ? data.included[route] : [];
  return json({ data: all.slice(off, off + pageSize), included: inc, meta: { page: { offset: off, limit: pageSize, total: all.length } } });
}

/** fetch-kompatible Funktion für Node-Tests. */
function fakeFetch(data, opts = {}) {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(url);
    calls.push(u.pathname);
    const r = respond(data, u, opts);
    return new Response(r.body, { status: r.status, headers: r.headers });
  };
  fn.calls = calls;
  return fn;
}

module.exports = { createData, respond, fakeFetch };
