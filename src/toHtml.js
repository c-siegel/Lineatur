// JSON worksheet document -> one self-contained, interactive HTML file.
//
// The file can be uploaded to Moodle (as a file/resource), embedded in a wiki or
// a WordPress page, or simply opened in a browser. Exercises that make sense on
// screen become interactive (tick boxes, gaps, drop-downs, a "Check" button and
// a running score). Everything else (plots, crosswords, trees, code, ...) is
// rendered by the same Typst engine as the PDF and embedded as vector SVG.
// Note: the answers are inside the file, so it is meant for practice, not exams.

import fs from 'node:fs';
import path from 'node:path';
import { prepare, documentSetup, blockMarkup, clozeParts, clozeWords, pointsLabel, headerFields } from './toTypst.js';
import { BODY_W, ROW, isTask, layoutOf } from '../public/layout.js';
import { safeMath, mathOk, emphasisParts, fmt, lines, shuffled, int, ACCENTS, TINTS, customColor, hexOf, isDark, frameStyleOf } from './typst-util.js';
import { tableRows, cellAnswer, TABLE_COLORS } from './tables.js';
import { matchingPairs, scramble, buildArithmetic } from './puzzles.js';
import { decodeImage } from './media.js';
import { VERSION } from './version.js';
import { licenseText } from '../public/meta.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Blocks rendered natively in HTML; all other types become Typst SVG.
const NATIVE = new Set(['heading', 'toc', 'text', 'image', 'choice', 'cloze', 'sorting', 'matching', 'anagram', 'arithmetic', 'lines', 'score',
  'table', 'infobox', 'pagebreak']);

// CSS colours matching the Typst palette in typst-util.js.
const CSS_FILL = {
  gray1: '#f6f6f6', gray2: '#eaeaea', gray3: '#dadada', blue: '#e8f0fe', green: '#e5f5ea',
  yellow: '#fff5cc', orange: '#ffecd9', red: '#fde7e7', purple: '#f1e8fd',
  teal: '#e2f4f3', rose: '#fbe7ea', lilac: '#f3eaf7', pink: '#fbe6ef', periwinkle: '#eceefe', sky: '#e6f3f9',
};
const CSS_STROKE = {
  gray: '#a0a0a0', dark: '#464646', black: '#000', blue: '#2f6fdb', green: '#1f8a4c', yellow: '#c99a00',
  orange: '#e07b00', red: '#c0392b', purple: '#7b3fd0',
  teal: '#5fbfba', rose: '#e58f9a', lilac: '#b58cc9', pink: '#e48cb0', periwinkle: '#9aa2f2', sky: '#8cbcec',
};

function blockCss(b) {
  const st = frameStyleOf(b);
  const out = [];
  const bg = CSS_FILL[st.fill] || customColor(st.fill);
  if (bg) out.push(`background:${bg}`);
  const c = CSS_STROKE[st.color] || customColor(st.color) || '#a0a0a0';
  const border = { solid: `1px solid ${c}`, thick: `3px solid ${c}`, dashed: `1.5px dashed ${c}`, dotted: `2px dotted ${c}`, card: `2px solid ${c}` }[st.frame];
  if (border) out.push(`border:${border}`);
  if (st.frame === 'left') out.push(`border-left:4px solid ${c}`);
  if (out.length) out.push('padding:10px 12px', `border-radius:${{ left: 0, card: 14 }[st.frame] ?? 6}px`);
  return out.join(';');
}

/** Base64 @font-face rules for the sheet's font, if its files are in fonts/. */
function fontFaces(family, fontDir) {
  const dir = path.join(fontDir, String(family).replace(/\s+/g, ''));
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir)
    .filter((f) => /\.(ttf|otf)$/i.test(f) && !/italic/i.test(f))
    .map((f) => {
      const weight = /700|bold/i.test(f) ? 700 : 400;
      const type = f.endsWith('.otf') ? 'opentype' : 'truetype';
      const data = fs.readFileSync(path.join(dir, f)).toString('base64');
      return `@font-face{font-family:${JSON.stringify(family)};font-weight:${weight};font-style:normal;src:url(data:font/${f.slice(-3)};base64,${data}) format("${type}")}`;
    })
    .join('\n');
}

