// Table blocks: a general table with fill-in cells (measurement tables,
// overviews) and a comparison chart ("Gemeinsamkeiten | Unterschiede").
// Typst's built-in table does the layout; no package needed.

import { S, inline, int, num, clamp, lines, hexOf, isDark } from './typst-util.js';

// Cell colours of the table looks (soft, so handwriting stays readable).
export const TABLE_COLORS = {
  blue: '#dbe5f1', yellow: '#fdf0c2', green: '#e2f2e6', rose: '#f9e0e3', lilac: '#efe4f6', gray: '#ececec',
};

/** "a | b | c" lines -> rows of trimmed cells, padded to the same length. */
export function tableRows(text) {
  const rows = String(text ?? '').split(/\r?\n/).filter((r) => r.trim()).map((r) => r.split('|').map((c) => c.trim()));
  const n = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(n - r.length).fill('')]);
}

/** A cell "[[42]]" is a gap: empty on the student sheet, the answer on the solution sheet. */
export const cellAnswer = (c) => (/^\[\[(.*)\]\]$/.exec(c) || [])[1];

function cellMarkup(c, sol) {
  const ans = cellAnswer(c);
  if (ans === undefined) return `[${inline(c)}]`;
  return sol ? `text(fill: ok, weight: "bold", ${S(ans.split('|').join(' / '))})` : '[]';
}

export function tableBody(b, { sol }) {
  const rows = tableRows(b.rows);
  if (!rows.length) return '';
  const n = rows[0].length;
  const hex = hexOf(b.color, TABLE_COLORS, 'blue');
  const color = `rgb("${hex}")`;
  const head = b.header || 'row';
  const hRow = head === 'row' || head === 'both';
  const hCol = head === 'col' || head === 'both';
  const look = b.look || 'filled';
  const widths = String(b.widths || '').split(/[;,\s]+/).map(Number).filter((v) => v > 0);
  const columns = widths.length === n ? `(${widths.map((v) => `${v}fr`).join(', ')})` : `(${Array(n).fill('1fr').join(', ')})`;
  const rowH = clamp(num(b.rowHeight, 0), 0, 80);
  const rowSizes = rowH ? `rows: (${hRow ? 'auto, ' : ''}${rowH}mm), ` : '';
  const fill = {
    filled: `(x, y) => ${color}`,
    grid: `(x, y) => if ${hRow ? 'y == 0' : 'false'} or ${hCol ? 'x == 0' : 'false'} { ${color} } else { none }`,
    zebra: `(x, y) => if ${hRow ? 'y > 0 and ' : ''}calc.${hRow ? 'odd' : 'even'}(y) { ${color} } else { none }`,
  }[look] || `(x, y) => ${color}`;
  const stroke = {
    filled: '1.6pt + white',
    grid: '0.5pt + luma(150)',
    zebra: `(x, y) => (left: if x > 0 { 1.2pt + luma(40) } else { none }${hRow ? ', bottom: if y == 0 { 1.2pt + luma(40) } else { none }' : ''})`,
  }[look] || '1.6pt + white';
  const cells = rows.flatMap((r, y) => r.map((c, x) => {
    const m = cellMarkup(c, sol);
    return (hRow && y === 0) || (hCol && x === 0) ? `table.cell(text(weight: "bold", ${m}))` : m;
  }));
  const title = b.title ? `#text(weight: "bold", underline(offset: 2pt, ${S(b.title)}))\n#v(2pt)\n` : '';
  // filled cells in a dark custom colour get white text
  const light = look === 'filled' && isDark(hex) ? '#set text(fill: white)\n' : '';
  return `${title}${light ? `#[${light}` : ''}#table(columns: ${columns}, ${rowSizes}inset: (x: 6pt, y: 5pt),
  align: (x, y) => (if x == 0 and ${n > 1} { left } else { center }) + horizon,
  fill: ${fill}, stroke: ${stroke},
  ${cells.join(', ')})${light ? ']' : ''}`;
}

/** Comparison chart: column titles, rules, writing lines (or the solution). */
export function tchartBody(b, { sol }) {
  const titles = String(b.columns || 'Gemeinsamkeiten | Unterschiede').split('|').map((t) => t.trim()).slice(0, 4);
  const k = Math.max(1, titles.length);
  const n = int(b.lines, 1, 30, 3);
  const solRows = tableRows(b.solution);
  const hasSol = sol && solRows.some((r) => r.some(Boolean));
  const body = titles.map((_, x) => {
    if (hasSol) {
      const items = solRows.map((r) => r[x] || '').filter(Boolean);
      return `[#set text(fill: ok); ${items.map(inline).join(' #linebreak() ')}]`;
    }
    return `ans-lines(${n})`;
  });
  return `${b.text ? `${inline(b.text)}\n\n` : ''}#table(columns: (${Array(k).fill('1fr').join(', ')}), inset: (x: 7pt, y: 5pt),
  align: (x, y) => if y == 0 { center } else { left },
  stroke: (x, y) => (left: if x > 0 { 1.6pt + accent } else { none }, bottom: if y == 0 { 1.6pt + accent } else { none }),
  ${titles.map((t) => `[${inline(t)}]`).join(', ')},
  ${body.join(', ')})`;
}
