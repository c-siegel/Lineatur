// JSON worksheet document -> Typst source.
//
// The editor only ever produces a plain JSON document. This file is the whole
// "layout engine": it numbers exercises, sums points, builds the grade scale and
// emits Typst markup. Student sheet and solution sheet come from the same source.
// The block bodies live in puzzles.js, mint.js and media.js.

import crypto from 'node:crypto';
import { getTheme } from './themes.js';
import {
  BODY_W, PAGE_W, PAGE_H, MARGIN_L, MARGIN_R, MARGIN_TOP, MARGIN_BOTTOM, MIRRORED, HEADER_GAP, isExercise, isTask,
  DEFAULT_FONT, layoutOf, readingOrder, applyGeometry, exLabel, headingNumbers, footerItems,
} from '../public/layout.js';
import { S, inline, fmt, num, clamp, shuffled, hexOf, paintOf, frameStyleOf, FILLS, STROKES, ACCENTS } from './typst-util.js';
import {
  wordsearchBody, crosswordBody, sortingBody, matchingBody, anagramBody, arithmeticBody,
} from './puzzles.js';
import { formulaBody, codeBody, functionBody, valueTableBody, treeBody } from './mint.js';
import { imageBody, qrBody, linesBody, squaresBody, scoreBody, infoBody, decodeImage } from './media.js';
import { tableBody, tchartBody } from './tables.js';
import { cycleBody, chainBody } from './diagrams.js';

export { buildWordSearch } from './puzzles.js';

export const LAB = {
  de: {
    name: 'Name', date: 'Datum', klass: 'Klasse', points: 'Punkte', pt: 'P.', pts: 'P.',
    solution: 'Lösung', task: 'Aufgabe', sum: 'Summe', max: 'Max.', got: 'Erreicht',
    rating: 'Bewertung', grade: 'Note', scale: 'Notenschlüssel', page: 'Seite',
    words: 'Gesuchte Wörter', from: 'ab', across: 'Waagerecht', down: 'Senkrecht',
    noImage: 'Bild auswählen', noQr: 'QR-Code: Text oder Link eingeben',
    check: 'Prüfen', showSolution: 'Lösung anzeigen', correct: 'richtig', yourAnswer: 'Deine Antwort',
    reset: 'Zurücksetzen', result: 'Ergebnis', bonus: 'ZP',
    toc: 'Inhaltsverzeichnis', noToc: 'Noch keine Überschriften für das Inhaltsverzeichnis', licenses: 'Lizenzhinweise',
    blocks: 'Bausteine', wordbank: 'Wortspeicher', fewItems: 'Mindestens zwei Einträge angeben',
  },
  en: {
    name: 'Name', date: 'Date', klass: 'Class', points: 'Points', pt: 'pt', pts: 'pts',
    solution: 'Solution', task: 'Task', sum: 'Total', max: 'Max.', got: 'Achieved',
    rating: 'Assessment', grade: 'Grade', scale: 'Grade scale', page: 'Page',
    words: 'Words to find', from: 'from', across: 'Across', down: 'Down',
    noImage: 'Choose an image', noQr: 'QR code: enter a text or link',
    check: 'Check', showSolution: 'Show solution', correct: 'correct', yourAnswer: 'Your answer',
    reset: 'Reset', result: 'Result', bonus: 'bonus',
    toc: 'Contents', noToc: 'No headings for the table of contents yet', licenses: 'Licence notes',
    blocks: 'Building blocks', wordbank: 'Word bank', fewItems: 'Enter at least two items',
  },
};

// Share of total points needed for grades 1..5 (German scale, grade 6 = below).
export const GRADE_THRESHOLDS = [92, 81, 67, 50, 30];

/** Name / class / date fields of the header, in display order, with their (editable) labels. */
export const HEADER_FIELDS = ['name', 'klass', 'date'];
export function headerFields(doc, T) {
  const cfg = doc.headerFields || {};
  return HEADER_FIELDS
    .filter((k) => cfg[k]?.show !== false)
    .map((k) => ({ key: k, label: String(cfg[k]?.label ?? '').trim() || T[k] }));
}

// Room taken by the exercise number badge and the points column (mm).
const EX_CHROME = 28;
// Room taken by a block frame / background (inset on both sides, mm).
const FRAME_INSET = 5.5;

// ---------------------------------------------------------------- preamble --

// Exercise number styles (Document → Content → Numbering). The number stands on the baseline of the
// exercise's first line: frames reach above and below it (outset) instead of making the line taller.
const BADGES = {
  filled: 'box(fill: accent, radius: 3pt, inset: (x: 6pt), outset: (y: 3pt), text(fill: white, weight: "bold", n))',
  circle: `context {
  let c = circle(stroke: 0.9pt + accent, inset: 1.5pt, align(center + horizon, text(fill: accent, weight: "bold", n)))
  let s = measure(c)
  box(width: s.width, height: measure[0].height, place(left + horizon, box(width: s.width, height: s.height, c)))
}`,
  box: 'box(stroke: 0.9pt + accent, radius: 2pt, inset: (x: 4.5pt), outset: (y: 2.5pt), text(fill: accent, weight: "bold", n))',
  plain: 'text(fill: accent, weight: "bold", size: 1.1em, n)',
};

// Gap styles for cloze texts, arithmetic results and anagrams (Document → Content → Gaps).
const GAPS = {
  line: { box: 'stroke: (bottom: 0.6pt + luma(60))', h: '1.05em', base: '0pt' },
  dotted: { box: 'stroke: (bottom: (paint: luma(60), thickness: 0.9pt, dash: "dotted"))', h: '1.05em', base: '0pt' },
  box: { box: 'stroke: 0.6pt + luma(110), radius: 2pt', h: '1.35em', base: '0.3em' },
  filled: { box: 'fill: luma(228), radius: 2pt', h: '1.35em', base: '0.3em' },
  bracket: { box: 'stroke: (bottom: 0.7pt + luma(70), left: 0.7pt + luma(70), right: 0.7pt + luma(70)), radius: (bottom-left: 5pt, bottom-right: 5pt)', h: '0.6em', base: '0pt' },
};

