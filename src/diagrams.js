// Diagram exercises: a cycle ("Kreislauf": boxes on an ellipse joined by arc
// arrows) and a chain ("Reihenfolge": boxes joined by straight arrows).
// Items written as [[text]] are empty boxes on the student sheet and filled on
// the solution sheet; an optional word bank lists them shuffled.
//
// Drawn with Typst's own place/curve. fletcher (MIT, on top of cetz) would also
// do it, but costs ~65 ms per diagram on every preview and needs a package
// download, which the offline desktop app cannot rely on.

import { S, inline, mm, num, clamp, lines, shuffled, customColor, lighten } from './typst-util.js';

export const DIAGRAM_COLORS = {
  lilac: { box: '#d4b6e3', arrow: '#9654b1' },
  orange: { box: '#f7b989', arrow: '#e8783c' },
  blue: { box: '#bcd2f3', arrow: '#4f7fd0' },
  teal: { box: '#b5e3e0', arrow: '#3a9e98' },
  rose: { box: '#f5c4c9', arrow: '#cf5b68' },
  gray: { box: '#e1e3e8', arrow: '#6b7280' },
};

/** Box and arrow colours: a palette name, or a custom "#rrggbb" for the arrows with lighter boxes. */
const colorsOf = (v, def) => {
  const hex = customColor(v);
  return hex ? { box: lighten(hex, 0.6), arrow: hex } : DIAGRAM_COLORS[v] || DIAGRAM_COLORS[def];
};

/** Items of a diagram: { text, blank }. */
export const diagramItems = (t) => lines(t).map((s) => {
  const m = /^\[\[(.*)\]\]$/.exec(s);
  return m ? { text: m[1], blank: true } : { text: s, blank: false };
});

/** One box; `width` is a Typst length ("30mm", "100%"). */
function boxShape(it, width, bh, c, sol, size = 8.5) {
  const label = !it.blank
    ? `text(size: ${size}pt)[${inline(it.text)}]`
    : sol ? `text(size: ${size}pt, fill: ok.darken(25%), weight: "bold")[${inline(it.text)}]` : 'none';
  return `box(width: ${width}, height: ${mm(bh)}, fill: rgb("${c.box}"), radius: 2.5mm, inset: 3pt, align(center + horizon, ${label}))`;
}

const boxMarkup = (it, x, y, bw, bh, c, sol, size) =>
  `place(dx: ${mm(x)}, dy: ${mm(y)}, ${boxShape(it, mm(bw), bh, c, sol, size)})`;

/** Filled triangle with its tip at (tx, ty) pointing along (ux, uy). */
function arrowHead(tx, ty, ux, uy, len, width, color) {
  const bx = tx - ux * len;
  const by = ty - uy * len;
  const px = -uy * width / 2;
  const py = ux * width / 2;
  return `place(curve(fill: rgb("${color}"), stroke: none, curve.move((${mm(tx)}, ${mm(ty)})), curve.line((${mm(bx + px)}, ${mm(by + py)})), curve.line((${mm(bx - px)}, ${mm(by - py)})), curve.close()))`;
}

function wordBank(items, b, c, T) {
  const blanks = items.filter((it) => it.blank).map((it) => it.text);
  if (!b.wordbank || !blanks.length) return '';
  const words = shuffled(blanks, parseInt(b.seed) || 1);
  return `#text(size: 8.5pt, weight: "bold", ${S(T.blocks + ':')}) #h(4pt) ${words.map((w) =>
    `#box(stroke: 0.7pt + rgb("${c.arrow}"), inset: (x: 5pt, y: 3pt), baseline: 3pt, text(size: 8.5pt)[${inline(w)}])`).join(' #h(4pt) ')}\n#v(4pt)\n`;
}

const intro = (b) => (String(b.text || '').trim() ? `${inline(b.text)}\n\n` : '');

