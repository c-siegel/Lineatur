// Preview transport (src/preview.js): page splitting, "only what changed", images once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { splitSvg, previewParts, rememberAssets, restoreAssets } from '../src/preview.js';

const hash = (s) => createHash('sha1').update(s).digest('base64url').slice(0, 20);
const IMG = 'data:image/png;base64,AAAA';

// shaped like typst.ts output: shared parts first, then one group per page
const svg = '<svg class="typst-doc" data-width="595.000" data-height="1684.000">'
  + '<style>.x{}</style><defs class="glyph"><path id="g1" d="M0 0"/></defs>'
  + '<g class="typst-page" transform="translate(0, 0)" data-page-width="595" data-page-height="842"><use href="#g1"/></g>'
  + `<g class="typst-page" transform="translate(0, 842)" data-page-width="595" data-page-height="842"><image href="${IMG}"/></g>`
  + '</svg>';

test('splitSvg: shared parts once, one SVG per page with its own viewBox', () => {
  const { shared, pages } = splitSvg(svg);
  assert.match(shared, /<defs class="glyph">/);
  assert.equal(pages.length, 2);
  assert.match(pages[0], /viewBox="0 0 595.000 842"/);
  assert.match(pages[1], /viewBox="0 842 595.000 842"/);
  assert.ok(!pages[0].includes('defs'), 'pages do not repeat the shared definitions');
});

test('previewParts: pages the editor has are sent as their key only', () => {
  const first = previewParts(svg);
  assert.ok(first.pages.every((p) => p.svg), 'first render sends every page');
  assert.ok(first.shared);
  const again = previewParts(svg, { have: first.pages.map((p) => p.key), haveShared: first.sharedKey, haveImages: Object.keys(first.images) });
  assert.ok(again.pages.every((p) => !p.svg), 'nothing is sent twice');
  assert.equal(again.shared, undefined);
  assert.deepEqual(again.images, {});
});

test('previewParts: images are replaced by a reference and sent once', () => {
  const { pages, images } = previewParts(svg);
  assert.ok(!pages[1].svg.includes(IMG));
  assert.match(pages[1].svg, /href="img:[\w-]+"/);
  assert.equal(Object.values(images)[0], IMG);
});

test('restoreAssets: known references come back, unknown ones are reported', () => {
  const url = `data:image/png;base64,${'B'.repeat(50)}`;
  const key = hash(url);
  const doc = { blocks: [{ src: `asset:${key}` }, { src: 'asset:unknownkey123' }] };
  rememberAssets({ [key]: url });
  const missing = restoreAssets(doc);
  assert.equal(doc.blocks[0].src, url);
  assert.deepEqual(missing, ['unknownkey123']);
});

test('rememberAssets: data whose hash does not match its key is ignored', () => {
  rememberAssets({ wrongkey00000000000a: 'data:image/png;base64,CCCC' });
  const doc = { src: 'asset:wrongkey00000000000a' };
  assert.deepEqual(restoreAssets(doc), ['wrongkey00000000000a']);
});
