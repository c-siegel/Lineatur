// Lineatur editor – The overlay on the rendered pages: block rectangles, guides, page tools, dragging, resizing and
// marquee selection.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import {
  BODY_W, HEADER_GAP, MARGIN_BOTTOM, MARGIN_TOP, MIN_W, PAGE_H, PAGE_W, ROW, VGRID, contentHeight, gridGeometry,
  layoutOf, marginLeft, movePage, snapPosition, snapWidth,
} from '../layout.js';
import { svgIcon } from '../icons.js';
import { $, h, toast } from './util.js';
import {
  add, autoScrollStage, cancelPaletteDrag, changed, chips, cols, copyBlock, doc, duplicate, editBlock, exNumbers,
  headerSelected, info, isFree, layoutText, licenseDialog, mode, openAlignMenu, paletteDrag, remove,
  renderBlocks, renderInspector, renderSelectionBox, reserveSidebars, round05, save, select, selectHeader,
  selectedBlocks, selectedId, selection, setSelection, toggleLock, toggleSelect, updatePaletteDrag, withGroups,
} from '../app.js';
import { more, row } from './docpanel.js';
import { TYPES } from './blocktypes.js';
import { schedule } from './preview.js';

// ------------------------------------------------------ canvas overlay --

const rects = new Map(); // block id -> overlay rectangle

function metrics() {
  const pages = [...$('pages').querySelectorAll('.page')].map((el) => ({
    left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight,
  }));
  return { pages, scale: pages.length ? pages[0].width / PAGE_W : 1 };
}

// Typst's text boxes end at the cap height and the baseline, so accents and
// descenders reach past them; the frame keeps this distance (mm) around a block.
const PAD_X = 1.5;
const PAD_Y = 2;

/** Pixel box of a block in canvas coordinates (null if its page is not rendered yet). */
function boxOf(b, m) {
  if (b.hidden) return null;
  if (!isFree()) {
    // flow: Typst reported where the block starts and ends (mm from the page top)
    const f = info.flow?.[b.id];
    const pg = f && m.pages[f.page];
    if (!pg || f.y0 === undefined) return null;
    const end = (f.page1 ?? f.page) === f.page && f.y1 !== undefined ? f.y1 : PAGE_H - MARGIN_BOTTOM;
    return {
      left: pg.left + (marginLeft(f.page) - PAD_X) * m.scale,
      top: pg.top + (f.y0 - PAD_Y) * m.scale,
      width: (BODY_W + 2 * PAD_X) * m.scale,
      height: (Math.max(4, end - f.y0) + PAD_Y) * m.scale,
    };
  }
  const l = layoutOf(b);
  const pg = m.pages[l.page];
  if (!pg) return null;
  const top0 = MARGIN_TOP + (l.page === 0 ? info.headerH : 0);
  const hh = drag?.id === b.id && drag.previewH !== undefined ? drag.previewH : info.heights[b.id] ?? 20;
  return {
    left: pg.left + (marginLeft(l.page) + l.x - PAD_X) * m.scale,
    top: pg.top + (top0 + l.y - PAD_Y) * m.scale,
    width: (l.w + 2 * PAD_X) * m.scale,
    height: (hh + 2 * PAD_Y) * m.scale,
  };
}

/** Pointer position -> {page, x, y} in millimetres on that page's content area. */
function pointerToMM(clientX, clientY) {
  const m = metrics();
  const r = $('canvas').getBoundingClientRect();
  const cx = clientX - r.left;
  const cy = clientY - r.top;
  let idx = m.pages.length - 1;
  for (let i = 0; i < m.pages.length; i++) {
    const pg = m.pages[i];
    // spread view: a row holds two pages, so the pointer must also be left of the page's right edge
    const sideBySide = m.pages.some((q, j) => j !== i && Math.abs(q.top - pg.top) < 2);
    if (cy < pg.top + pg.height + 7 && (!sideBySide || cx < pg.left + pg.width + 12)) { idx = i; break; }
  }
  const pg = m.pages[Math.max(0, idx)];
  if (!pg) return { page: 0, x: 0, y: 0 };
  return {
    page: Math.max(0, idx),
    x: (cx - pg.left) / m.scale - marginLeft(Math.max(0, idx)),
    y: (cy - pg.top) / m.scale - MARGIN_TOP - (idx === 0 ? info.headerH : 0),
  };
}

