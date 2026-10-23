// Page design add-ons (src/themes.js): loaded from folders, broken ones skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadThemes, getTheme, themeList } from '../src/themes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the Projektheft design in extras/ loads with its settings', async () => {
  const names = await loadThemes(root, ['extras/uni-leipzig/themes']);
  assert.ok(names.includes('projektheft'));
  const t = themeList().find((x) => x.name === 'projektheft');
  assert.deepEqual(t.fields.map((f) => f.key), ['series', 'title', 'institute']);
  assert.equal(getTheme('projektheft').dir, '/extras/uni-leipzig/themes/projektheft');
});

test('a design without page() or named "custom" is not loaded', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineatur-themes-'));
  const write = (name, code) => {
    fs.mkdirSync(path.join(root, 'themes', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'themes', name, 'theme.js'), code);
  };
  write('ohne-page', 'export default { name: "ohne-page" };');
  write('eigen', 'export default { name: "custom", page: () => "" };');
  write('gut', 'export default { name: "gut", label: "Gut", page: () => "" };');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const names = await loadThemes(root, ['themes']);
    assert.deepEqual(names.filter((n) => ['ohne-page', 'custom', 'gut'].includes(n)), ['gut']);
  } finally {
    console.warn = warn;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
