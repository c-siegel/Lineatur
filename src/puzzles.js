// Generated exercises: word search, crossword, sorting, matching, anagram,
// arithmetic drills. Each `*Body(b, ctx, w)` returns the Typst markup of the
// exercise body for an available width of `w` millimetres. All randomness is
// seeded (block.seed), so a sheet looks the same every time it is rendered.

import { S, inline, int, fmt, mm, mulberry32, shuffled, normalizeWord, lines } from './typst-util.js';

// ------------------------------------------------------------- word search --

export function buildWordSearch(block) {
  const size = int(block.size, 6, 18, 10);
  const difficulty = int(block.difficulty, 1, 3, 1);
  const rnd = mulberry32(parseInt(block.seed) || 1);
  const dirs = [[1, 0], [0, 1]];
  if (difficulty >= 2) dirs.push([1, 1], [1, -1]);
  if (difficulty >= 3) dirs.push([-1, 0], [0, -1], [-1, -1], [-1, 1]);

  const all = lines(block.words, true)
    .map((shown) => ({ shown: shown.toUpperCase(), word: normalizeWord(shown) }))
    .filter((e) => e.word.length >= 2);
  const entries = all.filter((e) => e.word.length <= size).sort((a, b) => b.word.length - a.word.length);

  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const mark = Array.from({ length: size }, () => Array(size).fill(false));
  // words longer than the grid cannot go in at all
  const skipped = all.filter((e) => e.word.length > size).map((e) => e.shown);

  for (const e of entries) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const [dx, dy] = dirs[Math.floor(rnd() * dirs.length)];
      const x0 = Math.floor(rnd() * size);
      const y0 = Math.floor(rnd() * size);
      const x1 = x0 + dx * (e.word.length - 1);
      const y1 = y0 + dy * (e.word.length - 1);
      if (x1 < 0 || x1 >= size || y1 < 0 || y1 >= size) continue;
      let fits = true;
      for (let i = 0; i < e.word.length; i++) {
        const c = grid[y0 + dy * i][x0 + dx * i];
        if (c && c !== e.word[i]) { fits = false; break; }
      }
      if (!fits) continue;
      for (let i = 0; i < e.word.length; i++) {
        grid[y0 + dy * i][x0 + dx * i] = e.word[i];
        mark[y0 + dy * i][x0 + dx * i] = true;
      }
      placed = true;
    }
    if (!placed) skipped.push(e.shown);
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!grid[y][x]) grid[y][x] = alphabet[Math.floor(rnd() * 26)];

  return { size, grid, mark, words: entries.map((e) => e.shown), skipped };
}

export function wordsearchBody(b, { sol, T, warn }, w) {
  const ws = buildWordSearch(b);
  if (ws.skipped.length) {
    warn?.(b.id, `Diese Wörter passen nicht ins Raster und fehlen auf dem Blatt: ${ws.skipped.join(', ')}. Raster vergrößern, Wörter kürzen oder neu mischen.`);
  }
  const cell = Math.max(3.5, Math.min(6.8, Math.floor((w / ws.size) * 10) / 10));
  const cols = `(${Array(ws.size).fill(cell + 'mm').join(', ')})`;
  const wordCols = w > 100 ? 4 : w > 60 ? 3 : 2;
  const cells = [];
  for (let y = 0; y < ws.size; y++)
    for (let x = 0; x < ws.size; x++) {
      const letter = `[#${S(ws.grid[y][x])}]`;
      cells.push(sol && ws.mark[y][x] ? `grid.cell(fill: ok-soft)${letter}` : letter);
    }
  // only the words that are really in the grid are listed
  const words = ws.words.filter((x) => !ws.skipped.includes(x)).map((x) => `[#${S(x)}]`).join(', ');
  return `${inline(b.text)}

#v(4pt)
#align(center)[
  #text(font: "DejaVu Sans Mono", size: 11pt, weight: "bold")[
    #grid(columns: ${cols}, rows: ${cell}mm, align: center + horizon,
      stroke: 0.4pt + luma(205), ${cells.join(', ')})
  ]
]
#v(4pt)
#text(size: 9pt, fill: luma(90))[#${S(T.words + ':')}]
#v(-2pt)
#text(font: "DejaVu Sans Mono", size: 9pt)[
  #grid(columns: ${wordCols}, column-gutter: 10pt, row-gutter: 5pt, align: left, ${words})
]`;
}

