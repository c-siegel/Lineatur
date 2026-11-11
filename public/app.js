// Lineatur editor.
//
// Two layout modes share one JSON document:
//   flow  - blocks one below the other, in document order
//   free  - blocks sit on page canvases, snapped to a 3/6/12 column grid;
//           hold Alt while dragging or resizing to place them freely.
// The pages are rendered by Typst on the server; an overlay of rectangles sits
// on top of them (draggable in free mode, selectable in both). Typst reports
// where each block landed, so the rectangles always match the rendered content.
// Selecting a block opens its properties in the inspector on the right.
//
// Parts of the editor live in public/editor/ (see the comment at the top of each module);
// this file keeps the shared state and wires everything together.

import {
  BODY_W, DEFAULT_FONT, DEFAULT_GRID, FONTS, TASKABLE_TYPES, isExercise, FORMATS, MARGIN_TOP, PAGE_W, ROW, applyGeometry,
  alignUnits, contentHeight, defaultWidth, distributeUnits, exLabel, headingNumbers, insertPage, layoutOf, layoutUnits,
  marginLeft, nextFreeSpot, readingOrder, removeEmptyPage, snapPosition, stackBlocks,
} from './layout.js';
import { getDoc, listDocs, putDoc, putTemplate, setLastDocId } from './store.js';
import { dialog, initDashboard, showDashboard } from './dashboard.js';
import { hydrateIcons, svgIcon } from './icons.js';
import { BLOCK_HELP } from './help.js';
import { LICENSES, licenseText, normalizeMeta } from './meta.js';
import { $, docUid, h, iconBtn, randSeed, toast, uid } from './editor/util.js';
import {
  SIZE_OPTIONS, closeTip, docSetting, field, more, renderDocPanel, row, setDocTab, setInstalledThemes, setThemeImport,
} from './editor/docpanel.js';
import { GRADE_THRESHOLDS, GROUPS, HEADER_LABELS, TYPES } from './editor/blocktypes.js';
import { blockWarnings, flushThumb, rendering, schedule, timer } from './editor/preview.js';
import {
  drag, metrics, pointerToMM, rects, renderOverlay, setSnapState, setupCanvas, updateChipsText,
} from './editor/canvas.js';
import {
  checkInput, choiceInput, fieldsFor, groupInspector, helpCard, helpFor, setHelpFor, styleFields, taskFields, textInput,
} from './editor/fields.js';
import { licenseName, openImageSearch, runImageSearch } from './editor/images.js';

// ------------------------------------------------------------------ state --

const STORE_KEY = 'lineatur-doc-v2'; // pre-library autosave, migrated on first start
let doc = emptyDoc();
let mode = 'student';
let selectedId = null;        // the one selected block (null when none or several are selected)
let selection = new Set();    // all selected block ids
let enteredGroup = null;      // group the user clicked into: its members are selected one by one
let pendingScroll = null;     // { id } or { page }: bring into view once it is rendered
let pendingArrange = false;
let pendingPlace = null;      // id of an assessment block to move to the bottom of the last page once heights are known
let headerSelected = false;   // the title header is selected (it has its own inspector)
let info = { heights: {}, natural: {}, headerH: 0, examH: 0, flow: {} };
let zoom = 1;

// setters for the editor modules (imported bindings are read-only there)
const setInfo = (v) => {
  // flow layout: the pages of the blocks come from Typst, and the layers panel lists them by page
  const pages = (i) => (isFree() ? '' : Object.entries(i.flow || {}).map(([id, f]) => `${id}:${f.page}`).join());
  const before = pages(info);
  info = v;
  if (pages(info) !== before) renderLayers();
};
const setPendingArrange = (v) => { pendingArrange = v; };

const isFree = () => doc.layoutMode === 'free';
const cols = () => doc.grid?.cols || 3;

function emptyDoc() {
  return {
    id: docUid(), title: 'Neues Arbeitsblatt', subtitle: '', lang: 'de', exam: false, nameLine: true,
    format: 'a4', font: DEFAULT_FONT, fontSize: 12, accent: 'blue',
    pageFrame: { style: 'none', color: 'gray' }, pageTint: 'none', logo: '',
    layoutMode: 'free', pageCount: 1, grid: { cols: 3 }, blocks: [],
  };
}

/** Writing lines kept their line style in b.style, where the frame settings live: move it to b.lineStyle. */
function migrateBlock(b) {
  // the task block ("Aufgabenstellung") is gone: any content block can be a task now.
  // Its answer lines become a lines block (1.55 em apart, about 6 mm), no lines a text block.
  if (b.type === 'task') {
    const { text, lines, solution, ...rest } = b;
    const n = parseInt(lines) || 0;
    Object.assign(b, n
      ? { ...rest, type: 'lines', task: true, taskText: text || '', count: n, lineStyle: 'ruled', spacing: 6, solution: solution || '', label: '' }
      : { ...rest, type: 'text', task: true, text: [text, solution].filter(Boolean)[0] || '' });
    delete b.lines;
  }
  if (b.type === 'lines' && typeof b.style === 'string') {
    b.lineStyle ??= b.style;
    b.style = {};
  }
  // multiple choice side by side was stored as layout: 'row', where the grid position lives
  if (typeof b.layout === 'string') {
    if (b.type === 'choice') b.arrange ??= b.layout;
    delete b.layout;
  }
  return b;
}

function normalize(d) {
  const out = { ...emptyDoc(), ...d };
  if (!d.id) out.id = docUid();
  if (!FORMATS[out.format]) out.format = 'a4';
  out.pageFrame = { style: 'none', color: 'gray', ...(d.pageFrame || {}) };
  const g = { ...DEFAULT_GRID, ...(d.grid || {}) };
  out.grid = { cols: Math.min(24, Math.max(1, parseInt(g.cols) || 3)), gutter: Number(g.gutter) || 0, row: Number(g.row) || 0 };
  out.meta = normalizeMeta(d.meta);
  out.blocks = (Array.isArray(d.blocks) ? d.blocks : []).map((b) => migrateBlock({ ...b, id: b.id || uid() }));
  out.headerFields = { ...(d.headerFields || {}) };
  // exam mode used to put the assessment table at the end automatically; now it is a movable block
  if (d.exam && !out.blocks.some((b) => b.type === 'assessment')) {
    const b = { id: uid(), ...TYPES.assessment.make() };
    if (out.layoutMode === 'free') {
      b.layout = { page: Math.max(0, ...out.blocks.map((x) => layoutOf(x).page)), x: 0, y: 0, w: BODY_W };
      pendingPlace = b.id;
    }
    out.blocks.push(b);
  }
  out.exam = false;
  const maxPage = Math.max(0, ...out.blocks.map((b) => layoutOf(b).page));
  out.pageCount = Math.max(1, parseInt(d.pageCount) || 1, maxPage + 1);
  return out;
}

// Autosave into the private library (IndexedDB), debounced.
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await putDoc(doc);
      setLastDocId(doc.id);
      $('savestate').textContent = 'gespeichert';
    } catch (e) {
      $('savestate').textContent = 'nicht gespeichert – ' + (e?.name || 'Speicherfehler');
    }
  }, 400);
}

/** Write a pending autosave of the current document right away (before switching documents). */
function flushSave() {
  if (!saveTimer) return Promise.resolve();
  clearTimeout(saveTimer);
  saveTimer = null;
  return putDoc(doc).catch(() => {});
}

/** Documents from the old single-document autosave go into the library once. */
async function migrateLegacy() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    if (!(await listDocs()).length) await putDoc(normalize(JSON.parse(raw)));
    localStorage.removeItem(STORE_KEY);
  } catch { /* nothing to migrate */ }
}

// ---------------------------------------------------------------- numbering --

const displayOrder = () => (isFree() ? readingOrder(doc.blocks) : doc.blocks);

function exNumbers() {
  const m = new Map();
  const restart = !!doc.numbering?.restart;
  let n = 0;
  for (const b of displayOrder()) {
    if (b.hidden) continue;
    if (restart && b.type === 'heading' && parseInt(b.level) !== 2) n = 0;
    if (isExercise(b) && b.numbered !== false) m.set(b.id, exLabel(++n, doc.numbering?.format));
  }
  return m;
}

// ---------------------------------------------------------------- inputs --

function changed(delay) { save(); schedule(delay); recordHistory(); }

// ------------------------------------------------------------ undo / redo --
// Snapshots of the whole document, taken once editing pauses for a moment.

const history = { past: [], future: [], current: null, timer: null };

function snapshotNow() {
  clearTimeout(history.timer);
  history.timer = null;
  const s = JSON.stringify(doc);
  if (s === history.current) return;
  if (history.current !== null) history.past.push(history.current);
  if (history.past.length > 100) history.past.shift();
  history.current = s;
  history.future = [];
  updateUndoButtons();
}
function recordHistory() {
  clearTimeout(history.timer);
  history.timer = setTimeout(snapshotNow, 500);
}
function resetHistory() {
  clearTimeout(history.timer);
  Object.assign(history, { past: [], future: [], current: JSON.stringify(doc), timer: null });
  updateUndoButtons();
}
function updateUndoButtons() {
  $('btn-undo').disabled = !history.past.length;
  $('btn-redo').disabled = !history.future.length;
}
function undoRedo(dir) {
  if (history.timer) snapshotNow(); // keep the edit that is still pending
  const from = dir < 0 ? history.past : history.future;
  const to = dir < 0 ? history.future : history.past;
  if (!from.length) return;
  to.push(history.current);
  history.current = from.pop();
  const keep = selectedId;
  doc = normalize(JSON.parse(history.current));
  applyGeometry(doc);
  selection = new Set([...selection].filter((id) => doc.blocks.some((b) => b.id === id)));
  selectedId = doc.blocks.some((b) => b.id === keep) ? keep : null;
  syncSettings(); applyMode(); renderBlocks(); renderOverlay();
  save(); schedule(0);
  updateUndoButtons();
}

const chips = new Map(); // block id -> layout chip element in the inspector

function layoutText(b) {
  const l = layoutOf(b);
  return `Seite ${l.page + 1} · x ${Math.round(l.x)} · y ${Math.round(l.y)} · Breite ${Math.round(l.w)} mm`;
}

