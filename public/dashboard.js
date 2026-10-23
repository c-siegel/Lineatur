// Dashboard: "My documents", "My collections", templates, the how-to (Anleitung).
//
// Everything lives in the browser's private library (store.js). Cards show a
// small image of each sheet's first page; it is made in the browser from the
// SVG the server renders, and kept in IndexedDB until the document changes.

import {
  listDocs, putDoc, deleteDocs, listCollections, putCollection, deleteCollection, listThumbs, putThumb,
  listTemplates, deleteTemplate,
} from './store.js';
import { META, META_LABELS, normalizeMeta } from './meta.js';
import { FORMATS } from './layout.js';
import { svgIcon } from './icons.js';
import { ATTRIBUTIONS, OWN_LICENSE, SOURCE_URL } from './attributions.js';

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const icon = (name, cls = '') => { const s = h('span', { class: 'ico ' + cls }); s.append(svgIcon(name)); return s; };

// portrait formats get a tall thumbnail (A4 and the A5 booklet pages)
const isPortrait = (format) => ['a4', 'a5'].includes(format || 'a4');
// The how-to is put into the templates once, as an ordinary template the user may delete;
// it is not added again afterwards (remembered in this browser).
const SEEDED = 'lineatur-seeded-anleitung';
let seeding = null; // one run at a time, even if the dashboard refreshes twice quickly
function seedTemplates() {
  seeding ??= (async () => {
    try { if (localStorage.getItem(SEEDED)) return; } catch { return; }
    try {
      const res = await fetch('/api/sample?name=anleitung');
      if (!res.ok) return;
      await api.importTemplates(await res.text());
      localStorage.setItem(SEEDED, '1');
    } catch { /* next start tries again */ }
  })();
  return seeding;
}
const SORTS = [['name-asc', 'Name (A–Z)'], ['name-desc', 'Name (Z–A)'], ['changed-desc', 'Zuletzt geändert'], ['changed-asc', 'Älteste zuerst']];

let api = null; // callbacks from the editor: open(id), create(doc?), importText(text), importTemplates(text), saveTemplate(doc)
const state = {
  view: 'docs', collectionId: null,
  q: '', filters: Object.fromEntries(META_LABELS.map(([k]) => [k, new Set()])),
  sort: 'name-asc', selecting: false, selected: new Set(),
  entries: [], collections: [], templates: [], thumbs: new Map(), guide: null,
};
try { state.sort = localStorage.getItem('lineatur-dash-sort') || state.sort; } catch { /* default */ }

// ----------------------------------------------------------- thumbnails --

/** A page SVG of the preview (which refers to the shared glyphs and to its images
 *  by hash) as a standalone SVG. */
export function pageWithDefs(shared, pageSvg, images = {}) {
  return pageSvg.replace(/^<svg[^>]*>/, (head) => head + shared)
    .replace(/href="img:([\w-]+)"/g, (m, k) => `href="${images[k] ?? ''}"`);
}