function gapHelpers(doc) {
  const g = doc.gaps || {};
  const st = GAPS[g.style] || GAPS.line;
  const font = g.font ? `font: (${S(g.font)}, "Libertinus Serif"), ` : '';
  const size = Number(g.size) > 0 ? `size: ${clamp(Number(g.size), 6, 24)}pt, ` : '';
  return `#let gap-blank(w) = box(width: w, height: ${st.h}, baseline: ${st.base}, ${st.box})
#let gap-sol(body) = box(baseline: ${st.base}, inset: (x: 3pt, bottom: 1pt, top: ${st.base === '0pt' ? '0pt' : '2pt'}), ${st.box},
  text(${font}${size}fill: ok, weight: "bold", body))`;
}

const preambleFor = (accent, badge = 'filled') => `
#let accent = rgb("${accent}")
#let soft = accent.lighten(88%)
#let ok = rgb("#c8372d")
#let ok-soft = rgb("#fbe9e6")
#let fill-line = box(width: 1fr, height: 1em, stroke: (bottom: 0.5pt + luma(120)))

#let diff-dots(d) = {
  for i in range(3) {
    box(baseline: 1pt, circle(radius: 2.3pt, fill: if i < d { accent } else { none }, stroke: 0.7pt + accent))
    h(1.6pt)
  }
}

#let num-badge(n) = ${BADGES[badge] || BADGES.filled}

// Number and points stand on the baseline of the body's first line: the strut gives their line the
// same height above the baseline (a cap height, or the height of a gap when the first line has one).
#let ex-strut(rise) = box(width: 0pt, if rise == none { hide[H] } else { box(height: rise) })
#let ex-box(n, pts, d, body, rise: none) = block(width: 100%, breakable: false, above: 1.3em, below: 0.5em)[
  #grid(columns: (auto, 1fr, auto), column-gutter: 9pt,
    align: (left + top, left + top, right + top),
    [#ex-strut(rise)#num-badge(n)], body, [#ex-strut(rise)#{
      if pts != "" { text(size: 9pt, fill: luma(90), pts) }
      if d > 0 { h(5pt); diff-dots(d) }
    }])
]

#let h-one(body, rule: true) = block(width: 100%, above: 1.5em, below: 0.7em, breakable: false,
  stack(spacing: 3pt, text(size: 1.27em, weight: "bold", fill: accent, body),
    if rule { line(length: 100%, stroke: 0.9pt + accent) }))
#let h-two(body) = block(above: 1.2em, below: 0.5em, text(size: 1.09em, weight: "bold", body))

// Heading blocks are real headings (for the table of contents and PDF bookmarks), styled like h-one / h-two.
#show heading.where(level: 1): it => h-one(it.body)
#show heading.where(level: 2): it => h-two(it.body)

#let ans-lines(n) = {
  for i in range(n) {
    v(1.55em)
    line(length: 100%, stroke: 0.5pt + luma(170))
  }
}

#let sol-box(body) = block(width: 100%, fill: ok-soft, stroke: (left: 2pt + ok),
  inset: 7pt, radius: 2pt, text(fill: ok.darken(35%), body))
`;

/** Decorative page frame drawn behind the content. */
function pageFrame(doc) {
  const f = doc.pageFrame || {};
  const style = f.style || 'none';
  const tint = paintOf(doc.pageTint, FILLS);
  if (style === 'none' && !tint) return '';
  const color = paintOf(f.color, STROKES) || 'luma(120)';
  const inset = Math.max(5, Math.min(MARGIN_L, MARGIN_R) / 2 - 1);
  const w = PAGE_W - 2 * inset;
  const h = PAGE_H - 2 * inset;
  const rect = (o, extra) => `place(top + left, dx: ${inset + o}mm, dy: ${inset + o}mm, rect(width: ${w - 2 * o}mm, height: ${h - 2 * o}mm, ${extra}))`;
  const parts = [];
  if (tint) parts.push(`place(top + left, rect(width: 100%, height: 100%, fill: ${tint}, stroke: none))`);
  if (style === 'line') parts.push(rect(0, `stroke: 1pt + ${color}`));
  if (style === 'thick') parts.push(rect(0, `stroke: 2.5pt + ${color}`));
  if (style === 'double') parts.push(rect(0, `stroke: 1.4pt + ${color}`), rect(1.6, `stroke: 0.5pt + ${color}`));
  if (style === 'rounded') parts.push(rect(0, `stroke: 1.2pt + ${color}, radius: 5mm`));
  if (style === 'dashed') parts.push(rect(0, `stroke: (paint: ${color}, thickness: 1pt, dash: "dashed"), radius: 3mm`));
  if (style === 'dotted') parts.push(rect(0, `stroke: (paint: ${color}, thickness: 2pt, dash: "loosely-dotted", cap: "round")`));
  if (style === 'corners') {
    const L = 14;
    const corner = (x, y, sx, sy) => `place(top + left, curve(stroke: 2pt + ${color}, curve.move((${x + sx * L}mm, ${y}mm)), curve.line((${x}mm, ${y}mm)), curve.line((${x}mm, ${y + sy * L}mm))))`;
    parts.push(
      corner(inset, inset, 1, 1), corner(PAGE_W - inset, inset, -1, 1),
      corner(inset, PAGE_H - inset, 1, -1), corner(PAGE_W - inset, PAGE_H - inset, -1, -1),
    );
  }
  return parts.join('\n    ');
}

// ------------------------------------------------------------------ context --