/** Short description of a block for the layers list. */
function blockSummary(b) {
  const text = b.text || b.title || b.formula || b.fns || b.fn || b.caption || b.code || '';
  const clean = String(text).replace(/\[\[(.+?)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
  return clean || TYPES[b.type]?.label || b.type;
}

/** Assessment block: headings, which tables to show, and the grade scale in percent. */
function assessmentFields(b) {
  const total = doc.blocks.filter((x) => isExercise(x) && !x.hidden)
    .reduce((s, x) => s + Math.max(0, Number(x.points) || 0), 0);
  const th = GRADE_THRESHOLDS.map((d, i) => (Number.isFinite(Number(b.thresholds?.[i])) ? Number(b.thresholds[i]) : d));
  const de = (v) => String(v).replace('.', ',');
  const hint = h('div', { class: 'mini' });
  const showHint = () => {
    hint.textContent = total > 0
      ? `Bei ${de(total)} Punkten: ` + th.map((p, i) => `${i + 1} ab ${de(Math.ceil((total * p) / 100 - 1e-9))}`).join(' · ')
      : 'Noch keine Aufgaben mit Punkten.';
  };
  showHint();
  const pct = (i) => h('label', {}, `Note ${i + 1}`, h('input', {
    type: 'number', min: 0, max: 100, step: 1, value: th[i],
    oninput: (e) => { th[i] = Math.min(100, Math.max(0, Number(e.target.value) || 0)); b.thresholds = [...th]; showHint(); changed(); },
  }));
  return [
    textInput(b, 'title', 'Überschrift (leer = ohne)'),
    h('div', { class: 'row' }, checkInput(b, 'table', 'Bewertungstabelle', true), checkInput(b, 'scale', 'Notenschlüssel', true)),
    textInput(b, 'scaleLabel', 'Beschriftung des Notenschlüssels (leer = „Notenschlüssel“)'),
    h('div', { class: 'mini' }, 'Mindestanteil der Gesamtpunkte je Note, in Prozent:'),
    h('div', { class: 'row' }, [0, 1, 2, 3, 4].map(pct)),
    hint,
    h('button', { class: 'btn small', onclick: () => { b.thresholds = [...GRADE_THRESHOLDS]; renderInspector(); changed(0); } }, 'Standard-Notenschlüssel'),
  ];
}

/** Exam toggle (Document → Info): add or remove the assessment block. */
function setAssessment(on) {
  if (on && !doc.blocks.some((b) => b.type === 'assessment')) {
    const b = { id: uid(), ...TYPES.assessment.make() };
    if (isFree()) {
      // goes to the bottom of the last page once Typst has measured it
      b.layout = { page: Math.max(0, doc.pageCount - 1), x: 0, y: 0, w: BODY_W };
      pendingPlace = b.id;
    }
    doc.blocks.push(b);
  } else if (!on) {
    if (doc.blocks.some((b) => b.type === 'assessment' && b.locked)) toast('Gesperrte Bewertungsbausteine bleiben erhalten. Erst entsperren.');
    doc.blocks = doc.blocks.filter((b) => b.type !== 'assessment' || b.locked);
    selection = new Set([...selection].filter((id) => doc.blocks.some((b) => b.id === id)));
    if (selectedId && !selection.has(selectedId)) selectedId = null;
  }
  renderBlocks(); renderOverlay(); docSetting();
}

/** Free layout: put a block at the bottom of the last page (or on a new page if that is full). */
function placeAtBottom(id) {
  pendingPlace = null;
  const b = doc.blocks.find((x) => x.id === id);
  if (!b || b.locked) return;
  const hh = info.heights[id] ?? 50;
  let page = Math.max(0, doc.pageCount - 1);
  const bottom = Math.max(0, ...doc.blocks
    .filter((x) => x !== b && !x.hidden && layoutOf(x).page === page)
    .map((x) => layoutOf(x).y + (info.heights[x.id] ?? 20)));
  let y = Math.floor((contentHeight(page, info.headerH) - hh) / ROW) * ROW;
  if (y < bottom + 4) { page++; y = 0; }
  b.layout = { ...layoutOf(b), page, x: 0, y: Math.max(0, y), w: BODY_W };
  doc.pageCount = Math.max(doc.pageCount, page + 1);
  renderOverlay(); changed(0);
}

/** Inspector of the title header: title, subtitle and the name / class / date fields. */
function headerInspector() {
  const cfg = (doc.headerFields ??= {});
  const labels = HEADER_LABELS[doc.lang] || HEADER_LABELS.de;
  const text = (obj, key, label, { placeholder = '', type = 'text', onInput } = {}) => h('label', {}, label, h('input', {
    type, value: obj[key] ?? '', placeholder,
    oninput: (e) => { obj[key] = e.target.value; onInput?.(); changed(); },
    onchange: () => renderDocPanel(),
  }));
  const fieldRow = (k) => {
    cfg[k] = { ...(cfg[k] || {}) };
    return h('div', { class: 'row' },
      checkInput(cfg[k], 'show', labels[k], true),
      text(cfg[k], 'label', 'Beschriftung', { placeholder: labels[k] }));
  };
  const nameLine = checkInput(doc, 'nameLine', 'Zeile für Name, Klasse und Datum', true);
  nameLine.addEventListener('change', () => renderDocPanel());
  return [
    h('div', { class: 'insp-head' },
      h('div', { class: 'insp-title' }, h('span', { class: 'ic' }, 'T'), 'Kopfbereich'),
      iconBtn('close', 'Schließen', () => { inspectorOpen = false; renderInspector(); })),
    h('fieldset', { class: 'insp-body' },
      text(doc, 'title', 'Titel', { onInput: syncTopbar }),
      text(doc, 'subtitle', 'Untertitel'),
      text(doc, 'solutionTitle', 'Titel des Lösungsblatts', { placeholder: doc.title || 'wie der Titel' }),
      h('h4', {}, 'Name, Klasse, Datum'),
      nameLine,
      choiceInput(cfg, 'position', 'Position', [['top', 'über dem Titel'], ['below', 'unter der Linie']]),
      fieldRow('name'), fieldRow('klass'), fieldRow('date'),
      h('div', { class: 'row' },
        text(doc, 'className', 'Klasse vorausfüllen', { placeholder: 'z. B. 7b' }),
        text(doc, 'date', 'Datum vorausfüllen', { type: 'date' })),
      h('div', { class: 'mini' }, 'Leere Felder bleiben eine Schreiblinie. Auf dem Lösungsblatt entfällt die Zeile.')),
  ];
}

/** Select the title header (clears the block selection) and open its inspector. */
function selectHeader(focus = false) {
  setSelection([]);
  headerSelected = true;
  inspectorOpen = true;
  $('rects').querySelector('.hdrbox')?.classList.add('sel');
  renderInspector();
  if (focus) $('inspector').querySelector('input')?.focus();
}

let inspectedId = null;
let inspectGroup = null; // id of the group whose frame settings are open in the inspector
const setInspectGroup = (g) => { inspectGroup = g; };
let inspectorOpen = false; // the inspector opens via "Baustein bearbeiten", a double click or for new blocks
const setInspectorOpen = (v) => { inspectorOpen = v; };

/** The properties of the selected block, in the panel on the right. */
function renderInspector() {
  const pane = $('inspector');
  const b = doc.blocks.find((x) => x.id === selectedId);
  chips.clear();
  if (headerSelected) {
    inspectedId = '__header';
    pane.hidden = !inspectorOpen;
    pane.replaceChildren(...(inspectorOpen ? headerInspector() : []));
    return;
  }
  const list = selectedBlocks();
  if (inspectGroup && inspectorOpen && selectionIsGroup() && list[0].group === inspectGroup) {
    inspectedId = '__group';
    pane.hidden = false;
    pane.replaceChildren(...groupInspector(inspectGroup));
    return;
  }
  inspectedId = b?.id ?? null;
  pane.hidden = !b || !inspectorOpen;
  if (!b || !inspectorOpen) { pane.replaceChildren(); return; }
  const def = TYPES[b.type] || { label: b.type, icon: '?' };
  const number = exNumbers().get(b.id);
  const head = h('div', { class: 'insp-head' },
    h('div', { class: 'insp-title' }, h('span', { class: 'ic' }, def.icon), def.label, number ? h('span', { class: 'num' }, number) : null));
  if (!isFree()) {
    head.append(iconBtn('up', 'Nach oben', () => moveBy(b.id, -1)), iconBtn('down', 'Nach unten', () => moveBy(b.id, 1)));
  }
  if (BLOCK_HELP[b.type]) {
    const open = helpFor === b.id;
    const helpBtn = iconBtn('help', open ? 'Hilfe ausblenden' : 'Hilfe zu diesem Baustein', () => { setHelpFor(open ? null : b.id); renderInspector(); });
    helpBtn.classList.toggle('on', open);
    helpBtn.setAttribute('aria-expanded', String(open));
    head.append(helpBtn);
  }
  head.append(
    iconBtn(b.locked ? 'unlock' : 'lock', b.locked ? 'Entsperren' : 'Sperren', () => toggleLock(b.id)),
    iconBtn('copy', 'Duplizieren', () => duplicate(b.id)),
    iconBtn('trash', 'Löschen', () => remove(b.id), 'danger'),
    iconBtn('close', 'Schließen', () => { inspectorOpen = false; renderInspector(); }),
  );
  const parts = [head];
  if (isFree()) {
    const chip = h('div', { class: 'layoutchip' }, layoutText(b));
    chips.set(b.id, chip);
    parts.push(chip);
  }
  if (helpFor === b.id) parts.push(helpCard(b));
  if (blockWarnings[b.id]) parts.push(h('div', { class: 'warnbar', role: 'status' }, blockWarnings[b.id]));
  if (b.locked) {
    parts.push(h('div', { class: 'lockbar' }, svgIcon('lock'), 'Gesperrt – Inhalt und Position sind geschützt.',
      h('button', { class: 'btn small', onclick: () => toggleLock(b.id) }, 'Entsperren')));
  }
  // a locked block shows its settings, but they cannot be changed
  const general = h('div', { class: 'row' },
    isExercise(b) ? checkInput(b, 'numbered', 'Mit Nummer', true) : null,
    isExercise(b) && b.numbered !== false ? choiceInput(b, 'numberLayout', 'Nummer und Text',
      [['', `wie im Dokument (${doc.numbering?.layout === 'inline' ? 'im Text' : 'eingerückt'})`], ['indent', 'eingerückt'], ['inline', 'im Text']]) : null,
    !isFree() ? checkInput(b, 'newPage', 'Auf neuer Seite beginnen') : null);
  parts.push(h('fieldset', { class: 'insp-body', disabled: b.locked || null },
    TASKABLE_TYPES.has(b.type) ? taskFields(b) : null, ...fieldsFor(b).filter(Boolean),
    general.children.length ? general : null, styleFields(b)));
  pane.replaceChildren(...parts);
}

/** Order of the layers panel. Grid: stacking order, the front-most block on top.
 *  Flow: the order on the sheet. */
const layerOrder = () => (isFree() ? [...doc.blocks].reverse() : doc.blocks);

/** Put the blocks `ids` before beforeId (in panel order; null = at the end), keeping their own order. */
function moveLayers(ids, beforeId) {
  const moving = new Set(ids);
  const order = layerOrder();
  const rest = order.filter((b) => !moving.has(b.id)).map((b) => b.id);
  const at = beforeId ? rest.indexOf(beforeId) : rest.length;
  rest.splice(at < 0 ? rest.length : at, 0, ...order.filter((b) => moving.has(b.id)).map((b) => b.id));
  const byId = new Map(doc.blocks.map((b) => [b.id, b]));
  doc.blocks = (isFree() ? rest.reverse() : rest).map((x) => byId.get(x));
}

/** Drag in the layers panel: put block id before beforeId (in panel order; null = at the end). */
function moveLayer(id, beforeId) {
  moveLayers([id], beforeId);
  renderBlocks(); renderOverlay(); changed(0);
}

/** Grid layout: move blocks (with their groups) to another page, below what is there.
 *  Their arrangement and x positions stay. False if a block is locked. */
function moveToPage(ids, page) {
  const all = withGroups(ids);
  const moving = doc.blocks.filter((b) => all.has(b.id));
  if (!moving.length || moving.every((b) => layoutOf(b).page === page)) return true;
  if (moving.some((b) => b.locked)) { toast('Gesperrte Bausteine bleiben auf ihrer Seite. Erst entsperren.'); return false; }
  const ls = moving.map((b) => ({ b, l: layoutOf(b), h: info.heights[b.id] ?? 20 }));
  const top = Math.min(...ls.map((i) => i.l.y));
  const height = Math.max(...ls.map((i) => i.l.y + i.h)) - top;
  const spot = nextFreeSpot(doc.blocks.filter((b) => !all.has(b.id)), info.heights, info.headerH, height, 4, { page });
  if (spot.insert) toast(`Seite ${page + 1} ist voll – der Baustein liegt oben auf der Seite und überlappt.`);
  const y = spot.insert ? 0 : spot.y;
  for (const i of ls) i.b.layout = { ...i.l, page, y: round05(y + i.l.y - top) };
  pendingScroll = { id: moving[0].id };
  return true;
}

let layerDrag = null; // ids of the rows being dragged

/** Dropped in the layers panel: on another page (grid) the blocks move there, then they go before beforeId. */
function dropLayers(ids, page, beforeId) {
  if (beforeId && ids.includes(beforeId)) return;
  let move = ids;
  if (isFree() && page !== layoutOf(blockById(ids[0])).page) {
    if (!moveToPage(ids, page)) return;
    move = [...withGroups(ids)]; // a group changes the page as a whole
  }
  moveLayers(move, beforeId);
  renderBlocks(); renderOverlay(); changed(0);
}

// Collapsed pages and opened groups of the layers panel, per document (only in this browser).
const LAYER_FOLD_KEY = 'lineatur-layers';
function layerFold() {
  try { return new Set(JSON.parse(localStorage.getItem(`${LAYER_FOLD_KEY}:${doc.id}`) || '[]')); } catch { return new Set(); }
}
function toggleLayerFold(key) {
  const s = layerFold();
  if (s.has(key)) s.delete(key); else s.add(key);
  try { localStorage.setItem(`${LAYER_FOLD_KEY}:${doc.id}`, JSON.stringify([...s])); } catch { /* storage may be unavailable */ }
  renderLayers();
}

/** Selection marks in the layers panel: a block row, a whole group, a page with something selected. */
function syncLayerSelection() {
  for (const li of $('layers').children) {
    const ids = li._ids;
    if (!ids) continue;
    const n = ids.filter((id) => selection.has(id)).length;
    const sel = li.dataset.id ? n > 0 : li.classList.contains('grouprow') && n > 0 && n === ids.length;
    li.classList.toggle('sel', sel);
    li.classList.toggle('has-sel', !sel && n > 0);
  }
}

/** Layers panel: the blocks of each page (collapsible), groups as one row that opens to its members.
 *  Grid: stacking order within a page; dragging a row onto another page moves the block there. */
function renderLayers() {
  const list = $('layers');
  const q = $('layer-search').value.trim().toLowerCase();
  const nums = exNumbers();
  const heads = headingNumbers(displayOrder(), doc.headingNumbering);
  const canDrag = !q; // a filtered list would hide where a row lands
  const fold = layerFold();
  const match = (b) => !q || blockSummary(b).toLowerCase().includes(q) || (TYPES[b.type]?.label || '').toLowerCase().includes(q);
  const order = layerOrder();

  // page of each block; in the flow layout Typst reports it (a block not set yet stays with the one before)
  const pageOf = new Map();
  let lastPage = 0;
  for (const b of order) {
    const p = isFree() ? layoutOf(b).page : info.flow?.[b.id]?.page ?? -1;
    if (p >= 0) lastPage = p;
    pageOf.set(b.id, p >= 0 ? p : lastPage);
  }
  const pages = isFree() ? doc.pageCount : Math.max(1, ...[...pageOf.values()].map((p) => p + 1));
  const groupIds = (g) => doc.blocks.filter((x) => x.group === g).map((x) => x.id);

  /** Drop target: on a row (before / after it, by the pointer) or on a page header (at the top of the page). */
  const dropOn = (li, page, beforeOf, halves = true) => {
    li.addEventListener('dragover', (e) => {
      if (!layerDrag) return;
      e.preventDefault();
      const after = halves && e.offsetY > li.offsetHeight / 2;
      li.classList.toggle('drop-before', !after);
      li.classList.toggle('drop-after', after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = li.classList.contains('drop-after');
      const ids = layerDrag;
      layerDrag = null;
      li.classList.remove('drop-before', 'drop-after');
      if (ids) dropLayers(ids, page, beforeOf(after));
    });
  };
  const dragFrom = (li, ids) => {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => { layerDrag = ids; e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { layerDrag = null; list.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'dragging')); });
  };
  const eye = (blocks) => {
    const hidden = blocks.every((b) => b.hidden);
    return iconBtn(hidden ? 'eyeOff' : 'eye', hidden ? 'Auf dem Blatt anzeigen' : 'Auf dem Blatt ausblenden', (e) => {
      e.stopPropagation();
      blocks.forEach((b) => { b.hidden = !hidden; });
      renderBlocks(); renderOverlay(); changed(0);
    });
  };
  const foldBtn = (key, open, what) => {
    const t = h('button', { class: 'fold', 'aria-expanded': String(open), title: open ? `${what} zuklappen` : `${what} aufklappen`,
      onclick: (e) => { e.stopPropagation(); toggleLayerFold(key); } });
    t.append(svgIcon('chevron'));
    return t;
  };
  const blockRow = (b, member) => {
    const n = nums.get(b.id) || heads.get(b.id);
    const g = member && b.group;
    const li = h('li', { class: (member ? 'member' : '') + (b.hidden ? ' off' : ''), 'data-id': b.id, title: blockSummary(b),
      onclick: (e) => {
        const add = e.shiftKey || e.ctrlKey || e.metaKey;
        if (g && enteredGroup !== g) enterGroup(b.id, { from: 'layers' }); // a member on its own
        else if (add) toggleSelect(b.id);
        else select(b.id, { from: 'layers' });
      },
      ondblclick: () => editBlock(b.id) },
    canDrag ? h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Ziehen ändert die Reihenfolge oder die Seite' }, '⠿') : null,
    h('span', { class: 'ic' }, TYPES[b.type]?.icon || '?'),
    h('span', { class: 'layer-name' }, (n ? n + ' ' : '') + blockSummary(b)));
    if (b.group && !member) li.append(h('span', { class: 'lockmark', title: 'Gruppiert' }, svgIcon('group')));
    if (b.locked) li.append(h('span', { class: 'lockmark', title: 'Gesperrt' }, svgIcon('lock')));
    li.append(eye([b]));
    li._ids = [b.id];
    if (canDrag) dragFrom(li, [b.id]);
    return li;
  };

  const rows = [];
  for (let p = 0; p < pages; p++) {
    const onPage = order.filter((b) => pageOf.get(b.id) === p);
    const shown = onPage.filter(match);
    if (q && !shown.length) continue;
    // a group is one entry, where its front-most member is
    const items = [];
    const seen = new Set();
    for (const b of shown) {
      if (!b.group) { items.push({ ids: [b.id], blocks: [b] }); continue; }
      if (seen.has(b.group)) continue;
      seen.add(b.group);
      const members = shown.filter((x) => x.group === b.group);
      items.push(members.length > 1 ? { g: b.group, ids: members.map((x) => x.id), blocks: members } : { ids: [b.id], blocks: [b] });
    }
    // dropped after an entry: in front of the next one (grid: last on this page; flow: before the next block on the sheet)
    const nextAfter = (i) => {
      if (items[i + 1]) return items[i + 1].ids[0];
      if (isFree()) return null;
      const last = items[i].ids[items[i].ids.length - 1];
      return order[order.findIndex((b) => b.id === last) + 1]?.id ?? null;
    };
    const firstOnPage = onPage[0]?.id ?? null;

    const closed = !q && fold.has('p:' + p);
    const head = h('li', { class: 'pagehead' + (closed ? ' closed' : ''), 'data-page': p, title: `Seite ${p + 1} anzeigen`,
      onclick: () => $('pages').querySelectorAll('.page')[p]?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
    foldBtn('p:' + p, !closed, `Seite ${p + 1}`),
    h('span', { class: 'layer-name' }, `Seite ${p + 1}`),
    h('span', { class: 'layer-num' }, onPage.length === 1 ? '1 Baustein' : `${onPage.length} Bausteine`));
    head._ids = onPage.map((b) => b.id);
    if (canDrag) dropOn(head, p, () => firstOnPage, false);
    rows.push(head);
    if (closed) continue;
    if (!items.length) {
      const empty = h('li', { class: 'empty-hint pageempty' }, isFree() ? 'Leere Seite – Bausteine hierher ziehen' : 'Leere Seite');
      if (canDrag) dropOn(empty, p, () => null, false);
      rows.push(empty);
    }
    items.forEach((it, i) => {
      if (!it.g) {
        const li = blockRow(it.blocks[0], false);
        if (canDrag) dropOn(li, p, (after) => (after ? nextAfter(i) : it.ids[0]));
        rows.push(li);
        return;
      }
      const open = !!q || fold.has('g:' + it.g) || enteredGroup === it.g;
      const all = groupIds(it.g);
      const grp = h('li', { class: 'grouprow' + (it.blocks.every((b) => b.hidden) ? ' off' : ''), 'data-group': it.g,
        title: 'Gruppe – Klick wählt die ganze Gruppe',
        onclick: (e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelect(it.ids[0]); return; }
          enteredGroup = null;
          setSelection(all, { from: 'layers' });
        } },
      canDrag ? h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Ziehen ändert die Reihenfolge oder die Seite' }, '⠿') : null,
      foldBtn('g:' + it.g, open, 'Gruppe'),
      h('span', { class: 'layer-name' }, `Gruppe · ${all.length} Bausteine`));
      if (it.blocks.some((b) => b.locked)) grp.append(h('span', { class: 'lockmark', title: 'Enthält gesperrte Bausteine' }, svgIcon('lock')));
      grp.append(eye(it.blocks));
      grp._ids = all;
      if (canDrag) { dragFrom(grp, all); dropOn(grp, p, (after) => (after && !open ? nextAfter(i) : it.ids[0])); }
      rows.push(grp);
      if (!open) return;
      it.blocks.forEach((b, k) => {
        const li = blockRow(b, true);
        if (canDrag) dropOn(li, p, (after) => (after ? it.ids[k + 1] ?? nextAfter(i) : b.id));
        rows.push(li);
      });
    });
  }
  const none = !doc.blocks.length || (q && !rows.length);
  list.replaceChildren(...(none ? [h('li', { class: 'empty-hint' }, doc.blocks.length ? 'Nichts gefunden.' : 'Noch keine Bausteine – fügen Sie welche unter „Bausteine“ hinzu.')] : rows));
  syncLayerSelection();
}

/** Everything that lists blocks: layers panel, inspector, title in the top bar. */
function renderBlocks() {
  renderLayers();
  renderInspector();
  showTitle();
}

// -------------------------------------------------------- block operations --

function add(type, index = doc.blocks.length, extra = {}) {
  const b = { id: uid(), ...TYPES[type].make(), ...extra };
  doc.blocks.splice(index, 0, b);
  selectOnly(b.id);
  pendingScroll = { id: b.id };
  inspectorOpen = true;
  renderBlocks(); renderOverlay(); changed(40);
}

/** Free mode: add at an explicit spot, or on the current page below what is there. */
function addFree(type, spot, extra = {}) {
  const b = { id: uid(), ...TYPES[type].make(), ...extra };
  const w = defaultWidth(type);
  const pos = spot || spotOnCurrentPage(25);
  b.layout = { page: pos.page, x: pos.x ?? 0, y: pos.y, w };
  doc.pageCount = Math.max(doc.pageCount, pos.page + 1);
  doc.blocks.push(b);
  selectOnly(b.id);
  pendingScroll = { id: b.id };
  inspectorOpen = true;
  renderBlocks(); renderOverlay(); changed(40);
}

const addByClick = (type, extra) => (isFree() ? addFree(type, null, extra) : add(type, flowInsertIndex(), extra));

// ---------------------------------------------------------- current page --

/** Index of the page that fills most of the visible stage. */
function visiblePage() {
  const view = $('stage').getBoundingClientRect();
  let best = 0;
  let most = 0;
  [...$('pages').querySelectorAll('.page')].forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top)) *
      Math.max(0, Math.min(r.right, view.right) - Math.max(r.left, view.left));
    if (area > most) { most = area; best = i; }
  });
  return best;
}