const PRINT_MARGIN = 5; // mm most printers cannot print on

function renderGuides(m) {
  const g = $('guides');
  g.replaceChildren();
  if (doc.printMargin) {
    for (const pg of m.pages) {
      const band = h('div', { class: 'printband' });
      band.style.cssText = `left:${pg.left}px;top:${pg.top}px;width:${pg.width}px;height:${pg.height}px;border-width:${PRINT_MARGIN * m.scale}px;`;
      g.append(band);
    }
  }
  if (!isFree()) return;
  if (m.pages.length > 1) m.pages.forEach((pg, i) => g.append(pageTools(pg, i, m.pages.length)));
  if (!$('show-grid').checked) return;
  const geo = gridGeometry(cols());
  m.pages.forEach((pg, i) => {
    const topMM = MARGIN_TOP + (i === 0 ? info.headerH : 0);
    const box = h('div', { class: 'gpage' + (VGRID ? '' : ' novgrid') });
    box.style.cssText = `left:${pg.left + marginLeft(i) * m.scale}px;top:${pg.top + topMM * m.scale}px;` +
      `width:${BODY_W * m.scale}px;height:${contentHeight(i, info.headerH) * m.scale}px;` +
      `background-size:100% ${ROW * m.scale}px;`;
    for (let c = 0; c < geo.cols; c++) {
      const col = h('div', { class: 'gcol' + (geo.cols === 3 ? ' strong' : '') });
      col.style.left = `${(c * geo.pitch / BODY_W) * 100}%`;
      col.style.width = `${(geo.colW / BODY_W) * 100}%`;
      box.append(col);
    }
    if (geo.cols > 3 && geo.cols % 3 === 0) {
      const third = gridGeometry(3);
      for (let t = 0; t < 3; t++) {
        const el = h('div', { class: 'gthird' });
        el.style.left = `${(t * third.pitch / BODY_W) * 100}%`;
        el.style.width = `${(third.colW / BODY_W) * 100}%`;
        box.append(el);
      }
    }
    g.append(box);

  });
}

/** Up / down buttons beside a page (free layout with several pages). */
function pageTools(pg, i, count) {
  const btn = (icon, title, to, off) => {
    const t = h('button', { class: 'iconbtn', title, 'aria-label': title, disabled: off, onclick: () => shiftPage(i, to) });
    t.append(svgIcon(icon));
    return t;
  };
  const box = h('div', { class: 'pagetools' },
    h('span', { class: 'pagenum' }, String(i + 1)),
    btn('up', `Seite ${i + 1} nach oben`, i - 1, i === 0),
    btn('down', `Seite ${i + 1} nach unten`, i + 1, i === count - 1));
  box.style.cssText = `left:${pg.left + pg.width - 6}px;top:${pg.top + 6}px;`;
  return box;
}

function shiftPage(from, to) {
  movePage(doc.blocks, from, to);
  renderBlocks(); renderOverlay(); changed(0);
}

function chipLabel(b, nums) {
  const n = nums.get(b.id);
  const l = layoutOf(b);
  const hh = info.heights[b.id];
  const size = isFree() && (b.id === selectedId || drag?.id === b.id)
    ? ` · ${Math.round(l.w)}×${Math.round(hh ?? 0)} mm` : '';
  return `${n ? '#' + n + ' ' : ''}${TYPES[b.type]?.label || b.type}${size}`;
}

/** Clickable frame over the title header on page 1. */
function renderHeaderRect(m) {
  const layer = $('rects');
  let el = layer.querySelector('.hdrbox');
  if (!el) {
    el = h('div', { class: 'hdrbox', title: 'Kopfbereich – klicken zum Bearbeiten' }, h('span', { class: 'chip' }, 'Kopfbereich'));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', () => selectHeader());
    el.addEventListener('dblclick', () => selectHeader(true));
    layer.append(el);
  }
  const pg = m.pages[0];
  let box = null;
  if (pg && isFree() && info.headerH > 0) box = { top: MARGIN_TOP, h: info.headerH - HEADER_GAP };
  const f = info.flow?.__header;
  if (pg && !isFree() && f?.y0 !== undefined && f.y1 !== undefined) box = { top: f.y0, h: f.y1 - f.y0 };
  el.hidden = !box;
  if (!box) return;
  Object.assign(el.style, {
    left: pg.left + (marginLeft(0) - PAD_X) * m.scale + 'px', top: pg.top + (box.top - PAD_Y) * m.scale + 'px',
    width: (BODY_W + 2 * PAD_X) * m.scale + 'px', height: (box.h + 2 * PAD_Y) * m.scale + 'px',
  });
  el.classList.toggle('sel', headerSelected);
}

