'use strict';
/* global studip, KH_I18N, KH_TYPES, KH_UNIS */
const $ = (id) => document.getElementById(id);
const { CATEGORIES, formatBytes, passes } = KH_TYPES;

const ui = {
  lang: 'de',
  t: KH_I18N.create('de'),
  user: null,
  areas: [],
  opencast: null,
  selected: new Set(),
  target: '',
  filter: { categories: new Set(CATEGORIES), maxBytes: 0 },
  recordings: { enabled: false, quality: 'high' },
  includeMessages: true,
  running: false,
  scanning: false,
  scanStatus: null, // { kind: 'found' | 'progress' | 'text', ... } für Neuzeichnen nach Sprachwechsel
  result: null,
  update: null,
};

// ------------------------------------------------------------------ Hilfen

const fmt = (n) => formatBytes(n, ui.t.locale);
const num = (n) => Number(n || 0).toLocaleString(ui.t.locale);

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function show(id, text) {
  const e = $(id);
  if (text == null) {
    e.hidden = true;
    return;
  }
  e.textContent = text;
  e.hidden = false;
}

function setStep(n, state) {
  const card = $('step' + n);
  card.classList.toggle('disabled', state === 'disabled');
  card.classList.toggle('done', state === 'done');
}

function semesterKey(title) {
  const m = /(\d{4})/.exec(title || '');
  if (!m) return 99999; // „Persönlich“ zuerst
  return Number(m[1]) + (/wi(se|nter)/i.test(title) ? 0.5 : 0);
}

const fileObj = ([size, cat]) => ({ size, cat });
const currentFilter = () => ({ categories: [...ui.filter.categories], maxBytes: ui.filter.maxBytes || null });

// ------------------------------------------------------------------ Sprache

