// Page geometry and grid maths, shared by the browser editor and the server
// (the server imports this file too, so both always agree on the numbers).
//
// All block rectangles are stored in millimetres relative to the page body:
//   x: from the left margin, y: from the top of the content area
//   (on page 1 that is below the title header), w: width. Height is automatic;
//   an optional h is a minimum height (the block was dragged taller).

// Page formats. The geometry below is exported as live bindings: applyGeometry()
// switches them for the whole module (editor: when a page setting changes;
// server: once per render, which is synchronous).
export const FORMATS = {
  a4: { label: 'A4 Hochformat', w: 210, h: 297, mx: 18, mt: 16, mb: 20 },
  'a4-landscape': { label: 'A4 Querformat', w: 297, h: 210, mx: 16, mt: 14, mb: 16 },
  a5: { label: 'A5 Hochformat (Broschüre)', w: 148, h: 210, mx: 14, mt: 16, mb: 18 },
  '4:3': { label: 'Folie 4:3', w: 254, h: 190.5, mx: 14, mt: 12, mb: 14 },
  '16:9': { label: 'Folie 16:9', w: 254, h: 142.875, mx: 14, mt: 10, mb: 12 },
};

export let FORMAT = 'a4';
export let PAGE_W = 210;
export let PAGE_H = 297;
export let MARGIN_L = 18;      // left margin of a right-hand (odd) page
export let MARGIN_R = 18;
export let MARGIN_TOP = 16;
export let MARGIN_BOTTOM = 20;
export let MIRRORED = false;   // double-sided: margins swap on left-hand (even) pages
export let BODY_W = PAGE_W - MARGIN_L - MARGIN_R; // 174 on A4
export let BODY_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM; // 261 on A4
export let GUTTER = 3;         // mm between grid columns
export let ROW = 5;            // vertical snap step in mm (the "vertical grid")
export let VGRID = 5;          // the vertical grid as set by the user (0 = off)

export const defaultMargins = (format) => {
  const f = FORMATS[format] || FORMATS.a4;
  return { left: f.mx, right: f.mx, top: f.mt, bottom: f.mb };
};
export const DEFAULT_GRID = { cols: 3, gutter: 3, row: 5 };

/** Page format, margins, page sides and grid of a document. Returns the format name. */
export function applyGeometry(doc = {}) {
  FORMAT = FORMATS[doc.format] ? doc.format : 'a4';
  const f = FORMATS[FORMAT];
  const m = { ...defaultMargins(FORMAT), ...(doc.margins || {}) };
  const mm = (v, d) => Math.min(80, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : d));
  PAGE_W = f.w; PAGE_H = f.h;
  MARGIN_L = mm(m.left, f.mx); MARGIN_R = mm(m.right, f.mx);
  MARGIN_TOP = mm(m.top, f.mt); MARGIN_BOTTOM = mm(m.bottom, f.mb);
  MIRRORED = doc.pageSide === 'both';
  BODY_W = PAGE_W - MARGIN_L - MARGIN_R;
  BODY_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
  const g = { ...DEFAULT_GRID, ...(doc.grid || {}) };
  GUTTER = Math.min(20, Math.max(0, Number(g.gutter) || 0));
  VGRID = Math.min(50, Math.max(0, Number(g.row) || 0));
  ROW = VGRID || 0.5; // no vertical grid: half-millimetre steps
  return FORMAT;
}

/** Left margin of a page (0-based index): mirrored documents swap it on even pages. */
export const marginLeft = (page) => (MIRRORED && page % 2 === 1 ? MARGIN_R : MARGIN_L);

const roman = (n) => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');

/** Heading numbers in reading order: format '1' (1. / 1.1), 'I' (I. / I.1), 'A' (A. / A.1), '' = none.
 *  Headings with numbered === false are skipped. Returns Map block id -> "1.1". */
export function headingNumbers(blocks, format) {
  const out = new Map();
  if (!['1', 'I', 'A'].includes(format)) return out;
  let n1 = 0;
  let n2 = 0;
  const first = (n) => (format === 'I' ? roman(n) : format === 'A' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : String(n));
  for (const b of blocks) {
    if (b.type !== 'heading' || b.hidden || b.numbered === false) continue;
    if (parseInt(b.level) === 2) out.set(b.id, `${first(Math.max(1, n1))}.${++n2}`);
    else { n1++; n2 = 0; out.set(b.id, `${first(n1)}.`); }
  }
  return out;
}