/** Page SVG -> small image (data URL) for a card. */
export async function makeThumb(pageSvg, width = 300) {
  const vb = (/viewBox="([^"]+)"/.exec(pageSvg)?.[1] || '').split(/[\s,]+/).map(Number);
  const ratio = vb.length === 4 && vb[2] > 0 ? vb[3] / vb[2] : 297 / 210;
  const height = Math.round(width * ratio);
  // typst.ts adds invisible <foreignObject> text layers (for selecting text);
  // the browser refuses to export a canvas that drew them, and they draw nothing anyway
  const sized = pageSvg
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/g, '')
    .replace(/^<svg/, `<svg width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = width * 2;
    c.height = height * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderThumb(doc) {
  const res = await fetch('/api/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, solutions: false }),
  });
  const data = await res.json();
  if (!data.ok || !data.pages?.length) return null;
  return makeThumb(pageWithDefs(data.shared || '', data.pages[0].svg, data.images));
}

let thumbQueue = Promise.resolve();
/** Make missing or outdated thumbnails one after another, updating cards as they arrive. */
function ensureThumbs(entries) {
  const todo = entries.filter((e) => {
    const t = state.thumbs.get(e.id);
    return !t || t.updated < e.updated;
  });
  for (const e of todo) {
    thumbQueue = thumbQueue.then(async () => {
      const t = state.thumbs.get(e.id);
      if (t && t.updated >= e.updated) return;
      try {
        const src = await renderThumb(e.doc);
        if (!src) return;
        await putThumb(e.id, src);
        state.thumbs.set(e.id, { id: e.id, updated: Date.now(), src });
        document.querySelectorAll(`[data-thumb="${CSS.escape(e.id)}"]`).forEach((img) => { img.src = src; img.hidden = false; });
      } catch { /* the card keeps its placeholder */ }
    });
  }
}

// --------------------------------------------------------------- filters --

/** All user-visible text of a document, for the search box. */
function searchText(d) {
  const out = [];
  const walk = (v, key) => {
    if (key === 'src' || key === 'logo' || key === 'id' || key === 'seed') return;
    if (typeof v === 'string') { if (!v.startsWith('data:') && v.length < 5000) out.push(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk({ title: d.title, subtitle: d.subtitle, description: d.description, className: d.className, pathTitle: d.pathTitle, blocks: d.blocks, meta: d.meta });
  return out.join(' ').toLowerCase();
}

function matches(entry) {
  const d = entry.doc || {};
  for (const [k, set] of Object.entries(state.filters)) {
    if (set.size && !set.has(d.meta?.[k])) return false;
  }
  const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  entry.text ??= searchText(d);
  return words.every((w) => entry.text.includes(w));
}

function sorted(list) {
  const name = (e) => (e.title || 'Ohne Titel').toLocaleLowerCase();
  const by = {
    'name-asc': (a, b) => name(a).localeCompare(name(b)),
    'name-desc': (a, b) => name(b).localeCompare(name(a)),
    'changed-desc': (a, b) => b.updated - a.updated,
    'changed-asc': (a, b) => a.updated - b.updated,
  }[state.sort] || (() => 0);
  return list.slice().sort(by);
}

const activeFilters = () => Object.values(state.filters).some((s) => s.size) || state.q.trim();

function renderFilterBar() {
  $('dash-filters').replaceChildren(...META_LABELS.map(([k, label]) => {
    const n = state.filters[k].size;
    return h('button', { class: 'dfilter' + (n ? ' on' : ''), 'aria-haspopup': 'true', onclick: (e) => { e.stopPropagation(); openFilter(k, e.currentTarget); } },
      n ? `${label} (${n})` : label, icon('chevron'));
  }));
}

function openFilter(key, anchor) {
  const pop = $('dash-pop');
  const set = state.filters[key];
  pop.replaceChildren(
    ...META[key].map((v) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: set.has(v), onchange: (e) => {
        if (e.target.checked) set.add(v); else set.delete(v);
        renderFilterBar(); renderMain();
      } }), v)),
    h('button', { class: 'linkish', onclick: () => { set.clear(); pop.hidden = true; renderFilterBar(); renderMain(); } }, 'Zurücksetzen'));
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(r.left, window.innerWidth - 260)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  pop.hidden = false;
}

// ---------------------------------------------------------------- dialogs --

/** Small modal with OK / Cancel. Resolves true on OK. Also used by the editor. */
export function dialog(title, body, { ok = 'Speichern', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' },
      h('form', { method: 'dialog' },
        h('div', { class: 'dlg-head' }, h('h2', {}, title)),
        h('div', { class: 'dlg-body' }, body),
        h('div', { class: 'dlg-actions' },
          h('button', { class: 'btn', value: 'cancel', type: 'submit', formnovalidate: true }, 'Abbrechen'),
          h('button', { class: 'btn ' + (danger ? 'danger-fill' : 'primary'), value: 'ok', type: 'submit' }, ok))));
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok); dlg.remove(); };
    // answer on the button press itself; 'close' (also fired by Escape) is the fallback,
    // since browsers may delay it, e.g. in background tabs
    dlg.querySelector('form').addEventListener('submit', (e) => {
      if (e.submitter?.value !== 'ok' || e.target.checkValidity()) finish(e.submitter?.value === 'ok');
    });
    dlg.addEventListener('close', () => finish(dlg.returnValue === 'ok'));
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('input, select')?.focus();
  });
}

async function chooseCollection(newOnly) {
  const name = h('input', { type: 'text', placeholder: 'Name der neuen Sammlung', required: newOnly || null });
  const radios = newOnly ? [] : state.collections.map((c) => h('label', { class: 'check' },
    h('input', { type: 'radio', name: 'coll', value: c.id }), `${c.title} (${c.docIds.length})`));
  const body = h('div', { class: 'stack' },
    ...radios,
    newOnly ? null : h('label', { class: 'check' }, h('input', { type: 'radio', name: 'coll', value: '__new', checked: true }), 'Neue Sammlung:'),
    name);
  name.addEventListener('focus', () => { const r = body.querySelector('input[value="__new"]'); if (r) r.checked = true; });
  if (!(await dialog(newOnly ? 'Sammlung erstellen' : 'Zu Sammlung hinzufügen', body, { ok: newOnly ? 'Erstellen' : 'Hinzufügen' }))) return null;
  const pick = body.querySelector('input[name="coll"]:checked')?.value ?? '__new';
  if (pick !== '__new') return state.collections.find((c) => c.id === pick);
  const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: name.value.trim() || 'Neue Sammlung', docIds: [], created: Date.now() };
  return c;
}

// ---------------------------------------------------------------- actions --

const selectedEntries = () => state.entries.filter((e) => state.selected.has(e.id));

async function download(res, fallback) {
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    alert(e.error || 'Export fehlgeschlagen');
    return;
  }
  const name = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || fallback);
  const a = h('a', { href: URL.createObjectURL(await res.blob()), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

async function exportPdf(entries, solutions) {
  setBusy(`${entries.length > 1 ? 'PDFs werden' : 'PDF wird'} erstellt…`);
  try {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (entries.length === 1 && !solutions) await download(await post('/api/pdf', { doc: entries[0].doc }), 'Arbeitsblatt.pdf');
    else await download(await post('/api/pdf-zip', { docs: entries.map((e) => e.doc), solutions }), 'Arbeitsblaetter.zip');
  } finally {
    setBusy('');
  }
}

async function changeMetadata(entries) {
  const selects = META_LABELS.map(([k, label]) => {
    const values = new Set(entries.map((e) => e.doc?.meta?.[k] || ''));
    const same = values.size === 1 ? [...values][0] : null;
    const sel = h('select', { 'data-key': k },
      h('option', { value: '__keep' }, same === null ? '– beibehalten (unterschiedliche Werte) –' : '– beibehalten –'),
      h('option', { value: '' }, '(keine Angabe)'),
      META[k].map((v) => h('option', { value: v }, v)));
    sel.value = same === null ? '__keep' : same;
    return h('label', {}, label, sel);
  });
  const body = h('div', { class: 'stack' }, h('p', { class: 'hint' }, `Gilt für ${entries.length} Dokument${entries.length === 1 ? '' : 'e'}.`), ...selects);
  if (!(await dialog('Metadaten ändern', body))) return;
  for (const e of entries) {
    const d = structuredClone(e.doc);
    d.meta = { ...(d.meta || {}) };
    for (const sel of body.querySelectorAll('select')) {
      if (sel.value === '__keep') continue;
      if (sel.value) d.meta[sel.dataset.key] = sel.value; else delete d.meta[sel.dataset.key];
    }
    await putDoc(d);
  }
  endSelection();
  await refresh();
}

async function deleteSelected(entries) {
  const body = h('p', {}, `${entries.length} Dokument${entries.length === 1 ? '' : 'e'} löschen? Das lässt sich nicht rückgängig machen. `,
    'Exportieren Sie sie vorher als JSON, wenn Sie eine Sicherung möchten.');
  if (!(await dialog('Dokumente löschen', body, { ok: 'Löschen', danger: true }))) return;
  await deleteDocs(entries.map((e) => e.id));
  endSelection();
  await refresh();
}

async function duplicate(entries) {
  for (const e of entries) {
    const d = structuredClone(e.doc);
    d.id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    d.title = `${e.title || 'Ohne Titel'} (Kopie)`;
    await putDoc(d);
  }
  endSelection();
  await refresh();
}

function actionItems() {
  const sel = selectedEntries();
  const none = !sel.length;
  const items = [
    ['folder', 'Sammlung erstellen', async () => {
      const c = await chooseCollection(true);
      if (!c) return;
      await putCollection({ ...c, docIds: [...new Set([...c.docIds, ...sel.map((e) => e.id)])] });
      endSelection(); await refresh();
    }],
    ['folderPlus', 'Zu Sammlung hinzufügen…', async () => {
      const c = await chooseCollection(false);
      if (!c) return;
      await putCollection({ ...c, docIds: [...new Set([...c.docIds, ...sel.map((e) => e.id)])] });
      endSelection(); await refresh();
    }],
    ['download', 'Ausgewählte als PDF exportieren', () => exportPdf(sel, false)],
    ['download', 'Mit Lösungsblättern als PDF exportieren (ZIP)', () => exportPdf(sel, true)],
    ['doc', 'Als JSON exportieren', () => {
      const blob = new Blob([JSON.stringify({ documents: sel.map((e) => e.doc) }, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `Arbeitsblätter (${sel.length}).json` });
      document.body.append(a); a.click(); a.remove();
    }],
    ['copy', 'Duplizieren', () => duplicate(sel)],
    ['settings', 'Metadaten ändern', () => changeMetadata(sel)],
  ];
  if (state.view === 'collection') {
    items.push(['minus', 'Aus Sammlung entfernen', async () => {
      const c = state.collections.find((x) => x.id === state.collectionId);
      await putCollection({ ...c, docIds: c.docIds.filter((id) => !state.selected.has(id)) });
      endSelection(); await refresh();
    }]);
  }
  items.push(['trash', 'Ausgewählte löschen', () => deleteSelected(sel), 'danger']);
  return items.map(([ic, label, fn, cls]) => h('button', { role: 'menuitem', class: cls || '', disabled: none || null,
    onclick: () => { $('dash-pop').hidden = true; fn(); } }, icon(ic), label));
}

function openActions(anchor) {
  openMenu(anchor, actionItems());
}

/** Show menu buttons in the dashboard popup under the anchor (kept inside the window). */
function openMenu(anchor, buttons) {
  const pop = $('dash-pop');
  pop.replaceChildren(h('div', { class: 'menu-list', role: 'menu' }, ...buttons));
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8))}px`;
  const below = r.bottom + 6;
  pop.style.top = `${below + pop.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - pop.offsetHeight - 6) : below}px`;
  pop.querySelector('button:not(:disabled)')?.focus();
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fileBase = (e) => (e.title || 'Arbeitsblatt').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'Arbeitsblatt';

/** One export of one document (PDF, solution, booklet, HTML), with the busy note. */
async function exportOne(e, what) {
  const jobs = {
    pdf: ['PDF wird erstellt…', '/api/pdf', { doc: e.doc }, `${fileBase(e)}.pdf`],
    solution: ['Lösungsblatt wird erstellt…', '/api/pdf', { doc: e.doc, solutions: true }, `${fileBase(e)} - Lösung.pdf`],
    booklet: ['Broschüre wird erstellt…', '/api/pdf', { doc: e.doc, booklet: true }, `${fileBase(e)} - Broschüre.pdf`],
    html: ['Digitale Fassung wird erstellt…', '/api/html', { doc: e.doc }, `${fileBase(e)} - digital.html`],
  };
  const [busy, url, body, name] = jobs[what];
  setBusy(busy);
  try { await download(await post(url, body), name); } finally { setBusy(''); }
}

async function renameDoc(e) {
  const input = h('input', { type: 'text', value: e.title || '', required: true, 'aria-label': 'Titel' });
  if (!(await dialog('Umbenennen', h('label', {}, 'Titel', input), { ok: 'Umbenennen' }))) return;
  const title = input.value.trim();
  if (!title || title === e.title) return;
  await putDoc({ ...structuredClone(e.doc), title });
  await refresh();
}

/** The "⋯" menu of one document card: open, rename, export, copy, collections, delete. */
function cardMenuItems(e) {
  const d = e.doc || {};
  const one = [e];
  const addTo = async (newOnly) => {
    const c = await chooseCollection(newOnly);
    if (!c) return;
    await putCollection({ ...c, docIds: [...new Set([...c.docIds, e.id])] });
    await refresh();
  };
  const items = [
    ['pencil', 'Bearbeiten', () => api.open(e.id)],
    ['doc', 'Umbenennen…', () => renameDoc(e)],
    ['copy', 'Duplizieren', () => duplicate(one)],
    '-',
    ['download', 'PDF herunterladen', () => exportOne(e, 'pdf')],
    ['download', 'PDF – Lösungsblatt', () => exportOne(e, 'solution')],
    d.booklet?.on ? ['book', 'PDF – Broschüre (A4 zum Falten)', () => exportOne(e, 'booklet')] : null,
    ['download', h('span', {}, 'Digital (HTML) ', h('span', { class: 'beta', title: 'Noch in Erprobung: nicht jeder Baustein ist interaktiv, manche erscheinen als Bild' }, 'Beta')), () => exportOne(e, 'html')],
    ['doc', 'Als JSON exportieren', () => downloadJson(d, fileBase(e))],
    ['docPlus', 'Als Vorlage speichern', async () => {
      await api.saveTemplate(d);
      await refresh();
      notice(`„${e.title || 'Ohne Titel'}“ liegt jetzt unter Vorlagen.`);
    }],
    '-',
    ['folderPlus', 'Zu Sammlung hinzufügen…', () => addTo(false)],
    state.view === 'collection' ? ['minus', 'Aus dieser Sammlung entfernen', async () => {
      const c = state.collections.find((x) => x.id === state.collectionId);
      await putCollection({ ...c, docIds: c.docIds.filter((id) => id !== e.id) });
      await refresh();
    }] : null,
    ['settings', 'Metadaten ändern…', () => changeMetadata(one)],
    '-',
    ['trash', 'Löschen…', () => deleteSelected(one), 'danger'],
  ];
  return items.filter(Boolean).map((it) => (it === '-'
    ? h('hr')
    : h('button', { role: 'menuitem', class: it[3] || '', onclick: () => { $('dash-pop').hidden = true; it[2](); } }, icon(it[0]), it[1])));
}

function endSelection() {
  state.selecting = false;
  state.selected.clear();
}

function setBusy(text) {
  const el = $('dash-busy');
  el.textContent = text;
  el.hidden = !text;
}

/** Short confirmation at the bottom of the screen. */
function notice(text) {
  setBusy(text);
  setTimeout(() => { if ($('dash-busy').textContent === text) setBusy(''); }, 2500);
}

/** Downloads a worksheet as editable JSON. */
function downloadJson(d, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })), download: `${name}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ----------------------------------------------------------------- render --

function docCard(e) {
  const d = e.doc || {};
  const t = state.thumbs.get(e.id);
  const sel = state.selected.has(e.id);
  const sub = [d.meta?.subject, d.meta?.grade && `Klasse ${d.meta.grade}`].filter(Boolean).join(' · ');
  const card = h('div', {
    class: 'dcard' + (sel ? ' sel' : '') + (state.selecting ? ' selecting' : ''), role: 'button', tabindex: 0,
    'aria-pressed': state.selecting ? String(sel) : null,
    title: `${e.title || 'Ohne Titel'}\n${FORMATS[d.format]?.label || 'A4 Hochformat'} · ${(d.blocks || []).length} Bausteine · geändert ${new Date(e.updated).toLocaleString('de-DE')}`,
  },
  h('div', { class: 'dthumb' + (isPortrait(d.format) ? '' : ' wide') },
    h('img', { 'data-thumb': e.id, src: t?.src || null, alt: '', hidden: !t || null, loading: 'lazy' })),
  h('div', { class: 'dtitle' }, e.title || 'Ohne Titel'),
  sub ? h('div', { class: 'dsub' }, sub) : null,
  h('button', {
    class: 'dcheck', type: 'button', title: sel ? 'Auswahl aufheben' : 'Auswählen',
    'aria-label': `„${e.title || 'Ohne Titel'}“ ${sel ? 'abwählen' : 'auswählen'}`, 'aria-pressed': String(sel),
    onclick: (ev) => { ev.stopPropagation(); toggle(); },
    onkeydown: (ev) => ev.stopPropagation(),
  }, sel ? '✓' : ''),
  state.selecting ? null : h('button', {
    class: 'dmore', type: 'button', title: 'Weitere Aktionen', 'aria-label': `Aktionen für „${e.title || 'Ohne Titel'}“`, 'aria-haspopup': 'menu',
    onclick: (ev) => { ev.stopPropagation(); openMenu(ev.currentTarget, cardMenuItems(e)); },
    onkeydown: (ev) => ev.stopPropagation(),
  }, icon('more')));
  // right click opens the same menu
  card.addEventListener('contextmenu', (ev) => {
    if (state.selecting) return;
    ev.preventDefault();
    openMenu(card.querySelector('.dmore') || card, cardMenuItems(e));
  });
  const toggle = () => {
    if (sel) state.selected.delete(e.id); else state.selected.add(e.id);
    state.selecting = state.selected.size > 0;
    renderMain();
  };
  // while something is selected, a click anywhere on a card selects; otherwise it opens
  const activate = () => (state.selecting ? toggle() : api.open(e.id));
  card.addEventListener('click', activate);
  card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); } });
  return card;
}

function newCard(label, onclick) {
  return h('button', { class: 'dcard dnew', onclick }, icon('docPlus', 'big'), h('span', {}, label));
}

/** Title row + toolbar (new, select several, actions, sort) + grid + footer. */
function docsSection(title, entries, { head = [], showNew = true, emptyText = '' } = {}) {
  const shown = sorted(entries.filter(matches));
  const n = state.selected.size;
  const toolbar = h('div', { class: 'dtoolbar' },
    showNew ? h('button', { class: 'btn primary', onclick: () => api.create() }, icon('docPlus'), 'Neues Arbeitsblatt') : null,
    showNew ? h('button', { class: 'btn', onclick: () => $('dash-import').click() }, 'JSON importieren…') : null,
    h('span', { class: 'grow' }),
    state.selecting ? h('span', { class: 'selcount' }, `${n} ausgewählt`) : null,
    state.selecting ? h('button', { class: 'linkish', onclick: () => {
      if (shown.every((e) => state.selected.has(e.id))) shown.forEach((e) => state.selected.delete(e.id));
      else shown.forEach((e) => state.selected.add(e.id));
      renderMain();
    } }, 'Alle auswählen') : null,
    state.selecting ? h('button', { class: 'btn', 'aria-haspopup': 'menu',
      onclick: (ev) => { ev.stopPropagation(); openActions(ev.currentTarget); } }, 'Aktionen', icon('chevron')) : null,
    state.selecting ? h('button', { class: 'btn', onclick: () => { endSelection(); renderMain(); } }, icon('close'), 'Auswahl aufheben') : null);
  const sort = h('label', { class: 'dsort' }, 'Sortieren nach',
    h('select', { onchange: (ev) => { state.sort = ev.target.value; try { localStorage.setItem('lineatur-dash-sort', state.sort); } catch { /* */ } renderMain(); } },
      SORTS.map(([v, t]) => h('option', { value: v, selected: v === state.sort }, t))));
  const grid = h('div', { class: 'dgrid' },
    showNew && !state.selecting ? newCard('Neues Arbeitsblatt', () => api.create()) : null,
    ...shown.map(docCard));
  const empty = !shown.length
    ? h('p', { class: 'dempty' }, entries.length ? 'Kein Dokument passt zur Suche oder zu den Filtern.' : emptyText)
    : null;
  const filtersOn = activeFilters();
  return [
    h('div', { class: 'dhead' }, ...head, h('h1', {}, `${title} (${entries.length})`)),
    toolbar,
    sort,
    grid,
    empty,
    h('div', { class: 'dfoot' }, `${shown.length} von ${entries.length} Materialien`,
      filtersOn ? h('button', { class: 'linkish', onclick: clearFilters }, 'Suche und Filter zurücksetzen') : null),
  ];
}

function clearFilters() {
  state.q = '';
  $('dash-q').value = '';
  Object.values(state.filters).forEach((s) => s.clear());
  renderFilterBar(); renderMain();
}

function collectionCard(c) {
  const thumbs = c.docIds.map((id) => state.thumbs.get(id)?.src).filter(Boolean).slice(0, 4);
  const card = h('div', { class: 'dcard dcoll', role: 'button', tabindex: 0, title: c.title },
    h('div', { class: 'dthumb mosaic' }, ...thumbs.map((src) => h('img', { src, alt: '' })),
      thumbs.length ? null : icon('folder', 'big muted')),
    h('div', { class: 'dtitle' }, c.title),
    h('div', { class: 'dsub' }, `${c.docIds.length} Dokument${c.docIds.length === 1 ? '' : 'e'}`));
  const open = () => { location.hash = `#/collection/${c.id}`; };
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return card;
}

