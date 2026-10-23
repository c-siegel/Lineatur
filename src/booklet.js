// Booklet imposition: an A5 document becomes A4 landscape sheets that are
// printed on both sides, folded in the middle and stapled (saddle stitch).
//
// The A5 document is compiled to PDF first; Typst (>= 0.14) can place PDF pages
// as vector images, so the imposition is just a second, tiny Typst document.
// No extra dependency (the `bookletic` package only imposes per-page content,
// not a flowing document; pdf-lib would work but the compiler already does).

/** Path under which the compiled A5 PDF is handed to the imposition compile. */
export const BOOKLET_SRC = '/assets/booklet-src.pdf';

/**
 * Page sequence of a booklet with n pages: padded with blanks to a multiple of 4.
 * backCover: the last page stays last (the blanks go in front of it).
 * Returns { pages: N, sides: [[left, right], ...] } with 1-based source pages, null = blank.
 * Sheet s, front: [N-2s, 2s+1], back: [2s+2, N-2s-1] (positions in the padded sequence).
 */
export function bookletOrder(n, { backCover = false } = {}) {
  n = Math.max(1, n | 0);
  const N = Math.ceil(n / 4) * 4;
  const seq = [null];
  const body = backCover && n > 1 ? n - 1 : n;
  for (let p = 1; p <= body; p++) seq.push(p);
  while (seq.length - 1 < N - (backCover && n > 1 ? 1 : 0)) seq.push(null);
  if (backCover && n > 1) seq.push(n);
  const sides = [];
  for (let s = 0; s < N / 4; s++) {
    sides.push([seq[N - 2 * s], seq[2 * s + 1]]);
    sides.push([seq[2 * s + 2], seq[N - 2 * s - 1]]);
  }
  return { pages: N, blanks: N - n, sides };
}

/** Typst source that puts two pages (w x h mm) side by side on each sheet side. */
export function imposeTypst(sides, { w = 148, h = 210, marks = true } = {}) {
  const img = (p) => (p ? `image("${BOOKLET_SRC}", page: ${p}, width: ${w}mm, height: ${h}mm)` : '');
  const mark = marks
    ? `\n  place(top + left, dx: ${w}mm, line(length: 3mm, angle: 90deg, stroke: 0.4pt + luma(150)))
  place(bottom + left, dx: ${w}mm, dy: -3mm, line(length: 3mm, angle: 90deg, stroke: 0.4pt + luma(150)))`
    : '';
  // the zero-size anchor keeps an all-blank sheet side as a page
  const pages = sides.map(([l, r]) => `#{
  place(top + left, box(width: 0pt, height: 0pt))
  ${l ? `place(top + left, ${img(l)})` : ''}
  ${r ? `place(top + left, dx: ${w}mm, ${img(r)})` : ''}${mark}
}`);
  return `#set page(width: ${2 * w}mm, height: ${h}mm, margin: 0pt)
${pages.join('\n#pagebreak()\n')}
`;
}