/** Exercise number as shown: 1, 2, … / a), b), … / A), B), … / (1), (2), … */
export function exLabel(n, format) {
  if (format === '(') return `(${n})`;
  if (format === 'a' || format === 'A') {
    let s = '';
    for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
    return (format === 'A' ? s.toUpperCase() : s) + ')';
  }
  return String(n);
}

// Fonts (files in fonts/, all under open licences; the last two are built into Typst).
export const FONTS = [
  'Open Sans', 'OpenDyslexic', 'Source Sans 3', 'Maven Pro', 'Roboto', 'Comic Neue', 'Lora', 'Kalam',
  'Fraunces', 'Montserrat', 'Nunito', 'BioRhyme', 'Caveat', 'New Computer Modern', 'Libertinus Serif',
];
export const DEFAULT_FONT = 'Open Sans';

// Footer: entries (title, page number, ...) in three zones. On double-sided pages the
// zones mirror: "left" is the inner edge, "right" the outer one.
export const FOOTER_ZONES = ['left', 'center', 'right'];

/** Footer (or, with key 'header', header) entries with their zone. Without own entries the
 *  footer has the title left and the page number right; the header is empty.
 *  Entries from before the zones: the first goes left, the last right, others to the middle. */
export function footerItems(doc, key = 'footer') {
  const f = doc[key] || {};
  const fallback = key === 'footer' ? [{ kind: 'title' }, { kind: 'page' }] : [];
  const items = f.preset === false && Array.isArray(f.items) ? f.items : fallback;
  return items.map((it, i) => ({
    ...it,
    zone: FOOTER_ZONES.includes(it.zone) ? it.zone : i === 0 ? 'left' : i === items.length - 1 ? 'right' : 'center',
  }));
}

export const MIN_W = 20;
export const HEADER_GAP = 4; // mm between the title header and the free canvas on page 1

// Blocks that always are exercises (numbered, with points).
export const EXERCISE_TYPES = new Set([
  'choice', 'cloze', 'wordsearch', 'crossword', 'sorting', 'matching', 'anagram', 'arithmetic',
  'cycle', 'chain',
]);

// Blocks that become an exercise with "Als Aufgabe" (b.task): number, points, difficulty and an
// optional instruction above the content (b.taskText; a text block is its own instruction).
export const TASKABLE_TYPES = new Set([
  'text', 'image', 'lines', 'squares', 'qr', 'table', 'tchart', 'infobox',
  'formula', 'function', 'valuetable', 'tree', 'code',
]);
export const isTask = (b) => b?.task === true && TASKABLE_TYPES.has(b.type);
/** Counts as an exercise: numbered (unless switched off), points in the total. */
export const isExercise = (b) => EXERCISE_TYPES.has(b?.type) || isTask(b);

/** Column geometry. 3, 6 and 12 columns all share the same outer edges, so the
 *  12-column grid is a strict refinement of the 3-column one. */
export function gridGeometry(cols) {
  const colW = (BODY_W - (cols - 1) * GUTTER) / cols;
  return { cols, colW, pitch: colW + GUTTER };
}

