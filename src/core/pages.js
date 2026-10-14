'use strict';
/**
 * Erzeugt die Offline-Seiten im Archiv: eine Übersicht, eine Infoseite pro Kurs
 * und eine Seite mit allen Nachrichten. Reines HTML ohne Skripte, damit es in
 * jedem Browser und auch in vielen Jahren noch funktioniert.
 */
const { formatBytes } = require('../shared/filetypes');

const TZ = 'Europe/Berlin';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Relativer Link aus Pfadteilen (Umlaute, Leerzeichen, # usw. werden kodiert). */
function hrefOf(parts) {
  return parts.map((p) => encodeURIComponent(p)).join('/');
}

function safeUrl(u) {
  const s = String(u || '').trim();
  return /^(https?:|mailto:)/i.test(s) ? s : null;
}

// ------------------------------------------------------------------ Beschreibungstexte

const ALLOWED_TAGS = new Set('p br div span ul ol li strong b em i u h1 h2 h3 h4 h5 h6 a blockquote pre code table thead tbody tr th td hr sub sup'.split(' '));

function sanitizeHtml(html) {
  let s = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|form)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|form|input|button|img|link|meta)\b[^>]*>/gi, '');
  s = s.replace(/<(\/?)([a-z0-9]+)\b([^>]*)>/gi, (m, close, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (close) return `</${tag}>`;
    if (tag === 'a') {
      const h = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const url = safeUrl(h && (h[1] ?? h[2] ?? h[3]).replace(/&amp;/g, '&'));
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">` : '<a>';
    }
    return tag === 'br' || tag === 'hr' ? `<${tag}>` : `<${tag}>`;
  });
  return s;
}