function renderOverlay() {
  const layer = $('rects');
  const m = metrics();
  renderGuides(m);
  const nums = exNumbers();
  const alive = new Set(doc.blocks.map((b) => b.id));
  for (const [id, el] of rects) if (!alive.has(id)) { el.remove(); rects.delete(id); }

  renderHeaderRect(m);

  const mm = []; // for overlap/overflow checks
  for (const b of doc.blocks) {
    let el = rects.get(b.id);
    if (!el) {
      el = makeRect(b);
      rects.set(b.id, el);
      layer.append(el);
    }
    const box = boxOf(b, m);
    el.hidden = !box;
    if (!box) continue;
    Object.assign(el.style, {
      left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px',
    });
    el.classList.toggle('sel', selection.has(b.id));
    el.classList.toggle('grouped', !!b.group);
    el.firstChild.textContent = chipLabel(b, nums);
    syncLockTool(el, b);
    if (!isFree()) continue;
    const l = layoutOf(b);
    mm.push({ el, ...l, h: info.heights[b.id] ?? 20 });
  }
  // the boxes follow the stacking order, so the front-most block also gets the clicks
  let prev = null;
  for (const b of doc.blocks) {
    const el = rects.get(b.id);
    if (prev && (prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)) {
      for (const x of doc.blocks) layer.append(rects.get(x.id));
      break;
    }
    prev = el;
  }

  // flag overlapping blocks and blocks that run off the page (unless "Warnungen" is off)
  const warn = $('show-warnings').checked;
  for (const a of mm) {
    let overlap = false;
    for (const c of mm) {
      if (!warn || a === c || a.page !== c.page) continue;
      if (a.x < c.x + c.w - 0.5 && c.x < a.x + a.w - 0.5 && a.y < c.y + c.h - 0.5 && c.y < a.y + a.h - 0.5) overlap = true;
    }
    a.el.classList.toggle('overlap', overlap);
    a.el.classList.toggle('overflow', warn && a.y + a.h > contentHeight(a.page, info.headerH) + 0.5);
  }
  document.body.classList.toggle('multisel', selection.size > 1);
  renderSelectionBox();
}

function makeRect(b) {
  const tool = (icon, title, fn, cls = '') => {
    const t = h('button', { class: cls, title, 'aria-label': title, onclick: (e) => { e.stopPropagation(); if (selectedId !== b.id) setSelection([b.id]); fn(e.currentTarget); } });
    t.addEventListener('pointerdown', (e) => e.stopPropagation());
    t.append(svgIcon(icon));
    return t;
  };
  const el = h('div', { class: 'blk', 'data-id': b.id },
    h('span', { class: 'chip' }),
    h('span', { class: 'hnd w', 'data-handle': 'w' }),
    h('span', { class: 'hnd e', 'data-handle': 'e' }),
    h('span', { class: 'hnd s', 'data-handle': 's', title: 'Höhe ziehen' }),
    // quick menu of the selected block
    h('span', { class: 'btools', role: 'toolbar', 'aria-label': 'Baustein' },
      tool('pencil', 'Baustein bearbeiten', () => editBlock(b.id)),
      tool('license', 'Lizenzinformationen anzeigen', () => licenseDialog(b.id)),
      tool('alignLeft', 'Ausrichten (auf der Seite)', (btn) => openAlignMenu(btn), 'aligntool'),
      tool('copy', 'Duplizieren', () => duplicate(b.id)),
      tool('clipboard', 'Kopieren', () => copyBlock(b.id)),
      tool('lock', 'Sperren', () => toggleLock(b.id), 'locktool'),
      tool('trash', 'Löschen', () => remove(b.id), 'danger deltool')));
  el.addEventListener('pointerdown', (e) => startDrag(e, b.id, el));
  el.addEventListener('dblclick', () => editBlock(b.id)); // also a single member of a group
  el.addEventListener('pointermove', onDragMove);
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  return el;
}