/** Everything the block renderers need, computed once per document. */
export function prepare(doc, { solutions = false, assets = new Map(), warnings } = {}) {
  applyGeometry(doc);
  const lang = LAB[doc.lang] ? doc.lang : 'de';
  const free = doc.layoutMode === 'free';
  // hidden blocks (eye icon in the layers panel) are left out entirely
  const blocks = (Array.isArray(doc.blocks) ? doc.blocks : []).filter((b) => !b.hidden);
  // In a free layout the visual position decides the order (and the numbering).
  const ordered = free ? readingOrder(blocks) : blocks;

  // Number the exercises and add up the points.
  const exInfo = new Map();
  const exercises = [];
  let total = 0;
  let bonusTotal = 0;
  // numbering may restart at every section heading (the booklet numbers (1), (2), … per mission)
  const restart = !!doc.numbering?.restart;
  let inSection = 0;
  for (const b of ordered) {
    if (restart && b.type === 'heading' && parseInt(b.level) !== 2) inSection = 0;
    if (!isExercise(b) || b.numbered === false) continue;
    const pts = Math.max(0, Number(b.points) || 0);
    const bonus = Math.max(0, Number(b.bonus) || 0);
    const n = exercises.length + 1;
    inSection++;
    const e = { n, label: exLabel(restart ? inSection : n, doc.numbering?.format), pts, bonus };
    exercises.push(e);
    exInfo.set(b, e);
    total += pts;
    bonusTotal += bonus;
  }

  // Heading numbers (Document → Content) and the headings a table of contents lists.
  const headNums = headingNumbers(ordered, doc.headingNumbering);
  const tocHeadings = ordered.filter((b) => b.type === 'heading' && b.toc !== false)
    .map((b) => ({ id: b.id, level: parseInt(b.level) === 2 ? 2 : 1, prefix: headNums.get(b.id) || '', text: b.text || '' }));

  const ctx = {
    fontSize: clamp(num(doc.fontSize, 12), 8, 20),
    gapRise: ((st) => `${st.h} - ${st.base}`)(GAPS[doc.gaps?.style] || GAPS.line), // height of a gap above the baseline
    themed: !!getTheme(doc.theme), free, lang, T: LAB[lang], sol: !!solutions, total, bonusTotal, assets, headNums, tocHeadings, exercises, restart,
    points: { ...(doc.points || {}) },
    /** A problem with one block, shown in the editor's inspector (not on the sheet). */
    warn: (id, text) => warnings?.set(id, text),
    addAsset(bytes, ext) {
      const path = `/assets/${crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 20)}.${ext}`;
      this.assets.set(path, bytes);
      return path;
    },
  };
  return { ctx, ordered, exInfo, exercises, total, free };
}

const SYMBOLS = { star: '☆', check: '✓', diamond: '◆', flag: '⚑' };

/** "3 P." / "☆ 3 GP" / "+1 ZP" next to an exercise (Document → Content → Points). */
export function pointsLabel(e, ctx) {
  const p = ctx.points;
  const sp = p.narrow ? ' ' : ' ';
  const part = (v, abbr, sym) => `${SYMBOLS[sym] ? SYMBOLS[sym] + ' ' : ''}${fmt(v, ctx.lang)}${sp}${abbr}`;
  const out = [];
  if (e.pts > 0) out.push(part(e.pts, p.abbr || (e.pts === 1 ? ctx.T.pt : ctx.T.pts), p.symbol));
  if (e.bonus > 0) out.push('+' + part(e.bonus, p.bonusAbbr || ctx.T.bonus, p.bonusSymbol));
  return out.join(' ');
}

/** 2026-10-13 -> 13.10.2026 (de) / 2026-10-13 (en). */
export function formatDate(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return lang === 'de' ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}


/** Booklet with a front cover: page numbers start on the second page with 1. */
export const coverOffset = (doc) => (doc.booklet?.on && doc.booklet.cover ? 1 : 0);
const backCover = (doc) => (doc.booklet?.on && doc.booklet.backCover ? 1 : 0);

/** Header or footer entries (title, footer text, page number, date, class or free text) in
 *  three zones; on double-sided pages left and right swap on the left-hand (even) pages.
 *  extra: markup added per zone (the design's logo), valign: vertical alignment of the zones. */
function zonesMarkup(doc, ctx, items, extra = {}, valign = 'top') {
  const off = coverOffset(doc);
  const pageNo = off ? `#str(here().page() - ${off})` : '#counter(page).display()';
  const pageCount = `#str(counter(page).final().first() - ${off + backCover(doc)})`;
  const one = (it) => {
    switch (it.kind) {
      case 'title': return `#${S(doc.pathTitle || doc.title || '')}`;
      case 'path': return `#${S(doc.pathTitle || '')}`;
      case 'page': return `#${S(ctx.T.page)} ${pageNo} / ${pageCount}`;
      case 'date': return `#${S(formatDate(doc.date, ctx.lang))}`;
      case 'class': return `#${S(doc.className || '')}`;
      case 'text': return `#${S(it.text || '')}`;
      default: return '';
    }
  };
  const zones = { left: [...(extra.left || [])], center: [], right: [] };
  for (const it of items) {
    const m = one(it);
    if (m) zones[it.zone].push(m);
  }
  zones.right.push(...(extra.right || []));
  const [l, c, r] = ['left', 'center', 'right'].map((z) => `[${zones[z].join(' #h(1.2em) ')}]`);
  const grid = (a, b) => `grid(columns: (1fr, auto, 1fr), align: (left + ${valign}, center + ${valign}, right + ${valign}), ${a}, ${c}, ${b})`;
  return MIRRORED
    ? `#context if calc.even(here().page()) { ${grid(r, l)} } else { ${grid(l, r)} }`
    : `#${grid(l, r)}`;
}

const footerMarkup = (doc, ctx) => zonesMarkup(doc, ctx, footerItems(doc));

export const DESIGN_SHAPES = ['none', 'corners', 'band', 'side'];