function collectionsView() {
  return [
    h('div', { class: 'dhead' }, h('h1', {}, `Meine Sammlungen (${state.collections.length})`)),
    h('p', { class: 'hint' }, 'Sammlungen bündeln Arbeitsblätter, z. B. für eine Unterrichtseinheit oder eine Klasse. Ein Arbeitsblatt kann in mehreren Sammlungen liegen.'),
    h('div', { class: 'dgrid' },
      newCard('Neue Sammlung', async () => {
        const c = await chooseCollection(true);
        if (c) { await putCollection(c); await refresh(); }
      }),
      ...state.collections.slice().sort((a, b) => a.title.localeCompare(b.title)).map(collectionCard)),
  ];
}

function collectionView() {
  const c = state.collections.find((x) => x.id === state.collectionId);
  if (!c) return [h('p', { class: 'dempty' }, 'Diese Sammlung gibt es nicht (mehr).')];
  const members = c.docIds.map((id) => state.entries.find((e) => e.id === id)).filter(Boolean);
  const head = [
    h('a', { class: 'backlink', href: '#/collections' }, '‹ Meine Sammlungen'),
    h('div', { class: 'collactions' },
      h('button', { class: 'btn small', onclick: async () => {
        const name = h('input', { type: 'text', value: c.title, required: true });
        if (await dialog('Sammlung umbenennen', name)) { await putCollection({ ...c, title: name.value.trim() || c.title }); await refresh(); }
      } }, 'Umbenennen'),
      h('button', { class: 'btn small', disabled: members.length ? null : true, onclick: () => exportPdf(members, false) }, icon('download'), 'Alle als PDF'),
      h('button', { class: 'btn small danger', onclick: async () => {
        const ok = await dialog('Sammlung löschen', h('p', {}, `Die Sammlung „${c.title}“ löschen? Die Arbeitsblätter darin bleiben erhalten.`), { ok: 'Löschen', danger: true });
        if (ok) { await deleteCollection(c.id); location.hash = '#/collections'; }
      } }, 'Sammlung löschen')),
  ];
  return docsSection(c.title, members, {
    head, showNew: false,
    emptyText: 'Diese Sammlung ist leer. Unter „Meine Dokumente“ Arbeitsblätter über den Kreis oben links auf dem Vorschaubild markieren und Aktionen → Zu Sammlung hinzufügen wählen.',
  });
}