/** Lock button and frame follow the block's locked state. */
function syncLockTool(el, b) {
  const locked = !!b.locked;
  el.classList.toggle('locked', locked);
  if (el.dataset.locked === String(locked)) return;
  el.dataset.locked = String(locked);
  const t = el.querySelector('.locktool');
  t.replaceChildren(svgIcon(locked ? 'unlock' : 'lock'));
  t.title = locked ? 'Entsperren' : 'Sperren';
  t.setAttribute('aria-label', t.title);
  const del = el.querySelector('.deltool');
  del.disabled = locked;
  del.title = locked ? 'Gesperrt – kann nicht gelöscht werden' : 'Löschen';
}

// ---- dragging, resizing ----------------------------------------------------

let drag = null;
let overCanvas = false;

const clampNum = (v, lo, hi, def) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) && v !== '' ? Number(v) : def));

/** Blocks that fill a taller frame with more of their content: which setting grows,
 *  by how many mm per step (mirrors the Typst renderers), and its limits. */
function fillRule(b) {
  switch (b.type) {
    case 'lines': {
      const step = b.lineStyle === 'school' ? 4 * clampNum(b.spacing, 2.5, 8, 4) : clampNum(b.spacing, 5, 20, 9);
      return { key: 'count', step, min: 1, max: 40, def: 5 };
    }
    case 'squares':
      return { key: 'rows', step: clampNum(b.size, 3, 12, 5), min: 1, max: 60, def: 8 };
    default:
      return null;
  }
}

/** Bottom handle: lines/squares/answer lines get more or fewer rows; other blocks
 *  get a minimum height (only while it is taller than their content). */
function resizeHeight(b, p, alt) {
  const s = drag.start;
  const room = contentHeight(s.page, info.headerH) - s.y;
  const want = Math.min(room, Math.max(ROW, p.page > s.page ? room : p.y - s.y));
  const next = { ...s };
  delete next.h;
  const r = drag.fill;
  if (r) {
    const n = clampNum(Math.round(drag.n0 + (want - drag.h0) / r.step), r.min, r.max, r.def);
    if (b[r.key] !== n) b[r.key] = n;
    drag.previewH = drag.h0 + (n - drag.n0) * r.step;
    if (s.h) next.h = s.h;
    return next;
  }
  const hh = Math.max(ROW, alt ? round05(want) : Math.round(want / ROW) * ROW);
  if (hh > drag.nat + 0.25) next.h = hh;
  drag.previewH = Math.max(hh, drag.nat);
  return next;
}

function setSnapState(alt, active) {
  const s = $('snapstate');
  s.classList.toggle('snap', active && !alt);
  s.classList.toggle('free', active && alt);
  s.textContent = !active
    ? 'Rastet am Raster ein · Alt halten für freie Platzierung'
    : alt ? 'Freie Platzierung (Alt gedrückt)' : `Rastet am ${cols()}-Spalten-Raster ein · Alt halten für freie Platzierung`;
}

function startDrag(e, id, el) {
  if (e.button !== 0) return;
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return;
  e.preventDefault();
  if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelect(id); return; }
  // pressing on a block of a multi-selection (or group) moves the whole selection
  const multi = selection.size > 1 && selection.has(id) && !e.target.dataset.handle;
  if (!multi) select(id, { from: 'canvas' });
  if (!isFree()) return; // flow: blocks are selected on the page, ordered in the inspector
  let members = null;
  if (multi || selection.size > 1) {
    const list = selectedBlocks();
    if (list.some((x) => x.locked)) { toast('Die Auswahl enthält gesperrte Bausteine und lässt sich nicht verschieben.'); return; }
    members = list.map((x) => ({ b: x, start: layoutOf(x) }));
  } else if (b.locked) return; // locked: no moving
  el.setPointerCapture(e.pointerId);
  const p = pointerToMM(e.clientX, e.clientY);
  const l = layoutOf(b);
  drag = {
    id, el, kind: e.target.dataset.handle && !members ? 'resize-' + e.target.dataset.handle : 'move',
    start: l, grab: { dx: p.x - l.x, dy: p.y - l.y }, ptr: { x: e.clientX, y: e.clientY }, members,
  };
  if (drag.kind === 'resize-s') {
    // content height without a minimum height, and (for lines, squares, …) the count it was drawn with
    drag.h0 = info.heights[id] ?? 20;
    drag.nat = l.h ? info.natural?.[id] ?? 0 : drag.h0;
    drag.fill = fillRule(b);
    if (drag.fill) drag.n0 = clampNum(b[drag.fill.key], drag.fill.min, drag.fill.max, drag.fill.def);
  }
  if (members) {
    // the group as a whole must stay on the page
    drag.minX = Math.min(...members.map((m) => m.start.x));
    drag.maxR = Math.max(...members.map((m) => m.start.x + m.start.w));
    drag.minY = Math.min(...members.filter((m) => m.start.page === l.page).map((m) => m.start.y));
  }
  el.classList.add('moving');
  setSnapState(e.altKey, true);
}

