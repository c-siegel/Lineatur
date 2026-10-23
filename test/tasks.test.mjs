// Inline bold / italic and content blocks used as tasks ("Als Aufgabe").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emphasisParts, inline } from '../src/typst-util.js';
import { toTypst } from '../src/toTypst.js';
import { isExercise, isTask } from '../public/layout.js';

test('emphasisParts: **bold**, *italic* and _italic_ for single words', () => {
  assert.deepEqual(emphasisParts('ein **fettes** und *kursives* Wort'), [
    { text: 'ein ', style: '' }, { text: 'fettes', style: 'bold' }, { text: ' und ', style: '' },
    { text: 'kursives', style: 'italic' }, { text: ' Wort', style: '' },
  ]);
  assert.deepEqual(emphasisParts('_so_ geht es'), [{ text: 'so', style: 'italic' }, { text: ' geht es', style: '' }]);
});

test('emphasisParts: multiplication, snake_case and lone marks stay text', () => {
  for (const t of ['3 * 4 = 12', 'max_wert und min_wert', 'ein * allein', '** nicht **']) {
    assert.deepEqual(emphasisParts(t), [{ text: t, style: '' }], t);
  }
});

test('inline: emphasis becomes strong / emph, the words stay escaped strings', () => {
  const m = inline('Das ist **"wichtig"**');
  assert.match(m, /#strong\[#"\\"wichtig\\""\]/);
});

test('isTask: only content blocks with the switch on; exercises stay exercises', () => {
  assert.equal(isTask({ type: 'lines', task: true }), true);
  assert.equal(isTask({ type: 'lines' }), false);
  assert.equal(isTask({ type: 'heading', task: true }), false);
  assert.equal(isExercise({ type: 'cloze' }), true);
  assert.equal(isExercise({ type: 'squares', task: true }), true);
});

test('toTypst: a lines task gets a number, points and its instruction', () => {
  const doc = {
    title: 'T', layoutMode: 'flow', blocks: [
      { id: 'a', type: 'lines', task: true, taskText: 'Erkläre **kurz**.', count: 2, points: 3 },
      { id: 'b', type: 'lines', count: 2 },
    ],
  };
  const src = toTypst(doc, { assets: new Map() });
  const boxes = src.match(/#ex-box\(/g) || [];
  assert.equal(boxes.length, 1, 'only the task is numbered');
  assert.match(src, /#ex-box\("1", "3 P\."/);
  assert.match(src, /#strong\[#"kurz"\]/);
});

test('toTypst: a cloze whose first line holds a gap lifts number and points to it', () => {
  const doc = { title: 'T', layoutMode: 'flow', blocks: [{ id: 'a', type: 'cloze', text: 'Wasser [[verdunstet]].', points: 1 }] };
  assert.match(toTypst(doc, { assets: new Map() }), /\], rise: [^)]+\)/);
  const late = { ...doc, blocks: [{ ...doc.blocks[0], text: 'x '.repeat(200) + '[[Lücke]]' }] };
  assert.doesNotMatch(toTypst(late, { assets: new Map() }), /\], rise:/);
});
