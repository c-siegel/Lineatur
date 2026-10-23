// Lineatur editor – Live preview: asks the server for the pages, sends only what changed, keeps unchanged pages and
// makes the dashboard thumbnail.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import { putThumb } from '../store.js';
import { makeThumb, pageWithDefs } from '../dashboard.js';
import { $, h } from './util.js';
import { more } from './docpanel.js';
import {
  applyZoom, autoArrange, doc, isFree, mode, pendingArrange, pendingPlace, placeAtBottom, renderInspector,
  setInfo, setPendingArrange,
} from '../app.js';
import { renderOverlay } from './canvas.js';

// ---------------------------------------------------------------- preview --

let lastTypst = ''; // Typst source of the last render ("Typst-Quelltext zeigen")
let timer = null;
let rendering = false;
let dirty = false;

function schedule(delay = 250) {
  clearTimeout(timer);
  timer = setTimeout(kick, delay);
}

async function kick() {
  if (rendering) { dirty = true; return; }
  rendering = true;
  do {
    dirty = false;
    await renderPreview();
  } while (dirty);
  rendering = false;
}

// The server sends the parts all pages share (styles, glyphs, clip paths) and one small
// SVG per page, each with a content hash. Parts the editor already shows go back as the
// hash alone (see src/preview.js). The shared parts live once in #svgdefs. Images in the
// pages arrive once as well and are referenced as "img:<hash>" in the page SVGs.
let blockWarnings = {}; // block id -> text, from the last preview
let shownShared = '';
let shownSharedKey = '';
let shownPages = new Map(); // hash -> page SVG (with image references)
const pageImages = new Map(); // image hash -> data URL

const withImages = (page) => page.replace(/href="img:([\w-]+)"/g, (m, k) => `href="${pageImages.get(k) ?? ''}"`);

function showPages({ shared, sharedKey, pages, images }) {
  for (const [k, url] of Object.entries(images || {})) pageImages.set(k, url);
  if (shared !== undefined) {
    $('svgdefs').innerHTML = shared;
    shownShared = shared;
    shownSharedKey = sharedKey;
  }
  const old = new Map();
  for (const el of $('pages').children) if (!old.has(el.dataset.key)) old.set(el.dataset.key, el);
  const next = new Map();
  $('pages').replaceChildren(...pages.map(({ key, svg }) => {
    const page = svg ?? shownPages.get(key);
    next.set(key, page);
    const kept = old.get(key);
    if (kept) { old.delete(key); return kept; }
    const d = h('div', { class: 'page', 'data-key': key });
    d.innerHTML = withImages(page); // SVG produced by our own Typst compiler from escaped text
    return d;
  }));
  shownPages = next;
  // forget images no page shows any more
  const used = new Set();
  for (const page of next.values()) for (const m of page.matchAll(/href="img:([\w-]+)"/g)) used.add(m[1]);
  for (const k of pageImages.keys()) if (!used.has(k)) pageImages.delete(k);
}

// Images travel once: large data URLs are sent as "asset:<hash>", their data only when
// the server asks for it. Hashes are cached per data URL (strings compare by value).
const BIG_DATA = 2000;
const assetKeys = new Map(); // data URL -> hash
const assetUrls = new Map(); // hash -> data URL

async function sha1Key(s) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 20);
}

/** The document as JSON with every large data URL replaced by its asset reference. */
async function docWithAssetRefs() {
  if (!crypto?.subtle) return doc; // not a secure context: send the images along
  const urls = [];
  JSON.stringify(doc, (k, v) => {
    if (typeof v === 'string' && v.length > BIG_DATA && v.startsWith('data:') && !assetKeys.has(v)) urls.push(v);
    return v;
  });
  for (const url of urls) {
    const key = await sha1Key(url);
    assetKeys.set(url, key);
    assetUrls.set(key, url);
  }
  return JSON.parse(JSON.stringify(doc, (k, v) => (typeof v === 'string' && assetKeys.has(v) ? `asset:${assetKeys.get(v)}` : v)));
}

async function fetchPreview() {
  const request = {
    doc: await docWithAssetRefs(),
    solutions: mode === 'solution',
    have: [...shownPages.keys()],
    haveShared: shownSharedKey,
    haveImages: [...pageImages.keys()],
    withSource: !$('source').hidden,
  };
  const post = async (body) => (await fetch('/api/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })).json();
  const data = await post(request);
  if (!data.missing) return data;
  // the server has not seen these images yet (or forgot them): send their data once
  return post({ ...request, assets: Object.fromEntries(data.missing.map((k) => [k, assetUrls.get(k)])) });
}

async function renderPreview() {
  const t0 = performance.now();
  $('status').textContent = 'wird gesetzt…';
  try {
    const data = await fetchPreview();
    lastTypst = data.typst || '';
    $('source').textContent = lastTypst;
    const err = $('error');
    if (!data.ok) {
      err.hidden = false;
      err.textContent = data.error;
      $('status').textContent = 'Fehler';
      return;
    }
    err.hidden = true;
    if (data.info) setInfo(data.info);
    // problems of single blocks (e.g. words that did not fit into a puzzle) go to the inspector
    const warnings = data.warnings || {};
    if (JSON.stringify(warnings) !== JSON.stringify(blockWarnings)) {
      blockWarnings = warnings;
      renderInspector();
    }
    applyZoom();
    showPages(data);
    const pages = data.pages;
    if (mode === 'student' && pages.length) queueThumb(pageWithDefs(shownShared, withImages(shownPages.get(pages[0].key))));
    $('status').textContent = `${pages.length} Seite${pages.length === 1 ? '' : 'n'} · ${Math.round(performance.now() - t0)} ms`;
    renderOverlay();
    if (pendingArrange && data.info) {
      setPendingArrange(false);
      autoArrange();
    } else if (pendingPlace && data.info && isFree()) {
      placeAtBottom(pendingPlace);
    }
  } catch (e) {
    const offline = e instanceof TypeError && /fetch/i.test(e.message);
    $('status').textContent = offline ? 'Server nicht erreichbar' : 'Editorfehler – siehe Konsole';
    if (!offline) console.error(e);
  }
}

// ------------------------------------------------- dashboard thumbnail --

let thumbSvg = null;
let thumbTimer = null;
function queueThumb(pageSvg) {
  thumbSvg = { id: doc.id, svg: pageSvg };
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(flushThumb, 3000);
}
async function flushThumb() {
  clearTimeout(thumbTimer);
  const t = thumbSvg;
  thumbSvg = null;
  if (!t) return;
  try { await putThumb(t.id, await makeThumb(t.svg)); } catch { /* the dashboard makes one itself */ }
}

export {
  BIG_DATA, assetKeys, assetUrls, blockWarnings, dirty, docWithAssetRefs, fetchPreview, flushThumb, kick,
  lastTypst, pageImages, queueThumb, renderPreview, rendering, schedule, sha1Key, showPages, shownPages,
  shownShared, shownSharedKey, thumbSvg, thumbTimer, timer, withImages,
};