function applyI18n() {
  const t = ui.t;
  document.documentElement.lang = ui.lang;
  for (const e of document.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  fillHostSelect();
  for (const o of $('maxSize').options) if (o.value !== '0') o.textContent = t('opt.over', { size: fmt(Number(o.value)) });
  for (const b of document.querySelectorAll('.lang-btn')) b.classList.toggle('active', b.dataset.lang === ui.lang);
  if (ui.version) $('version').textContent = t('app.version', { v: ui.version });
  if (ui.user) show('loginOk', t('step1.ok', { name: ui.user.name, host: new URL(ui.user.host).host }));
  if (ui.areas.length) {
    $('scanBtn').textContent = t('step2.rescan');
    renderScanStatus();
    renderSelection();
  }
  $('expandAll').textContent = t([...document.querySelectorAll('.semester')].every((d) => d.open) && ui.areas.length ? 'step2.collapseAll' : 'step2.expandAll');
  if (ui.result) renderResult(ui.result);
  if (ui.update) renderUpdate(ui.update);
}

for (const b of document.querySelectorAll('.lang-btn')) {
  b.addEventListener('click', async () => {
    const r = await studip.setLanguage(b.dataset.lang);
    if (!r.ok) return;
    ui.lang = r.value;
    ui.t = KH_I18N.create(ui.lang);
    applyI18n();
  });
}

// ------------------------------------------------------------------ Schritt 1: Anmelden

const normHost = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();

function fillHostSelect() {
  const sel = $('hostSelect');
  const current = sel.value;
  const unis = KH_UNIS.universities.slice().sort((a, b) => a.name.localeCompare(b.name, ui.t.locale));
  sel.replaceChildren(
    ...unis.map((u) => el('option', { value: u.url, text: u.city && !u.name.includes(u.city.split(' ')[0]) ? `${u.name} (${u.city})` : u.name })),
    el('option', { value: 'custom', text: ui.t('step1.other') })
  );
  sel.value = current || KH_UNIS.DEFAULT_URL;
}

function selectHost(host) {
  const known = KH_UNIS.universities.find((u) => normHost(u.url) === normHost(host));
  if (known) {
    $('hostSelect').value = known.url;
    $('customHostField').hidden = true;
  } else if (host) {
    $('hostSelect').value = 'custom';
    $('customHost').value = host;
    $('customHostField').hidden = false;
  }
}

$('hostSelect').addEventListener('change', () => {
  $('customHostField').hidden = $('hostSelect').value !== 'custom';
  if ($('hostSelect').value === 'custom') $('customHost').focus();
});

function currentHost() {
  return $('hostSelect').value === 'custom' ? $('customHost').value.trim() : $('hostSelect').value;
}

$('loginBtn').addEventListener('click', async () => {
  const t = ui.t;
  const host = currentHost();
  if (!host) return show('loginError', t('step1.needAddress'));
  show('loginError', null);
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = t('step1.waiting');
  const r = await studip.login(host);
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = ui.t('step1.button');
  if (!r.ok) {
    if (r.code !== 'aborted') show('loginError', ui.t('step1.failed', { error: r.error }));
    return;
  }
  onLoggedIn(r.value);
});

function onLoggedIn(user) {
  ui.user = user;
  $('userName').textContent = user.name;
  $('userChip').hidden = false;
  $('loginForm').hidden = true;
  $('loginHint').hidden = true;
  show('loginError', null);
  show('loginOk', ui.t('step1.ok', { name: user.name, host: new URL(user.host).host }));
  setStep(1, 'done');
  setStep(2, 'active');
  $('scanBtn').disabled = false;
  runScan();
}

$('logoutBtn').addEventListener('click', async () => {
  if (ui.running && !confirm(ui.t('step3.logoutRunning'))) return;
  await studip.logout();
  ui.user = null;
  ui.areas = [];
  ui.selected.clear();
  ui.scanStatus = null;
  $('userChip').hidden = true;
  $('loginForm').hidden = false;
  $('loginHint').hidden = false;
  show('loginOk', null);
  $('selection').hidden = true;
  $('scanStatus').textContent = '';
  $('scanBtn').disabled = true;
  $('scanBtn').textContent = ui.t('step2.scan');
  setStep(1, 'active');
  setStep(2, 'disabled');
  setStep(3, 'disabled');
});

// ------------------------------------------------------------------ Schritt 2: Einlesen und Auswählen

function renderScanStatus() {
  const s = ui.scanStatus;
  const t = ui.t;
  if (!s) return ($('scanStatus').textContent = '');
  if (s.kind === 'progress') {
    $('scanStatus').textContent = s.total ? t('step2.scanning', { done: s.done, total: s.total, label: s.label || t('page.personalHeading') }) : t('step2.loadingCourses');
  } else if (s.kind === 'found') {
    const courses = ui.areas.filter((a) => a.kind === 'course').length;
    const files = ui.areas.reduce((x, a) => x + a.fileCount, 0);
    const bytes = ui.areas.reduce((x, a) => x + a.bytes, 0);
    $('scanStatus').textContent = t('step2.found', { courses: t.n('course', courses), files: t.n('file', files), size: fmt(bytes) });
  } else {
    $('scanStatus').textContent = t(s.key);
  }
}

async function runScan() {
  if (ui.scanning) return;
  show('scanError', null);
  ui.scanning = true;
  ui.result = null;
  $('resultBox').hidden = true;
  $('progressBox').hidden = true;
  $('scanBtn').disabled = true;
  ui.scanStatus = { kind: 'text', key: 'step2.connecting' };
  renderScanStatus();
  updateStart();
  const r = await studip.scan();
  ui.scanning = false;
  $('scanBtn').disabled = false;
  if (!r.ok) {
    ui.scanStatus = null;
    renderScanStatus();
    updateStart();
    if (r.code === 'session') return sessionLost();
    return show('scanError', ui.t('step2.scanFailed', { error: r.error }));
  }
  ui.areas = r.value.areas;
  ui.opencast = r.value.opencast;
  const ids = new Set(ui.areas.map((a) => a.id));
  for (const id of [...ui.selected]) if (!ids.has(id) || !hasContent(ui.areas.find((a) => a.id === id))) ui.selected.delete(id);
  ui.scanStatus = { kind: 'found' };
  renderScanStatus();
  $('scanBtn').textContent = ui.t('step2.rescan');
  renderSelection();
  $('selection').hidden = false;
  setStep(2, 'done');
  setStep(3, 'active');
  $('chooseBtn').disabled = false;
  updateStart();
}

const hasContent = (a) => !!a && (a.fileCount > 0 || a.recordings.length > 0);
const selectable = (a) => !a.scanned || hasContent(a);

$('scanBtn').addEventListener('click', runScan);

// Überblick sofort zeigen und laufend ergänzen, während die Kurse eingelesen werden
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderSelection();
  });
}
studip.onScanUpdate((u) => {
  if (!ui.scanning) return;
  if (u.type === 'courses') {
    ui.areas = u.areas;
    ui.selected = new Set(ui.areas.map((a) => a.id));
    $('selection').hidden = false;
    queueRender();
  } else if (u.type === 'area') {
    const i = ui.areas.findIndex((a) => a.id === u.area.id);
    if (i >= 0) ui.areas[i] = u.area;
    if (!hasContent(u.area)) ui.selected.delete(u.area.id);
    queueRender();
  }
});