function onDragMove(e) {
  if (!drag || drag.el !== e.currentTarget) return;
  drag.ptr = { x: e.clientX, y: e.clientY };
  applyDrag(e.altKey);
}

/** Recompute the dragged block's layout from the last pointer position. */
function applyDrag(alt) {
  const b = doc.blocks.find((x) => x.id === drag.id);
  if (!b) return;
  const p = pointerToMM(drag.ptr.x, drag.ptr.y);
  const s = drag.start;
  const c = cols();
  let next;

  if (drag.kind === 'move') {
    const pos = snapPosition(p.x - drag.grab.dx, p.y - drag.grab.dy, s.w, c, alt);
    const maxY = Math.max(0, contentHeight(p.page, info.headerH) - ROW);
    next = { ...s, page: p.page, x: pos.x, y: Math.min(pos.y, maxY) };
  } else if (drag.kind === 'resize-e') {
    next = { ...s, w: snapWidth(p.x - s.x, s.x, c, alt) };
  } else if (drag.kind === 'resize-s') {
    next = resizeHeight(b, p, alt);
  } else {
    const right = s.x + s.w;
    const x = snapPosition(p.x, 0, MIN_W, c, alt).x;
    const left = Math.min(x, right - (alt ? MIN_W : gridGeometry(c).colW));
    next = { ...s, x: left, w: snapWidth(right - left, left, c, alt) };
  }
  if (drag.members) {
    const dx = Math.min(Math.max(next.x - s.x, -drag.minX), BODY_W - drag.maxR);
    const dp = next.page - s.page;
    const dy = Math.max(next.y - s.y, dp === 0 ? -drag.minY : -Infinity);
    for (const m of drag.members) {
      const o = m.start;
      const page = Math.max(0, o.page + dp);
      m.b.layout = { ...o, page, x: round05(o.x + dx), y: round05(Math.max(0, o.y + dy)) };
      doc.pageCount = Math.max(doc.pageCount, page + 1);
    }
  } else {
    b.layout = next;
    doc.pageCount = Math.max(doc.pageCount, next.page + 1);
  }

  drag.el.classList.toggle('freemove', alt);
  setSnapState(alt, true);
  renderOverlay();
  updateChipsText();
  changed(40); // live re-render while dragging
}