async function templatesView() {
  ensureThumbs(state.templates);
  const card = (s) => {
    const t = state.thumbs.get(s.id);
    const title = s.title || 'Ohne Titel';
    const el = h('div', { class: 'dcard', role: 'button', tabindex: 0, title: `Eine eigene Kopie von „${title}“ anlegen` },
      h('div', { class: 'dthumb' + (isPortrait(s.doc.format) ? '' : ' wide') },
        h('img', { 'data-thumb': s.id, src: t?.src || null, alt: '', hidden: !t || null })),
      h('div', { class: 'dtitle' }, title),
      h('button', {
        class: 'dmore', type: 'button', title: 'Weitere Aktionen', 'aria-label': `Aktionen für „${title}“`, 'aria-haspopup': 'menu',
        onclick: (ev) => { ev.stopPropagation(); openMenu(ev.currentTarget, templateMenuItems(s)); },
        onkeydown: (ev) => ev.stopPropagation(),
      }, icon('more')));
    const use = () => api.create(structuredClone(s.doc));
    el.addEventListener('click', use);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') use(); });
    return el;
  };
  const list = state.templates.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  return [
    h('div', { class: 'dhead' }, h('h1', {}, `Vorlagen (${list.length})`)),
    h('div', { class: 'dtoolbar' },
      h('button', { class: 'btn', onclick: importTemplateFile }, icon('docPlus'), 'Vorlage importieren…'),
      h('span', { class: 'grow' })),
    h('p', { class: 'hint' }, 'Ein Klick auf eine Vorlage legt eine eigene Kopie unter „Meine Dokumente“ an. Über ⋯ lassen sich Vorlagen exportieren und löschen.'),
    list.length
      ? h('div', { class: 'dgrid' }, ...list.map(card))
      : h('p', { class: 'dempty' }, 'Noch keine Vorlagen. Importieren Sie ein Arbeitsblatt (JSON) als Vorlage, oder wählen Sie bei einem Ihrer Dokumente ⋯ → „Als Vorlage speichern“.'),
  ];
}