function renderSelection() {
  const t = ui.t;
  const list = $('semesterList');
  const openSems = new Set([...list.querySelectorAll('.semester[open]')].map((d) => d.dataset.semester));
  list.replaceChildren();
  const groups = new Map();
  for (const a of ui.areas) {
    const key = a.kind === 'personal' ? '' : a.semester;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const ordered = [...groups.entries()].sort((x, y) => semesterKey(y[0]) - semesterKey(x[0]));
  for (const [semester, areas] of ordered) {
    const name = semester || t('step2.personal');
    const usable = areas.filter(selectable);
    const semBox = el('input', { type: 'checkbox', 'aria-label': t('step2.selectSemester', { name }) });
    semBox.disabled = usable.length === 0;
    semBox.addEventListener('click', (e) => e.stopPropagation());
    semBox.addEventListener('change', () => {
      for (const a of usable) semBox.checked ? ui.selected.add(a.id) : ui.selected.delete(a.id);
      renderSelectionState();
    });
    const semBytes = areas.reduce((s, a) => s + a.bytes, 0);
    const details = el(
      'details',
      { class: 'semester', 'data-semester': semester },
      el(
        'summary',
        {},
        semBox,
        el('span', { class: 'name', text: name }),
        el('span', { class: 'meta', text: semester ? t.n('course', areas.length) : '' }),
        el('span', { class: 'meta size', text: areas.some((a) => !a.scanned) ? '…' : fmt(semBytes) })
      )
    );
    if (openSems.has(semester)) details.open = true;
    for (const a of areas) {
      const box = el('input', { type: 'checkbox', 'data-id': a.id, 'aria-label': a.label || name });
      box.disabled = !selectable(a);
      box.addEventListener('change', () => {
        box.checked ? ui.selected.add(a.id) : ui.selected.delete(a.id);
        renderSelectionState();
      });
      const title = el('div', { class: 'title', title: a.label, text: a.label || t('page.personalHeading') });
      const notes = a.errors.map((e) => t.err(e));
      const info = !a.scanned
        ? t('step2.pending')
        : [
            a.fileCount ? t.n('file', a.fileCount) : t('step2.noFiles'),
            a.recordingsTotal
              ? t.n('recording', a.recordingsTotal) + (a.recordings.length < a.recordingsTotal ? ` (${t('step2.downloadable', { count: num(a.recordings.length) })})` : '')
              : '',
          ]
            .filter(Boolean)
            .join(' · ');
      details.append(
        el(
          'label',
          { class: 'course' + (!a.scanned ? ' pending' : hasContent(a) ? '' : ' empty') },
          box,
          el('div', { class: 'info' }, title, notes.length ? el('span', { class: 'warn', text: '⚠ ' + notes.join(' · ') }) : null),
          el('span', { class: 'meta', text: info }),
          el('span', { class: 'meta size', text: a.fileCount ? fmt(a.bytes) : '' })
        )
      );
    }
    list.append(details);
  }
  renderSelectionState();
}

function computeSelection() {
  const filter = currentFilter();
  const s = { courses: 0, files: 0, bytes: 0, filtered: 0, recs: 0, recBytes: 0, cats: {} };
  for (const c of CATEGORIES) s.cats[c] = { n: 0, bytes: 0 };
  for (const a of ui.areas) {
    if (!ui.selected.has(a.id)) continue;
    if (a.kind === 'course') s.courses++;
    for (const raw of a.files) {
      const f = fileObj(raw);
      s.cats[f.cat] = s.cats[f.cat] || { n: 0, bytes: 0 };
      s.cats[f.cat].n++;
      s.cats[f.cat].bytes += f.size || 0;
      if (passes(f, filter)) {
        s.files++;
        s.bytes += f.size || 0;
      } else s.filtered++;
    }
    if (ui.recordings.enabled) {
      for (const [hi, lo] of a.recordings) {
        s.recs++;
        s.recBytes += ui.recordings.quality === 'low' ? lo : hi;
      }
    }
  }
  return s;
}

function renderSelectionState() {
  const t = ui.t;
  for (const box of document.querySelectorAll('.course input[type="checkbox"]')) box.checked = ui.selected.has(box.dataset.id);
  for (const det of document.querySelectorAll('.semester')) {
    const boxes = [...det.querySelectorAll('.course input:not(:disabled)')];
    const semBox = det.querySelector('summary input');
    const n = boxes.filter((b) => b.checked).length;
    semBox.checked = boxes.length > 0 && n === boxes.length;
    semBox.indeterminate = n > 0 && n < boxes.length;
  }
  const s = computeSelection();
  let summary = t('step2.selected', { courses: t.n('course', s.courses), files: t.n('file', s.files), size: fmt(s.bytes) });
  if (s.recs) summary = t('step2.withRecordings', { selection: summary, recordings: t.n('recording', s.recs), size: fmt(s.recBytes) });
  $('selSummary').textContent = summary;
  $('filteredNote').textContent = s.filtered ? t('opt.filtered', { files: t.n('file', s.filtered) }) : '';
  renderChips(s);
  renderRecordingsInfo();
  updateStart();
}

function renderChips(s) {
  const t = ui.t;
  const box = $('typeChips');
  box.replaceChildren();
  for (const c of CATEGORIES) {
    const stat = s.cats[c];
    if (!stat || !stat.n) continue;
    const input = el('input', { type: 'checkbox' });
    input.checked = ui.filter.categories.has(c);
    input.addEventListener('change', () => {
      input.checked ? ui.filter.categories.add(c) : ui.filter.categories.delete(c);
      renderSelectionState();
    });
    box.append(
      el('label', { class: 'chip-check' + (input.checked ? ' on' : '') }, input, el('span', { text: t(`cat.${c}`) }), el('span', { class: 'meta', text: `${num(stat.n)} · ${fmt(stat.bytes)}` }))
    );
  }
}

function renderRecordingsInfo() {
  const t = ui.t;
  const all = ui.areas.flatMap((a) => a.recordings); // nur die mit Download-Freigabe
  const total = ui.areas.reduce((s, a) => s + (a.recordingsTotal || 0), 0);
  const available = (ui.opencast && ui.opencast.available) || total > 0;
  $('recordingsRow').hidden = !available;
  $('includeRecordings').disabled = !all.length;
  if (!available) {
    $('recordingsInfo').textContent = '';
    $('qualityRow').hidden = true;
    return;
  }
  if (!all.length) {
    $('recordingsInfo').textContent = total ? t('opt.recordingsNoDownload', { total: t.n('recording', total) }) : t('opt.recordingsNone');
    $('includeRecordings').checked = false;
    ui.recordings.enabled = false;
  } else {
    const size = all.reduce((s, [hi, lo]) => s + (ui.recordings.quality === 'low' ? lo : hi), 0);
    $('recordingsInfo').textContent =
      total > all.length
        ? t('opt.recordingsSome', { total: t.n('recording', total), count: num(all.length), size: fmt(size) })
        : t('opt.recordingsHint', { count: t.n('recording', all.length), size: fmt(size) });
  }
  // Qualitätswahl gibt es nur bei Opencast (MediaCast liefert eine Fassung)
  $('qualityRow').hidden = !ui.recordings.enabled || !(ui.opencast && ui.opencast.available);
}

$('selAll').addEventListener('click', () => {
  ui.selected = new Set(ui.areas.filter(selectable).map((a) => a.id));
  renderSelectionState();
});
$('selNone').addEventListener('click', () => {
  ui.selected.clear();
  renderSelectionState();
});
$('expandAll').addEventListener('click', () => {
  const dets = [...document.querySelectorAll('.semester')];
  const open = !dets.every((d) => d.open);
  dets.forEach((d) => (d.open = open));
  $('expandAll').textContent = ui.t(open ? 'step2.collapseAll' : 'step2.expandAll');
});
$('maxSize').addEventListener('change', () => {
  ui.filter.maxBytes = Number($('maxSize').value) || 0;
  renderSelectionState();
});
$('includeRecordings').addEventListener('change', () => {
  ui.recordings.enabled = $('includeRecordings').checked;
  renderSelectionState();
});
$('quality').addEventListener('change', () => {
  ui.recordings.quality = $('quality').value;
  renderSelectionState();
});
$('includeMessages').addEventListener('change', () => {
  ui.includeMessages = $('includeMessages').checked;
  updateStart();
});

// ------------------------------------------------------------------ Schritt 3: Sichern

async function initTarget() {
  const r = await studip.defaultFolder();
  if (r.ok) setTarget(r.value);
}
function setTarget(p) {
  ui.target = p;
  $('targetPath').textContent = p;
  $('targetPath').title = p;
  updateStart();
}
$('chooseBtn').addEventListener('click', async () => {
  const r = await studip.chooseFolder();
  if (r.ok && r.value) setTarget(r.value);
});

function updateStart() {
  $('startBtn').disabled = ui.running || ui.scanning || !ui.target || !ui.areas.length || (ui.selected.size === 0 && !ui.includeMessages);
}

async function startBackup() {
  const t = ui.t;
  ui.running = true;
  ui.result = null;
  updateStart();
  $('chooseBtn').disabled = true;
  $('scanBtn').disabled = true;
  $('cancelBtn').hidden = false;
  $('progressBox').hidden = false;
  $('resultBox').hidden = true;
  $('barFill').style.width = '0%';
  $('progressText').textContent = t('step3.starting');
  $('progressPct').textContent = '';
  $('currentFile').textContent = '';
  setStep(3, 'active');
  $('progressBox').scrollIntoView({ behavior: 'smooth', block: 'center' });

  const r = await studip.start({
    areaIds: [...ui.selected],
    includeMessages: ui.includeMessages,
    target: ui.target,
    filter: currentFilter(),
    recordings: ui.recordings.enabled ? { quality: ui.recordings.quality } : null,
  });

  ui.running = false;
  $('progressText').textContent = '';
  $('currentFile').textContent = '';
  $('cancelBtn').hidden = true;
  $('chooseBtn').disabled = false;
  $('scanBtn').disabled = false;
  updateStart();
  ui.result = r;
  renderResult(r);
  if (r.ok && r.value.sessionExpired) sessionLost(true);
  $('resultBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderResult(r) {
  const t = ui.t;
  $('resultBox').hidden = false;
  $('againBtn').hidden = true;
  $('overviewBtn').hidden = true;
  if (!r.ok) {
    $('resultText').textContent = t('step3.failed', { error: r.error });
    $('againBtn').hidden = false;
    $('errorDetails').hidden = true;
    return;
  }
  const s = r.value;
  let text;
  if (s.sessionExpired) {
    text = t('step3.expired', { files: t.n('file', s.downloaded) });
  } else if (s.cancelled) {
    text = t('step3.cancelled', { files: t.n('file', s.downloaded) });
    $('againBtn').hidden = false;
  } else {
    text = t('step3.done', { files: t.n('file', s.downloaded), size: fmt(s.bytes), skipped: num(s.skipped) });
    if (s.updated) text += ' ' + t('step3.updated', { files: t.n('file', s.updated) });
    if (s.failed) text += ' ' + t('step3.someFailed', { files: t.n('file', s.failed) });
    $('barFill').style.width = '100%';
    setStep(3, 'done');
  }
  $('overviewBtn').hidden = !s.overview;
  $('resultText').textContent = text;
  if (s.errorCount) {
    $('errorDetails').hidden = false;
    $('errorSummary').textContent = t('step3.notes', { count: t.n('note', s.errorCount), file: t('file.errors') });
    $('errorList').replaceChildren(...s.errors.map((e) => el('li', { text: e })));
  } else {
    $('errorDetails').hidden = true;
  }
}

$('startBtn').addEventListener('click', startBackup);
$('againBtn').addEventListener('click', startBackup);
$('cancelBtn').addEventListener('click', async () => {
  $('cancelBtn').disabled = true;
  await studip.cancel();
  $('cancelBtn').disabled = false;
});
$('openBtn').addEventListener('click', () => studip.openFolder(ui.target));
$('overviewBtn').addEventListener('click', () => {
  if (ui.result && ui.result.ok && ui.result.value.overview) studip.openFile(ui.result.value.overview);
});

function sessionLost(keepSelection) {
  ui.user = null;
  $('userChip').hidden = true;
  $('loginForm').hidden = false;
  $('loginHint').hidden = false;
  show('loginOk', null);
  show('loginError', ui.t('step1.expired'));
  setStep(1, 'active');
  if (!keepSelection) {
    setStep(2, 'disabled');
    setStep(3, 'disabled');
  }
}

// ------------------------------------------------------------------ Fortschritt

studip.onProgress((p) => {
  const t = ui.t;
  if (p.phase === 'scan') {
    if (!ui.scanning) return; // verspätete Meldung nach dem Ende des Einlesens
    ui.scanStatus = { kind: 'progress', done: p.done, total: p.total, label: p.label };
    renderScanStatus();
  } else if (p.phase === 'details') {
    $('progressText').textContent = t('step3.details', { done: p.done + 1, total: p.total, label: p.label });
    $('currentFile').textContent = '';
  } else if (p.phase === 'download') {
    const pct = p.bytesTotal ? Math.min(100, (p.bytesDone / p.bytesTotal) * 100) : p.filesTotal ? (p.filesDone / p.filesTotal) * 100 : 0;
    $('barFill').style.width = pct.toFixed(1) + '%';
    $('progressPct').textContent = Math.floor(pct) + ' %';
    $('progressText').textContent = t('step3.progress', { done: num(p.filesDone), files: t.n('file', p.filesTotal), bytesDone: fmt(p.bytesDone), bytesTotal: fmt(p.bytesTotal) });
    $('currentFile').textContent = p.current || '';
  } else if (p.phase === 'messages') {
    $('progressText').textContent = t('step3.messages', { box: p.box });
    $('currentFile').textContent = '';
  } else if (p.phase === 'pages') {
    $('progressText').textContent = t('step3.pages');
    $('currentFile').textContent = '';
  }
});

// ------------------------------------------------------------------ Updates

function renderUpdate(s) {
  const t = ui.t;
  $('updateNote').textContent = '';
  if (s.status === 'available' || s.status === 'downloading' || s.status === 'ready') {
    $('updateBar').hidden = false;
    $('updateBtn').hidden = s.status === 'downloading';
    if (s.status === 'available') {
      $('updateText').textContent = t('update.available', { version: s.version });
      $('updateBtn').textContent = t('update.download');
    } else if (s.status === 'downloading') {
      $('updateText').textContent = t('update.downloading', { version: s.version, percent: s.percent || 0 });
    } else {
      $('updateText').textContent = t('update.ready', { version: s.version });
      $('updateBtn').textContent = t('update.restart');
    }
  } else if (s.status === 'none') {
    $('updateNote').textContent = t('update.none');
  } else if (s.status === 'error') {
    $('updateNote').textContent = t('update.error');
  }
}
studip.onUpdate((s) => {
  ui.update = s;
  renderUpdate(s);
});
$('updateBtn').addEventListener('click', () => studip.updateAction());
$('updateClose').addEventListener('click', () => ($('updateBar').hidden = true));
$('checkUpdatesBtn').addEventListener('click', () => studip.checkUpdates());
$('autoUpdate').addEventListener('change', () => studip.setAutoUpdate($('autoUpdate').checked));

// ------------------------------------------------------------------ Start

(async () => {
  const s = await studip.settings();
  if (s.ok) {
    const st = s.value;
    ui.lang = st.lang || 'de';
    ui.t = KH_I18N.create(ui.lang);
    fillHostSelect();
    if (st.host) selectHost(st.host);
    if (st.filter && Array.isArray(st.filter.categories)) {
      ui.filter.categories = new Set(st.filter.categories.filter((c) => CATEGORIES.includes(c)));
      ui.filter.maxBytes = st.filter.maxBytes || 0;
      $('maxSize').value = String(ui.filter.maxBytes);
      if ($('maxSize').value !== String(ui.filter.maxBytes)) $('maxSize').value = '0';
    }
    if (st.recordings && st.recordings.quality) {
      ui.recordings.quality = st.recordings.quality;
      $('quality').value = st.recordings.quality;
    }
    $('autoUpdate').checked = st.autoUpdate !== false;
    if (typeof st.includeMessages === 'boolean') {
      ui.includeMessages = st.includeMessages;
      $('includeMessages').checked = st.includeMessages;
    }
  }
  const v = await studip.version();
  if (v.ok) ui.version = v.value;
  applyI18n();
  await initTarget();
})();