function endDrag(e) {
  if (!drag || drag.el !== e.currentTarget) return;
  drag.el.classList.remove('moving', 'freemove');
  try { drag.el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  const refill = drag.fill;
  // keep the new height until Typst reports the real one
  if (drag.previewH !== undefined) info.heights[drag.id] = drag.previewH;
  drag = null;
  setSnapState(false, false);
  if (refill) renderInspector(); // the count fields changed with the height
  renderBlocks();   // list order and numbering follow the new positions
  renderOverlay();
  save(); schedule(0);
}

function updateChipsText() {
  chips.forEach((chip, id) => {
    const b = doc.blocks.find((x) => x.id === id);
    if (b) chip.textContent = layoutText(b);
  });
}

let marquee = null;

function onMarqueeMove(e) {
  const m = marquee;
  if (!m) return;
  const r = $('canvas').getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (!m.moved && Math.hypot(x - m.x0, y - m.y0) < 4) return;
  if (!m.moved) {
    m.moved = true;
    m.el = h('div', { class: 'marquee' });
    $('rects').append(m.el);
  }
  const box = { l: Math.min(x, m.x0), t: Math.min(y, m.y0), r: Math.max(x, m.x0), b: Math.max(y, m.y0) };
  Object.assign(m.el.style, { left: box.l + 'px', top: box.t + 'px', width: box.r - box.l + 'px', height: box.b - box.t + 'px' });
  // every block the frame touches (with its group)
  const hits = [];
  rects.forEach((el, id) => {
    if (el.hidden) return;
    const l = parseFloat(el.style.left); const t = parseFloat(el.style.top);
    if (l < box.r && l + parseFloat(el.style.width) > box.l && t < box.b && t + parseFloat(el.style.height) > box.t) hits.push(id);
  });
  setSelection(new Set([...m.base, ...withGroups(hits)]));
  autoScrollStage(e.clientY);
}

function endMarquee() {
  window.removeEventListener('pointermove', onMarqueeMove);
  const m = marquee;
  marquee = null;
  m?.el?.remove();
  if (m && !m.moved && !m.add) select(null);
}

function setupCanvas() {
  const canvas = $('canvas');
  canvas.addEventListener('pointerenter', () => { overCanvas = true; });
  canvas.addEventListener('pointerleave', () => { overCanvas = false; });
  // drag on empty page space: selection frame; a plain click clears the selection
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.blk, .selbox, .hdrbox')) return;
    const r = canvas.getBoundingClientRect();
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    marquee = { x0: e.clientX - r.left, y0: e.clientY - r.top, base: add ? new Set(selection) : new Set(), add, moved: false, el: null };
    e.preventDefault();
    window.addEventListener('pointermove', onMarqueeMove);
    window.addEventListener('pointerup', endMarquee, { once: true });
  });

  // Alt toggles snapping live, also mid-drag. Stop the browser menu from grabbing it.
  const onAlt = (down) => (e) => {
    if (e.key === 'Escape' && paletteDrag?.active) { cancelPaletteDrag(); return; }
    if (e.key !== 'Alt') return;
    if (drag || overCanvas || paletteDrag?.active) e.preventDefault();
    if (drag) applyDrag(down);
    if (paletteDrag?.active) { paletteDrag.alt = down; updatePaletteDrag(); }
  };
  window.addEventListener('keydown', onAlt(true), true);
  window.addEventListener('keyup', onAlt(false), true);

  // arrow keys nudge the selected block: one grid step, Shift = 0.5 mm
  window.addEventListener('keydown', (e) => {
    if (!isFree() || !selection.size || drag || document.body.dataset.view !== 'editor') return;
    if (!e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const list = selectedBlocks();
    if (list.some((b) => b.locked)) return;
    e.preventDefault();
    const stepX = e.shiftKey ? 0.5 : gridGeometry(cols()).pitch;
    const stepY = e.shiftKey ? 0.5 : ROW;
    const dx = e.key === 'ArrowLeft' ? -stepX : e.key === 'ArrowRight' ? stepX : 0;
    const dy = e.key === 'ArrowUp' ? -stepY : e.key === 'ArrowDown' ? stepY : 0;
    if (list.length === 1) {
      const l = layoutOf(list[0]);
      const pos = snapPosition(l.x + dx, l.y + dy, l.w, cols(), e.shiftKey);
      list[0].layout = { ...l, x: pos.x, y: pos.y };
    } else {
      // several: move by the step, keeping the arrangement on the page
      const ls = list.map((b) => layoutOf(b));
      const mx = Math.min(Math.max(dx, -Math.min(...ls.map((l) => l.x))), BODY_W - Math.max(...ls.map((l) => l.x + l.w)));
      const my = Math.max(dy, -Math.min(...ls.map((l) => l.y)));
      list.forEach((b, i) => { b.layout = { ...ls[i], x: round05(ls[i].x + mx), y: round05(ls[i].y + my) }; });
    }
    renderOverlay(); updateChipsText(); changed(40);
  });

  new ResizeObserver(() => renderOverlay()).observe($('pages'));
  new ResizeObserver(() => reserveSidebars()).observe($('stage'));
}

export {
  PAD_X, PAD_Y, PRINT_MARGIN, applyDrag, boxOf, chipLabel, clampNum, drag, endDrag, endMarquee, fillRule,
  makeRect, marquee, metrics, onDragMove, onMarqueeMove, overCanvas, pageTools, pointerToMM, rects, renderGuides,
  renderHeaderRect, renderOverlay, resizeHeight, setSnapState, setupCanvas, shiftPage, startDrag, syncLockTool,
  updateChipsText,
};
