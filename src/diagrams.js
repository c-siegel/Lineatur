// Diagram exercises: a cycle ("Kreislauf": boxes on an ellipse joined by arc
// arrows) and a chain ("Reihenfolge": boxes joined by straight arrows).
// Items written as [[text]] are empty boxes on the student sheet and filled on
// the solution sheet; an optional word bank lists them shuffled.
//
// Drawn with Typst's own place/curve. fletcher (MIT, on top of cetz) would also
// do it, but costs ~65 ms per diagram on every preview and needs a package
// download, which the offline desktop app cannot rely on.

import { S, inline, mm, clamp, lines, shuffled, customColor, lighten } from './typst-util.js';

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

function boxMarkup(it, x, y, bw, bh, c, sol, size = 8.5) {
  const label = !it.blank
    ? `text(size: ${size}pt, ${S(it.text)})`
    : sol ? `text(size: ${size}pt, fill: ok.darken(25%), weight: "bold", ${S(it.text)})` : 'none';
  return `place(dx: ${mm(x)}, dy: ${mm(y)}, box(width: ${mm(bw)}, height: ${mm(bh)}, fill: rgb("${c.box}"), radius: 2.5mm, inset: 3pt, align(center + horizon, ${label})))`;
}

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
    `#box(stroke: 0.7pt + rgb("${c.arrow}"), inset: (x: 5pt, y: 3pt), baseline: 3pt, text(size: 8.5pt, ${S(w)}))`).join(' #h(4pt) ')}\n#v(4pt)\n`;
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
  let bw = clamp(w * (n > 5 ? 0.27 : 0.3), 18, 42);
  let bh = bhOf(bw);
  let rx = Math.max(10, (w - bw) / 2 - 1);
  // at most ~10 cm high, so the diagram still fits on an A5 page
  let ry = clamp(rx * 0.72, bh + 4, 40);
  // grow the ellipse, then shrink the boxes, until neighbours leave room for an arrow
  const crowded = () => {
    const c = items.map((_, i) => [rx * Math.cos(ang(i)), ry * Math.sin(ang(i))]);
    return c.some((p, i) => c.some((q, j) => j > i && Math.abs(p[0] - q[0]) < bw + 7 && Math.abs(p[1] - q[1]) < bh + 7));
  };
  for (let k = 0; k < 80 && crowded(); k++) {
    if (ry < 40) ry = Math.min(40, ry + 3);
    else if (bw > 17) {
      bw *= 0.95;
      if (bw < 26) size = 7.5;
      bh = bhOf(bw);
      rx = Math.max(10, (w - bw) / 2 - 1);
    } else break;
  }
  const W = w;
  const H = 2 * ry + bh + 2;
  const cx = W / 2;
  const cy = H / 2;
  const at = (a) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  const centers = items.map((_, i) => at(ang(i)));
  const inside = ([x, y], i, pad = 2) => Math.abs(x - centers[i][0]) < bw / 2 + pad && Math.abs(y - centers[i][1]) < bh / 2 + pad;

  const parts = [];
  const step = dir * 0.01;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let a0 = ang(i);
    let a1 = ang(i) + (dir * 2 * Math.PI) / n;
    while (inside(at(a0), i) && Math.abs(a0 - ang(i)) < Math.PI) a0 += step;
    while (inside(at(a1), j) && Math.abs(a1 - ang(i)) > 0.02) a1 -= step;
    if (dir * (a1 - a0) < 0.08) continue; // boxes touch: no room for an arrow
    const head = 4.5;
    const pts = [];
    const segs = 24;
    for (let k = 0; k <= segs; k++) pts.push(at(a0 + ((a1 - a0) * k) / segs));
    // shorten the arc by the head length
    const tip = pts[pts.length - 1];
    while (pts.length > 2 && Math.hypot(pts[pts.length - 1][0] - tip[0], pts[pts.length - 1][1] - tip[1]) < head * 0.8) pts.pop();
    const last = pts[pts.length - 1];
    const len = Math.hypot(tip[0] - last[0], tip[1] - last[1]) || 1;
    parts.push(`place(curve(stroke: (paint: rgb("${c.arrow}"), thickness: 2.2mm, join: "round"), curve.move((${mm(pts[0][0])}, ${mm(pts[0][1])}))${pts.slice(1).map(([x, y]) => `, curve.line((${mm(x)}, ${mm(y)}))`).join('')}))`);
    parts.push(arrowHead(tip[0], tip[1], (tip[0] - last[0]) / len, (tip[1] - last[1]) / len, head + 1, 5.5, c.arrow));
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
  const parts = [];
  let W;
  let H;
  if (b.direction === 'column') {
    const bw = Math.min(w, 60);
    const bh = 12;
    const gap = 8;
    W = bw;
    H = n * bh + (n - 1) * gap;
    items.forEach((it, i) => {
      const y = i * (bh + gap);
      parts.push(boxMarkup(it, 0, y, bw, bh, c, sol));
      if (i < n - 1) {
        parts.push(`place(line(start: (${mm(bw / 2)}, ${mm(y + bh + 1)}), end: (${mm(bw / 2)}, ${mm(y + bh + gap - 4)}), stroke: 1.4mm + rgb("${c.arrow}")))`);
        parts.push(arrowHead(bw / 2, y + bh + gap - 1, 0, 1, 3.5, 4.5, c.arrow));
      }
    });
  } else {
    const gap = 8;
    const bw = Math.min(42, (w - (n - 1) * gap) / n);
    const bh = clamp(bw * 0.6, 11, 16);
    W = n * bw + (n - 1) * gap;
    H = bh;
    items.forEach((it, i) => {
      const x = i * (bw + gap);
      parts.push(boxMarkup(it, x, 0, bw, bh, c, sol));
      if (i < n - 1) {
        parts.push(`place(line(start: (${mm(x + bw + 1)}, ${mm(bh / 2)}), end: (${mm(x + bw + gap - 4)}, ${mm(bh / 2)}), stroke: 1.4mm + rgb("${c.arrow}")))`);
        parts.push(arrowHead(x + bw + gap - 1, bh / 2, 1, 0, 3.5, 4.5, c.arrow));
      }
    });
  }
  return `${intro(b)}${wordBank(items, b, c, T)}#align(center, box(width: ${mm(W)}, height: ${mm(H)}, {
  ${parts.join('\n  ')}
}))`;
}