/** The page new blocks and pages go to: the page of the selection, else the page in view. */
function currentPage() {
  const list = selectedBlocks().filter((b) => !b.hidden);
  if (list.length && isFree()) return Math.min(...list.map((b) => layoutOf(b).page));
  const f = list.length && info.flow?.[list[list.length - 1].id];
  return f ? (f.page1 ?? f.page) : visiblePage();
}

/** Mark the current page (where a click in the palette inserts) when there are several. */
function markCurrentPage() {
  const pages = [...$('pages').querySelectorAll('.page')];
  const cur = pages.length > 1 ? currentPage() : -1;
  pages.forEach((el, i) => el.classList.toggle('current', i === cur));
}

/** Insert an empty page after page `after` (never behind a booklet's back cover); returns its index. */
function insertPageAfter(after) {
  if (doc.booklet?.on && doc.booklet.backCover && doc.pageCount > 1) after = Math.min(after, doc.pageCount - 2);
  insertPage(doc.blocks, after);
  doc.pageCount++;
  return after + 1;
}

/** Grid layout: a free spot of height h on the current page (or right after it). */
function spotOnCurrentPage(h) {
  const page = currentPage();
  const spot = nextFreeSpot(doc.blocks, info.heights, info.headerH, h, 4, { page, pageCount: doc.pageCount });
  if (spot.insert) spot.page = insertPageAfter(page);
  return spot;
}

