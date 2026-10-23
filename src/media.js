// Media and page furniture blocks: image, QR code, writing lines, squared
// paper, points counter. Binary content (images, QR codes) is handed to the
// compiler as virtual files through ctx.addAsset, never inlined into the source.

import QRCode from 'qrcode';
import { S, inline, int, num, clamp, mm, fmt, TINTS, hexOf, isDark, lineStyleOf } from './typst-util.js';

const DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/;
const EXT = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };

/** data:image/...;base64 -> { ext, bytes } or null (only raster formats are accepted). */
export function decodeImage(src) {
  const m = DATA_URL.exec(String(src || ''));
  if (!m) return null;
  return { ext: EXT[m[1]], bytes: Buffer.from(m[2], 'base64') };
}

const placeholder = (text, h = 30) =>
  `#box(width: 100%, height: ${h}mm, stroke: (paint: luma(170), dash: "dashed"), radius: 3pt, align(center + horizon, text(fill: luma(140), size: 9pt, ${S(text)})))`;

export function imageBody(b, ctx) {
  const img = decodeImage(b.src);
  const align = { left: 'left', right: 'right' }[b.align] || 'center';
  if (!img) return placeholder(ctx.T.noImage);
  const path = ctx.addAsset(img.bytes, img.ext);
  const width = clamp(num(b.width, 100), 10, 100);
  const out = [`#align(${align}, image(${S(path)}, width: ${width}%))`];
  if (b.caption) out.push(`#v(-2pt)\n#align(${align}, block(width: ${width}%, align(${align}, text(size: 9pt)[${inline(b.caption)}])))`);
  if (b.credit) out.push(`#v(-4pt)\n#align(${align}, block(width: ${width}%, align(${align}, text(size: 6.5pt, fill: luma(120), ${S(b.credit)}))))`);
  return out.join('\n');
}

/** QR code as an SVG (dark modules merged into horizontal runs). */
export function qrSvg(text) {
  const qr = QRCode.create(String(text || ' '), { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const q = 2; // quiet zone in modules
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!qr.modules.get(y, x)) { x++; continue; }
      let run = 1;
      while (x + run < n && qr.modules.get(y, x + run)) run++;
      d += `M${x + q} ${y + q}h${run}v1h-${run}z`;
      x += run;
    }
  }
  const s = n + 2 * q;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s * 4}" height="${s * 4}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** Black rounded label with a small pointer on top (e.g. under a QR code). */
export const badge = (text) => `stack(spacing: 0pt, align(center, polygon(fill: black, (0mm, 1.8mm), (1.8mm, 0mm), (3.6mm, 1.8mm))),
    box(fill: black, radius: 3pt, inset: (x: 10pt, y: 4pt), text(fill: white, size: 8.5pt, ${S(text)})))`;

export function qrBody(b, ctx) {
  const text = String(b.text || '').trim();
  if (!text) return placeholder(ctx.T.noQr, 25);
  const size = clamp(num(b.size, 30), 12, 120);
  const path = ctx.addAsset(Buffer.from(qrSvg(text)), 'svg');
  const align = { left: 'left', right: 'right' }[b.align] || 'center';
  if (b.caption && b.captionStyle === 'badge') {
    return `#align(${align}, box(width: ${Math.max(size, 40)}mm, stack(spacing: 1.5mm, align(center, image(${S(path)}, width: ${size}mm)), align(center, ${badge(b.caption)}))))`;
  }
  const caption = b.caption ? `\n#v(-2pt)\n#align(${align}, box(width: ${Math.max(size, 55)}mm, align(${align}, text(size: 8.5pt)[${inline(b.caption)}])))` : '';
  return `#align(${align}, image(${S(path)}, width: ${size}mm))${caption}`;
}

/** Writing lines with an optional label ("Beobachtung:"); the solution sheet shows b.solution instead. */
export function linesBody(b, ctx = {}) {
  const label = String(b.label || '').trim() ? `#text(${S(b.label)})
` : '';
  if (ctx.sol && String(b.solution || '').trim()) return `${label}#sol-box[${inline(b.solution)}]`;
  return label + ruledLines(b);
}

