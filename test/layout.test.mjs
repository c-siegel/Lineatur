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

test('distribute: a group counts as one unit and keeps its inner spacing', async () => {
  applyGeometry({});
  const { layoutUnits, distributeUnits } = await import('../public/layout.js');
  const blk = (id, x, w, group) => ({ id, type: 'text', group, layout: { page: 0, x, y: 0, w } });
  const blocks = [blk('a', 0, 20), blk('g1', 30, 10, 'g'), blk('g2', 45, 10, 'g'), blk('b', 150, 20)];
  const units = layoutUnits(blocks, {});
  assert.equal(units.length, 3);
  distributeUnits(units, 'h');
  const [, g1, g2, b] = blocks;
  assert.equal(g2.layout.x - g1.layout.x, 15);             // spacing inside the group unchanged
  assert.equal(g1.layout.x - 20, 150 - (g2.layout.x + 10)); // equal gaps around the group
  assert.equal(b.layout.x, 150);
  // the entered group: its members are units of their own
  assert.equal(layoutUnits(blocks, {}, 'g').length, 4);
});

test('align: a group moves as a whole, a locked member keeps the whole group in place', async () => {
  applyGeometry({});
  const { layoutUnits, alignUnits } = await import('../public/layout.js');
  const blk = (id, x, y, group, locked) => ({ id, type: 'text', group, locked, layout: { page: 0, x, y, w: 20 } });
  const blocks = [blk('a', 10, 0), blk('g1', 50, 0, 'g'), blk('g2', 80, 10, 'g')];
  alignUnits(layoutUnits(blocks, {}), 'left', 200);
  assert.deepEqual(blocks.map((b) => b.layout.x), [10, 10, 40]);
  blocks[2].locked = true;
  assert.equal(alignUnits(layoutUnits(blocks, {}), 'right', 200), 1);
  assert.deepEqual(blocks.map((b) => b.layout.x), [40, 10, 40]);
});

test('next free spot: on the given page, else the next one, else a new page right after it', async () => {
  applyGeometry({});
  const { nextFreeSpot, BODY_H } = await import('../public/layout.js');
  const blk = (id, page, y) => ({ id, type: 'text', layout: { page, x: 0, y, w: 50 } });
  const blocks = [blk('a', 0, 0), blk('b', 1, 0), blk('c', 2, 0)];
  const heights = { a: 20, b: BODY_H - 10, c: 20 };
  assert.deepEqual(nextFreeSpot(blocks, heights, 0, 20, 4, { page: 0, pageCount: 3 }), { page: 0, y: 25 });
  // page 1 is full: page 2 has room below its block
  assert.deepEqual(nextFreeSpot(blocks, heights, 0, 20, 4, { page: 1, pageCount: 3 }), { page: 2, y: 25 });
  heights.c = BODY_H - 10;
  assert.deepEqual(nextFreeSpot(blocks, heights, 0, 20, 4, { page: 1, pageCount: 3 }), { page: 2, y: 0, insert: true });
  // without a page: below everything on the last page with blocks
  assert.deepEqual(nextFreeSpot(blocks, heights, 0, 20), { page: 3, y: 0 });
});

test('pages: insert after a page and remove an empty one renumber the blocks', async () => {
  const { insertPage, removeEmptyPage } = await import('../public/layout.js');
  const blocks = [at('a', 0, 0, 0), at('b', 1, 0, 0), at('c', 2, 0, 0)];
  insertPage(blocks, 0);
  assert.deepEqual(blocks.map((b) => b.layout.page), [0, 2, 3]);
  assert.equal(removeEmptyPage(blocks, 2), false);
  assert.equal(removeEmptyPage(blocks, 1), true);
  assert.deepEqual(blocks.map((b) => b.layout.page), [0, 1, 2]);
});