// --------------------------------------------------------------- crossword --

/** "WORD: clue" lines -> entries. A line without a colon uses the word as its own clue. */
export function crosswordEntries(text) {
  return lines(text)
    .map((l) => {
      const i = l.search(/[:=]/);
      const word = i >= 0 ? l.slice(0, i).trim() : l;
      const clue = i >= 0 ? l.slice(i + 1).trim() : l;
      return { shown: word, word: normalizeWord(word), clue };
    })
    .filter((e) => e.word.length >= 2 && e.word.length <= 20);
}

function tryCrossword(entries, rnd) {
  const cells = new Map(); // "x,y" -> letter
  const key = (x, y) => x + ',' + y;
  const placed = [];
  const at = (x, y) => cells.get(key(x, y));

  const canPlace = (word, x, y, dx, dy) => {
    let crossings = 0;
    if (at(x - dx, y - dy) || at(x + dx * word.length, y + dy * word.length)) return -1;
    for (let i = 0; i < word.length; i++) {
      const cx = x + dx * i;
      const cy = y + dy * i;
      const c = at(cx, cy);
      if (c) {
        if (c !== word[i]) return -1;
        crossings++;
      } else if (at(cx + dy, cy + dx) || at(cx - dy, cy - dx)) {
        return -1; // would touch a parallel word
      }
    }
    return crossings;
  };
  const put = (e, x, y, dx, dy) => {
    for (let i = 0; i < e.word.length; i++) cells.set(key(x + dx * i, y + dy * i), e.word[i]);
    placed.push({ ...e, x, y, dir: dx ? 'across' : 'down' });
  };

  const [first, ...rest] = entries;
  put(first, 0, 0, 1, 0);
  const skipped = [];
  let pending = rest;
  for (let round = 0; round < 2; round++) {
    const next = [];
    for (const e of pending) {
      let best = null;
      for (const p of placed) {
        for (let i = 0; i < p.word.length; i++) {
          for (let j = 0; j < e.word.length; j++) {
            if (p.word[i] !== e.word[j]) continue;
            const [dx, dy] = p.dir === 'across' ? [0, 1] : [1, 0];
            const px = p.x + (p.dir === 'across' ? i : 0);
            const py = p.y + (p.dir === 'across' ? 0 : i);
            const x = px - dx * j;
            const y = py - dy * j;
            const score = canPlace(e.word, x, y, dx, dy);
            if (score > 0 && (!best || score + rnd() * 0.5 > best.score)) best = { x, y, dx, dy, score };
          }
        }
      }
      if (best) put(e, best.x, best.y, best.dx, best.dy);
      else next.push(e);
    }
    pending = next;
  }
  skipped.push(...pending);
  return { placed, skipped, cells };
}

export function buildCrossword(block) {
  const entries = crosswordEntries(block.entries);
  if (!entries.length) return null;
  const rnd = mulberry32(parseInt(block.seed) || 1);
  let best = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const order = attempt === 0
      ? entries.slice().sort((a, b) => b.word.length - a.word.length)
      : shuffled(entries, Math.floor(rnd() * 1e9));
    const r = tryCrossword(order, rnd);
    const xs = r.placed.flatMap((p) => [p.x, p.x + (p.dir === 'across' ? p.word.length - 1 : 0)]);
    const ys = r.placed.flatMap((p) => [p.y, p.y + (p.dir === 'down' ? p.word.length - 1 : 0)]);
    r.minX = Math.min(...xs); r.minY = Math.min(...ys);
    r.w = Math.max(...xs) - r.minX + 1; r.h = Math.max(...ys) - r.minY + 1;
    const score = r.placed.length * 1000 - r.w * r.h;
    if (!best || score > best.score) best = { ...r, score };
  }
  // number the starting cells in reading order
  const starts = [...new Set(best.placed.map((p) => `${p.y - best.minY},${p.x - best.minX}`))]
    .map((s) => s.split(',').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numberAt = new Map(starts.map(([y, x], i) => [`${x},${y}`, i + 1]));
  const words = best.placed.map((p) => ({
    ...p, n: numberAt.get(`${p.x - best.minX},${p.y - best.minY}`),
  })).sort((a, b) => a.n - b.n);
  const grid = Array.from({ length: best.h }, (_, y) =>
    Array.from({ length: best.w }, (_, x) => best.cells.get(`${x + best.minX},${y + best.minY}`) || ''));
  return { grid, numberAt, words, skipped: best.skipped.map((e) => e.shown), w: best.w, h: best.h };
}