/**
 * Own page design (Dokument → Seite → Seitendesign → Eigenes Design), built from settings only:
 * two colours, a shape on every page, a header with zones like the footer, and a logo.
 * Returns { background, header } as Typst code (header null when it would be empty).
 * hide: Typst condition for pages without header (the covers of a booklet).
 */
function designParts(doc, ctx, hide) {
  const d = doc.design || {};
  const c1 = `rgb("${hexOf(d.color, ACCENTS, 'blue')}")`;
  const c2 = `rgb("${hexOf(d.color2, ACCENTS, 'gray')}")`;
  // the outer edge of the page: always right, or alternating on double-sided pages
  const outer = MIRRORED ? 'not calc.even(here().page())' : 'true';
  const tri = (len, fill) => `if r { polygon(fill: ${fill}, (${len}mm, 0mm), (${len}mm, ${len}mm), (0mm, ${len}mm)) } else { polygon(fill: ${fill}, (0mm, 0mm), (${len}mm, ${len}mm), (0mm, ${len}mm)) }`;
  const shapes = {
    corners: `context {
    let r = ${outer}
    let at = if r { bottom + right } else { bottom + left }
    place(at, ${tri(54, c2)})
    place(at, ${tri(38, c1)})
  }`,
    band: `place(top + left, rect(width: 100%, height: 6mm, fill: ${c1}))
    place(top + left, dy: 6mm, rect(width: 100%, height: 1.2mm, fill: ${c2}))`,
    side: `context {
    let r = ${outer}
    place(if r { top + right } else { top + left }, rect(width: 5mm, height: 100%, fill: ${c1}))
    place(if r { top + right } else { top + left }, dx: if r { -6.5mm } else { 6.5mm }, rect(width: 0.8mm, height: 100%, fill: ${c2}))
  }`,
  };
  const logo = decodeImage(d.logo);
  const extra = {};
  if (logo) extra[d.logoPos === 'left' ? 'left' : 'right'] = [`#box(image(${S(ctx.addAsset(logo.bytes, logo.ext))}, height: 7mm))`];
  const items = footerItems(doc, 'header');
  const skip = [hide, d.firstPage === false ? 'here().page() == 1' : ''].filter(Boolean).join(' or ');
  const header = items.length || logo ? `context ${skip ? `if ${skip} { none } else ` : ''}[
    #set text(size: 8pt, fill: ${c1})
    ${zonesMarkup(doc, ctx, items, extra, 'horizon')}${d.line !== false ? `
    #v(-2pt)
    #line(length: 100%, stroke: 0.6pt + ${c2})` : ''}
  ]` : null;
  return { background: shapes[d.shape] || '', header };
}

/** Short mark in the middle of the binding edge, as a guide for the hole punch. */
function punchMark() {
  const y = (PAGE_H / 2).toFixed(1);
  const even = 'calc.even(here().page())';
  const side = MIRRORED ? `if ${even} { right } else { left }` : 'left';
  const dx = MIRRORED ? `if ${even} { -4mm } else { 4mm }` : '4mm';
  return `context place(top + (${side}), dx: ${dx}, dy: ${y}mm, line(length: 5mm, stroke: 0.6pt + luma(140)))`;
}

/** What a page design (src/themes.js) gets to build its page arguments: page size, the
 *  booklet's cover pages, a Typst string literal and an image from a data URL. */
function pageTools(doc, ctx) {
  return {
    width: PAGE_W, height: PAGE_H, cover: !!coverOffset(doc), backCover: !!backCover(doc), S,
    image(src, heightMm) {
      const img = decodeImage(src);
      return img ? `image(${S(ctx.addAsset(img.bytes, img.ext))}, height: ${heightMm}mm)` : 'none';
    },
  };
}

/** Preamble plus page and text setup. `page` overrides the page setup (HTML export). */
export function documentSetup(doc, ctx, page) {
  const font = String(doc.font || DEFAULT_FONT);
  const size = clamp(num(doc.fontSize, 12), 8, 20);
  const accent = hexOf(doc.accent, ACCENTS, 'blue');
  const theme = getTheme(doc.theme); // an installed page design; unknown names fall back to none
  const margin = MIRRORED
    ? `(inside: ${MARGIN_L}mm, outside: ${MARGIN_R}mm, top: ${MARGIN_TOP}mm, bottom: ${MARGIN_BOTTOM}mm)`
    : `(left: ${MARGIN_L}mm, right: ${MARGIN_R}mm, top: ${MARGIN_TOP}mm, bottom: ${MARGIN_BOTTOM}mm)`;
  // no footer on the covers of a booklet
  const noFooter = [coverOffset(doc) ? 'here().page() == 1' : '',
    backCover(doc) ? '(here().page() > 1 and here().page() == counter(page).final().first())' : ''].filter(Boolean).join(' or ');
  const design = doc.theme === 'custom' ? designParts(doc, ctx, noFooter) : null;
  const background = [design?.background, pageFrame(doc), doc.punchMarks ? punchMark() : ''].filter(Boolean).join('\n    ');
  const footer = `context ${noFooter ? `if ${noFooter} { none } else ` : ''}[
    #set text(size: 8pt, fill: luma(130))
    ${footerMarkup(doc, ctx)}
  ]`;
  const pageSetup = page || (theme
    ? `#set page(width: ${PAGE_W}mm, height: ${PAGE_H}mm, margin: ${margin},
  ..${theme.page(doc, pageTools(doc, ctx))})`
    : `#set page(width: ${PAGE_W}mm, height: ${PAGE_H}mm,
  margin: ${margin},${background ? `\n  background: {\n    ${background}\n  },` : ''}${design?.header ? `\n  header: ${design.header},` : ''}
  footer: ${footer})`);
  const keywords = [doc.meta?.subject, doc.meta?.grade]
    .filter(Boolean).map(S).join(', ');
  const title = ctx.sol && doc.solutionTitle ? doc.solutionTitle : doc.title;
  return `${preambleFor(accent, doc.numbering?.style)}