/** Lets the user pick worksheet JSON files and stores them as own templates. */
function importTemplateFile() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', multiple: true, hidden: true });
  input.addEventListener('change', async () => {
    let added = 0;
    const failed = [];
    for (const f of input.files) {
      try { added += await api.importTemplates(await f.text()); } catch { failed.push(f.name); }
    }
    input.remove();
    await refresh();
    if (failed.length) alert(`Keine gültige Arbeitsblatt-Datei (JSON): ${failed.join(', ')}`);
    else if (added) notice(added === 1 ? 'Vorlage importiert.' : `${added} Vorlagen importiert.`);
  });
  document.body.append(input);
  input.click();
}

function templateMenuItems(s) {
  const title = s.title || 'Ohne Titel';
  const remove = async () => {
    const body = h('p', {}, `Die Vorlage „${title}“ löschen? Arbeitsblätter, die Sie daraus angelegt haben, bleiben erhalten.`);
    if (!(await dialog('Vorlage löschen', body, { ok: 'Löschen', danger: true }))) return;
    await deleteTemplate(s.id);
    await refresh();
  };
  const items = [
    ['docPlus', 'Neues Arbeitsblatt daraus', () => api.create(structuredClone(s.doc))],
    ['doc', 'Als JSON exportieren', () => downloadJson(s.doc, fileBase(s))],
    '-',
    ['trash', 'Vorlage löschen…', remove, 'danger'],
  ];
  return items.map((it) => (it === '-'
    ? h('hr')
    : h('button', { role: 'menuitem', class: it[3] || '', onclick: () => { $('dash-pop').hidden = true; it[2](); } }, icon(it[0]), it[1])));
}