export function crosswordBody(b, { sol, T, warn }, w) {
  const cw = buildCrossword(b);
  if (!cw) return inline(b.text);
  const wide = w > 110;
  const gridW = wide ? w * 0.58 : w;
  const cell = Math.max(4, Math.min(7.5, Math.floor((gridW / cw.w) * 10) / 10));
  const cells = [];
  for (let y = 0; y < cw.h; y++)
    for (let x = 0; x < cw.w; x++) {
      const ch = cw.grid[y][x];
      if (!ch) { cells.push('[]'); continue; }
      const n = cw.numberAt.get(`${x},${y}`);
      const numMark = n ? `#place(top + left, dx: 0.6pt, dy: 0.6pt, text(size: 5.5pt, fill: luma(60), "${n}"))` : '';
      const letter = sol ? `#text(fill: ok, weight: "bold", ${S(ch)})` : '';
      cells.push(`grid.cell(stroke: 0.6pt + luma(60))[${numMark}${letter}]`);
    }
  const clueList = (dir, title) => {
    const items = cw.words.filter((x) => x.dir === dir);
    if (!items.length) return '[]';
    return `[#text(weight: "bold", ${S(title)})
#set par(spacing: 0.45em)
${items.map((x) => `#text(weight: "bold", "${x.n}") ${inline(x.clue)}`).join('\n\n')}]`;
  };
  const gridMarkup = `#grid(columns: (${Array(cw.w).fill(cell + 'mm').join(', ')}), rows: ${cell}mm, align: center + horizon,
    ${cells.join(', ')})`;
  const clues = `#grid(columns: ${wide ? 1 : 2}, column-gutter: 14pt, row-gutter: 10pt, ${clueList('across', T.across)}, ${clueList('down', T.down)})`;
  if (cw.skipped.length) {
    warn?.(b.id, `Diese Wörter kreuzen sich mit keinem anderen und fehlen im Rätsel: ${cw.skipped.join(', ')}. Neu anordnen oder Wörter mit gemeinsamen Buchstaben ergänzen.`);
  }
  const layout = wide
    ? `#grid(columns: (auto, 1fr), column-gutter: 8mm, ${'[' + gridMarkup + ']'}, [#set text(size: 9.5pt)\n${clues}])`
    : `#align(center)[${gridMarkup}]\n#v(6pt)\n#text(size: 9.5pt)[${clues}]`;
  return `${inline(b.text)}\n\n#v(4pt)\n${layout}`;
}

// ----------------------------------------------------------------- sorting --

export function sortingBody(b, { sol }) {
  const items = lines(b.items);
  const order = shuffled(items.map((_, i) => i), parseInt(b.seed) || 1);
  const rows = order.map((i) => {
    const box = `box(width: 7mm, height: 6mm, stroke: 0.7pt + luma(90), radius: 2pt, align(center + horizon, ${sol ? `text(fill: ok, weight: "bold", "${i + 1}")` : '[]'}))`;
    return `[#${box}], [${inline(items[i])}]`;
  });
  return `${inline(b.text)}

#v(3pt)
#grid(columns: (auto, 1fr), column-gutter: 8pt, row-gutter: 6pt, align: (center + horizon, left + horizon),
  ${rows.join(',\n  ')})`;
}

// ---------------------------------------------------------------- matching --

export const matchingPairs = (text) =>
  lines(text)
    .map((l) => {
      const i = l.search(/\s*(=|->|→|\|)\s*/);
      return i < 0 ? null : { left: l.slice(0, i).trim(), right: l.slice(i).replace(/^\s*(=|->|→|\|)\s*/, '').trim() };
    })
    .filter((p) => p && p.left && p.right);