/** Flow layout: new blocks go after the selection, else after the last block on the page in view. */
function flowInsertIndex() {
  const sel = doc.blocks.map((b, i) => (selection.has(b.id) ? i : -1)).filter((i) => i >= 0);
  if (sel.length) return Math.max(...sel) + 1;
  const p = visiblePage();
  let at = -1;
  doc.blocks.forEach((b, i) => {
    const f = info.flow?.[b.id];
    // a page break ends the page: new blocks go in front of it
    if (f && b.type !== 'pagebreak' && f.page <= p && p <= (f.page1 ?? f.page)) at = i;
  });
  return at < 0 ? doc.blocks.length : at + 1;
}

/** Scroll a newly added block or page into view once it is on the canvas. */
function scrollToPending() {
  const p = pendingScroll;
  if (!p) return;
  if (p.id) {
    if (!doc.blocks.some((b) => b.id === p.id)) { pendingScroll = null; return; }
    const el = rects.get(p.id);
    if (!el || el.hidden) return;
    pendingScroll = null;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else {
    const el = $('pages').querySelectorAll('.page')[p.page];
    if (!el) return;
    pendingScroll = null;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function remove(id) {
  if (doc.blocks.find((b) => b.id === id)?.locked) { toast('Gesperrte Bausteine können nicht gelöscht werden. Erst entsperren.'); return; }
  doc.blocks = doc.blocks.filter((b) => b.id !== id);
  if (selection.has(id)) { selection.delete(id); selectedId = selection.size === 1 ? [...selection][0] : null; }
  renderBlocks(); renderOverlay(); changed();
}

function duplicate(id) {
  const i = doc.blocks.findIndex((b) => b.id === id);
  if (i < 0) return;
  const copy = JSON.parse(JSON.stringify(doc.blocks[i]));
  copy.id = uid();
  delete copy.locked;
  if (copy.type === 'wordsearch') copy.seed = randSeed();
  if (isFree()) {
    const l = layoutOf(doc.blocks[i]);
    const hh = info.heights[id] ?? 20;
    let page = l.page;
    let y = Math.ceil((l.y + hh + 4) / ROW) * ROW;
    if (y + hh > contentHeight(page, info.headerH)) { page++; y = 0; }
    copy.layout = { ...l, page, y };
    doc.pageCount = Math.max(doc.pageCount, page + 1);
    doc.blocks.push(copy);
  } else {
    doc.blocks.splice(i + 1, 0, copy);
  }
  selectOnly(copy.id);
  renderBlocks(); renderOverlay(); changed();
}

function moveBy(id, delta) {
  const i = doc.blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.blocks.length) return;
  [doc.blocks[i], doc.blocks[j]] = [doc.blocks[j], doc.blocks[i]];
  renderBlocks(); renderOverlay(); changed(0);
}

function clearDropline() { document.querySelectorAll('.dropline').forEach((e) => e.remove()); }

/** Flow mode: insert position for a pointer on the pages, from the block
 *  positions Typst reported. Returns { index, page, y } (y in mm from the page top). */
function flowDropIndex(clientX, clientY) {
  const m = metrics();
  const r = $('canvas').getBoundingClientRect();
  const cy = clientY - r.top;
  let page = m.pages.length - 1;
  for (let i = 0; i < m.pages.length; i++) if (cy < m.pages[i].top + m.pages[i].height + 12) { page = i; break; }
  const y = (cy - (m.pages[page]?.top ?? 0)) / m.scale;
  const shown = doc.blocks.map((b, i) => ({ b, i, f: info.flow?.[b.id] })).filter((e) => e.f && e.f.y0 !== undefined);
  for (const e of shown) {
    const p1 = e.f.page1 ?? e.f.page;
    const mid = e.f.page === p1 ? (e.f.y0 + e.f.y1) / 2 : e.f.y0 + 5;
    if (e.f.page > page || (e.f.page === page && mid > y)) return { index: e.i, page: e.f.page, y: e.f.y0 };
  }
  const last = shown[shown.length - 1];
  return { index: doc.blocks.length, page: last ? (last.f.page1 ?? last.f.page) : 0, y: last ? last.f.y1 : MARGIN_TOP + info.headerH };
}

// ------------------------------------------------------ quick menu actions --

/** Open the properties of a block in the inspector. */
function editBlock(id) {
  inspectorOpen = true;
  enteredGroup = blockById(id)?.group || null; // a member of a group: work inside the group
  setSelection([id]);
  renderInspector();
  $('inspector').querySelector('fieldset:not([disabled]) input, fieldset:not([disabled]) textarea, fieldset:not([disabled]) select')?.focus();
}

function toggleLock(id) {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return;
  if (b.locked) delete b.locked; else b.locked = true;
  toast(b.locked ? 'Baustein gesperrt.' : 'Baustein entsperrt.');
  renderBlocks(); renderOverlay(); changed(0);
}

// Copy and paste of blocks, also between worksheets (kept in localStorage).
const CLIP_KEY = 'lineatur-clipboard';
let memClipboard = null;

function copyBlock(id) {
  copyBlocks(doc.blocks.filter((b) => b.id === id));
}

function copyBlocks(list) {
  if (!list.length) return;
  const data = JSON.stringify({ lineaturBlocks: list });
  memClipboard = data;
  try { localStorage.setItem(CLIP_KEY, data); } catch { /* too large for localStorage: keep it in memory */ }
  navigator.clipboard?.writeText(data).catch(() => {});
  toast(`${list.length === 1 ? 'Baustein' : list.length + ' Bausteine'} kopiert – mit Strg+V einfügen, auch in einem anderen Arbeitsblatt.`);
}

function pasteBlock() {
  let data = null;
  try { data = localStorage.getItem(CLIP_KEY); } catch { /* use the memory copy */ }
  data ??= memClipboard;
  let list = null;
  try {
    const parsed = JSON.parse(data || 'null');
    list = parsed?.lineaturBlocks || (parsed?.lineaturBlock ? [parsed.lineaturBlock] : null);
  } catch { list = null; }
  list = (list || []).filter((b) => b && TYPES[b.type]);
  if (!list.length) { toast('Die Zwischenablage enthält keinen Baustein.'); return; }
  insertCopies(list);
  toast(list.length === 1 ? 'Baustein eingefügt.' : `${list.length} Bausteine eingefügt.`);
}

/** Insert copies of blocks (new ids, own groups, unlocked). Grid layout: they keep their
 *  arrangement and go to `at` ({ page, y }) or the next free spot; flow: after the selection. */
function insertCopies(list, at = null) {
  const groups = new Map();
  const copies = list.map((b) => {
    const c = migrateBlock({ ...structuredClone(b), id: uid() });
    delete c.locked;
    if (c.group) { if (!groups.has(c.group)) groups.set(c.group, 'g' + uid()); c.group = groups.get(c.group); }
    return c;
  });
  if (isFree()) {
    const ls = copies.map((c) => layoutOf(c));
    const minPage = Math.min(...ls.map((l) => l.page));
    const minY = Math.min(...ls.filter((l) => l.page === minPage).map((l) => l.y));
    const height = Math.max(...ls.filter((l) => l.page === minPage).map((l, i) => l.y + (info.heights[list[i]?.id] ?? 20))) - minY;
    const spot = at || spotOnCurrentPage(Math.max(20, height));
    copies.forEach((c, i) => {
      const l = ls[i];
      const w = Math.min(l.w, BODY_W);
      const page = spot.page + (l.page - minPage);
      c.layout = { ...l, page, x: Math.min(Math.max(0, l.x), BODY_W - w), y: Math.max(0, spot.y + (l.page === minPage ? l.y - minY : l.y)), w };
      doc.pageCount = Math.max(doc.pageCount, page + 1);
      doc.blocks.push(c);
    });
  } else {
    doc.blocks.splice(flowInsertIndex(), 0, ...copies);
  }
  setSelection(copies.map((c) => c.id), { quiet: true });
  renderBlocks(); renderOverlay(); changed(0);
  return copies;
}

/** Licence information of a block (TASL: title, author, source, licence). */
async function licenseDialog(id) {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return;
  const l = { ...(b.license || {}) };
  const lic = h('select', {}, h('option', { value: '' }, '– keine Angabe –'),
    LICENSES.map(([k, name]) => h('option', { value: k, selected: l.license === k }, name)));
  const other = h('input', { type: 'text', value: l.licenseName || '', placeholder: 'Name der Lizenz' });
  const otherRow = h('label', {}, 'Lizenzname', other);
  const showOther = () => { otherRow.hidden = lic.value !== 'other'; };
  lic.addEventListener('change', showOther);
  showOther();
  const author = h('input', { type: 'text', value: l.author || '', placeholder: 'z. B. Max Mustermann' });
  const title = h('input', { type: 'text', value: l.title || '', placeholder: 'Titel des Werks (optional)' });
  const source = h('input', { type: 'text', value: l.source || '', placeholder: 'Link oder Quelle (optional)' });
  const url = LICENSES.find(([k]) => k === l.license)?.[2];
  const body = h('div', { class: 'stack' },
    h('p', { class: 'hint' }, `Baustein: ${TYPES[b.type]?.label || b.type}. Die Angaben erscheinen in der digitalen (HTML-)Fassung (Beta) unter „Lizenzhinweise“.`),
    b.type === 'image' && b.credit ? h('p', { class: 'hint' }, 'Bildnachweis: ' + b.credit) : null,
    h('label', {}, 'Lizenz', lic), otherRow,
    h('label', {}, 'Urheber/in', author), h('label', {}, 'Titel', title), h('label', {}, 'Quelle', source),
    url ? h('a', { href: url, target: '_blank', rel: 'noopener', class: 'hint' }, 'Lizenztext ansehen') : null,
    licenseText(b) ? h('p', { class: 'hint' }, 'Aktueller Hinweis: ' + licenseText(b)) : null);
  if (b.locked) body.querySelectorAll('input, select').forEach((e) => { e.disabled = true; });
  if (!(await dialog('Lizenzinformationen', body, { ok: b.locked ? 'Schließen' : 'Speichern' })) || b.locked) return;
  const next = { license: lic.value, licenseName: lic.value === 'other' ? other.value.trim() : '', author: author.value.trim(), title: title.value.trim(), source: source.value.trim() };
  if (Object.values(next).some(Boolean)) b.license = next; else delete b.license;
  changed(0);
}

// ------------------------------------------------------------ blocks panel --

let paletteFilter = 'all';

function renderPalette() {
  const q = $('block-search').value.trim().toLowerCase();
  const item = (type, def) => {
    const el = h('div', { class: 'pal-item', role: 'button', tabindex: 0, title: `${def.label} – klicken zum Einfügen oder auf die Seite ziehen`,
      onclick: () => { if (!paletteDragJustEnded) addByClick(type); } },
    h('span', { class: 'ic' }, def.icon), h('span', { class: 'pal-label' }, def.label));
    if (type === 'image') {
      el.append(iconBtn('search', 'Freie Bilder suchen', (e) => {
        e.stopPropagation();
        openImageSearch((src, credit) => addByClick('image', { src, credit }));
      }));
    }
    el.append(iconBtn('plus', 'Einfügen', (e) => { e.stopPropagation(); addByClick(type); }));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addByClick(type); } });
    el.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) startPaletteDrag(e, type); });
    return el;
  };
  const groups = GROUPS
    .filter(([g]) => paletteFilter === 'all' || paletteFilter === g)
    .map(([group, title]) => {
      const items = Object.entries(TYPES)
        .filter(([t, d]) => d.group === group && !(d.flowOnly && isFree()) && (!q || d.label.toLowerCase().includes(q) || t.includes(q)))
        .map(([t, d]) => item(t, d));
      return items.length ? h('div', { class: 'pal-group' }, h('h3', {}, title), ...items) : null;
    })
    .filter(Boolean);
  $('palette').replaceChildren(...(groups.length ? groups : [h('div', { class: 'empty-hint' }, 'Kein Baustein gefunden.')]));
}

