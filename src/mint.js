// MINT blocks: formula, source code, function plot ("mathematical drawing"),
// value table and probability tree. Plots and trees are drawn natively in
// Typst (lines, curves, placed labels), so they use the sheet's fonts and come
// out as vectors in PDF, preview and HTML export alike.

import { S, inline, safeMath, mathOk, fmt, mm, num, clamp, lines } from './typst-util.js';
import { parse, evaluate, toMath, parseFunction } from './mathexpr.js';

const PLOT_COLORS = ['rgb("#2f6fdb")', 'rgb("#c0392b")', 'rgb("#1f8a4c")', 'rgb("#7b3fd0")', 'rgb("#d96c00")', 'rgb("#0f8a8a")'];
const FN_NAMES = ['f', 'g', 'h', 'k', 'p', 'q'];

/** Shown instead of a block when its input cannot be rendered. */
const problem = (msg) => `#text(fill: rgb("#c0392b"), size: 9pt, ${S('⚠ ' + msg)})`;

// ----------------------------------------------------------------- formula --

const LATEX_WORDS = {
  cdot: 'dot', times: 'times', div: 'div', pm: 'plus.minus', mp: 'minus.plus',
  le: '<=', leq: '<=', ge: '>=', geq: '>=', neq: '!=', ne: '!=', approx: 'approx', equiv: 'equiv',
  infty: 'infinity', to: '->', rightarrow: '->', Rightarrow: '=>', Leftrightarrow: '<=>', leftarrow: '<-',
  cdots: 'dots.c', ldots: 'dots', dots: 'dots', in: 'in', notin: 'in.not', subset: 'subset', cup: 'union', cap: 'sect',
  int: 'integral', sum: 'sum', prod: 'product', partial: 'diff', nabla: 'nabla', degree: 'degree', circ: 'compose',
  varepsilon: 'epsilon.alt', varphi: 'phi.alt', perp: 'perp', parallel: 'parallel', angle: 'angle', triangle: 'triangle',
  quad: 'quad', qquad: 'wide', mid: 'divides', forall: 'forall', exists: 'exists', emptyset: 'emptyset', mathbb: 'bb',
};
const LATEX_FUNCS = { sqrt: 'sqrt', overline: 'overline', vec: 'arrow', hat: 'hat', bar: 'overline', underline: 'underline', mathbf: 'bold', mathrm: 'upright', bb: 'bb', abs: 'abs' };

/** Read one {group} starting at s[i] === '{'; returns [content, nextIndex]. */
function group(s, i) {
  if (s[i] !== '{') {
    // single token argument like \frac12 or ^2
    const m = s.slice(i).match(/^\s*(\\[a-zA-Z]+|.)/);
    return m ? [m[1], i + m[0].length] : ['', i];
  }
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

/** Common LaTeX math -> Typst math (teachers often know LaTeX). */
export function latexToTypst(src) {
  const s = String(src);
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\\') {
      const m = s.slice(i + 1).match(/^([a-zA-Z]+|.)/);
      const cmd = m ? m[1] : '';
      i += 1 + cmd.length;
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const [a, i2] = group(s, i);
        const [b, i3] = group(s, i2);
        out += `(${latexToTypst(a)})/(${latexToTypst(b)})`;
        i = i3;
      } else if (cmd === 'sqrt') {
        if (s[i] === '[') {
          const end = s.indexOf(']', i);
          const n = s.slice(i + 1, end);
          const [a, i2] = group(s, end + 1);
          out += `root(${latexToTypst(n)}, ${latexToTypst(a)})`;
          i = i2;
        } else {
          const [a, i2] = group(s, i);
          out += `sqrt(${latexToTypst(a)})`;
          i = i2;
        }
      } else if (cmd === 'text') {
        const [a, i2] = group(s, i);
        out += JSON.stringify(a);
        i = i2;
      } else if (LATEX_FUNCS[cmd]) {
        const [a, i2] = group(s, i);
        out += `${LATEX_FUNCS[cmd]}(${latexToTypst(a)})`;
        i = i2;
      } else if (cmd === 'left' || cmd === 'right') {
        // \left( ... \right) -> plain delimiters
      } else if (cmd === ',' || cmd === ';' || cmd === ' ' || cmd === ':') {
        out += ' ';
      } else if (cmd === '\\') {
        out += ' \\ ';
      } else if (cmd === '{' || cmd === '}') {
        out += cmd === '{' ? '{' : '}';
      } else if (cmd === '%') {
        out += '%';
      } else {
        out += ' ' + (LATEX_WORDS[cmd] || cmd) + ' ';
      }
    } else if ((c === '^' || c === '_') && s[i + 1] === '{') {
      const [a, i2] = group(s, i + 1);
      out = out.replace(/ +$/, '') + `${c}(${latexToTypst(a)})`;
      i = i2;
    } else if (c === '{' || c === '}') {
      i++; // plain LaTeX grouping has no visible output
    } else {
      // LaTeX reads "4ac" as 4·a·c, Typst would look for a variable "ac"
      if (/[a-zA-Z]/.test(c) && /[a-zA-Z]$/.test(out) && /[a-zA-Z]/.test(s[i - 1] || '')) out += ' ';
      out += c;
      i++;
    }
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