/** Two columns with dots to connect; the solution draws the connecting lines. */
export function matchingBody(b, { sol }, w) {
  const pairs = matchingPairs(b.pairs);
  if (!pairs.length) return inline(b.text);
  const right = shuffled(pairs.map((_, i) => i), parseInt(b.seed) || 1);
  const rowH = 9;
  const colW = (w - 24) / 2;
  const H = pairs.length * rowH;
  const dotL = colW + 3;
  const dotR = w - colW - 3;
  const parts = [];
  pairs.forEach((p, i) => {
    const y = i * rowH;
    parts.push(`place(dx: 0mm, dy: ${mm(y)}, box(width: ${mm(colW)}, height: ${mm(rowH)}, align(right + horizon, par(leading: 0.4em)[${inline(p.left)}])))`);
    parts.push(`place(dx: ${mm(dotL - 1.2)}, dy: ${mm(y + rowH / 2 - 1.2)}, circle(radius: 1.2mm, fill: luma(60)))`);
  });
  right.forEach((pi, i) => {
    const y = i * rowH;
    parts.push(`place(dx: ${mm(dotR - 1.2)}, dy: ${mm(y + rowH / 2 - 1.2)}, circle(radius: 1.2mm, fill: luma(60)))`);
    parts.push(`place(dx: ${mm(w - colW)}, dy: ${mm(y)}, box(width: ${mm(colW)}, height: ${mm(rowH)}, align(left + horizon, par(leading: 0.4em)[${inline(pairs[pi].right)}])))`);
  });
  if (sol) {
    pairs.forEach((_, i) => {
      const j = right.indexOf(i);
      parts.push(`place(line(start: (${mm(dotL)}, ${mm(i * rowH + rowH / 2)}), end: (${mm(dotR)}, ${mm(j * rowH + rowH / 2)}), stroke: 1.2pt + ok))`);
    });
  }
  return `${inline(b.text)}

#v(4pt)
#box(width: ${mm(w)}, height: ${mm(H)}, {
  set text(size: 10pt)
  ${parts.join('\n  ')}
})`;
}

// ----------------------------------------------------------------- anagram --

export function scramble(word, seed) {
  const letters = [...String(word).toUpperCase().replace(/\s+/g, '')];
  return shuffled(letters, seed).join('');
}

export function anagramBody(b, { sol }, w) {
  const words = lines(b.words, true);
  const cols = w > 110 ? 3 : w > 60 ? 2 : 1;
  const seed = parseInt(b.seed) || 1;
  const cells = words.map((word, i) => {
    const sc = scramble(word, seed + i * 7919);
    const answer = sol
      ? `gap-sol(${S(word)})`
      : `gap-blank(1fr)`;
    return `[#text(font: "DejaVu Sans Mono", weight: "bold", tracking: 2.5pt, ${S(sc)}) #linebreak() #v(2pt) #${answer}]`;
  });
  return `${inline(b.text)}

#v(3pt)
#grid(columns: ${cols}, column-gutter: 12pt, row-gutter: 12pt, ${cells.join(', ')})`;
}

// -------------------------------------------------------------- arithmetic --

const OPS = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
};
const OP_SIGN = { '+': '+', '-': '−', '*': '·', '/': ':' };

/** Generate drill problems; returns [{ a, op, b, result }]. */
export function buildArithmetic(b) {
  const ops = (Array.isArray(b.ops) && b.ops.length ? b.ops : ['+']).filter((o) => OPS[o]);
  const min = int(b.min, -1000000, 1000000, 1);
  const max = Math.max(min, int(b.max, -1000000, 1000000, 20));
  const count = int(b.count, 1, 60, 12);
  const rnd = mulberry32(parseInt(b.seed) || 1);
  const r = () => min + Math.floor(rnd() * (max - min + 1));
  const out = [];
  for (let i = 0; i < count; i++) {
    const op = ops[Math.floor(rnd() * ops.length)] || '+';
    let x = r();
    let y = r();
    if (op === '-' && b.noNegative !== false && y > x) [x, y] = [y, x];
    if (op === '/') {
      // whole-number division: x = y * q
      if (y === 0) y = 1;
      const q = r();
      x = y * q;
    }
    out.push({ a: x, op, b: y, result: OPS[op](x, y) });
  }
  return out;
}

export function arithmeticBody(b, { sol, lang }, w) {
  const probs = buildArithmetic(b);
  const cols = int(b.columns, 1, 4, w > 110 ? 3 : w > 60 ? 2 : 1);
  const show = (v) => (v < 0 ? `(${fmt(v, lang)})` : fmt(v, lang));
  const cells = probs.map((p) => {
    const res = sol
      ? `gap-sol(${S(fmt(p.result, lang))})`
      : `gap-blank(14mm)`;
    return `[#${S(`${show(p.a)} ${OP_SIGN[p.op]} ${show(p.b)} =`)} #${res}]`;
  });
  return `${inline(b.text)}

#v(3pt)
#grid(columns: ${cols}, column-gutter: 12pt, row-gutter: 10pt, ${cells.join(', ')})`;
}
