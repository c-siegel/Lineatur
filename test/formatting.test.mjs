// **bold**, *italic* and $math$ reach Typst in every text field (no stray marks on the sheet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGeometry } from '../public/layout.js';
import { toTypst } from '../src/toTypst.js';
import { inlineParts, plainText } from '../src/typst-util.js';

applyGeometry({});
const render = (block, solutions = false) => {
  const warnings = new Map();
  const src = toTypst({ layoutMode: 'flow', blocks: [{ id: 'b1', ...block }] }, { assets: new Map(), solutions, warnings });
  return { src, warnings };
};
const ITALIC = '#emph[#"kursiv"]';

// block -> the fields that hold *kursiv*
const CASES = {
  'cloze: text': { type: 'cloze', text: 'Das ist *kursiv* und [[Lücke]].' },
  'cloze: word bank': { type: 'cloze', text: 'Ein [[*kursiv*]].', wordbank: true },
  'cloze: solution': { type: 'cloze', text: 'Ein [[*kursiv*]].', sol: true },
  'lines: label': { type: 'lines', label: '*kursiv*:' },
  'infobox: title': { type: 'infobox', title: '*kursiv*', text: 'Text' },
  'table: title': { type: 'table', title: '*kursiv*', rows: 'a | b\nc | d' },
  'table: answer on the solution sheet': { type: 'table', rows: 'a | b\nc | [[*kursiv*]]', sol: true },
  'cycle: boxes': { type: 'cycle', items: '*kursiv*\nzwei\ndrei' },
  'chain: boxes and word bank': { type: 'chain', items: 'eins\n[[*kursiv*]]\ndrei', wordbank: true, sol: true },
  'tree: labels': { type: 'tree', spec: '*kursiv*: 1/2\nB: 1/2' },
};

for (const [name, { sol, ...block }] of Object.entries(CASES)) {
  test(`formatting works in ${name}`, () => {
    const { src } = render(block, !!sol);
    assert.ok(src.includes(ITALIC), `${name}: no emphasis in\n${src.slice(-600)}`);
    assert.ok(!src.includes('*kursiv*'), `${name}: the marks stay visible`);
  });
}

test('cloze: emphasis runs across a gap', () => {
  const { src } = render({ type: 'cloze', text: '*Die [[Sonne]] scheint*' });
  assert.match(src, /#emph\[#"Die "#gap-blank\([\d.]+em\)#" scheint"\]/);
});

test('cloze: a formula in the solution is set as math, the gap is sized without the marks', () => {
  const { src } = render({ type: 'cloze', text: 'Also [[$x^2$]].' }, true);
  assert.ok(src.includes('#gap-sol[$x^2$]'));
  assert.equal(plainText('$x^2$'), 'x^2');
});

test('cloze: a gap inside a formula stays text and gets a warning', () => {
  const { src, warnings } = render({ type: 'cloze', text: 'Löse $x = [[2]]$.' });
  assert.ok(src.includes('#"$x = "#gap-blank('));
  assert.match(warnings.get('b1'), /Formel/);
});

test('holes: user text cannot fake a hole', () => {
  assert.equal(inlineParts(['a\u00000\u0000b']), '#"a0b"');
});