export function formulaMath(b) {
  const raw = String(b.formula ?? '');
  return raw.includes('\\') ? latexToTypst(raw) : raw;
}

export function formulaBody(b) {
  const m = safeMath(formulaMath(b));
  if (!m) return problem('Die Formel darf kein „#“ enthalten.');
  if (!mathOk(m)) return problem('Formel nicht lesbar: ' + m);
  const align = { left: 'left', right: 'right' }[b.align] || 'center';
  const size = clamp(num(b.size, 13), 8, 30);
  return `#align(${align})[#text(size: ${size}pt)[$ ${m} $]]`;
}

// -------------------------------------------------------------------- code --

/** String literal that keeps line breaks (for source code). */
const SM = (t) =>
  '"' + String(t ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '    ') + '"';

export const CODE_LANGS = ['python', 'java', 'javascript', 'c', 'cpp', 'csharp', 'html', 'css', 'sql', 'bash', 'json', 'xml', 'php', 'kotlin', 'go', 'rust', 'text'];

export function codeBody(b) {
  const lang = CODE_LANGS.includes(b.lang) ? b.lang : 'text';
  const size = clamp(num(b.size, 9), 6, 14);
  const numbers = b.lineNumbers !== false
    ? '#show raw.line: it => { box(width: 1.8em, align(right, text(fill: luma(150), str(it.number)))); h(0.9em); it.body }'
    : '';
  const title = b.title ? `#text(size: 8.5pt, fill: luma(110), weight: "bold", ${S(b.title)})\n#v(-3pt)\n` : '';
  return `${title}#block(width: 100%, fill: luma(246), stroke: 0.5pt + luma(215), radius: 3pt, inset: 7pt)[
  #set text(font: "DejaVu Sans Mono", size: ${size}pt)
  #set par(justify: false)
  ${numbers}
  #raw(${SM(b.code)}, lang: ${S(lang)}, block: true)
]`;
}

// ---------------------------------------------------------- function plot --