function renderPaletteFilter() {
  $('block-filter').replaceChildren(...[['all', 'Alle'], ...GROUPS].map(([g, label]) =>
    h('button', { class: g === paletteFilter ? 'on' : '', role: 'tab', onclick: () => { paletteFilter = g; renderPaletteFilter(); renderPalette(); } }, label)));
}

// ------------------------------------------------- palette -> page drag --
// Pointer events instead of HTML5 drag-and-drop: works the same with mouse,
// pen and touch, shows a snapped outline of the new block on the page, and
// honours Alt (free placement) live, like moving a block.

let paletteDrag = null;
let paletteDragJustEnded = false;
const DROP_PREVIEW_H = 25; // mm; the real height is only known after rendering

function startPaletteDrag(e, type) {
  if (e.button !== 0) return;
  e.preventDefault(); // no text selection while dragging
  paletteDrag = { type, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, alt: e.altKey, active: false };
  window.addEventListener('pointermove', onPaletteMove);
  window.addEventListener('pointerup', endPaletteDrag);
  window.addEventListener('pointercancel', cancelPaletteDrag);
}

function onPaletteMove(e) {
  const d = paletteDrag;
  if (!d) return;
  Object.assign(d, { x: e.clientX, y: e.clientY, alt: e.altKey });
  if (!d.active) {
    if (Math.hypot(d.x - d.x0, d.y - d.y0) < 5) return; // a click, not a drag (yet)
    d.active = true;
    const def = TYPES[d.type];
    d.ghost = h('div', { class: 'pal-ghost' }, h('span', { class: 'ic' }, def.icon), def.label);
    document.body.append(d.ghost);
    document.body.classList.add('pal-dragging');
  }
  autoScrollStage(d.y);
  updatePaletteDrag();
}

/** Scroll the pages while dragging near the top or bottom edge. */
function autoScrollStage(clientY) {
  const pane = $('stage');
  const r = pane.getBoundingClientRect();
  if (clientY > r.bottom - 50 && clientY < r.bottom + 20) pane.scrollTop += 14;
  else if (clientY < r.top + 60 && clientY > r.top - 20) pane.scrollTop -= 14;
}

const isOver = (el, x, y) => {
  if (!el || el.hidden || !el.offsetParent) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};

/** Where a drop at the current pointer position would put the block. */
function paletteDropTarget() {
  const { type, x, y, alt } = paletteDrag;
  if (!isOver($('stage'), x, y) || !$('pages').children.length || x < $('stage').getBoundingClientRect().left) return null;
  if (isOver($('panel'), x, y) || isOver($('inspector'), x, y)) return null; // the panels float over the stage
  if (!isFree()) return { kind: 'list', ...flowDropIndex(x, y) };
  const w = defaultWidth(type);
  const p = pointerToMM(x, y);
  // pointer holds the block at the middle of its top edge
  const pos = snapPosition(p.x - w / 2, p.y - 4, w, cols(), alt);
  const maxY = Math.max(0, contentHeight(p.page, info.headerH) - ROW);
  return { kind: 'page', page: p.page, x: pos.x, y: Math.min(pos.y, maxY), w };
}

function updatePaletteDrag() {
  const d = paletteDrag;
  d.ghost.style.transform = `translate(${d.x + 14}px, ${d.y + 10}px)`;
  d.target = paletteDropTarget();
  d.ghost.classList.toggle('nodrop', !d.target);
  clearDropline();
  document.querySelector('.droppreview')?.remove();
  const m = metrics();
  const pg = d.target && m.pages[d.target.page];
  if (!pg) return;

  if (d.target.kind === 'list') {
    const line = h('div', { class: 'dropline' });
    line.style.cssText = `left:${pg.left + marginLeft(d.target.page) * m.scale}px;top:${pg.top + d.target.y * m.scale - 1.5}px;width:${BODY_W * m.scale}px;`;
    $('rects').append(line);
  } else {
    const top0 = MARGIN_TOP + (d.target.page === 0 ? info.headerH : 0);
    const el = h('div', { class: 'droppreview' + (d.alt ? ' free' : '') }, TYPES[d.type].label);
    el.style.cssText = `left:${pg.left + (marginLeft(d.target.page) + d.target.x) * m.scale}px;top:${pg.top + (top0 + d.target.y) * m.scale}px;` +
      `width:${d.target.w * m.scale}px;height:${DROP_PREVIEW_H * m.scale}px;`;
    $('rects').append(el);
    setSnapState(d.alt, true);
  }
}

function finishPaletteDrag() {
  window.removeEventListener('pointermove', onPaletteMove);
  window.removeEventListener('pointerup', endPaletteDrag);
  window.removeEventListener('pointercancel', cancelPaletteDrag);
  paletteDrag?.ghost?.remove();
  document.querySelector('.droppreview')?.remove();
  document.body.classList.remove('pal-dragging');
  clearDropline();
  setSnapState(false, false);
}

function endPaletteDrag() {
  const d = paletteDrag;
  finishPaletteDrag();
  paletteDrag = null;
  if (!d?.active) return; // plain click: the click handler adds the block
  // the click event after pointerup must not add a second block
  paletteDragJustEnded = true;
  setTimeout(() => { paletteDragJustEnded = false; }, 0);
  const t = d.target;
  if (!t) return;
  if (t.kind === 'page') addFree(d.type, { page: t.page, x: t.x, y: t.y });
  else add(d.type, t.index);
}

function cancelPaletteDrag() {
  finishPaletteDrag();
  paletteDrag = null;
}

// ----------------------------------------------------------- selection --

const blockById = (id) => doc.blocks.find((b) => b.id === id);
const selectedBlocks = () => displayOrder().filter((b) => selection.has(b.id));

/** The ids plus all other members of their groups. */
function withGroups(ids) {
  const out = new Set();
  for (const id of ids) {
    const b = blockById(id);
    if (!b) continue;
    out.add(id);
    if (b.group) doc.blocks.forEach((x) => { if (x.group === b.group) out.add(x.id); });
  }
  return out;
}

/** Select exactly these blocks (no group expansion), without rendering. */
function selectOnly(id) {
  selection = new Set(id ? [id] : []);
  selectedId = id || null;
}

function setSelection(ids, { from, quiet = false } = {}) {
  selection = new Set(ids);
  // selecting anything outside the entered group leaves it
  const left = enteredGroup && (!selection.size || [...selection].some((id) => blockById(id)?.group !== enteredGroup));
  if (left) enteredGroup = null;
  inspectGroup = null;
  headerSelected = false;
  $('rects').querySelector('.hdrbox')?.classList.remove('sel');
  selectedId = selection.size === 1 ? [...selection][0] : null;
  if (quiet) return;
  if (left) renderLayers(); // the group closes again in the layers panel
  rects.forEach((el, bid) => el.classList.toggle('sel', selection.has(bid)));
  syncLayerSelection();
  document.body.classList.toggle('multisel', selection.size > 1);
  if (inspectedId !== selectedId) renderInspector();
  renderSelectionBox();
  markCurrentPage();
  if (selectedId && from === 'layers') rects.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  updateChipsText();
}