/** The how-to: samples/anleitung.json, exported to HTML by scripts/build-guide.mjs. */
function guideView() {
  const open = async () => api.create(await (await fetch('/api/sample?name=anleitung')).json());
  // srcdoc instead of src: some embedded browsers refuse to load pages into frames
  const frame = h('iframe', { class: 'dguide', title: 'Anleitung', sandbox: 'allow-scripts' });
  state.guide ??= fetch('guide/anleitung.html').then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))));
  state.guide.then((html) => { frame.srcdoc = html; })
    .catch(() => { state.guide = null; frame.srcdoc = '<p style="font-family: sans-serif">Die Anleitung konnte nicht geladen werden.</p>'; });
  return [
    h('div', { class: 'dhead dguide-head' },
      h('h1', {}, 'Anleitung'),
      h('button', { class: 'btn', onclick: open, title: 'Eine eigene Kopie der Anleitung als Arbeitsblatt anlegen' }, icon('doc'), 'Als Arbeitsblatt öffnen')),
    frame,
  ];
}

// Version at the bottom of the sidebar; the server reads it from package.json.
const versionLine = h('div', { class: 'dversion-name' });
fetch('/api/version').then((r) => r.json()).then(({ version }) => {
  versionLine.textContent = `Lineatur v${String(version).replace(/\.0$/, '')}`;
  versionLine.title = `Version ${version}`;
}).catch(() => { /* no version, no line */ });