/** "A(1|2)" lines -> points. Accepts | or ; between coordinates, decimal comma. */
export function parsePoints(text) {
  return lines(text)
    .map((l) => l.match(/^\s*([A-Za-z][A-Za-z0-9']*)?\s*\(\s*(-?[\d.,]+)\s*[|;]\s*(-?[\d.,]+)\s*\)\s*$/))
    .filter(Boolean)
    .map((m) => ({ name: m[1] || '', x: Number(m[2].replace(',', '.')), y: Number(m[3].replace(',', '.')) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function plotFunctions(b) {
  const out = [];
  const errors = [];
  lines(b.fns).slice(0, 6).forEach((line, i) => {
    try {
      const f = parseFunction(line, FN_NAMES[i] || 'f');
      out.push({ ...f, color: PLOT_COLORS[i % PLOT_COLORS.length] });
    } catch (e) {
      errors.push(`${line}: ${e.message}`);
    }
  });
  return { fns: out, errors };
}

function niceStep(range) {
  const raw = range / 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) || p * 10;
}

/** Centered label at (x, y) mm inside the plot box. */
const label = (x, y, body, w = 14, h = 5) =>
  `place(dx: ${mm(x - w / 2)}, dy: ${mm(y - h / 2)}, box(width: ${mm(w)}, height: ${mm(h)}, align(center + horizon, ${body})))`;

export function functionBody(b, { sol, lang }, w) {
  let xmin = num(b.xmin, -5);
  let xmax = num(b.xmax, 5);
  let ymin = num(b.ymin, -5);
  let ymax = num(b.ymax, 5);
  if (xmax <= xmin) xmax = xmin + 1;
  if (ymax <= ymin) ymax = ymin + 1;
  const step = num(b.step, 0) > 0 ? num(b.step) : niceStep(Math.max(xmax - xmin, ymax - ymin));
  const maxH = clamp(num(b.maxHeight, 110), 30, 250);

  let u = w / (xmax - xmin);
  if (u * (ymax - ymin) > maxH) u = maxH / (ymax - ymin);
  const W = u * (xmax - xmin);
  const H = u * (ymax - ymin);
  const X = (x) => (x - xmin) * u;
  const Y = (y) => (ymax - y) * u;

  const parts = [];
  const gridMode = b.grid || 'squares';
  if (gridMode !== 'none') {
    // squared paper: half steps light, full steps a bit darker
    const minor = gridMode === 'squares' && u * step / 2 >= 2.5 ? step / 2 : step;
    for (let x = Math.ceil(xmin / minor) * minor; x <= xmax + 1e-9; x += minor) {
      const major = Math.abs(x / step - Math.round(x / step)) < 1e-6;
      parts.push(`place(line(start: (${mm(X(x))}, 0mm), end: (${mm(X(x))}, ${mm(H)}), stroke: ${major ? '0.45pt + luma(185)' : '0.3pt + luma(215)'}))`);
    }
    for (let y = Math.ceil(ymin / minor) * minor; y <= ymax + 1e-9; y += minor) {
      const major = Math.abs(y / step - Math.round(y / step)) < 1e-6;
      parts.push(`place(line(start: (0mm, ${mm(Y(y))}), end: (${mm(W)}, ${mm(Y(y))}), stroke: ${major ? '0.45pt + luma(185)' : '0.3pt + luma(215)'}))`);
    }
  }

  // axes (at zero, or at the border when zero is out of range)
  const ax = Y(clamp(0, ymin, ymax));
  const ay = X(clamp(0, xmin, xmax));
  const arrow = (x, y, dir) => {
    const a = 2.2;
    const pts = dir === 'right'
      ? [[x, y], [x - a, y - a / 2.4], [x - a, y + a / 2.4]]
      : [[x, y], [x - a / 2.4, y + a], [x + a / 2.4, y + a]];
    return `place(polygon(fill: black, ${pts.map(([px, py]) => `(${mm(px)}, ${mm(py)})`).join(', ')}))`;
  };
  parts.push(`place(line(start: (0mm, ${mm(ax)}), end: (${mm(W)}, ${mm(ax)}), stroke: 0.8pt))`, arrow(W, ax, 'right'));
  parts.push(`place(line(start: (${mm(ay)}, ${mm(H)}), end: (${mm(ay)}, 0mm), stroke: 0.8pt))`, arrow(ay, 0, 'up'));
  parts.push(label(W - 2, ax + 3.6, '$x$', 6, 4), label(ay - 3.2, 2, '$y$', 6, 4));

  // tick labels
  const tick = (v) => `text(size: 7pt, ${S(fmt(v, lang, 3))})`;
  if (u * step >= 4) {
    for (let x = Math.ceil(xmin / step) * step; x <= xmax + 1e-9; x += step) {
      if (Math.abs(x) < 1e-9 || X(x) > W - 3 || X(x) < 2) continue;
      parts.push(`place(line(start: (${mm(X(x))}, ${mm(ax - 0.8)}), end: (${mm(X(x))}, ${mm(ax + 0.8)}), stroke: 0.6pt))`);
      parts.push(label(X(x), ax + 3, tick(x), 10, 3.5));
    }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax + 1e-9; y += step) {
      if (Math.abs(y) < 1e-9 || Y(y) < 3 || Y(y) > H - 2) continue;
      parts.push(`place(line(start: (${mm(ay - 0.8)}, ${mm(Y(y))}), end: (${mm(ay + 0.8)}, ${mm(Y(y))}), stroke: 0.6pt))`);
      parts.push(`place(dx: ${mm(ay - 11.5)}, dy: ${mm(Y(y) - 1.75)}, box(width: 10mm, height: 3.5mm, align(right + horizon, ${tick(y)})))`);
    }
  }

  // graphs
  const { fns, errors } = plotFunctions(b);
  const showGraphs = b.showGraphs === 'never' ? false : b.showGraphs === 'solution' ? sol : true;
  if (showGraphs) {
    const span = ymax - ymin;
    for (const f of fns) {
      const N = 320;
      let seg = [];
      const segs = [];
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const x = xmin + ((xmax - xmin) * i) / N;
        let y;
        try { y = evaluate(f.tree, x); } catch { y = NaN; }
        const bad = !Number.isFinite(y) || Math.abs(y - (ymin + ymax) / 2) > span * 20 || (prev !== null && Math.abs(y - prev) > span * 2);
        if (bad) {
          if (seg.length > 1) segs.push(seg);
          seg = Number.isFinite(y) && Math.abs(y - (ymin + ymax) / 2) <= span * 20 ? [[x, y]] : [];
        } else {
          seg.push([x, y]);
        }
        prev = Number.isFinite(y) ? y : null;
      }
      if (seg.length > 1) segs.push(seg);
      for (const s of segs) {
        const pts = s.map(([x, y]) => `(${mm(X(x))}, ${mm(Y(clamp(y, ymin - span, ymax + span)))})`);
        parts.push(`place(curve(stroke: 1.3pt + ${f.color}, curve.move(${pts[0]}), ${pts.slice(1).map((p) => `curve.line(${p})`).join(', ')}))`);
      }
    }
  }

  // points and shapes
  const pts = parsePoints(b.points);
  if (pts.length) {
    if (b.connect && pts.length > 1) {
      const path = pts.map((p) => `(${mm(X(p.x))}, ${mm(Y(p.y))})`).join(', ');
      parts.push(`place(polygon(stroke: 1pt + luma(40), fill: rgb(47, 111, 219, 25), ${path}))`);
    }
    for (const p of pts) {
      const px = X(p.x);
      const py = Y(p.y);
      parts.push(`place(dx: ${mm(px - 0.9)}, dy: ${mm(py - 0.9)}, circle(radius: 0.9mm, fill: black))`);
      if (p.name) parts.push(`place(dx: ${mm(px + 1)}, dy: ${mm(py - 4.6)}, text(size: 8.5pt, weight: "bold", ${S(p.name)}))`);
    }
  }

  const legend = fns.length && b.legend !== false
    ? `\n#v(3pt)\n#align(center)[#set text(size: 9.5pt)\n${fns.map((f) => {
      const m = toMath(f.tree, lang);
      const lhs = f.isY ? 'y' : `${f.name}(x)`;
      return `#box(baseline: -2pt, line(length: 6mm, stroke: 1.6pt + ${f.color})) #h(3pt) $${lhs} = ${mathOk(m) ? m : 'dots'}$`;
    }).join(' #h(14pt) ')}]` : '';
  const err = errors.length ? '\n' + problem(errors.join(' · ')) : '';
  const title = b.text ? inline(b.text) + '\n\n#v(2pt)\n' : '';
  return `${title}#align(center, box(width: ${mm(W)}, height: ${mm(H)}, clip: true, {
  ${parts.join('\n  ')}
}))${legend}${err}`;
}

// ------------------------------------------------------------- value table --

export function valueTableXs(text) {
  return String(text ?? '')
    .split(/;|\s+|,\s+/)
    .map((s) => s.trim().replace(',', '.').replace('−', '-'))
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 16);
}

export function valueTableBody(b, { sol, lang }) {
  let f;
  try {
    f = parseFunction(b.fn || 'x', 'f');
  } catch (e) {
    return problem(`${b.fn}: ${e.message}`);
  }
  const xs = valueTableXs(b.xs);
  if (!xs.length) return problem('Keine x-Werte');
  const showY = b.mode === 'full' || sol;
  const ys = xs.map((x) => {
    const y = evaluate(f.tree, x);
    return Number.isFinite(y) ? fmt(y, lang, 2) : '–';
  });
  const lhs = f.isY ? 'y' : `${f.name}(x)`;
  const term = toMath(f.tree, lang);
  const head = b.showTerm !== false && mathOk(term) ? `$${lhs} = ${term}$` : `$${lhs}$`;
  const given = b.mode === 'full';
  const yCell = (y) => (showY
    ? `[#text(fill: ${given ? 'black' : 'ok'}, weight: ${given ? '"regular"' : '"bold"'}, ${S(y)})]`
    : '[]');
  return `${b.text ? inline(b.text) + '\n\n#v(2pt)\n' : ''}#table(columns: (auto, ${xs.map(() => '1fr').join(', ')}), align: center + horizon, inset: (x: 4pt, y: 6pt),
  stroke: 0.6pt + luma(110), fill: (x, y) => if x == 0 { soft } else { none },
  [$x$], ${xs.map((x) => `[#${S(fmt(x, lang, 3))}]`).join(', ')},
  [${head}], ${ys.map(yCell).join(', ')})`;
}

// ------------------------------------------------------- probability tree --

/** "3/10", "0,3", "30 %" -> { v, num, den } (num/den only for fractions). */
export function parseProb(t) {
  const s = String(t ?? '').trim();
  let m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[2]) > 0) return { v: Number(m[1]) / Number(m[2]), num: Number(m[1]), den: Number(m[2]), text: s };
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  if (m) return { v: Number(m[1].replace(',', '.')) / 100, text: s };
  m = s.match(/^\d*(?:[.,]\d+)?$/);
  if (m && s) return { v: Number(s.replace(',', '.')), text: s };
  return null;
}

/** Indented lines -> tree. "Label: p" per line; indentation = depth. */
export function parseTree(text) {
  const root = { label: '', children: [] };
  const stack = [{ node: root, indent: -1 }];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.replace(/\t/g, '  ').match(/^ */)[0].length;
    const body = raw.trim();
    const m = body.match(/^(.*?)\s*[:|]\s*([^:|]+)$/);
    const node = { label: (m ? m[1] : body).trim(), prob: m ? parseProb(m[2]) : null, probText: m ? m[2].trim() : '', children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, indent });
  }
  return root;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Typst math for a probability (fractions stacked). */
const probMath = (p, lang) => {
  if (!p) return '';
  if (p.den) return `$${p.num}/${p.den}$`;
  return `#${S(String(p.text))}`;
};