${gapHelpers(doc)}
${theme ? theme.setup(theme.dir) : ''}
#set document(title: ${S(title || '')}${doc.description ? `, description: ${S(doc.description)}` : ''}${keywords ? `, keywords: (${keywords},)` : ''})
${pageSetup}
#set text(font: (${S(font)}, "Libertinus Serif", "DejaVu Sans Mono"), size: ${size}pt, lang: ${S(ctx.lang)}${doc.hyphenate ? ', hyphenate: true' : ''})
#set par(justify: false, leading: 0.65em, spacing: 0.9em)
${doc.mathFont ? `#show math.equation: set text(font: (${S(font)}, "New Computer Modern Math"))` : ''}
`;
}

/** Text block: size (klein / normal / groß / Titel), alignment, bold and italic. */
export const TEXT_SIZES = { small: 0.85, large: 1.3, title: 2.2 };
function textBody(b) {
  const opts = [TEXT_SIZES[b.size] ? `size: ${TEXT_SIZES[b.size]}em` : '', b.bold ? 'weight: "bold"' : '', b.italic ? 'style: "italic"' : ''].filter(Boolean);
  let m = inline(b.text);
  if (opts.length) m = `#text(${opts.join(', ')})[${m}]`;
  const align = { center: 'center', right: 'right' }[b.align];
  return align ? `#align(${align})[${m}]` : m;
}

// ------------------------------------------------------------------- main --