export function toHtml(doc, { snippetSvg, fontDir }) {
  const stud = prepare(doc, { solutions: false });
  const solP = prepare(doc, { solutions: true });
  const { ctx, ordered, exInfo, total } = stud;
  const { T, lang } = ctx;
  const accent = hexOf(doc.accent, ACCENTS, 'blue');
  const font = String(doc.font || 'Open Sans');
  const mathCache = new Map();

  /** One Typst snippet -> inline SVG markup ('' on failure). */
  const svgOf = (source, assets) => {
    const r = snippetSvg(source, assets);
    return r.svg ? r.svg.replace(/^<\?xml[^>]*>\s*/, '') : `<p class="warn">${esc(r.error)}</p>`;
  };

  const mathSvg = (m) => {
    if (!mathCache.has(m)) {
      mathCache.set(m, svgOf(`#set page(width: auto, height: auto, margin: 1pt, fill: none)\n#set text(size: 12pt)\n$${m}$`, new Map()));
    }
    return `<span class="math">${mathCache.get(m)}</span>`;
  };

  /** User text -> HTML (escaped, line breaks, **bold**, *italic*, $math$ as SVG). */
  const rich = (t) => String(t ?? '').split(/(\$[^$\n]+\$)/g).map((part) => {
    if (/^\$[^$\n]+\$$/.test(part)) {
      const m = safeMath(part.slice(1, -1));
      if (m && mathOk(m)) return mathSvg(m);
    }
    return part.split(/\r?\n/).map((line) => emphasisParts(line).map(({ text, style }) => (
      style === 'bold' ? `<strong>${esc(text)}</strong>` : style === 'italic' ? `<em>${esc(text)}</em>` : esc(text)
    )).join('')).join('<br>');
  }).join('');

  /** A block compiled by Typst on its own page of the given width. */
  const blockSvg = (b, e, width, sol, bare = false) => {
    const p = sol ? solP : stud;
    p.ctx.assets = new Map();
    const markup = blockMarkup(b, bare ? null : sol ? solP.exInfo.get(b) : e, p.ctx, width, { bare });
    const page = `#set page(width: ${width}mm, height: auto, margin: (x: 0.5mm, y: 1.5mm), fill: none)`;
    return { markup, svg: () => svgOf(documentSetup(doc, p.ctx, page) + '\n' + markup, p.ctx.assets) };
  };

  // ---- exercises -----------------------------------------------------------
  let exId = 0;
  const exercise = (b, e, inner, data = '') => {
    const id = `ex${++exId}`;
    const pts = pointsLabel(e, ctx);
    // an open task without a sample answer has nothing to check
    const foot = data.includes('"open"') && !inner.includes('<details') ? ''
      : `<div class="exfoot"><button type="button" class="check">${esc(T.check)}</button><span class="feedback" aria-live="polite"></span></div>`;
    return `<section class="ex" id="${id}" data-points="${e.pts}"${data}>
<div class="exhead"><span class="num">${esc(e.label)}</span><div class="q">${rich(b.text)}</div><span class="pts">${esc(pts)}</span></div>
${inner}
${foot}
</section>`;
  };

  const native = (b, e, width, inTask = false) => {
    switch (b.type) {
      case 'heading': {
        const tag = parseInt(b.level) === 2 ? 'h3' : 'h2';
        const num = ctx.headNums.get(b.id);
        return `<${tag} id="h-${esc(b.id)}"${tag === 'h2' && b.rule === false ? ' class="norule"' : ''}>${num ? `<span class="hnum">${esc(num)}</span> ` : ''}${rich(b.text)}</${tag}>`;
      }
      case 'toc': {
        const depth = parseInt(b.depth) === 1 ? 1 : 2;
        const items = ctx.tocHeadings.filter((x) => x.level <= depth);
        const title = b.title ?? T.toc;
        return `<nav class="toc">${title ? `<b>${esc(title)}</b>` : ''}<ol>${items.map((x) =>
          `<li class="l${x.level}"><a href="#h-${esc(x.id)}">${x.prefix ? esc(x.prefix) + ' ' : ''}${rich(x.text)}</a></li>`).join('') || `<li><i>${esc(T.noToc)}</i></li>`}</ol></nav>`;
      }
      case 'text': {
        const css = [{ small: 'font-size:.85em', large: 'font-size:1.3em', title: 'font-size:2.2em' }[b.size],
          { center: 'text-align:center', right: 'text-align:right' }[b.align], b.bold && 'font-weight:700', b.italic && 'font-style:italic'].filter(Boolean).join(';');
        return `<p${css ? ` style="${css}"` : ''}>${rich(b.text)}</p>`;
      }
      case 'image': {
        const img = decodeImage(b.src);
        if (!img) return '';
        const w = Math.min(100, Math.max(10, Number(b.width) || 100));
        const align = { left: 'left', right: 'right' }[b.align] || 'center';
        return `<figure style="text-align:${align}"><img src="${esc(b.src)}" alt="${esc(b.caption || '')}" style="width:${w}%">${b.caption ? `<figcaption>${rich(b.caption)}</figcaption>` : ''}${b.credit ? `<small class="credit">${esc(b.credit)}</small>` : ''}</figure>`;
      }
      case 'lines':
        return `${String(b.label || '').trim() ? `<div class="lbl">${esc(b.label)}</div>` : ''}<textarea class="write" rows="${int(b.count, 1, 40, 5)}" aria-label="${esc(b.label || T.yourAnswer)}"></textarea>${String(b.solution || '').trim() ? `<details><summary>${esc(T.showSolution)}</summary><div class="sol">${rich(b.solution)}</div></details>` : ''}`;
      case 'infobox':
        const tint = hexOf(b.color, TINTS, 'rose');
        return `<aside class="info" style="background:${tint}${isDark(tint) ? ';color:#fff' : ''}">${String(b.title || '').trim() ? `<b>${esc(b.title)}</b><br>` : ''}${rich(b.text)}</aside>`;
      case 'table': {
        const rows = tableRows(b.rows);
        if (!rows.length) return '';
        const head = b.header || 'row';
        const hRow = head === 'row' || head === 'both';
        const hCol = head === 'col' || head === 'both';
        const color = hexOf(b.color, TABLE_COLORS, 'blue');
        const gaps = rows.some((r) => r.some((c) => cellAnswer(c) !== undefined));
        const cell = (c, x, y) => {
          const tag = (hRow && y === 0) || (hCol && x === 0) ? 'th' : 'td';
          const ans = cellAnswer(c);
          const inner = ans !== undefined
            ? `<input class="gap" size="${Math.max(4, ans.split('|')[0].length + 1)}" data-a="${esc(ans)}" aria-label="${esc(T.yourAnswer)}">`
            : c ? rich(c) : '<input class="cellin" aria-label="' + esc(T.yourAnswer) + '">';
          return `<${tag}>${inner}</${tag}>`;
        };
        const table = `${b.title ? `<div class="ttitle">${esc(b.title)}</div>` : ''}<table class="tbl ${esc(b.look || 'filled')}" style="--cell:${color}">${rows.map((r, y) => `<tr>${r.map((c, x) => cell(c, x, y)).join('')}</tr>`).join('')}</table>`;
        // cells with an answer ([[…]]) make the table checkable (as a task: by the task's own button)
        return gaps && !inTask
          ? `<section class="ex" id="ex-${esc(b.id)}" data-points="0" data-kind="gaps">${table}<div class="exfoot"><button type="button" class="check">${esc(T.check)}</button><span class="feedback" aria-live="polite"></span></div></section>`
          : table;
      }
      case 'score':
        return `<div class="scorebox"><b>${esc((b.label || T.points) + ':')}</b> <span class="score-live">0</span> / ${esc(fmt(Number(b.max) > 0 ? Number(b.max) : total, lang))}</div>`;
      case 'choice': {
        const opts = (b.options || []).map((o) =>
          `<label class="opt" data-ok="${o.correct ? 1 : 0}"><input type="checkbox"> <span>${rich(o.text)}</span></label>`).join('');
        return exercise(b, e, `<div class="opts${b.arrange === 'row' ? ' row-opts' : ''}">${opts}</div>`, ' data-kind="choice"');
      }
      case 'cloze': {
        const html = clozeParts(b.text).map((p, i) => (i % 2 === 0
          ? rich(p)
          : `<input class="gap" size="${Math.max(4, p.split('|')[0].length + 1)}" data-a="${esc(p)}" aria-label="${esc(T.yourAnswer)}">`)).join('');
        const words = b.wordbank ? clozeWords(b) : [];
        const bank = words.length ? `<div class="wordbank">${words.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : '';
        // the question text of a cloze is the text itself
        return exercise({ ...b, text: '' }, e, `${bank}<p class="cloze">${html}</p>`, ' data-kind="gaps"');
      }
      case 'sorting': {
        const items = lines(b.items);
        const order = shuffled(items.map((_, i) => i), parseInt(b.seed) || 1);
        const opts = ['', ...items.map((_, i) => String(i + 1))].map((v) => `<option value="${v}">${v || '–'}</option>`).join('');
        return exercise(b, e, `<ol class="sorting">${order.map((i) =>
          `<li><select class="pick" data-a="${i + 1}" aria-label="#">${opts}</select> ${rich(items[i])}</li>`).join('')}</ol>`, ' data-kind="picks"');
      }
      case 'matching': {
        const pairs = matchingPairs(b.pairs);
        const right = shuffled(pairs.map((_, i) => i), parseInt(b.seed) || 1);
        const letter = (k) => String.fromCharCode(65 + k);
        const opts = `<option value="">–</option>${right.map((_, k) => `<option value="${letter(k)}">${letter(k)}</option>`).join('')}`;
        return exercise(b, e, `<div class="matching"><ol class="left">${pairs.map((p, i) =>
          `<li>${rich(p.left)} <select class="pick" data-a="${letter(right.indexOf(i))}" aria-label="#">${opts}</select></li>`).join('')}</ol>
<ul class="right">${right.map((pi, k) => `<li><b>${letter(k)}</b> ${rich(pairs[pi].right)}</li>`).join('')}</ul></div>`, ' data-kind="picks"');
      }
      case 'anagram': {
        const seed = parseInt(b.seed) || 1;
        return exercise(b, e, `<div class="anagrams">${lines(b.words, true).map((w, i) =>
          `<label><span class="scr">${esc(scramble(w, seed + i * 7919))}</span><input class="gap" data-a="${esc(w)}" aria-label="${esc(T.yourAnswer)}"></label>`).join('')}</div>`, ' data-kind="gaps"');
      }
      case 'arithmetic': {
        const sign = { '+': '+', '-': '−', '*': '·', '/': ':' };
        const show = (v) => (v < 0 ? `(${fmt(v, lang)})` : fmt(v, lang));
        return exercise(b, e, `<div class="drill">${buildArithmetic(b).map((p) =>
          `<label>${esc(`${show(p.a)} ${sign[p.op]} ${show(p.b)} =`)} <input class="gap numeric" inputmode="decimal" data-a="${p.result}" data-num="1" aria-label="${esc(T.yourAnswer)}"></label>`).join('')}</div>`, ' data-kind="gaps"');
      }
    }
    return '';
  };

  const render = (b, width) => {
    const e = exInfo.get(b);
    if (isTask(b)) {
      // a content block used as a task: number, points and instruction around its content
      const content = b.type === 'text' ? '' : renderContent(b, width, null, true);
      const kind = content.includes('class="gap"') ? 'gaps' : 'open';
      const html = e
        ? exercise(b.type === 'text' ? b : { text: b.taskText }, e, content, ` data-kind="${kind}"`)
        : `${String(b.taskText || '').trim() && b.type !== 'text' ? `<p>${rich(b.taskText)}</p>` : ''}${b.type === 'text' ? `<p>${rich(b.text)}</p>` : content}`;
      const css = blockCss(b);
      return css && html ? `<div class="framed" style="${css}">${html}</div>` : html;
    }
    return renderContent(b, width, e);
  };

  /** One block as HTML (native) or as Typst SVG; e = its exercise number, if any.
   *  inTask: the content of a task, which draws frame, number and instruction itself. */
  const renderContent = (b, width, e = null, inTask = false) => {
    if (NATIVE.has(b.type)) {
      const html = native(b, e, width, inTask);
      const css = !inTask && blockCss(b);
      return css && html ? `<div class="framed" style="${css}">${html}</div>` : html;
    }
    const s = blockSvg(b, e, width, false, inTask);
    if (!s.markup) return '';
    const sol = blockSvg(b, e, width, true, inTask);
    const solHtml = sol.markup !== s.markup
      ? `<details><summary>${esc(T.showSolution)}</summary><div class="svg">${sol.svg()}</div></details>` : '';
    return `<div class="svg">${s.svg()}</div>${solHtml}`;
  };

  // ---- rows: blocks side by side on the page stay side by side ----------------
  const free = doc.layoutMode === 'free';
  const rows = [];
  for (const b of ordered) {
    const l = layoutOf(b);
    const last = rows[rows.length - 1];
    if (free && last && last.page === l.page && Math.abs(last.y - l.y) < 2 * ROW) last.items.push({ b, l });
    else rows.push({ page: l.page, y: l.y, items: [{ b, l }] });
  }
  const rowHtml = (r) => {
    if (r.items.length === 1) return render(r.items[0].b, BODY_W);
    return `<div class="row">${r.items.map(({ b, l }) =>
      `<div class="cell" style="flex:${(l.w / BODY_W).toFixed(3)} 1 0">${render(b, l.w)}</div>`).join('')}</div>`;
  };
  // framed groups: consecutive rows made only of one group's members share its frame
  const groupCss = new Map();
  for (const b of ordered) {
    if (b.group && b.groupFrame && !groupCss.has(b.group)) {
      const css = blockCss({ style: b.groupFrame });
      if (css) groupCss.set(b.group, css);
    }
  }
  const rowGroup = (r) => {
    const g = r.items[0].b.group;
    return g && groupCss.has(g) && r.items.every(({ b }) => b.group === g) ? g : null;
  };
  const chunks = [];
  for (const r of rows) {
    const g = rowGroup(r);
    const last = chunks[chunks.length - 1];
    if (g && last?.g === g) last.html.push(rowHtml(r));
    else chunks.push({ g, html: [rowHtml(r)] });
  }
  const body = chunks.map((c) => (c.g
    ? `<div class="framed group" style="${groupCss.get(c.g)}">${c.html.join('\n')}</div>`
    : c.html.join('\n'))).join('\n');

  const logo = decodeImage(doc.logo) ? `<img class="logo" src="${esc(doc.logo)}" alt="">` : '';
  const fields = doc.nameLine !== false ? headerFields(doc, T) : [];
  const nameLine = fields.length
    ? `<div class="namebar">${fields.map((f) => `<label>${esc(f.label)}: <input${f.key === 'date' ? ' type="date"' : ''}${f.key === 'klass' && doc.className ? ` value="${esc(doc.className)}"` : ''}${f.key === 'date' && doc.date ? ` value="${esc(doc.date)}"` : ''}></label>`).join('')}</div>` : '';
  const scoreBar = total > 0
    ? `<div class="result">${esc(T.result)}: <b class="score-live">0</b> / ${esc(fmt(total, lang))} ${esc(T.points)} <button type="button" id="reset">${esc(T.reset)}</button></div>` : '';

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Lineatur ${VERSION}">
<title>${esc(doc.title || 'Worksheet')}</title>
<style>
${fontFaces(font, fontDir)}
:root{--accent:${accent};--ok:#1f8a4c;--bad:#c0392b}
*{box-sizing:border-box}
body{margin:0;background:#f3f5f9;color:#1d2433;font:${Math.round((Number(doc.fontSize) || 12) * 1.45)}px/1.5 ${JSON.stringify(font)},system-ui,sans-serif}
main{max-width:${Math.round(BODY_W * 3.78 + 64)}px;margin:24px auto;background:#fff;padding:28px 32px 40px;border-radius:8px;box-shadow:0 2px 14px rgba(20,30,60,.1)}
header{display:flex;align-items:flex-end;gap:16px;border-bottom:2px solid var(--accent);padding-bottom:6px;margin-bottom:12px}
header h1{margin:0;font-size:2em;line-height:1.1;flex:1}header .sub{display:block;font-size:.55em;font-weight:400;color:#667}
.logo{max-height:56px}
h2{color:var(--accent);border-bottom:1px solid var(--accent);padding-bottom:2px;font-size:1.3em;margin:1.3em 0 .5em}h2.norule{border-bottom:0}h3{font-size:1.1em;margin:1.1em 0 .4em}
.namebar{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px}.namebar label{display:flex;gap:6px;align-items:center;flex:1 1 160px}.namebar input{flex:1;min-width:0}
input,select,textarea,button{font:inherit}
input,select,textarea{border:1px solid #c5ccd8;border-radius:5px;padding:3px 6px;background:#fff;color:inherit}
textarea.write{width:100%;resize:vertical;margin:6px 0}
.ex{margin:16px 0;padding-top:4px}
.exhead{display:flex;gap:10px;align-items:flex-start}.exhead .q{flex:1}.num{background:var(--accent);color:#fff;font-weight:700;border-radius:4px;padding:0 8px}.pts{color:#667;font-size:.85em;white-space:nowrap}
.exfoot{display:flex;gap:12px;align-items:center;margin-top:6px}
.check,#reset{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:4px 12px;cursor:pointer}#reset{background:#667;margin-left:8px}
.feedback{font-weight:600}
.opts{display:flex;flex-direction:column;gap:4px;margin-left:34px}.opt{display:flex;gap:8px;align-items:baseline;padding:2px 6px;border-radius:5px}
.cloze{margin-left:34px;line-height:2}.gap{width:auto}
.right-ans{outline:2px solid var(--ok);background:#e3f4ea}.wrong-ans{outline:2px solid var(--bad);background:#fde7e7}
.sorting,.matching,.anagrams,.drill{margin-left:34px}.sorting li{list-style:none;margin:4px 0}
.matching{display:flex;gap:28px;flex-wrap:wrap}.matching ol,.matching ul{margin:0;padding-left:1.2em}.matching li{margin:4px 0}.matching ul{list-style:none}
.anagrams,.drill{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 18px}.anagrams label{display:flex;flex-direction:column;gap:3px}.scr{font-family:monospace;font-weight:700;letter-spacing:.25em}
.drill .numeric{width:5em}
details{margin:6px 0 6px 34px}summary{cursor:pointer;color:var(--accent)}.sol{background:#e3f4ea;border-left:3px solid var(--ok);padding:6px 10px;margin-top:4px}
.svg svg{max-width:100%;height:auto;display:block}
.math svg{display:inline-block;vertical-align:middle;height:auto;max-width:none}
.hnum{color:var(--accent)}.toc{margin:10px 0 16px}.toc ol{list-style:none;padding:0;margin:6px 0 0}.toc li{margin:3px 0}.toc li.l2{padding-left:1.5em}.toc li.l1{font-weight:600}.toc a{color:inherit;text-decoration:none;border-bottom:1px dotted #aab}.toc a:hover{color:var(--accent)}.licenses{margin-top:28px;font-size:.75em;color:#667}.licenses ul{margin:4px 0;padding-left:1.2em}
figure{margin:10px 0}figure img{max-width:100%;height:auto}figcaption{font-size:.85em}.credit{display:block;color:#888;font-size:.7em}
.row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}.cell{min-width:240px}
.framed{margin:10px 0}
.scorebox{margin:10px 0 10px auto;width:max-content;border:2px solid var(--accent);border-radius:6px;padding:4px 10px}
.result{position:sticky;bottom:0;background:#fff;border-top:1px solid #dde;padding:10px 0;margin-top:20px;text-align:right}
.warn{color:var(--bad)}
.lbl{font-weight:600;margin-top:8px}.info{border-radius:14px;padding:10px 14px;margin:10px 0}
.ttitle{font-weight:700;text-decoration:underline;margin:8px 0 4px}.tbl{border-collapse:collapse;width:100%;margin:4px 0 8px}.tbl td,.tbl th{padding:5px 8px;text-align:center}.tbl tr>*:first-child{text-align:left}
.tbl.filled td,.tbl.filled th{background:var(--cell);border:2px solid #fff}.tbl.grid td,.tbl.grid th{border:1px solid #999}.tbl.grid th{background:var(--cell)}.tbl.zebra tr:nth-child(even){background:var(--cell)}.tbl.zebra td+td,.tbl.zebra th+th{border-left:2px solid #333}
.tbl input{width:100%;min-width:3em;background:rgba(255,255,255,.7)}
.row-opts{flex-direction:row;flex-wrap:wrap;gap:4px 18px}
.wordbank{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 4px 34px;padding:6px 10px;border:1px solid #c5ccd8;border-radius:6px}
@media print{body{background:#fff}main{box-shadow:none;margin:0;max-width:none}.exfoot,.result,details{display:none}}
@media (max-width:600px){main{padding:16px;margin:0;border-radius:0}.opts,.cloze,.sorting,.matching,.anagrams,.drill,details{margin-left:0}}
</style>
</head>
<body>
<main>
${doc.headerFields?.position === 'below' ? '' : nameLine}
<header><h1>${esc(doc.title || '')}${doc.subtitle ? `<span class="sub">${esc(doc.subtitle)}</span>` : ''}</h1>${logo}</header>
${doc.headerFields?.position === 'below' ? nameLine : ''}
${body}
${scoreBar}
${(() => {
  const notes = ordered.map(licenseText).filter(Boolean);
  return notes.length ? `<footer class="licenses"><b>${esc(T.licenses)}</b><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></footer>` : '';
})()}
</main>
<script>
(() => {
  const norm = (s) => String(s).trim().toLowerCase().replace(/\\s+/g, ' ');
  const scores = new Map();
  const mark = (el, ok) => { el.classList.toggle('right-ans', ok); el.classList.toggle('wrong-ans', !ok); };
  const total = () => { let s = 0; scores.forEach((v) => (s += v)); return s; };
  const num = (v) => String(Math.round(v * 100) / 100).replace('.', '${lang === 'de' ? ',' : '.'}');
  function check(ex) {
    const kind = ex.dataset.kind;
    let right = 0, n = 0;
    if (kind === 'choice') {
      ex.querySelectorAll('.opt').forEach((o) => {
        const ok = o.querySelector('input').checked === (o.dataset.ok === '1');
        mark(o, ok); n++; if (ok) right++;
      });
    } else if (kind === 'gaps') {
      ex.querySelectorAll('.gap').forEach((g) => {
        const want = g.dataset.a;
        const ok = g.dataset.num
          ? Math.abs(Number(g.value.replace(',', '.').replace('−', '-')) - Number(want)) < 1e-9 && g.value.trim() !== ''
          : want.split('|').some((a) => norm(a) === norm(g.value));
        mark(g, ok); n++; if (ok) right++;
      });
    } else if (kind === 'picks') {
      ex.querySelectorAll('.pick').forEach((p) => { const ok = p.value === p.dataset.a; mark(p, ok); n++; if (ok) right++; });
    } else {
      ex.querySelector('details')?.setAttribute('open', '');
      return;
    }
    const pts = Number(ex.dataset.points) || 0;
    scores.set(ex.id, n ? (pts * right) / n : 0);
    ex.querySelector('.feedback').textContent = right + ' / ' + n + ' ${esc(T.correct)}' + (pts ? ' · ' + num(scores.get(ex.id)) + ' / ' + num(pts) : '');
    ex.querySelector('.feedback').style.color = right === n ? 'var(--ok)' : 'var(--bad)';
    document.querySelectorAll('.score-live').forEach((s) => (s.textContent = num(total())));
  }
  document.querySelectorAll('.ex .check').forEach((b) => b.addEventListener('click', () => check(b.closest('.ex'))));
  document.getElementById('reset')?.addEventListener('click', () => {
    document.querySelectorAll('.ex').forEach((ex) => {
      ex.querySelectorAll('input,select,textarea').forEach((i) => { if (i.type === 'checkbox') i.checked = false; else i.value = ''; });
      ex.querySelectorAll('.right-ans,.wrong-ans').forEach((e) => e.classList.remove('right-ans', 'wrong-ans'));
      ex.querySelector('.feedback').textContent = '';
    });
    scores.clear();
    document.querySelectorAll('.score-live').forEach((s) => (s.textContent = '0'));
  });
})();
</script>
</body>
</html>
`;
}
