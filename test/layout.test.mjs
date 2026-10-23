// Shared layout rules (public/layout.js, public/meta.js) and the Typst output they drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingOrder, footerItems, applyGeometry, BODY_W } from '../public/layout.js';
import { normalizeMeta } from '../public/meta.js';
import { toTypst } from '../src/toTypst.js';
import { S, customColor } from '../src/typst-util.js';
import { shortVersion } from '../src/version.js';

const at = (id, page, x, y) => ({ id, type: 'text', text: id, layout: { page, x, y, w: 50 } });

test('reading order: page, then row, then left to right', () => {
  const order = readingOrder([at('c', 1, 0, 0), at('b', 0, 60, 0), at('a', 0, 0, 1), at('d', 0, 0, 40)]);
  assert.deepEqual(order.map((b) => b.id), ['a', 'b', 'd', 'c']);
});

test('footer: default title left and page right; the header starts empty', () => {
  assert.deepEqual(footerItems({}).map((i) => `${i.kind}:${i.zone}`), ['title:left', 'page:right']);
  assert.deepEqual(footerItems({}, 'header'), []);
});

test('footer: entries from before the zones get left / middle / right', () => {
  const doc = { footer: { preset: false, items: [{ kind: 'title' }, { kind: 'date' }, { kind: 'page' }] } };
  assert.deepEqual(footerItems(doc).map((i) => i.zone), ['left', 'center', 'right']);
});

test('footer: double-sided pages swap left and right on even pages', () => {
  const src = toTypst({ pageSide: 'both', layoutMode: 'flow', blocks: [] }, { assets: new Map() });
  assert.match(src, /calc\.even\(here\(\)\.page\(\)\)/);
});

test('free layout: blocks are drawn in stacking order, the last one on top', () => {
  applyGeometry({});
  const doc = { layoutMode: 'free', blocks: [{ ...at('unten', 0, 0, 0), text: 'UNTEN' }, { ...at('oben', 0, 0, 0), text: 'OBEN' }] };
  const src = toTypst(doc, { assets: new Map() });
  assert.ok(src.indexOf('UNTEN') < src.indexOf('OBEN'));
  assert.ok(BODY_W > 0);
});

test('text block: size, alignment, bold and italic reach Typst', () => {
  const src = toTypst({ layoutMode: 'flow', blocks: [{ id: 't', type: 'text', text: 'Titel', size: 'title', align: 'center', bold: true, italic: true }] }, { assets: new Map() });
  assert.match(src, /#align\(center\)\[#text\(size: 2\.2em, weight: "bold", style: "italic"\)/);
});

test('an unknown page design falls back to plain pages', () => {
  const src = toTypst({ theme: 'nicht-installiert', layoutMode: 'flow', blocks: [] }, { assets: new Map() });
  assert.ok(!src.includes('#import'));
});

test('metadata: fields that were removed are dropped', () => {
  assert.deepEqual(normalizeMeta({ subject: 'Physik', track: 'Gymnasium', method: 'Test', social: 'Plenum' }), { subject: 'Physik' });
});

test('user text cannot break out of Typst strings, colours must be #rrggbb', () => {
  assert.equal(S('a"b\\c#d'), '"a\\"b\\\\c#d"');
  assert.equal(customColor('#a1b2c3'), '#a1b2c3');
  assert.equal(customColor('#fff"); #eval("x'), null);
});

test('version: 1.0.0 is shown as 1.0', () => {
  assert.equal(shortVersion('1.0.0'), '1.0');
  assert.equal(shortVersion('1.2.3'), '1.2.3');
});