export function toTypst(doc, { solutions = false, assets, warnings } = {}) {
  const { ctx, ordered, exInfo, exercises, total, free } = prepare(doc, { solutions, assets, warnings });
  const { T, lang, sol } = ctx;

  const out = [documentSetup(doc, ctx)];

  // Header (title, logo, name line). Defined once so the free layout can measure it.
  const right = sol
    ? `#box(fill: ok-soft, inset: (x: 8pt, y: 4pt), radius: 3pt, text(fill: ok, weight: "bold")[#${S(T.solution)}])`
    : total > 0
      ? `#text(size: 10pt)[#${S(T.points + ':')} #box(width: 1.5cm, height: 1em, stroke: (bottom: 0.5pt + luma(120))) / #${S(fmt(total, lang) + (ctx.bonusTotal > 0 ? ` (+${fmt(ctx.bonusTotal, lang)} ${ctx.points.bonusAbbr || T.bonus})` : ''))}]`
      : '';
  const logo = decodeImage(doc.logo);
  const logoMarkup = logo ? `#image(${S(ctx.addAsset(logo.bytes, logo.ext))}, height: ${clamp(num(doc.logoHeight, 14), 6, 30)}mm)` : '';
  const sub = doc.subtitle
    ? `#linebreak()#text(size: 1em, fill: luma(100))[#${S(doc.subtitle)}]`
    : '';
  // a line to write on, or the value set in Document → Info / the header inspector
  const filled = (v) => (v ? `#box(width: 1fr, stroke: (bottom: 0.5pt + luma(120)), inset: (bottom: 1pt), ${S(v)})` : '#fill-line');
  const values = { name: '', klass: doc.className, date: formatDate(doc.date, lang) };
  const widths = { name: '2.2fr', klass: '1fr', date: '1fr' };
  const fields = doc.nameLine !== false && !sol ? headerFields(doc, T) : [];
  const nameGrid = fields.length
    ? `#grid(columns: (${fields.map((f) => widths[f.key]).join(', ')},), column-gutter: 14pt,
  ${fields.map((f) => `[#${S(f.label + ':')} ${filled(values[f.key])}]`).join(', ')})`
    : '';
  // 'top': above the title (default), 'below': under the accent line
  const below = doc.headerFields?.position === 'below';
  // the title header can be switched off (e.g. for an own title page built from blocks)
  const noHeader = doc.titleHeader === false;
  const hgap = noHeader ? 0 : HEADER_GAP;
  if (noHeader) out.push('#let HEADER = []');
  else out.push(`#let HEADER = [
${nameGrid && !below ? `${nameGrid}\n#v(8pt)` : ''}
#grid(columns: (1fr, auto), column-gutter: 10pt, align: (left + bottom, right + bottom),
  [#text(size: 2em, weight: "bold")[#${S((sol && doc.solutionTitle) || doc.title || '')}]${sub}],
  [${logoMarkup ? `#stack(dir: ltr, spacing: 10pt, align(bottom, [${right}]), [${logoMarkup}])` : right}])
#v(2pt)
#line(length: 100%, stroke: 1.2pt + accent)
${nameGrid && below ? `#v(6pt)\n${nameGrid}` : ''}
]`);

  // Old documents: exam mode without an assessment block puts the table at the end.
  const legacyExam = doc.exam && !(doc.blocks || []).some((b) => b.type === 'assessment');
  const assessment = legacyExam && exercises.length && total > 0
    ? assessmentMarkup({}, ctx)
    : '';

  // Grouped blocks can share a frame and background ("Rahmen & Hintergrund" of the group).
  // It is stored on every member as groupFrame, so copies and undo keep it.
  const groupFrames = new Map();
  for (const b of ordered) {
    if (!b.group || !b.groupFrame || groupFrames.has(b.group)) continue;
    const f = frameOf({ style: b.groupFrame });
    if (f) groupFrames.set(b.group, f);
  }
  // a page break cannot sit inside a frame
  const inGroupFrame = (b) => !!b && groupFrames.has(b.group) && b.type !== 'pagebreak';
  ctx.groupFrames = groupFrames;

  if (!free) {
    // Invisible position markers (they do not change the layout) tell the
    // editor where each block (and the header) landed, so it can be selected on the page.
    const mark = (id, edge) =>
      `#context [#metadata((id: ${S(id)}, e: "${edge}", page: here().page(), y: here().position().y.mm())) <bp>]`;
    const marked = (b, width) => {
      const m = blockMarkup(b, exInfo.get(b), ctx, width);
      return m ? `${mark(b.id, 's')}\n${m}\n${mark(b.id, 'e')}` : '';
    };
    if (!noHeader) out.push(`${mark('__header', 's')}\n#HEADER\n${mark('__header', 'e')}`);
    for (let i = 0; i < ordered.length; i++) {
      const b = ordered[i];
      // "Auf neuer Seite beginnen" (flow layout; in the grid layout the page is set by position)
      if (inGroupFrame(b)) {
        // consecutive members of a framed group go into one frame
        const parts = [];
        let j = i;
        for (; j < ordered.length && ordered[j].group === b.group && inGroupFrame(ordered[j]); j++) {
          const m = marked(ordered[j], BODY_W - FRAME_INSET);
          if (m) parts.push(m);
        }
        if (parts.length && b.newPage) out.push('#pagebreak(weak: true)');
        if (parts.length) out.push(`#block(width: 100%, inset: 7pt, ${groupFrames.get(b.group)})[\n${parts.join('\n\n')}\n]`);
        i = j - 1;
        continue;
      }
      const m = marked(b, BODY_W);
      if (m && b.newPage) out.push('#pagebreak(weak: true)');
      if (m) out.push(m);
    }
    if (assessment) out.push(assessment);
    return out.join('\n\n') + '\n';
  }

  // ---- free layout: every block is placed absolutely on its page ----------
  // Drawn in the order of doc.blocks (the stacking order of the layers panel: later ones
  // lie on top); numbering and the HTML export follow the reading order instead.
  const stacked = (Array.isArray(doc.blocks) ? doc.blocks : []).filter((b) => !b.hidden);
  const withLayout = stacked.map((b) => ({ b, l: layoutOf(b) }));
  const headerOffset = (p) => (p === 0 ? `measure(block(width: ${BODY_W}mm, HEADER)).height + ${hgap}mm` : '0pt');

  /** Frames of the framed groups on one page, drawn behind their members: exactly the box
   *  around all members (their heights measured by Typst), like the frame of a single block;
   *  the members keep the frame's inner spacing themselves (see blockMarkup). */
  function groupFrameMarkup(onPage, p) {
    const byGroup = new Map();
    for (const e of onPage) if (inGroupFrame(e.b)) byGroup.set(e.b.group, [...(byGroup.get(e.b.group) || []), e]);
    const parts = [];
    for (const [g, members] of byGroup) {
      const bottoms = members.flatMap(({ b, l }) => {
        const m = blockMarkup(b, exInfo.get(b), ctx, l.w);
        return m ? [`${num(l.y)}mm + calc.max(measure(block(width: ${num(l.w)}mm, breakable: false)[\n${m}\n]).height, ${num(l.h || 0)}mm)`] : [];
      });
      if (!bottoms.length) continue;
      const x0 = Math.min(...members.map((e) => e.l.x));
      const x1 = Math.max(...members.map((e) => e.l.x + e.l.w));
      const y0 = Math.min(...members.map((e) => e.l.y));
      parts.push(`#context {
  let bottom = calc.max(${bottoms.join(',\n    ')})
  let hh = ${headerOffset(p)}
  place(top + left, dx: ${num(x0)}mm, dy: hh + ${num(y0)}mm,
    block(width: ${num(x1 - x0)}mm, height: bottom - ${num(y0)}mm, ${groupFrames.get(g)}))
}`);
    }
    return parts;
  }
  const pageCount = Math.max(
    1,
    parseInt(doc.pageCount) || 1,
    ...withLayout.map((e) => e.l.page + 1),
  );

  for (let p = 0; p < pageCount; p++) {
    if (p > 0) out.push('#pagebreak()');
    // Zero-size anchor so that an empty page still exists.
    out.push('#place(top + left, box(width: 0pt, height: 0pt))');
    if (p === 0) {
      out.push(`#context {
  [#metadata((id: "__header", h: measure(block(width: ${BODY_W}mm, HEADER)).height.mm() + ${hgap})) <bh>]
  HEADER
}`);
    }
    out.push(...groupFrameMarkup(withLayout.filter((e) => e.l.page === p), p));
    for (const { b, l } of withLayout) {
      if (l.page !== p) continue;
      const markup = blockMarkup(b, exInfo.get(b), ctx, l.w);
      if (!markup) continue;
      // A block dragged taller than its content keeps that height (a frame stretches with it);
      // n reports the content's own height, so the editor knows how far it can shrink.
      const body = l.h
        ? `let nat = measure(block(width: ${num(l.w)}mm, breakable: false)[
${markup}
  ])
  let body = block(width: ${num(l.w)}mm, height: calc.max(nat.height, ${num(l.h)}mm), breakable: false)[
${blockMarkup(b, exInfo.get(b), ctx, l.w, { stretch: true })}
  ]`
        : `let body = block(width: ${num(l.w)}mm, breakable: false)[
${markup}
  ]`;
      out.push(`#context {
  ${body}
  let m = measure(body)
  let hh = ${p === 0 ? `measure(block(width: ${BODY_W}mm, HEADER)).height + ${hgap}mm` : '0pt'}
  place(top + left, dx: ${num(l.x)}mm, dy: hh + ${num(l.y)}mm, {
    body
    [#metadata((id: ${S(b.id)}, h: m.height.mm()${l.h ? ', n: nat.height.mm()' : ''})) <bh>]
  })
}`);
    }
    if (p === pageCount - 1 && assessment) {
      out.push(`#context {
  let body = block(width: ${BODY_W}mm, breakable: false)[
${assessment}
  ]
  place(bottom + left, {
    body
    [#metadata((id: "__exam", h: measure(body).height.mm())) <bh>]
  })
}`);
    }
  }
  return out.join('\n\n') + '\n';
}