/** Inside the entered group a block is selected on its own, elsewhere with its group. */
const insideGroup = (id) => !!enteredGroup && blockById(id)?.group === enteredGroup;

/** Select a block (with its group); null clears the selection. */
function select(id, opts = {}) {
  setSelection(id ? (insideGroup(id) ? [id] : withGroups([id])) : [], opts);
}

/** Shift/Ctrl click: add the block (and its group) to the selection or take it out. */
function toggleSelect(id) {
  const ids = insideGroup(id) ? [id] : withGroups([id]);
  const next = new Set(selection);
  const has = [...ids].every((x) => next.has(x));
  ids.forEach((x) => (has ? next.delete(x) : next.add(x)));
  setSelection(next);
}

/** The whole group is selected, and a further click on `id` would select just that member? */
function canEnterGroup(id) {
  const g = blockById(id)?.group;
  return !!g && g !== enteredGroup && selectionIsGroup() && selectedBlocks()[0].group === g;
}

/** Work inside the group of `id`: only this member is selected. */
function enterGroup(id, { from = 'canvas' } = {}) {
  const b = blockById(id);
  if (!b?.group) return;
  const again = enteredGroup === b.group;
  enteredGroup = b.group;
  setSelection([id], { from });
  if (!again) renderLayers(); // the group opens in the layers panel
}

/** Leave the entered group; the whole group is selected again. */
function leaveGroup() {
  const g = enteredGroup;
  if (!g) return;
  enteredGroup = null;
  setSelection(doc.blocks.filter((b) => b.group === g).map((b) => b.id));
  renderLayers();
}

/** Frame settings of a block's group (from a single member's quick menu). */
function openGroupFrame(id) {
  const g = blockById(id)?.group;
  if (!g) return;
  enteredGroup = null;
  setSelection(withGroups([id]));
  inspectGroup = g;
  inspectorOpen = true;
  renderInspector();
}

// ------------------------------------------------- selection: group, align --

function groupSelection() {
  const list = selectedBlocks();
  if (list.length < 2) return;
  const g = 'g' + uid();
  const frame = list.find((b) => b.groupFrame)?.groupFrame;
  list.forEach((b) => { b.group = g; if (frame) b.groupFrame = { ...frame }; else delete b.groupFrame; });
  toast(`${list.length} Bausteine gruppiert – ein Klick wählt die ganze Gruppe, ein weiterer Klick einen einzelnen Baustein.`);
  renderBlocks(); renderOverlay(); changed(0);
}

function ungroupSelection() {
  const list = selectedBlocks().filter((b) => b.group);
  list.forEach((b) => { delete b.group; delete b.groupFrame; });
  inspectGroup = null;
  if (list.length) toast('Gruppierung aufgehoben.');
  renderBlocks(); renderOverlay(); changed(0);
}

/** The selection is exactly one whole group? */
const selectionIsGroup = () => {
  const list = selectedBlocks();
  const g = list[0]?.group;
  return list.length > 1 && !!g && list.every((b) => b.group === g) && doc.blocks.filter((b) => b.group === g).length === list.length;
};

/** Units for aligning and distributing: a group moves as one (except the entered group). */
const selectionUnits = () => layoutUnits(selectedBlocks(), info.heights, enteredGroup);

function lockSelection() {
  const list = selectedBlocks();
  const lock = !list.every((b) => b.locked);
  list.forEach((b) => { if (lock) b.locked = true; else delete b.locked; });
  toast(lock ? `${list.length === 1 ? 'Baustein' : list.length + ' Bausteine'} gesperrt.` : 'Entsperrt.');
  renderBlocks(); renderOverlay(); changed(0);
}

function deleteSelection() {
  const list = selectedBlocks();
  const free = list.filter((b) => !b.locked);
  if (!free.length) { toast('Gesperrte Bausteine können nicht gelöscht werden. Erst entsperren.'); return; }
  const gone = new Set(free.map((b) => b.id));
  doc.blocks = doc.blocks.filter((b) => !gone.has(b.id));
  setSelection(list.filter((b) => b.locked).map((b) => b.id), { quiet: true });
  if (free.length < list.length) toast('Gesperrte Bausteine wurden nicht gelöscht.');
  renderBlocks(); renderOverlay(); changed(0);
}

function duplicateSelection() {
  const list = selectedBlocks();
  if (list.length === 1) { duplicate(list[0].id); return; }
  let at = null;
  if (isFree()) {
    // the copies go right below the selection, or to the top of the next page
    const ls = list.map((b) => ({ l: layoutOf(b), h: info.heights[b.id] ?? 20 }));
    const page = Math.min(...ls.map((x) => x.l.page));
    const onPage = ls.filter((x) => x.l.page === page);
    const top = Math.min(...onPage.map((x) => x.l.y));
    const bottom = Math.max(...onPage.map((x) => x.l.y + x.h));
    const y = Math.ceil((bottom + 4) / ROW) * ROW;
    at = y + (bottom - top) <= contentHeight(page, info.headerH) ? { page, y } : { page: page + 1, y: 0 };
  }
  insertCopies(list, at);
}

const round05 = (v) => Math.round(v * 2) / 2;
const clampX = (x, w) => Math.min(Math.max(0, x), Math.max(0, BODY_W - w));

/** Align the selected blocks to each other, or a single block on the page.
 *  mode: left | hcenter | right | top | vcenter | bottom */
function alignSelection(mode) {
  if (!isFree()) { toast('Ausrichten geht im Raster-Layout (Dokument → Seite → Layout).'); return; }
  const units = selectionUnits();
  if (!units.length) return;
  const skipped = alignUnits(units, mode, contentHeight(units[0].page, info.headerH));
  if (skipped) toast('Gesperrte Bausteine wurden nicht verschoben.');
  renderBlocks(); renderOverlay(); changed(0);
}

/** Equal gaps between the selected blocks (at least three, on one page); a group counts as one. axis: 'h' | 'v' */
function distributeSelection(axis) {
  if (!isFree()) { toast('Verteilen geht im Raster-Layout (Dokument → Seite → Layout).'); return; }
  const units = selectionUnits();
  if (units.length < 3) { toast('Zum Verteilen mindestens drei Bausteine oder Gruppen auswählen.'); return; }
  if (new Set(units.flatMap((u) => u.items.map((i) => i.l.page))).size > 1) { toast('Verteilen geht nur mit Bausteinen auf derselben Seite.'); return; }
  const skipped = distributeUnits(units, axis);
  if (skipped) toast('Gesperrte Bausteine wurden nicht verschoben.');
  renderBlocks(); renderOverlay(); changed(0);
}

const ALIGN_ITEMS = [
  ['left', 'alignLeft', 'Linksbündig'], ['hcenter', 'alignCenterH', 'Horizontal zentriert'], ['right', 'alignRight', 'Rechtsbündig'],
  ['top', 'alignTop', 'Oben ausrichten'], ['vcenter', 'alignMiddleV', 'Vertikal zentriert'], ['bottom', 'alignBottom', 'Unten ausrichten'],
];

/** Small pop-up menu under a quick-menu button. */
function openQuickPop(anchor, items) {
  let pop = $('qpop');
  if (!pop) {
    pop = h('div', { id: 'qpop', class: 'qpop', role: 'menu' });
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(pop);
    document.addEventListener('pointerdown', () => { pop.hidden = true; });
  }
  pop.replaceChildren(...items.map(([icon, label, fn, disabled]) => {
    const b = h('button', { role: 'menuitem', disabled: disabled || null, onclick: () => { pop.hidden = true; fn(); } }, label);
    b.prepend(svgIcon(icon));
    return b;
  }));
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = `${Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)}px`;
  pop.style.top = `${r.bottom + 4}px`;
}

function openAlignMenu(anchor) {
  const n = selectionUnits().length;
  const items = ALIGN_ITEMS.map(([mode, icon, label]) => [icon, n === 1 ? `${label} (auf der Seite)` : label, () => alignSelection(mode)]);
  items.push(
    ['distH', 'Horizontal gleichmäßig verteilen', () => distributeSelection('h'), n < 3],
    ['distV', 'Vertikal gleichmäßig verteilen', () => distributeSelection('v'), n < 3],
  );
  openQuickPop(anchor, items);
}

