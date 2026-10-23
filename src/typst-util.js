// Small helpers shared by every block renderer.
//
// Safety rule of the whole engine: user text only ever reaches Typst as an
// escaped string literal (S) or as checked math (safeMath). Helper functions in
// the preamble are named with a hyphen (ex-box, ans-lines, ...) because math
// mode cannot reach hyphenated names, so `$ ... $` from a user cannot call them.

/** Typst string literal. */
export const S = (t) =>
  '"' + String(t ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';

/** Math from the user, or null if it could leave math mode.
 *  `#` is the only way out of math into code (file access, loops), and `$`
 *  would end the math early, so both are refused. */
export function safeMath(m) {
  const s = String(m ?? '');
  if (!s.trim() || s.length > 1500 || /[#$]/.test(s)) return null;
  return s;
}

// The server plugs in a checker that test-compiles each math snippet once, so
// one mistyped formula shows up as plain text instead of breaking the sheet.
let mathValidator = () => true;
export const setMathValidator = (fn) => { mathValidator = fn; };
export const mathOk = (m) => mathValidator(m);

/**
 * Bold and italic for single words: **fett**, *kursiv* or _kursiv_ (as in Markdown).
 * The marks must touch the words ("3 * 4" stays a multiplication), and an underscore only
 * counts at word edges (snake_case stays as it is). No nesting.
 * Returns [{ text, style: '' | 'bold' | 'italic' }].
 */
const EMPH = /\*\*(?!\s)([^*\n]*?\S)\*\*|\*(?![\s*])([^*\n]*?[^\s*])\*|(?<![\p{L}\p{N}_])_(?![\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu;
export function emphasisParts(t) {
  const out = [];
  let last = 0;
  for (const m of String(t ?? '').matchAll(EMPH)) {
    if (m.index > last) out.push({ text: t.slice(last, m.index), style: '' });
    out.push({ text: m[1] ?? m[2] ?? m[3], style: m[1] !== undefined ? 'bold' : 'italic' });
    last = m.index + m[0].length;
  }
  if (last < String(t ?? '').length) out.push({ text: String(t).slice(last), style: '' });
  return out;
}

/** One line of user text as Typst markup, with **bold** and *italic*. */
const emphasized = (line) => emphasisParts(line).map(({ text, style }) => (
  style === 'bold' ? `#strong[#${S(text)}]` : style === 'italic' ? `#emph[#${S(text)}]` : `#${S(text)}`
)).join('');

/** Inline text for markup mode. Supports $math$, line breaks, **bold** and *italic*. */
export function inline(t) {
  const out = [];
  String(t ?? '').split(/(\$[^$\n]+\$)/g).forEach((part) => {
    if (!part) return;
    if (/^\$[^$\n]+\$$/.test(part)) {
      const m = safeMath(part.slice(1, -1));
      out.push(m && mathOk(m) ? part : '#' + S(part));
    } else {
      out.push(
        part
          .split(/\r?\n/)
          .map((line) => (line ? emphasized(line) : ''))
          .join(' #linebreak() '),
      );
    }
  });
  return out.join('');
}

export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const mm = (v) => `${Math.round(num(v) * 100) / 100}mm`;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const int = (v, lo, hi, d) => clamp(Number.isFinite(parseInt(v)) ? parseInt(v) : d, lo, hi);

/** Number for display, with a decimal comma in German. */
export const fmt = (n, lang, digits = 2) => {
  const f = 10 ** digits;
  return String(Math.round(n * f) / f).replace('.', lang === 'de' ? ',' : '.').replace('-', '−');
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates. Avoids returning the input order when it can. */
export function shuffled(list, seed) {
  const rnd = mulberry32(seed || 1);
  for (let attempt = 0; attempt < 5; attempt++) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.length < 2 || a.some((x, i) => x !== list[i])) return a;
  }
  return list.slice().reverse();
}

export const normalizeWord = (w) =>
  String(w)
    .toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z]/g, '');

/** Non-empty trimmed lines (or comma separated items when allowCommas). */
export const lines = (t, allowCommas = false) =>
  String(t ?? '').split(allowCommas ? /[\n,;]+/ : /\r?\n/).map((s) => s.trim()).filter(Boolean);

/** Frame and background settings of a block ({ frame, color, fill }). */
export const frameStyleOf = (b) => (b.style && typeof b.style === 'object' ? b.style : {});

/** Line style of a writing-lines block. Older documents kept it in b.style (a string),
 *  which clashed with the frame settings; it now lives in b.lineStyle. */
export const lineStyleOf = (b) => b.lineStyle || (typeof b.style === 'string' ? b.style : '') || 'ruled';

// Colours for frames, backgrounds and the accent. Greys first, then colours.
export const FILLS = {
  none: null,
  gray1: 'luma(246)', gray2: 'luma(234)', gray3: 'luma(218)',
  blue: 'rgb("#e8f0fe")', green: 'rgb("#e5f5ea")', yellow: 'rgb("#fff5cc")',
  orange: 'rgb("#ffecd9")', red: 'rgb("#fde7e7")', purple: 'rgb("#f1e8fd")',
  // pastel card colours of the Projektheft design
  teal: 'rgb("#e2f4f3")', rose: 'rgb("#fbe7ea")', lilac: 'rgb("#f3eaf7")', pink: 'rgb("#fbe6ef")',
  periwinkle: 'rgb("#eceefe")', sky: 'rgb("#e6f3f9")',
};
export const STROKES = {
  gray: 'luma(160)', dark: 'luma(70)', black: 'black',
  blue: 'rgb("#2f6fdb")', green: 'rgb("#1f8a4c")', yellow: 'rgb("#c99a00")',
  orange: 'rgb("#e07b00")', red: 'rgb("#c0392b")', purple: 'rgb("#7b3fd0")',
  teal: 'rgb("#5fbfba")', rose: 'rgb("#e58f9a")', lilac: 'rgb("#b58cc9")', pink: 'rgb("#e48cb0")',
  periwinkle: 'rgb("#9aa2f2")', sky: 'rgb("#8cbcec")',
};
/** Strong tints for info boxes (text stays dark on them). */
export const TINTS = {
  rose: '#f0979d', periwinkle: '#a6acf7', orange: '#f8a660', sky: '#9fd0e6', teal: '#90d4cf',
  yellow: '#f6dc6a', lilac: '#d3b0e2', green: '#a9dcb5', gray: '#dcdfe5',
};
export const ACCENTS = {
  blue: '#2f6fdb', green: '#1f8a4c', red: '#c0392b', purple: '#7b3fd0',
  orange: '#d96c00', teal: '#0f8a8a', gray: '#4a5160',
};

// Custom colours: besides the palette names, every colour setting accepts any RGB
// colour as "#rrggbb" (the editor's colour picker). Only this exact form is let
// through, so a colour can never inject Typst code or CSS.

/** "#rrggbb" (normalised to lower case) or null. */
export const customColor = (v) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(v ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : null;
};

/** Hex colour of a palette name (palette values are hex) or a custom colour, else the default name. */
export const hexOf = (v, palette, def) => palette[v] || customColor(v) || (def ? palette[def] : null);

/** Typst paint of a palette name (palette values are Typst expressions) or a custom colour, else null. */
export const paintOf = (v, palette) => palette[v] || (customColor(v) ? `rgb("${customColor(v)}")` : null);

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Mix a hex colour with white (t = 0: unchanged, 1: white). */
export const lighten = (hex, t) =>
  `#${rgbOf(hex).map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')).join('')}`;

/** Dark colours need white text on top (relative luminance below ~0.4). */
export const isDark = (hex) => {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
};