export function cycleBody(b, { sol, T }, w) {
  const items = diagramItems(b.items);
  const c = colorsOf(b.color, 'lilac');
  if (items.length < 2) return `${intro(b)}#text(size: 9pt, fill: luma(140), style: "italic", ${S(T.fewItems)})`;
  const n = items.length;
  const dir = b.direction === 'ccw' ? -1 : 1;
  const ang = (i) => -Math.PI / 2 + dir * (2 * Math.PI * i) / n;
  // box height from the longest text (8.5pt is about 1.6 mm per character); smaller text in small boxes
  let size = 8.5;
  const bhOf = (bw) => clamp(Math.max(...items.map((it) => Math.ceil(it.text.length / Math.max(6, (bw - 3) / (size * 0.19))))) * size * 0.43 + 4, 10, 26);
  // narrowest box that still fits the longest word; never wider than 17 mm, as before
  const longestWord = Math.max(...items.map((it) => Math.max(...it.text.split(/\s+/).map((s) => s.length))));
  const minBw = () => clamp(longestWord * size * 0.17 + 3, 12, 17);
  let bw = clamp(w * (n > 5 ? 0.27 : 0.3), 18, 42);
  let bh = bhOf(bw);
  let rx = Math.max(10, (w - bw) / 2 - 1);
  // at most ~10 cm high, so the diagram still fits on an A5 page
  let ry = clamp(rx * 0.72, bh + 4, 40);
  // Geometry relative to the ellipse centre. An arrow runs along the ellipse from
  // where it leaves box i to where it reaches box i+1, keeping `pad` from both.
  const at = (a) => [rx * Math.cos(a), ry * Math.sin(a)];
  const inside = ([x, y], i, pad = 2) => {
    const [px, py] = at(ang(i));
    return Math.abs(x - px) < bw / 2 + pad && Math.abs(y - py) < bh / 2 + pad;
  };
  const step = dir * 0.01;
  const arcLength = (a0, a1, segs = 24) => {
    let len = 0;
    for (let k = 1; k <= segs; k++) {
      const [x0, y0] = at(a0 + ((a1 - a0) * (k - 1)) / segs);
      const [x1, y1] = at(a0 + ((a1 - a0) * k) / segs);
      len += Math.hypot(x1 - x0, y1 - y0);
    }
    return len;
  };
  const gaps = () => items.map((_, i) => {
    const j = (i + 1) % n;
    let a0 = ang(i);
    let a1 = ang(i) + (dir * 2 * Math.PI) / n;
    while (inside(at(a0), i) && dir * (a1 - a0) > 0) a0 += step;
    while (inside(at(a1), j) && dir * (a1 - a0) > 0) a1 -= step;
    return { a0, a1, len: dir * (a1 - a0) > 0 ? arcLength(a0, a1) : 0 };
  });
  // full-size head plus a visible piece of shaft
  const HEAD = 5.5;
  const MIN_ARC = HEAD + 3.5;
  // grow the ellipse, then shrink the boxes, then the text, until every arrow has room
  for (let k = 0; k < 120 && gaps().some((g) => g.len < MIN_ARC); k++) {
    if (ry < 40) ry = Math.min(40, ry + 3);
    else if (bw > minBw()) {
      bw = Math.max(minBw(), bw * 0.95);
      if (bw < 26) size = Math.min(size, 7.5);
      bh = bhOf(bw);
      rx = Math.max(10, (w - bw) / 2 - 1);
    } else if (size > 6.5) {
      size = 6.5;
      bh = bhOf(bw);
    } else break;
  }
  const W = w;
  const H = 2 * ry + bh + 2;
  const shift = ([x, y]) => [W / 2 + x, H / 2 + y];
  const centers = items.map((_, i) => shift(at(ang(i))));

  const parts = [];
  for (const { a0, a1, len: arc } of gaps()) {
    if (arc < 4) continue; // boxes (almost) touch: no room for a recognisable arrow
    // if the layout could not make room, draw a smaller arrow rather than one sticking out backwards
    const f = Math.min(1, arc / MIN_ARC);
    const head = HEAD * f;
    const pts = [];
    const segs = 24;
    for (let k = 0; k <= segs; k++) pts.push(shift(at(a0 + ((a1 - a0) * k) / segs)));
    // end the shaft inside the head
    const tip = pts[pts.length - 1];
    while (pts.length > 2 && Math.hypot(pts[pts.length - 1][0] - tip[0], pts[pts.length - 1][1] - tip[1]) < head * 0.65) pts.pop();
    const last = pts[pts.length - 1];
    const len = Math.hypot(tip[0] - last[0], tip[1] - last[1]) || 1;
    parts.push(`place(curve(stroke: (paint: rgb("${c.arrow}"), thickness: ${mm(2.2 * Math.max(f, 0.6))}, join: "round"), curve.move((${mm(pts[0][0])}, ${mm(pts[0][1])}))${pts.slice(1).map(([x, y]) => `, curve.line((${mm(x)}, ${mm(y)}))`).join('')}))`);
    parts.push(arrowHead(tip[0], tip[1], (tip[0] - last[0]) / len, (tip[1] - last[1]) / len, head, 5.5 * f, c.arrow));
  }
  items.forEach((it, i) => parts.push(boxMarkup(it, centers[i][0] - bw / 2, centers[i][1] - bh / 2, bw, bh, c, sol, size)));
  return `${intro(b)}${wordBank(items, b, c, T)}#align(center, box(width: ${mm(W)}, height: ${mm(H)}, {
  ${parts.join('\n  ')}
}))`;
}