// ------------------------------------------------------------------ blocks --

const BODIES = {
  choice: choiceBody,
  cloze: clozeBody,
  wordsearch: wordsearchBody,
  crossword: crosswordBody,
  sorting: sortingBody,
  matching: matchingBody,
  anagram: anagramBody,
  arithmetic: arithmeticBody,
  cycle: cycleBody,
  chain: chainBody,
};
const CONTENT = {
  heading: headingMarkup,
  toc: tocMarkup,
  text: textBody,
  image: imageBody,
  qr: qrBody,
  lines: linesBody,
  squares: squaresBody,
  score: scoreBody,
  assessment: assessmentMarkup,
  formula: formulaBody,
  code: codeBody,
  function: functionBody,
  valuetable: valueTableBody,
  tree: treeBody,
  table: tableBody,
  tchart: tchartBody,
  infobox: infoBody,
  // page break (flow layout; in the grid layout every block already sits on its page)
  // the zero-size anchor keeps the new page even when the next block starts a new page itself
  pagebreak: (b, ctx) => (ctx.free ? '' : '#pagebreak()\n#box(width: 0pt, height: 0pt)'),
};

export const BLOCK_TYPES = new Set([...Object.keys(BODIES), ...Object.keys(CONTENT)]);

/** A real Typst heading (so it can appear in the table of contents), with its number. */
function headingMarkup(b, ctx) {
  const level = parseInt(b.level) === 2 ? 2 : 1;
  const inToc = b.toc !== false;
  const num = ctx.headNums.get(b.id);
  const markup = `#heading(level: ${level}, outlined: ${inToc}, bookmarked: ${inToc})[${num ? `#${S(num)} ` : ''}${inline(b.text)}]`;
  // Without the line under it: a scoped show rule, so the heading stays a real heading.
  return level === 1 && b.rule === false && !ctx.themed ? `#[#show heading.where(level: 1): it => h-one(it.body, rule: false)
${markup}]` : markup;
}

/** Table of contents of the heading blocks, with page numbers and leader dots. */
function tocMarkup(b, ctx) {
  const depth = parseInt(b.depth) === 1 ? 1 : 2;
  const title = b.title ?? ctx.T.toc;
  const head = title ? `#text(size: 1.09em, weight: "bold", fill: accent)[#${S(title)}]\n#v(1pt)\n` : '';
  if (!ctx.tocHeadings.some((x) => x.level <= depth)) {
    return `${head}#text(size: 9pt, fill: luma(140), style: "italic", ${S(ctx.T.noToc)})`;
  }
  const pages = b.pageNumbers !== false;
  return `${head}#block(width: 100%)[
  #set outline.entry(fill: ${pages && b.dots !== false ? 'repeat([.], gap: 0.15em)' : 'none'})
  #show outline.entry.where(level: 1): set text(weight: "bold")
  #show outline.entry.where(level: 1): set block(above: 0.75em)
  ${pages ? '' : '#show outline.entry: it => link(it.element.location(), it.indented(none, it.body()))'}
  #outline(title: none, depth: ${depth}, indent: 1.5em)
]`;
}

/** Frame and background of a single block. */
function frameOf(b) {
  const st = frameStyleOf(b);
  const fill = paintOf(st.fill, FILLS);
  const color = paintOf(st.color, STROKES) || 'luma(150)';
  const stroke = {
    solid: `0.8pt + ${color}`,
    thick: `2pt + ${color}`,
    dashed: `(paint: ${color}, thickness: 0.9pt, dash: "dashed")`,
    dotted: `(paint: ${color}, thickness: 1.2pt, dash: "dotted")`,
    left: `(left: 3pt + ${color})`,
    card: `1.6pt + ${color}`,
  }[st.frame] || null;
  if (!fill && !stroke) return null;
  return `fill: ${fill || 'none'}, stroke: ${stroke || 'none'}, radius: ${{ left: 0, card: 9 }[st.frame] ?? 4}pt`;
}

/** Markup for one block (no placement). Returns '' for unknown types. */
export function blockMarkup(b, e, ctx, availMm, { stretch = false, bare = false } = {}) {
  const frame = frameOf(b);
  // grid layout: a member of a framed group keeps the same inner spacing as a framed single
  // block, so the shared frame (drawn on the members' outline) looks like a block frame
  const grouped = !!ctx.free && b.type !== 'pagebreak' && !!ctx.groupFrames?.has(b.group);
  const inner = availMm - (frame ? FRAME_INSET : 0) - (grouped ? FRAME_INSET : 0);
  let markup = '';
  if (CONTENT[b.type] && isTask(b) && !bare) {
    // a content block used as a task: the instruction above it, number and points beside it
    // (bare: the content alone, for the HTML export, which shows number and instruction itself)
    const content = CONTENT[b.type](b, ctx, e ? Math.max(20, inner - EX_CHROME) : inner);
    const instruction = b.type !== 'text' && String(b.taskText || '').trim() ? `${inline(b.taskText)}\n\n#v(1pt)\n` : '';
    const body = instruction + content;
    const d = Math.min(3, Math.max(0, parseInt(b.difficulty) || 0));
    markup = e ? `#ex-box(${S(e.label)}, ${S(pointsLabel(e, ctx))}, ${d}, [\n${body}\n])` : body;
  } else if (CONTENT[b.type]) {
    markup = CONTENT[b.type](b, ctx, inner);
  } else if (BODIES[b.type] && e) {
    const d = Math.min(3, Math.max(0, parseInt(b.difficulty) || 0));
    const body = BODIES[b.type](b, ctx, Math.max(20, inner - EX_CHROME));
    const rise = firstLineHasGap(b, ctx, inner - EX_CHROME) ? `, rise: ${ctx.gapRise}` : '';
    markup = `#ex-box(${S(e.label)}, ${S(pointsLabel(e, ctx))}, ${d}, [\n${body}\n]${rise})`;
  } else if (BODIES[b.type] && b.numbered === false) {
    // an exercise switched to "ohne Nummer": the body without number and points
    markup = BODIES[b.type](b, ctx, Math.max(20, inner));
  }
  if (!markup || bare) return markup; // bare: the HTML export frames the task itself
  const h100 = stretch ? 'height: 100%, ' : '';
  if (frame) markup = `#block(width: 100%, ${h100}inset: 7pt, breakable: false, ${frame})[\n${markup}\n]`;
  if (grouped) markup = `#block(width: 100%, ${h100}inset: 7pt, breakable: false)[\n${markup}\n]`;
  return markup;
}