function plainToHtml(text) {
  let s = esc(text);
  // Stud.IP-Linksyntax [Text]https://… und <https://…>
  s = s.replace(/\[([^\]\n]{1,200})\](https?:\/\/[^\s<]+)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`);
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/%%([^%\n]+)%%/g, '<em>$1</em>');
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function richText(text) {
  const s = String(text || '').replace(/^<!--\s*HTML\s*-->/i, '').trim();
  if (!s) return '';
  if (/<(p|br|div|ul|ol|li|strong|b|em|i|a|h[1-6]|table|span|u)\b[^>]*>/i.test(s)) return sanitizeHtml(s);
  return plainToHtml(s);
}

// ------------------------------------------------------------------ Datum und Zeit

function fmtDate(iso, locale, opts) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts }).format(d);
}
const fmtDay = (iso, l) => fmtDate(iso, l, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (iso, l) => fmtDate(iso, l, { hour: '2-digit', minute: '2-digit' });
const fmtStamp = (iso, l) => fmtDate(iso, l, { dateStyle: 'long', timeStyle: 'short' });

// ------------------------------------------------------------------ Gemeinsames Layout

const CSS = `
:root{--bg:#f7f6f3;--card:#fff;--ink:#1d2327;--muted:#5f6b73;--line:#e3e1db;--accent:#1f5f7a;--soft:#e4eff4;--warn:#9a6a12}
@media (prefers-color-scheme:dark){:root{--bg:#15191c;--card:#1e2428;--ink:#e8ecee;--muted:#9aa6ad;--line:#2f383e;--accent:#6bb8d6;--soft:#1d3542;--warn:#e0b45a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:920px;margin:0 auto;padding:28px 20px 48px}
a{color:var(--accent)}a:hover{text-decoration:none}
h1{font-size:26px;line-height:1.25;margin:6px 0 4px}h2{font-size:18px;margin:28px 0 10px}h3{font-size:15px;margin:18px 0 6px}
.sub{color:var(--muted);margin:0 0 4px}.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:12px 0}
dl.meta{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:0}dl.meta dt{color:var(--muted)}dl.meta dd{margin:0}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}tr.cancelled td{color:var(--muted);text-decoration:line-through}
ul.tree,ul.tree ul{list-style:none;margin:0;padding-left:18px}ul.tree{padding-left:0}
ul.tree li{padding:2px 0}.folder>span{font-weight:600}.size{color:var(--muted);font-size:13px;white-space:nowrap}
.missing{color:var(--muted)}.badge{display:inline-block;font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 8px;margin-left:6px}
.notes li{color:var(--warn)}.desc p{margin:0 0 10px}
details>summary{cursor:pointer;color:var(--accent)}
.course-list{list-style:none;margin:0;padding:0}.course-list li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}
.course-list li:last-child{border-bottom:0}.course-list .num{color:var(--muted);font-size:13px;margin-right:6px}
.msg{border-top:1px solid var(--line);padding:12px 0}.msg:first-of-type{border-top:0}.msg h3{margin:0 0 4px}.msg .when{color:var(--muted);font-size:13px}
.msg .body{white-space:pre-wrap;margin-top:8px}
footer{color:var(--muted);font-size:12.5px;margin-top:32px}
@media print{body{background:#fff}.card{border:0;padding:0}a{color:inherit}}
`;

function layout({ t, title, body }) {
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="KursHamster">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
}

// ------------------------------------------------------------------ Dateibaum

function fileTree(files, t) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    let node = root;
    for (const dir of f.parts.slice(0, -1)) {
      if (!node.dirs.has(dir)) node.dirs.set(dir, { dirs: new Map(), files: [] });
      node = node.dirs.get(dir);
    }
    node.files.push(f);
  }
  const render = (node) => {
    const items = [];
    for (const f of node.files.sort((a, b) => a.parts.at(-1).localeCompare(b.parts.at(-1), t.locale))) {
      const name = esc(f.parts.at(-1));
      const size = f.size != null ? ` <span class="size">${formatBytes(f.size, t.locale)}</span>` : '';
      items.push(
        f.saved
          ? `<li><a href="${hrefOf(f.parts)}">${name}</a>${size}</li>`
          : `<li class="missing">${name}${size} <span class="badge">${esc(f.reason || t('page.notSaved'))}</span></li>`
      );
    }
    for (const [dir, sub] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0], t.locale))) {
      items.unshift(`<li class="folder"><span>📁 ${esc(dir)}</span><ul>${render(sub)}</ul></li>`);
    }
    return items.join('\n');
  };
  return `<ul class="tree">${render(root)}</ul>`;
}

// ------------------------------------------------------------------ Kursseite

function coursePage({ t, area, details, files, recordings, notes, host, generatedAt, overviewHref }) {
  const d = details || {};
  const meta = [];
  const row = (k, v) => v && meta.push(`<dt>${esc(t(k))}</dt><dd>${v}</dd>`);
  row('page.semester', esc(area.semester));
  row('page.number', esc(area.number));
  row('page.type', esc(d.typeName));
  row('page.institute', esc(d.instituteName));
  row('page.lecturers', d.lecturers && d.lecturers.length ? esc(d.lecturers.join(', ')) : '');
  row('page.location', esc(area.location));

  const events = (d.events || []).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const regular = [...new Set(events.filter((e) => e.recurrence).map((e) => [e.recurrence, e.location].filter(Boolean).join(', ')))];
  if (regular.length) row('page.regular', esc(regular.join(' · ')));

  let html = `<div class="top"><a href="${esc(overviewHref)}">${esc(t('page.backToOverview'))}</a>`;
  if (host) html += `<a href="${esc(host)}/dispatch.php/course/overview?cid=${encodeURIComponent(area.id)}" target="_blank" rel="noopener">${esc(t('page.openInStudip'))} ↗</a>`;
  html += `</div>\n<h1>${esc(area.title)}</h1>`;
  if (area.subtitle) html += `<p class="sub">${esc(area.subtitle)}</p>`;
  if (meta.length) html += `<div class="card"><dl class="meta">${meta.join('')}</dl></div>`;

  const desc = richText(area.description);
  if (desc) html += `<h2>${esc(t('page.description'))}</h2><div class="card desc">${desc}</div>`;
  const misc = richText(area.miscellaneous);
  if (misc) html += `<h2>${esc(t('page.misc'))}</h2><div class="card desc">${misc}</div>`;

  if (events.length) {
    const rows = events
      .map((e) => {
        const topic = [e.categories, e.title && e.title !== area.title ? e.title : ''].filter(Boolean).join(' – ');
        return `<tr${e.cancelled ? ' class="cancelled"' : ''}><td>${esc(fmtDay(e.start, t.locale))}</td><td>${esc(fmtTime(e.start, t.locale))}–${esc(fmtTime(e.end, t.locale))}</td><td>${esc(e.location || '')}</td><td>${esc(topic)}${e.cancelled ? ` <span class="badge">${esc(t('page.cancelled'))}</span>` : ''}</td></tr>`;
      })
      .join('\n');
    html += `<h2>${esc(t('page.schedule'))}</h2><div class="card"><details${events.length <= 16 ? ' open' : ''}><summary>${esc(t.n('date', events.length))}</summary>
<table><thead><tr><th>${esc(t('page.date'))}</th><th>${esc(t('page.time'))}</th><th>${esc(t('page.room'))}</th><th>${esc(t('page.topic'))}</th></tr></thead><tbody>${rows}</tbody></table></details></div>`;
  }

  html += `<h2>${esc(t('page.files'))} <span class="badge">${esc(t.n('file', files.length))}</span></h2>`;
  html += `<div class="card">${files.length ? fileTree(files, t) : `<p class="missing">${esc(t('page.noFiles'))}</p>`}</div>`;

  if (recordings && recordings.length) {
    html += `<h2>${esc(t('page.recordings'))} <span class="badge">${esc(t.n('recording', recordings.length))}</span></h2><div class="card">${fileTree(recordings, t)}</div>`;
  }
  if (notes && notes.length) {
    html += `<h2>${esc(t('page.notes'))}</h2><div class="card"><ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
  }
  html += `<footer>${esc(t('page.generated', { date: fmtStamp(generatedAt, t.locale) }))}</footer>`;
  return layout({ t, title: area.label || area.title, body: html });
}

// ------------------------------------------------------------------ Übersicht

function overviewPage({ t, host, generatedAt, semesters, personal, messages }) {
  const courseCount = semesters.reduce((s, x) => s + x.courses.length, 0);
  const semText = semesters.length === 1 ? t('page.semesterOne') : t('page.semesters', { n: semesters.length });
  let hostName = host;
  try {
    hostName = new URL(host).host;
  } catch {}
  let html = `<h1>🐹 ${esc(t('page.overviewTitle'))}</h1><p class="sub">${esc(t('page.overviewIntro', { courses: t.n('course', courseCount), semesters: semText, host: hostName }))}</p>`;

  const quick = [];
  if (messages && messages.href) quick.push(`<li><span><a href="${esc(messages.href)}">${esc(t('page.messagesLink'))}</a></span><span class="size">${esc(t.n('message', messages.count))}</span></li>`);
  if (personal && personal.href) quick.push(`<li><span><a href="${esc(personal.href)}">${esc(t('page.personalHeading'))}</a></span><span class="size">${esc(t.n('file', personal.count))}</span></li>`);
  if (quick.length) html += `<div class="card"><ul class="course-list">${quick.join('')}</ul></div>`;

  html += `<h2>${esc(t('page.coursesHeading'))}</h2>`;
  for (const sem of semesters) {
    const items = sem.courses
      .map((c) => {
        const label = `${c.number ? `<span class="num">${esc(c.number)}</span>` : ''}${esc(c.title)}`;
        const info = [c.fileCount ? t.n('file', c.fileCount) : '', c.recCount ? t.n('recording', c.recCount) : ''].filter(Boolean).join(' · ');
        return c.href
          ? `<li><span><a href="${esc(c.href)}">${label}</a></span><span class="size">${esc(info)}</span></li>`
          : `<li class="missing"><span>${label}</span><span class="size">${esc(t('page.notBackedUp'))}</span></li>`;
      })
      .join('\n');
    html += `<h3>${esc(sem.name)}</h3><div class="card"><ul class="course-list">${items}</ul></div>`;
  }
  html += `<footer>${esc(t('page.generated', { date: fmtStamp(generatedAt, t.locale) }))}</footer>`;
  return layout({ t, title: t('page.overviewTitle'), body: html });
}

// ------------------------------------------------------------------ Nachrichten

function messagesPage({ t, boxes, generatedAt, overviewHref }) {
  let html = `<div class="top"><a href="${esc(overviewHref)}">${esc(t('page.backToOverview'))}</a></div><h1>${esc(t('page.messagesHeading'))}</h1>`;
  for (const box of boxes) {
    const items = box.messages
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(
        (m) => `<div class="msg"><h3>${esc(m.subject || t('page.noSubject'))}</h3>
<div class="when">${esc(fmtStamp(m.date, t.locale))} · ${esc(t('page.from'))}: ${esc(m.from || t('page.system'))} · ${esc(t('page.to'))}: ${esc(m.to || '-')}</div>
<div class="body">${esc(m.text)}</div></div>`
      )
      .join('\n');
    html += `<h2>${esc(box.title)} <span class="badge">${esc(t.n('message', box.messages.length))}</span></h2><div class="card">${items}</div>`;
  }
  html += `<footer>${esc(t('page.generated', { date: fmtStamp(generatedAt, t.locale) }))}</footer>`;
  return layout({ t, title: t('page.messagesHeading'), body: html });
}

module.exports = { coursePage, overviewPage, messagesPage, richText, sanitizeHtml, hrefOf, esc };