/** Dashed frame around a multi-selection, with its quick menu. */
function renderSelectionBox() {
  renderGroupOutline();
  let wrap = $('selbox');
  const shown = [...selection].map((id) => rects.get(id)).filter((el) => el && !el.hidden);
  if (selection.size < 2 || !shown.length || drag?.members) { if (wrap) wrap.hidden = true; return; }
  if (!wrap) {
    wrap = h('div', { id: 'selbox', class: 'selbox' });
    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    $('rects').append(wrap);
  }
  const box = shown.reduce((a, el) => {
    const l = parseFloat(el.style.left); const t = parseFloat(el.style.top);
    const r = l + parseFloat(el.style.width); const btm = t + parseFloat(el.style.height);
    return { l: Math.min(a.l, l), t: Math.min(a.t, t), r: Math.max(a.r, r), b: Math.max(a.b, btm) };
  }, { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
  Object.assign(wrap.style, { left: box.l - 4 + 'px', top: box.t - 4 + 'px', width: box.r - box.l + 8 + 'px', height: box.b - box.t + 8 + 'px' });
  wrap.hidden = false;
  const list = selectedBlocks();
  const isGroup = selectionIsGroup();
  const units = selectionUnits().length;
  const allLocked = list.every((b) => b.locked);
  const tool = (icon, title, fn, opts = {}) => {
    const t = h('button', { title, 'aria-label': title, class: opts.cls || '', disabled: opts.disabled || null,
      onclick: (e) => { e.stopPropagation(); fn(e.currentTarget); } });
    t.append(svgIcon(icon));
    return t;
  };
  wrap.replaceChildren(
    h('span', { class: 'selchip' }, `${list.length} Bausteine${isGroup ? ' · Gruppe' : ''}`),
    h('span', { class: 'mtools', role: 'toolbar', 'aria-label': 'Auswahl' },
      isGroup
        ? tool('ungroup', 'Gruppierung aufheben (Strg+Umschalt+G)', ungroupSelection)
        : enteredGroup ? null : tool('group', 'Gruppieren (Strg+G)', groupSelection),
      isGroup ? tool('frame', 'Rahmen & Hintergrund der Gruppe', () => {
        inspectGroup = list[0].group;
        inspectorOpen = true;
        renderInspector();
      }, { cls: list.some((b) => b.groupFrame) ? 'on' : '' }) : null,
      tool('alignLeft', 'Ausrichten und verteilen', openAlignMenu, { cls: 'aligntool', disabled: !isFree() }),
      tool('distH', 'Horizontal gleichmäßig verteilen', () => distributeSelection('h'), { cls: 'aligntool', disabled: !isFree() || units < 3 }),
      tool('distV', 'Vertikal gleichmäßig verteilen', () => distributeSelection('v'), { cls: 'aligntool', disabled: !isFree() || units < 3 }),
      tool(allLocked ? 'unlock' : 'lock', allLocked ? 'Alle entsperren' : 'Alle sperren', lockSelection),
      tool('copy', 'Duplizieren', duplicateSelection),
      tool('clipboard', 'Kopieren', () => copyBlocks(selectedBlocks())),
      tool('trash', 'Löschen', deleteSelection, { cls: 'danger', disabled: allLocked })));
}

/** Dashed outline around the group the user clicked into. */
function renderGroupOutline() {
  let el = $('groupbox');
  const shown = enteredGroup
    ? doc.blocks.filter((b) => b.group === enteredGroup).map((b) => rects.get(b.id)).filter((r) => r && !r.hidden) : [];
  if (!shown.length) { if (el) el.hidden = true; return; }
  if (!el) {
    el = h('div', { id: 'groupbox', class: 'groupbox' }, h('span', { class: 'groupchip' }, 'In der Gruppe · Esc verlässt sie'));
    $('rects').append(el);
  }
  const box = shown.reduce((a, r) => {
    const l = parseFloat(r.style.left); const t = parseFloat(r.style.top);
    return { l: Math.min(a.l, l), t: Math.min(a.t, t), r: Math.max(a.r, l + parseFloat(r.style.width)), b: Math.max(a.b, t + parseFloat(r.style.height)) };
  }, { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
  Object.assign(el.style, { left: box.l - 6 + 'px', top: box.t - 6 + 'px', width: box.r - box.l + 12 + 'px', height: box.b - box.t + 12 + 'px' });
  el.hidden = false;
}

// ------------------------------------------------------- layout controls --

function setLayoutMode(next) {
  if (next === doc.layoutMode) return;
  if (next === 'free') {
    doc.layoutMode = 'free';
    doc.pageCount = Math.max(1, doc.pageCount || 1);
    if (doc.blocks.some((b) => !b.layout)) {
      // first visit: stack provisionally, then refine once Typst reports real heights
      doc.pageCount = stackBlocks(doc.blocks, info.heights, info.headerH || 25);
      pendingArrange = true;
    }
  } else {
    doc.blocks = readingOrder(doc.blocks); // flow order = what you saw on the pages
    doc.layoutMode = 'flow';
  }
  applyMode();
  renderBlocks(); renderOverlay(); changed(0);
}

function autoArrange() {
  const ordered = readingOrder(doc.blocks);
  doc.pageCount = stackBlocks(ordered, info.heights, info.headerH || 25);
  renderBlocks(); renderOverlay(); changed(0);
}

function applyMode() {
  document.body.dataset.layout = doc.layoutMode;
  setSnapState(false, false);
  renderPalette(); // page breaks are offered in the flow layout only
}

// Grid layout: pages are explicit. Flow layout: the content makes the pages, so
// "+ Seite" appends a page break and "− Seite" removes a trailing one.
/** Flow layout: where a new page goes – at the end, or in front of the booklet's back cover
 *  (the block that starts the last page). */
function flowPageIndex() {
  if (!(doc.booklet?.on && doc.booklet.backCover)) return doc.blocks.length;
  for (let i = doc.blocks.length - 1; i > 0; i--) {
    const b = doc.blocks[i];
    if (!b.hidden && (b.newPage || b.type === 'pagebreak')) return i;
  }
  return doc.blocks.length;
}
/** A new page after the current one (flow: a page break after the selection or the page in view). */
function addPage() {
  if (!isFree()) { add('pagebreak', Math.min(flowInsertIndex(), flowPageIndex())); return; }
  const page = insertPageAfter(currentPage());
  setSelection([]);
  pendingScroll = { page };
  toast(`Seite ${page + 1} eingefügt.`);
  renderBlocks(); renderOverlay(); changed(0);
}
/** Grid layout: remove the current page if it is empty. Flow: remove a trailing page break. */
function removePage() {
  if (!isFree()) {
    const lastBlock = doc.blocks[flowPageIndex() - 1];
    if (lastBlock?.type === 'pagebreak' && !lastBlock.locked) { remove(lastBlock.id); return; }
    $('error').hidden = false;
    $('error').textContent = 'Auf der letzten Seite liegen noch Bausteine. Seiten entstehen im Fluss-Layout durch den Inhalt; entfernen Sie Bausteine oder einen Seitenumbruch.';
    return;
  }
  if (doc.pageCount < 2) return;
  const page = Math.min(currentPage(), doc.pageCount - 1);
  if (!removeEmptyPage(doc.blocks, page)) {
    toast(`Auf Seite ${page + 1} liegen noch Bausteine. Bitte zuerst verschieben oder löschen.`);
    return;
  }
  doc.pageCount--;
  toast(`Seite ${page + 1} entfernt.`);
  renderBlocks(); renderOverlay(); changed(0);
}

// ------------------------------------------------------------ file actions --

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = () => (doc.title || 'Arbeitsblatt').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'Arbeitsblatt';

async function exportFile(endpoint, body, name, what) {
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    $('error').hidden = false; $('error').textContent = e.error || `${what}-Export fehlgeschlagen`;
    return;
  }
  download(await res.blob(), name);
}
const downloadPdf = (solutions) =>
  exportFile('/api/pdf', { doc, solutions }, `${safeName()}${solutions ? ' - Lösung' : ''}.pdf`, 'PDF');
const downloadHtml = () => exportFile('/api/html', { doc }, `${safeName()} - digital.html`, 'HTML');
const downloadBooklet = (solutions) =>
  exportFile('/api/pdf', { doc, solutions, booklet: true }, `${safeName()} - Broschüre${solutions ? ' - Lösung' : ''}.pdf`, 'PDF');

// Booklets can be viewed as spreads (2 | 3, 4 | 5, …), the first page alone on the right.
let spreads = false;
function applySpreads() {
  const on = !!doc.booklet?.on;
  $('btn-spreads').hidden = !on;
  $('btn-spreads').classList.toggle('on', on && spreads);
  $('pages').classList.toggle('spreads', on && spreads);
  document.querySelectorAll('.booklet-only').forEach((el) => { el.hidden = !on; });
  reserveSidebars();
  renderOverlay();
}

function setDoc(d) {
  flushSave();
  pendingPlace = null;
  doc = normalize(d);
  applyGeometry(doc);
  selectedId = null;
  selection = new Set();
  headerSelected = false;
  info = { heights: {}, natural: {}, headerH: 0, examH: 0, flow: {} };
  pendingArrange = false;
  if (isFree() && doc.blocks.some((b) => !b.layout)) {
    // a document without positions (no layout mode yet) opens in the grid: stack it
    // provisionally, then refine once Typst reports the real heights
    doc.pageCount = stackBlocks(doc.blocks, info.heights, info.headerH || 25);
    pendingArrange = true;
  }
  syncSettings(); applyMode(); renderBlocks(); renderOverlay(); schedule(0);
  resetHistory();
}

function syncSettings() {
  renderDocPanel();
  syncTopbar();
  applySpreads();
}

function setMode(m) {
  mode = m;
  $('mode-student').classList.toggle('on', m === 'student');
  $('mode-solution').classList.toggle('on', m === 'solution');
  document.body.dataset.mode = m; // solution mode tints the stage in correction red
  schedule(0);
}

// ------------------------------------------------------------------- zoom --

const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const MM_PX = 96 / 25.4;

function applyZoom() {
  $('pages').style.setProperty('--page-w', `${Math.round(PAGE_W * MM_PX * zoom)}px`);
  $('zoom-val').textContent = `${Math.round(zoom * 100)}%`;
  reserveSidebars();
}

/** The side panels float over the stage. The pages keep the panels' full width free on both
 *  sides, whether a panel is open or not, so opening and closing a panel never moves them.
 *  When page plus panels are wider than the window, the stage scrolls sideways, so every
 *  part of the page can be brought out from under a panel. */
function reserveSidebars() {
  const stage = $('stage');
  const css = getComputedStyle(document.documentElement);
  stage.style.setProperty('--reserve-l', `${parseFloat(css.getPropertyValue('--panel-w')) || 290}px`);
  stage.style.setProperty('--reserve-r', `${parseFloat(css.getPropertyValue('--inspector-w')) || 340}px`);
}
function setZoom(z) {
  zoom = Math.min(2, Math.max(0.5, z));
  try { localStorage.setItem('lineatur-zoom', String(zoom)); } catch { /* not important */ }
  applyZoom();
  renderOverlay();
}
function stepZoom(dir) {
  const i = ZOOMS.findIndex((z) => z >= zoom - 1e-6);
  const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 1e-6) : [...ZOOMS].reverse().find((z) => z < zoom - 1e-6);
  setZoom(next ?? ZOOMS[Math.max(0, i)]);
}

// ----------------------------------------------------------- side panels --

function showPane(name) {
  const collapsed = document.body.classList.contains('panel-collapsed');
  const current = document.querySelector('.rail-btn.on')?.dataset.panel;
  // clicking the open panel's icon again folds the panel away (like the sidebar toggle)
  if (current === name && !collapsed) { document.body.classList.add('panel-collapsed'); return; }
  document.body.classList.remove('panel-collapsed');
  document.querySelectorAll('.rail-btn[data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name));
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  if (name === 'layers') renderLayers();
  renderOverlay();
}

function showTab(name) {
  setDocTab(name);
  renderDocPanel();
}

/** Title field in the top bar and the tab title; left alone while someone types in it. */
function showTitle() {
  const input = $('tb-title');
  if (document.activeElement !== input) input.value = doc.title || '';
  document.title = `${doc.title || 'Ohne Titel'} – Lineatur`;
}

/** Rename in place: Enter or leaving the field keeps the new title, Escape restores the old one. */
function initTitleEdit() {
  const input = $('tb-title');
  let before = '';
  let justFocused = false;
  input.addEventListener('focus', () => { before = doc.title || ''; input.select(); justFocused = true; });
  // the mouseup of the focusing click would undo the select-all
  input.addEventListener('mouseup', (e) => { if (justFocused) e.preventDefault(); justFocused = false; });
  input.addEventListener('input', () => {
    doc.title = input.value;
    showTitle();
    changed(250);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      doc.title = before;
      input.value = before;
      showTitle();
      changed(0);
    }
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); input.blur(); }
  });
  input.addEventListener('change', () => {
    doc.title = input.value.trim();
    showTitle();
    renderDocPanel(); // the Info tab shows the title too
  });
}

/** Top-bar font / size mirror the document settings. */
function syncTopbar() {
  $('tb-font').value = FONTS.includes(doc.font) ? doc.font : DEFAULT_FONT;
  $('tb-size').value = String(doc.fontSize || 12);
  showTitle();
}