/** Assessment table + grade scale (the assessment block; also old exam-mode documents).
 *  b.title / b.scaleLabel override the labels, b.thresholds the percentages for grades 1..5. */
function assessmentMarkup(b, ctx) {
  const { exercises, total, T, lang } = ctx;
  const showTable = b.table !== false;
  const showScale = b.scale !== false;
  const title = b.title ?? T.rating;
  const head = title ? `#h-two[#${S(title)}]\n` : '';
  if (!exercises.length || total <= 0) {
    return `${head}#text(size: 9pt, fill: luma(140), style: "italic", ${S(lang === 'de'
      ? 'Bewertung: noch keine Aufgaben mit Punkten' : 'Assessment: no exercises with points yet')})`;
  }
  const cell = (x) => `[#${S(x)}]`;
  const parts = [];
  if (showTable) {
    const cols = exercises.length + 2;
    // restarted numbers repeat, so the table counts through
    const hd = [T.task, ...exercises.map((e) => (ctx.restart ? String(e.n) : e.label)), T.sum].map(cell).join(', ');
    const max = [T.max, ...exercises.map((e) => fmt(e.pts, lang)), fmt(total, lang)].map(cell).join(', ');
    const got = [T.got, ...exercises.map(() => ''), ''].map(cell).join(', ');
    parts.push(`#table(columns: ${cols}, align: center + horizon, inset: 6pt, stroke: 0.5pt + luma(150),
    fill: (x, y) => if y == 0 { soft } else { none },
    ${hd}, ${max}, ${got})`);
  }
  if (showScale) {
    const pct = GRADE_THRESHOLDS.map((d, i) => clamp(num(b.thresholds?.[i], d), 0, 100));
    const need = pct.map((p) => Math.ceil((total * p) / 100 - 1e-9));
    const gradeRow = [T.grade, '1', '2', '3', '4', '5', '6'].map(cell).join(', ');
    const scaleRow = [
      String(b.scaleLabel ?? '').trim() || T.scale,
      ...need.map((p) => `${T.from} ${fmt(p, lang)}`),
      `< ${fmt(need[4], lang)}`,
    ].map(cell).join(', ');
    parts.push(`#table(columns: 7, align: center + horizon, inset: 6pt, stroke: 0.5pt + luma(150),
    fill: (x, y) => if y == 0 { soft } else { none },
    ${gradeRow}, ${scaleRow})`);
  }
  return `#block(breakable: false, width: 100%)[
  ${head}${parts.join('\n  #v(8pt)\n  ')}
]`;
}

// ------------------------------------------------- core exercise bodies --

function choiceBody(b, { sol }) {
  const opts = (b.options || [])
    .map((o) => {
      const right = sol && o.correct;
      const box = `#box(width: 9pt, height: 9pt, radius: 2pt, baseline: 1pt, stroke: 0.8pt + ${right ? 'ok' : 'luma(70)'}, fill: ${right ? 'ok' : 'none'})`;
      const text = right ? `#text(fill: ok, weight: "bold")[${inline(o.text)}]` : inline(o.text);
      return `${box} #h(5pt) ${text}`;
    })
    .join('\n\n');
  // options side by side (b.arrange; b.layout is the block's position in the grid layout)
  if (b.arrange === 'row') return `${inline(b.text)}\n\n#block(inset: (left: 2pt))[\n${opts.split('\n\n').join(' #h(1.4em) ')}\n]`;
  return `${inline(b.text)}\n\n#block(inset: (left: 2pt))[\n#set par(spacing: 0.6em)\n${opts}\n]`;
}

/** Whether the first printed line of a cloze probably holds a gap, which makes that line taller
 *  (estimated from the line width: a character is about half an em wide). */
function firstLineHasGap(b, ctx, widthMm) {
  if (b.type !== 'cloze' || b.wordbank || ctx.sol) return false;
  const at = String(b.text ?? '').search(/\[\[.+?\]\]/);
  return at >= 0 && at < widthMm / (ctx.fontSize * 0.3528 * 0.5);
}

/** Cloze text -> [text, gap, text, gap, ...]. A gap may list alternatives: [[Wolke|Wolken]]. */
export const clozeParts = (text) => String(text ?? '').split(/\[\[(.+?)\]\]/g);

/** Answers of a cloze text (first alternative), shuffled, for the word bank. */
export const clozeWords = (b) => shuffled(clozeParts(b.text).filter((_, i) => i % 2).map((p) => p.split('|')[0].trim()), parseInt(b.seed) || 7);

function clozeBody(b, { sol }) {
  const words = b.wordbank ? clozeWords(b) : [];
  const bank = words.length
    ? `#block(width: 100%, stroke: 0.6pt + luma(160), radius: 3pt, inset: 6pt)[${words.map((w) => `#${S(w)}`).join(' #h(1.2em) ')}]\n`
    : '';
  return bank + clozeParts(b.text)
    .map((p, i) => {
      if (i % 2 === 0) return inline(p);
      return sol
        ? `#gap-sol[#${S(p.split('|').join(' / '))}]`
        : `#gap-blank(${Math.max(3, p.split('|')[0].length * 0.6).toFixed(1)}em)`;
    })
    .join('');
}