export function chainBody(b, { sol, T }, w) {
  const items = diagramItems(b.items);
  const c = colorsOf(b.color, 'rose');
  if (items.length < 2) return `${intro(b)}#text(size: 9pt, fill: luma(140), style: "italic", ${S(T.fewItems)})`;
  const n = items.length;
  const gap = 8;
  // Box size in mm from the inspector; 0 or empty = automatic. Boxes that would fill the line
  // become fractions, so Typst gives them the line's real width: `w` is only an estimate (number
  // and points beside an exercise take less room than reserved), and fixed-width boxes left a
  // margin on both sides.
  const boxH = (auto) => (num(b.boxHeight) > 0 ? clamp(num(b.boxHeight), 6, 80) : auto);
  const wanted = (auto) => (num(b.boxWidth) > 0 ? Math.max(8, num(b.boxWidth)) : auto);
  const shaft = (x1, y1, x2, y2) => `place(line(start: (${mm(x1)}, ${mm(y1)}), end: (${mm(x2)}, ${mm(y2)}), stroke: 1.4mm + rgb("${c.arrow}")))`;
  let body;
  if (b.direction === 'column') {
    const fill = wanted(60) >= w;
    const bw = fill ? w : wanted(60);
    const bh = boxH(12);
    const arrow = `box(width: 4.5mm, height: ${mm(gap)}, { ${shaft(2.25, 1, 2.25, gap - 4)}; ${arrowHead(2.25, gap - 1, 0, 1, 3.5, 4.5, c.arrow)} })`;
    const parts = items.map((it) => boxShape(it, fill ? '100%' : mm(bw), bh, c, sol));
    body = `#align(center, block(width: ${fill ? '100%' : mm(bw)}, stack(dir: ttb, ${parts.join(`, align(center, ${arrow}), `)})))`;
  } else {
    const fit = (w - (n - 1) * gap) / n;
    const fill = wanted(42) >= fit;
    const bw = fill ? fit : wanted(42);
    const bh = boxH(clamp(bw * 0.6, 11, 16));
    const arrow = `box(width: ${mm(gap)}, height: ${mm(bh)}, { ${shaft(1, bh / 2, gap - 4, bh / 2)}; ${arrowHead(gap - 1, bh / 2, 1, 0, 3.5, 4.5, c.arrow)} })`;
    const col = fill ? '1fr' : mm(bw);
    const columns = items.flatMap((_, i) => (i ? [mm(gap), col] : [col]));
    const parts = items.map((it) => boxShape(it, '100%', bh, c, sol));
    body = `#align(center, grid(columns: (${columns.join(', ')}), ${parts.join(`, ${arrow}, `)}))`;
  }
  return `${intro(b)}${wordBank(items, b, c, T)}${body}`;
}