/** Writing lines: plain ruled, primary-school lineature, dotted. */
function ruledLines(b) {
  const n = int(b.count, 1, 40, 5);
  const style = lineStyleOf(b);
  if (style === 'school') {
    // four-line system with a shaded middle band (Lineatur for first graders)
    const s = clamp(num(b.spacing, 4), 2.5, 8);
    const gap = s;
    const rowH = 3 * s + gap;
    return `#box(width: 100%, height: ${mm(n * rowH - gap)}, {
  for i in range(${n}) {
    let y = i * ${mm(rowH)}
    place(dy: y + ${mm(s)}, rect(width: 100%, height: ${mm(s)}, fill: rgb("#eef3fb"), stroke: none))
    place(dy: y, line(length: 100%, stroke: 0.4pt + luma(170)))
    place(dy: y + ${mm(s)}, line(length: 100%, stroke: 0.4pt + luma(150)))
    place(dy: y + ${mm(2 * s)}, line(length: 100%, stroke: 0.8pt + luma(80)))
    place(dy: y + ${mm(3 * s)}, line(length: 100%, stroke: 0.4pt + luma(170)))
  }
})`;
  }
  const sp = clamp(num(b.spacing, 9), 5, 20);
  const stroke = style === 'dotted' ? '(paint: luma(130), thickness: 0.6pt, dash: "dotted")' : '0.5pt + luma(150)';
  return `#box(width: 100%, height: ${mm(n * sp)}, {
  for i in range(${n}) { place(dy: (i + 1) * ${mm(sp)}, line(length: 100%, stroke: ${stroke})) }
})`;
}

/** Squared paper ("Kästchen") filling the block width. */
export function squaresBody(b, ctx, w) {
  const s = clamp(num(b.size, 5), 3, 12);
  const rows = int(b.rows, 1, 60, 8);
  const cols = Math.max(1, Math.floor(w / s + 1e-6));
  const W = cols * s;
  const H = rows * s;
  const stroke = b.dots ? null : '0.35pt + luma(185)';
  const body = b.dots
    ? `for y in range(${rows + 1}) { for x in range(${cols + 1}) { place(dx: x * ${mm(s)} - 0.3mm, dy: y * ${mm(s)} - 0.3mm, circle(radius: 0.3mm, fill: luma(130))) } }`
    : `for i in range(${cols + 1}) { place(line(start: (i * ${mm(s)}, 0mm), end: (i * ${mm(s)}, ${mm(H)}), stroke: ${stroke})) }
  for i in range(${rows + 1}) { place(line(start: (0mm, i * ${mm(s)}), end: (${mm(W)}, i * ${mm(s)}), stroke: ${stroke})) }`;
  return `#align(center, box(width: ${mm(W)}, height: ${mm(H)}, {
  ${body}
}))`;
}

/** Points counter: "Points: ___ / max". max = 0 means the sheet's total. */
export function scoreBody(b, ctx) {
  const max = num(b.max, 0) > 0 ? num(b.max) : ctx.total;
  const label = b.label || ctx.T.points;
  const align = { left: 'left', center: 'center' }[b.align] || 'right';
  return `#align(${align}, box(stroke: 1pt + accent, radius: 4pt, inset: (x: 9pt, y: 6pt))[
  #text(weight: "bold", ${S(label + ':')}) #box(width: 13mm, height: 1em, stroke: (bottom: 0.6pt + luma(90))) / #${S(fmt(max, ctx.lang))}
])`;
}

/** Info box: rounded, strongly tinted, optional bold title. */
export function infoBody(b) {
  const fill = hexOf(b.color, TINTS, 'rose');
  const title = String(b.title || '').trim() ? `#text(weight: "bold", ${S(b.title)})\n\n` : '';
  // white text on a dark custom colour
  return `#block(width: 100%, inset: 9pt, radius: 11pt, fill: rgb("${fill}"), breakable: false)[
${isDark(fill) ? '#set text(fill: white)\n' : ''}${title}${inline(b.text)}
]`;
}
