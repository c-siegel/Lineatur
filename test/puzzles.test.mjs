// Generated exercises (src/puzzles.js): reproducible, and honest about what did not fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordSearch, buildCrossword, buildArithmetic } from '../src/puzzles.js';

const gridHas = (grid, word) => {
  const n = grid.length;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const [dx, dy] of dirs) {
    let ok = true;
    for (let i = 0; i < word.length && ok; i++) ok = grid[y + dy * i]?.[x + dx * i] === word[i];
    if (ok) return true;
  }
  return false;
};

test('word search: every word that is listed can be found in the grid', () => {
  const ws = buildWordSearch({ words: 'Sonne, Mond, Stern, Komet', size: 10, difficulty: 2, seed: 7 });
  for (const w of ws.words.filter((x) => !ws.skipped.includes(x))) assert.ok(gridHas(ws.grid, w), w);
});

test('word search: a word longer than the grid is reported, not dropped silently', () => {
  const ws = buildWordSearch({ words: 'Mond, Donaudampfschifffahrt', size: 8, difficulty: 1, seed: 1 });
  assert.deepEqual(ws.skipped, ['DONAUDAMPFSCHIFFFAHRT']);
});

test('word search: the same seed gives the same grid', () => {
  const a = buildWordSearch({ words: 'Apfel, Birne', size: 8, difficulty: 3, seed: 42 });
  const b = buildWordSearch({ words: 'Apfel, Birne', size: 8, difficulty: 3, seed: 42 });
  assert.deepEqual(a.grid, b.grid);
});

test('crossword: a word that crosses no other one is reported', () => {
  const cw = buildCrossword({ entries: 'HAUS: Gebäude\nMAUS: Tier\nXYZ: passt nicht', seed: 1 });
  assert.ok(cw.skipped.includes('XYZ'));
  assert.ok(!cw.skipped.includes('HAUS') || !cw.skipped.includes('MAUS'));
});

test('arithmetic: divisions come out even, subtractions stay non-negative', () => {
  const tasks = buildArithmetic({ ops: ['-', '/'], min: 1, max: 12, count: 60, seed: 3, noNegative: true });
  for (const t of tasks) {
    if (t.op === '/') assert.ok(Number.isInteger(t.result), `${t.a} / ${t.b}`);
    if (t.op === '-') assert.ok(t.result >= 0, `${t.a} - ${t.b}`);
  }
});