const external = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** Sidebar footer: version, licence, source code, attributions. */
function sidebarFooter() {
  return h('div', { class: 'dversion' },
    versionLine,
    h('div', {}, h('a', { href: '#/attributions' }, OWN_LICENSE.name), ' · ', external(SOURCE_URL, 'GitHub')),
    h('a', { href: '#/attributions', class: state.view === 'attributions' ? 'on' : null }, 'Lizenzen & Danksagung'));
}

/** Everything Lineatur is built on, with licences (list in attributions.js). */
function attributionsView() {
  const link = (url, text) => (url ? external(url, text) : text);
  return [
    h('div', { class: 'dhead' }, h('h1', {}, 'Lizenzen & Danksagung')),
    h('p', { class: 'dabout' }, versionLine.textContent || 'Lineatur', ' ist freie Software unter der ', OWN_LICENSE.name, ' (', OWN_LICENSE.holder, '). ',
      'Der Quellcode liegt auf ', external(SOURCE_URL, 'GitHub'), '. Lineatur baut auf diesen Werken auf, danke an alle, die sie offen zur Verfügung stellen:'),
    ...ATTRIBUTIONS.map(([group, rows]) => h('section', { class: 'dattr' },
      h('h2', { class: 'dsection' }, group),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Werk'), h('th', {}, 'Verwendung'), h('th', {}, 'Lizenz'))),
        h('tbody', {}, ...rows.map(([name, url, use, license, licenseUrl]) => h('tr', {},
          h('td', {}, link(url, name)), h('td', {}, use), h('td', {}, link(licenseUrl, license)))))))),
  ];
}

