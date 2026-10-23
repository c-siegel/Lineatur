// Preview transport: what the editor needs after every edit, kept small.
//
// - The multi-page SVG from typst.ts is split into the parts all pages share
//   (styles, glyphs, clip paths) and one SVG per page. Every part gets a content
//   hash; the editor says which hashes it already shows, and only the others are sent.
// - Images travel once: the editor replaces large data URLs in the document by
//   "asset:<hash>" and sends the data only when the server asks for it.

import { createHash } from 'node:crypto';

const hash = (s) => createHash('sha1').update(s).digest('base64url').slice(0, 20);

/** typst.ts SVG -> { shared, pages: [svg] }; each page SVG shows only its own page. */
export function splitSvg(svg) {
  const head = /^<svg[^>]*>/.exec(svg)?.[0];
  const w = /data-width="([\d.]+)"/.exec(head || '')?.[1];
  const starts = [...svg.matchAll(/<g\b[^>]*class="typst-page"[^>]*>/g)];
  if (!head || !w || !starts.length) return null;
  const end = svg.lastIndexOf('</svg>');
  const shared = svg.slice(head.length, starts[0].index);
  let y = 0;
  const pages = starts.map((m, i) => {
    const h = Number(/data-page-height="([\d.]+)"/.exec(m[0])?.[1]) || 0;
    const body = svg.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : end);
    const page = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="typst-doc" style="overflow: hidden;" viewBox="0 ${y} ${w} ${h}">${body}</svg>`;
    y += h;
    return page;
  });
  return { shared, pages };
}

/**
 * Preview response: parts the editor already has (by hash) are sent as the hash alone.
 * Images embedded in the pages (logos, QR codes, pictures) are replaced by "img:<hash>"
 * and sent once in `images`, so a changed page does not carry its images again.
 */
export function previewParts(svg, { have = [], haveShared = '', haveImages = [] } = {}) {
  const split = splitSvg(svg);
  if (!split) return { pages: [{ key: hash(svg), svg }], shared: '', sharedKey: '', images: {} };
  const known = new Set(have);
  const knownImages = new Set(haveImages);
  const images = {};
  const sharedKey = hash(split.shared);
  return {
    sharedKey,
    shared: sharedKey === haveShared ? undefined : split.shared,
    pages: split.pages.map((p) => {
      const page = p.replace(/href="(data:[^"]+)"/g, (m, url) => {
        const key = hash(url);
        if (!knownImages.has(key)) images[key] = url;
        return `href="img:${key}"`;
      });
      const key = hash(page);
      return known.has(key) ? { key } : { key, svg: page };
    }),
    images,
  };
}

// ------------------------------------------------------------- image cache --

const ASSET = /^asset:([A-Za-z0-9_-]{8,64})$/;
const CACHE_LIMIT = 200_000_000; // characters of data URLs kept in memory
const assets = new Map(); // hash -> data URL, oldest first
let cached = 0;

/** Data URLs the editor sent along (hash -> data URL), checked against their hash. */
export function rememberAssets(sent) {
  for (const [key, url] of Object.entries(sent || {})) {
    if (typeof url !== 'string' || !url.startsWith('data:') || assets.has(key) || hash(url) !== key) continue;
    assets.set(key, url);
    cached += url.length;
  }
  for (const [key, url] of assets) {
    if (cached <= CACHE_LIMIT) break;
    assets.delete(key);
    cached -= url.length;
  }
}

/** Puts the cached data URLs back into the document. Returns the hashes the cache lacks. */
export function restoreAssets(doc) {
  const missing = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => { if (typeof x === 'string') v[i] = restore(x); else walk(x); });
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) { if (typeof x === 'string') v[k] = restore(x); else walk(x); }
    }
  };
  const restore = (s) => {
    const key = ASSET.exec(s)?.[1];
    if (!key) return s;
    const url = assets.get(key);
    if (url === undefined) { missing.add(key); return s; }
    assets.delete(key); // keep recently used entries at the end
    assets.set(key, url);
    return url;
  };
  walk(doc);
  return [...missing];
}