export function treeBody(b, { sol, lang }, w) {
  const root = parseTree(b.spec);
  if (!root.children.length) return problem('Das Baumdiagramm ist leer');
  const leaves = [];
  let depth = 0;
  const walk = (n, d, path) => {
    n.depth = d;
    depth = Math.max(depth, d);
    if (!n.children.length && d > 0) { n.leaf = leaves.length; n.path = path; leaves.push(n); }
    n.children.forEach((c) => walk(c, d + 1, [...path, c]));
  };
  walk(root, 0, []);

  const pathMode = b.showPaths || 'none';
  const probMode = b.showProbs || 'always';
  const showProbs = probMode === 'always' || sol;
  const showPathValues = pathMode === 'always' || (pathMode === 'solution' && sol);
  const pathW = pathMode === 'none' ? 0 : Math.min(62, w * 0.42);
  const rowH = 11;
  const H = leaves.length * rowH;
  const nodeW = 16;
  const colW = Math.max(22, (w - 6 - pathW - nodeW / 2) / depth);

  const pos = (n) => {
    if (n.leaf !== undefined) n.y = n.leaf * rowH + rowH / 2;
    else { n.children.forEach(pos); n.y = n.children.reduce((s, c) => s + c.y, 0) / n.children.length; }
    n.x = n.depth === 0 ? 2 : 2 + n.depth * colW;
  };
  pos(root);

  const parts = [];
  const draw = (n) => {
    for (const c of n.children) {
      const x0 = n.depth === 0 ? n.x : n.x + nodeW / 2;
      const x1 = c.x - nodeW / 2;
      parts.push(`place(line(start: (${mm(x0)}, ${mm(n.y)}), end: (${mm(x1)}, ${mm(c.y)}), stroke: 0.7pt + luma(60)))`);
      const mx = (x0 + x1) / 2;
      // label above an upward edge, below a downward one, so siblings never collide
      const my = (n.y + c.y) / 2 + (c.y > n.y + 0.5 ? 3 : -3);
      if (showProbs && c.probText) {
        parts.push(label(mx, my, `box(fill: white, inset: 1pt, text(size: 8.5pt, fill: ${probMode === 'always' ? 'black' : 'ok'}, ${probMath(c.prob, lang) ? `[${probMath(c.prob, lang)}]` : S(c.probText)}))`, 14, 7));
      } else if (c.probText) {
        parts.push(`place(dx: ${mm(mx - 4.5)}, dy: ${mm(my - 2.7)}, box(width: 9mm, height: 5.4mm, fill: white, stroke: 0.6pt + luma(110), radius: 1.5pt))`);
      }
      parts.push(label(c.x, c.y, `box(fill: white, inset: 1.5pt, text(size: 10pt, ${S(c.label)}))`, nodeW, 6));
      draw(c);
    }
  };
  parts.push(`place(dx: ${mm(root.x - 1)}, dy: ${mm(root.y - 1)}, circle(radius: 1mm, fill: luma(60)))`);
  draw(root);

  if (pathMode !== 'none') {
    const px = w - pathW;
    for (const leaf of leaves) {
      const probs = leaf.path.map((n) => n.prob);
      const names = leaf.path.map((n) => n.label).join(', ');
      let value = '';
      if (probs.every((p) => p)) {
        if (probs.every((p) => p.den)) {
          let nu = probs.reduce((s, p) => s * p.num, 1);
          let de = probs.reduce((s, p) => s * p.den, 1);
          const g = gcd(nu, de) || 1;
          nu /= g; de /= g;
          value = `$${probs.map((p) => `${p.num}/${p.den}`).join(' dot ')} = ${de === 1 ? nu : `${nu}/${de}`}$`;
        } else {
          value = `#${S(fmt(probs.reduce((s, p) => s * p.v, 1), lang, 4))}`;
        }
      }
      const lhs = `#text(size: 8.5pt)[#${S(`P(${names}) =`)}]`;
      const rhs = showPathValues && value
        ? `#text(size: 8.5pt, fill: ${pathMode === 'always' ? 'black' : 'ok'})[${value}]`
        : '#box(width: 1fr, height: 0.9em, stroke: (bottom: 0.5pt + luma(120)))';
      parts.push(`place(dx: ${mm(px)}, dy: ${mm(leaf.y - rowH / 2)}, box(width: ${mm(pathW)}, height: ${mm(rowH)}, align(left + horizon)[${lhs} ${rhs}]))`);
    }
  }

  return `${b.text ? inline(b.text) + '\n\n#v(2pt)\n' : ''}#box(width: ${mm(w)}, height: ${mm(H)}, {
  ${parts.join('\n  ')}
})`;
}