function renderNav() {
  const item = (view, label, count, ic, href, indent = false) => h('a', {
    class: 'dnav-item' + (indent ? ' sub' : '') + (isActive(view, href) ? ' on' : ''), href,
  }, icon(ic), h('span', { class: 'grow' }, label), count != null ? h('span', { class: 'count' }, String(count)) : null);
  $('dash-nav').replaceChildren(
    h('div', { class: 'dnav-head' }, icon('user'), 'Meine Materialien'),
    item('docs', 'Meine Dokumente', state.entries.length, 'doc', '#/'),
    item('collections', 'Meine Sammlungen', state.collections.length, 'folder', '#/collections'),
    ...state.collections.slice().sort((a, b) => a.title.localeCompare(b.title))
      .map((c) => item('collection', c.title, c.docIds.length, 'dot', `#/collection/${c.id}`, true)),
    h('div', { class: 'dnav-head' }, icon('blocks'), 'Für den Einstieg'),
    item('guide', 'Anleitung', null, 'book', '#/guide'),
    item('templates', 'Vorlagen', state.templates.length, 'doc', '#/templates'),
    sidebarFooter());
}

function isActive(view, href) {
  if (view === 'collection') return state.view === 'collection' && href.endsWith(state.collectionId);
  return state.view === view;
}

async function renderMain() {
  const main = $('dash-main');
  let parts;
  if (state.view === 'collections') parts = collectionsView();
  else if (state.view === 'collection') parts = collectionView();
  else if (state.view === 'templates') parts = await templatesView();
  else if (state.view === 'guide') parts = guideView();
  else if (state.view === 'attributions') parts = attributionsView();
  else parts = docsSection('Meine Dokumente', state.entries, { emptyText: 'Noch keine Arbeitsblätter. Legen Sie eins an oder starten Sie mit einer Vorlage.' });
  main.replaceChildren(...parts.filter(Boolean));
}

async function refresh() {
  await seedTemplates();
  const [entries, collections, thumbs, templates] = await Promise.all([listDocs(), listCollections(), listThumbs(), listTemplates()]);
  // metadata of earlier versions had English values
  for (const e of entries) if (e.doc) e.doc.meta = normalizeMeta(e.doc.meta);
  state.entries = entries;
  state.collections = collections;
  state.templates = templates;
  state.thumbs = new Map(thumbs.map((t) => [t.id, t]));
  for (const id of [...state.selected]) if (!entries.some((e) => e.id === id)) state.selected.delete(id);
  renderNav();
  renderFilterBar();
  await renderMain();
  ensureThumbs(entries);
}

// ------------------------------------------------------------------- API --

/** Show a dashboard view: docs | collections | collection (with id) | templates | guide. */
export async function showDashboard(view = 'docs', id = null) {
  if (state.view !== view || state.collectionId !== id) endSelection();
  state.view = ['docs', 'collections', 'collection', 'templates', 'guide', 'attributions'].includes(view) ? view : 'docs';
  state.collectionId = id;
  $('dash-pop').hidden = true;
  try {
    await refresh();
  } catch (e) {
    $('dash-main').replaceChildren(h('p', { class: 'dempty' }, `Ihre Bibliothek konnte nicht geöffnet werden (${e?.message || e}). Private Fenster blockieren manchmal den Browserspeicher.`));
  }
}

export function initDashboard(callbacks) {
  api = callbacks;
  $('dash-q').addEventListener('input', (e) => { state.q = e.target.value; renderMain(); });
  $('dash-search').addEventListener('submit', (e) => { e.preventDefault(); if (state.view !== 'docs' && state.view !== 'collection') location.hash = '#/'; });
  $('dash-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await api.importText(await f.text()); } catch { alert('Keine gültige Arbeitsblatt-Datei (JSON).'); }
    await refresh();
  });
  document.addEventListener('click', (e) => {
    const pop = $('dash-pop');
    if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.body.dataset.view !== 'dashboard') return;
    if (!$('dash-pop').hidden) { $('dash-pop').hidden = true; return; }
    if (state.selecting) { endSelection(); renderMain(); }
  });
}