// ---------------------------------------------------------------- routing --
// #/ my documents · #/collections · #/collection/<id> · #/templates · #/edit/<id>

let routing = Promise.resolve();

async function openEditor(id) {
  if (doc.id !== id || document.body.dataset.view !== 'editor') {
    const entry = await getDoc(id).catch(() => null);
    if (!entry) { location.hash = '#/'; return; }
    setDoc(entry.doc);
  }
  setLastDocId(id);
  document.body.dataset.view = 'editor';
  document.title = `${doc.title || 'Ohne Titel'} – Lineatur`;
  renderOverlay();
}

async function leaveEditor() {
  if (document.body.dataset.view !== 'editor') return;
  select(null);
  await flushSave();
  await flushThumb();
}

function route() {
  routing = routing.then(async () => {
    const [view, id] = location.hash.replace(/^#\/?/, '').split('/');
    if (view === 'edit' && id) return openEditor(decodeURIComponent(id));
    await leaveEditor();
    document.body.dataset.view = 'dashboard';
    document.title = 'Meine Dokumente – Lineatur';
    await showDashboard(view || 'docs', id ? decodeURIComponent(id) : null);
  }).catch((e) => console.error(e));
}

/** New worksheet (empty, or a copy of a template) -> library -> editor. */
async function createDoc(from) {
  const d = normalize({ ...(from || emptyDoc()), id: docUid() });
  await putDoc(d);
  location.hash = `#/edit/${d.id}`;
}

/** A worksheet JSON or a collection export ({ documents: [...] }) -> library. */
async function importText(text) {
  const data = JSON.parse(text);
  const docs = Array.isArray(data.documents) ? data.documents : [data];
  for (const d of docs) await putDoc(normalize({ ...d, id: docUid() }));
}

/** A worksheet JSON or a collection export -> own templates. Returns how many. */
async function importTemplates(text) {
  const data = JSON.parse(text);
  const docs = Array.isArray(data.documents) ? data.documents : [data];
  if (!docs.length || docs.some((d) => !Array.isArray(d?.blocks))) throw new Error('not a worksheet');
  for (const d of docs) await putTemplate(normalize({ ...d, id: `t${docUid()}` }));
  return docs.length;
}

/** A copy of a worksheet as own template. */
const saveTemplate = (d) => putTemplate(normalize({ ...structuredClone(d), id: `t${docUid()}` }));

// ------------------------------------------------------------------- init --

function fillSelect(id, options) {
  $(id).replaceChildren(...options.map(([v, t]) => h('option', { value: v }, t)));
}

const fontLabel = (f) => (f === 'Source Sans 3' ? 'Source Sans Pro' : f === 'New Computer Modern' ? 'Modern Roman' : f);

async function init() {
  hydrateIcons();
  renderPaletteFilter();
  renderPalette();
  setupCanvas();

  fillSelect('tb-font', FONTS.map((f) => [f, fontLabel(f)]));
  fillSelect('tb-size', SIZE_OPTIONS);

  // panels, tabs
  document.querySelectorAll('.rail-btn[data-panel]').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.panel)));
  $('btn-collapse').addEventListener('click', () => document.body.classList.toggle('panel-collapsed'));
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('block-search').addEventListener('input', renderPalette);
  $('layer-search').addEventListener('input', renderLayers);

  $('tb-font').addEventListener('change', (e) => { doc.font = e.target.value; syncSettings(); changed(0); });
  $('tb-size').addEventListener('change', (e) => { doc.fontSize = Number(e.target.value); syncSettings(); changed(0); });

  // top bar
  initTitleEdit();
  fetch('/api/themes').then((r) => r.json()).then((list) => {
    setInstalledThemes(Array.isArray(list) ? list : []);
    if (document.body.dataset.view === 'editor') renderDocPanel();
  }).catch(() => { /* no add-on designs */ });
  fetch('/api/themes/config').then((r) => r.json()).then((c) => {
    setThemeImport(c.importAllowed);
    if (document.body.dataset.view === 'editor') renderDocPanel();
  }).catch(() => { /* an older server: no import */ });
  $('mode-student').addEventListener('click', () => setMode('student'));
  $('mode-solution').addEventListener('click', () => setMode('solution'));
  $('btn-undo').addEventListener('click', () => undoRedo(-1));
  $('btn-redo').addEventListener('click', () => undoRedo(1));
  $('zoom-in').addEventListener('click', () => stepZoom(1));
  $('zoom-out').addEventListener('click', () => stepZoom(-1));
  $('zoom-val').addEventListener('click', () => setZoom(1));
  try { zoom = Number(localStorage.getItem('lineatur-zoom')) || 1; } catch { /* default */ }

  const menu = $('download-menu');
  const toggleMenu = (open) => { menu.hidden = !open; $('btn-download').setAttribute('aria-expanded', String(open)); };
  $('btn-download').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false); });
  menu.addEventListener('click', () => toggleMenu(false));
  $('btn-pdf').addEventListener('click', () => downloadPdf(false));
  $('btn-pdf-sol').addEventListener('click', () => downloadPdf(true));
  $('btn-html').addEventListener('click', downloadHtml);
  $('btn-booklet').addEventListener('click', () => downloadBooklet(false));
  $('btn-booklet-sol').addEventListener('click', () => downloadBooklet(true));
  $('btn-spreads').addEventListener('click', () => {
    spreads = !spreads;
    try { localStorage.setItem('lineatur-spreads', spreads ? '1' : ''); } catch { /* not important */ }
    applySpreads();
  });
  try { spreads = !!localStorage.getItem('lineatur-spreads'); } catch { /* default */ }
  $('btn-json').addEventListener('click', () => {
    download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${safeName()}.json`);
  });
  $('btn-src').addEventListener('click', () => {
    const s = $('source'); s.hidden = !s.hidden;
    $('canvas').hidden = !s.hidden;
    if (!s.hidden) schedule(0); // the preview only carries the source while it is shown
    $('btn-src').querySelector('b').textContent = s.hidden ? 'Typst-Quelltext zeigen' : 'Zurück zu den Seiten';
  });

  // keyboard: undo/redo, delete the selected block, Escape deselects
  window.addEventListener('keydown', (e) => {
    if (document.body.dataset.view !== 'editor') return; // the dashboard has its own keys
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); return; }
    if (mod && !typing && e.key === 'y') { e.preventDefault(); undoRedo(1); return; }
    if (typing) return;
    if (mod && e.key === 'c' && selection.size && !window.getSelection()?.toString()) { e.preventDefault(); copyBlocks(selectedBlocks()); return; }
    if (mod && e.key === 'v') { e.preventDefault(); pasteBlock(); return; }
    if (mod && e.key === 'a') { e.preventDefault(); setSelection(doc.blocks.filter((b) => !b.hidden).map((b) => b.id)); return; }
    if (mod && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); return; }
    if (e.key === 'Enter' && selectedId) { e.preventDefault(); editBlock(selectedId); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) {
      e.preventDefault();
      if (selection.size === 1) remove([...selection][0]); else deleteSelection();
    }
    if (e.key === 'Escape' && enteredGroup && !paletteDrag) { leaveGroup(); return; }
    if (e.key === 'Escape' && (selection.size || headerSelected) && !paletteDrag) select(null);
  });

  // page tools
  // grid lines start off, warnings on, whatever the browser remembers from the last visit
  $('show-grid').checked = false;
  $('show-warnings').checked = true;
  $('show-grid').addEventListener('change', () => renderOverlay());
  $('show-warnings').addEventListener('change', () => renderOverlay());
  // an open explanation bubble closes on any other click, on Escape and when the panel scrolls
  document.addEventListener('click', (e) => { if (!e.target.closest?.('#tip-pop')) closeTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTip(); });
  document.addEventListener('scroll', closeTip, true);
  $('btn-addpage').addEventListener('click', addPage);
  $('btn-rmpage').addEventListener('click', removePage);
  // the page in view is where the palette inserts: keep its mark up to date while scrolling
  let markQueued = false;
  $('stage').addEventListener('scroll', () => {
    if (markQueued) return;
    markQueued = true;
    requestAnimationFrame(() => { markQueued = false; markCurrentPage(); });
  }, { passive: true });
  $('btn-arrange').addEventListener('click', autoArrange);

  // image search dialog
  $('img-form').addEventListener('submit', (e) => { e.preventDefault(); runImageSearch(); });
  $('img-more').addEventListener('click', () => runImageSearch(true));
  document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  applyZoom();
  initDashboard({ open: (id) => { location.hash = `#/edit/${id}`; }, create: createDoc, importText, importTemplates, saveTemplate });
  await migrateLegacy();
  window.addEventListener('hashchange', route);
  route();
}

init();

export {
  ALIGN_ITEMS, CLIP_KEY, DROP_PREVIEW_H, MM_PX, STORE_KEY, ZOOMS, add, addByClick, addFree, addPage,
  alignSelection, applyMode, applySpreads, applyZoom, assessmentFields, autoArrange, autoScrollStage, blockById,
  blockSummary, canEnterGroup, cancelPaletteDrag, changed, chips, clampX, clearDropline, cols, copyBlock, copyBlocks, createDoc,
  deleteSelection, displayOrder, distributeSelection, doc, download, downloadBooklet, downloadHtml, downloadPdf,
  duplicate, duplicateSelection, editBlock, emptyDoc, enterGroup, enteredGroup, endPaletteDrag, exNumbers, exportFile, fillSelect,
  finishPaletteDrag, flowDropIndex, flowPageIndex, flushSave, fontLabel, groupSelection, headerInspector,
  headerSelected, history, importTemplates, importText, info, init, initTitleEdit, insertCopies, inspectGroup,
  inspectedId, inspectorOpen, isFree, isOver, layerDrag, layerOrder, layoutText, leaveEditor, licenseDialog,
  leaveGroup, lockSelection, memClipboard, migrateBlock, migrateLegacy, mode, moveBy, moveLayer, moveLayers, moveToPage, normalize, onPaletteMove,
  markCurrentPage, openAlignMenu, openEditor, openGroupFrame, openQuickPop, paletteDrag, paletteDragJustEnded, paletteDropTarget, paletteFilter,
  pasteBlock, pendingArrange, pendingPlace, placeAtBottom, recordHistory, remove, removePage, renderBlocks,
  renderInspector, renderLayers, renderPalette, renderPaletteFilter, renderSelectionBox, reserveSidebars,
  resetHistory, round05, route, scrollToPending, routing, safeName, save, saveTemplate, saveTimer, select, selectHeader,
  selectOnly, selectedBlocks, selectedId, selection, selectionIsGroup, selectionUnits, setAssessment, setDoc, setInfo,
  setInspectGroup, setInspectorOpen, setLayoutMode, setMode, setPendingArrange, setSelection, setZoom, showPane,
  showTab, showTitle, snapshotNow, spreads, startPaletteDrag, stepZoom, syncSettings, syncTopbar, toggleLock,
  syncLayerSelection, toggleSelect, undoRedo, ungroupSelection, updatePaletteDrag, updateUndoButtons, withGroups, zoom,
};