export const spanWidth = (cols, span) => {
  const g = gridGeometry(cols);
  return span * g.colW + (span - 1) * GUTTER;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round05 = (v) => Math.round(v * 2) / 2;

/** Number of columns a width covers on the given grid (at least 1). */
export function spanOf(w, cols) {
  const g = gridGeometry(cols);
  return clamp(Math.round((w + GUTTER) / g.pitch), 1, cols);
}

/** Snap a top-left corner. free=true (Alt held): only clamp to the page. */
export function snapPosition(x, y, w, cols, free) {
  if (free) {
    return { x: clamp(round05(x), 0, Math.max(0, BODY_W - w)), y: Math.max(0, round05(y)) };
  }
  const g = gridGeometry(cols);
  const span = spanOf(w, cols);
  const col = clamp(Math.round(x / g.pitch), 0, cols - span);
  return { x: col * g.pitch, y: Math.max(0, Math.round(y / ROW) * ROW) };
}

/** Snap a width for a block whose left edge is at x. */
export function snapWidth(w, x, cols, free) {
  if (free) return clamp(round05(w), MIN_W, BODY_W - x);
  const g = gridGeometry(cols);
  const startCol = Math.round(x / g.pitch);
  return spanWidth(cols, clamp(spanOf(w, cols), 1, cols - startCol));
}

/** Default width for a new block, in thirds of the page. */
const DEFAULT_THIRDS = {
  heading: 3, text: 3, choice: 1, cloze: 3, wordsearch: 2, crossword: 3, sorting: 2, matching: 3,
  anagram: 2, arithmetic: 3, image: 1, qr: 1, lines: 3, squares: 3, score: 1, formula: 2, code: 3, toc: 3,
  function: 2, valuetable: 3, tree: 2, assessment: 3,
  table: 3, tchart: 3, cycle: 3, chain: 3, infobox: 3, pagebreak: 3,
};
export const defaultWidth = (type) => spanWidth(3, DEFAULT_THIRDS[type] || 3);

export const layoutOf = (b) => {
  const h = Number(b.layout?.h) || 0;
  return {
    page: Math.max(0, parseInt(b.layout?.page) || 0),
    x: Number(b.layout?.x) || 0,
    y: Number(b.layout?.y) || 0,
    w: Number(b.layout?.w) || BODY_W,
    ...(h > 0 ? { h } : {}),
  };
};

/** Move page `from` to index `to` (0-based): renumbers the pages of all blocks. */
export function movePage(blocks, from, to) {
  for (const b of blocks) {
    const l = layoutOf(b);
    let p = l.page;
    if (p === from) p = to;
    else if (from < to && p > from && p <= to) p--;
    else if (from > to && p >= to && p < from) p++;
    if (p !== l.page) b.layout = { ...l, page: p };
  }
}

/** Reading order of a free layout: page, then row, then left to right.
 *  Exercise numbers follow this order, so they always match what you see. */
export function readingOrder(blocks) {
  return blocks
    .map((b, i) => ({ b, i, l: layoutOf(b) }))
    .sort((a, c) =>
      a.l.page - c.l.page ||
      Math.round(a.l.y / 5) - Math.round(c.l.y / 5) ||
      a.l.x - c.l.x ||
      a.i - c.i)
    .map((e) => e.b);
}

/** Usable content height of a page (page 1 loses the header). */
export const contentHeight = (page, headerH) => BODY_H - (page === 0 ? headerH || 0 : 0);

/** Stack blocks full-width, top to bottom, adding pages as needed
 *  (reserveLast = height to keep free at the bottom of the last page).
 *  Mutates block.layout; returns the resulting page count. */
export function stackBlocks(blocks, heights, headerH, gap = 4, reserveLast = 0) {
  let page = 0;
  let y = 0;
  for (const b of blocks) {
    const h = Math.max(5, heights?.[b.id] ?? 20);
    if (y > 0 && y + h > contentHeight(page, headerH)) {
      page++;
      y = 0;
    }
    const { h: minH } = layoutOf(b);
    b.layout = { page, x: 0, y: Math.round(y / ROW) * ROW, w: BODY_W, ...(minH ? { h: minH } : {}) };
    y = Math.round(y / ROW) * ROW + h + gap;
  }
  // keep the automatic assessment table (bottom of the last page) free of blocks
  if (reserveLast > 0 && y - gap > contentHeight(page, headerH) - reserveLast - 2) page++;
  return page + 1;
}

/** First free spot below everything on the last page (new blocks, duplicates). */
export function nextFreeSpot(blocks, heights, headerH, h = 20, gap = 4) {
  let page = 0;
  for (const b of blocks) page = Math.max(page, layoutOf(b).page);
  let bottom = 0;
  for (const b of blocks) {
    const l = layoutOf(b);
    if (l.page === page) bottom = Math.max(bottom, l.y + (heights?.[b.id] ?? 20));
  }
  let y = Math.ceil((bottom + gap) / ROW) * ROW;
  if (bottom === 0) y = 0;
  if (y + h > contentHeight(page, headerH)) {
    page++;
    y = 0;
  }
  return { page, y };
}
