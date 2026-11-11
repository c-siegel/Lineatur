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

test('a design from an outside folder brings its Typst files as virtual files', async () => {
  const { loadExternalThemes, themeFiles } = await import('../src/themes.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lineatur-ext-'));
  fs.mkdirSync(path.join(dir, 'ext'));
  fs.writeFileSync(path.join(dir, 'ext', 'theme.js'), 'export default { name: "ext", label: "Ext", page: () => "" };');
  fs.writeFileSync(path.join(dir, 'ext', 'ext.typ'), '#let x = 1');
  assert.deepEqual(await loadExternalThemes(dir), ['ext']);
  assert.equal(getTheme('ext').dir, '/ext-themes/ext');
  assert.ok(themeFiles().some(([p]) => p === 'ext-themes/ext/ext.typ'));
  assert.deepEqual(await loadExternalThemes(path.join(dir, 'missing')), []);
});

test('a design package (.zip) installs at once and can be removed again', async () => {
  const { installTheme, removeTheme, themeFiles } = await import('../src/themes.js');
  const { zip } = await import('../src/zip.js');
  const { unzip } = await import('../src/unzip.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lineatur-imp-'));
  const pkg = zip([
    { name: 'meins/theme.js', data: Buffer.from('export default { name: "meins", label: "Meins", page: () => "" };') },
    { name: 'meins/meins.typ', data: Buffer.from('#let y = 2') },
  ]);
  const files = unzip(pkg);
  assert.deepEqual(files.map((f) => f.name), ['meins/theme.js', 'meins/meins.typ']);
  assert.deepEqual(await installTheme(files, dir), { name: 'meins', label: 'Meins' });
  assert.ok(fs.existsSync(path.join(dir, 'meins', 'theme.js')));
  assert.equal(getTheme('meins').dir, '/ext-themes/meins');
  assert.ok(themeFiles().some(([p]) => p === 'ext-themes/meins/meins.typ'));
  assert.equal(themeList(dir).find((t) => t.name === 'meins').removable, true);
  assert.deepEqual(fs.readdirSync(dir), ['meins']); // no temporary folder left
  removeTheme('meins', dir);
  assert.equal(getTheme('meins'), undefined);
  assert.ok(!fs.existsSync(path.join(dir, 'meins')));
});

test('a design package with sub-folders, paths or no theme.js is refused', async () => {
  const { installTheme } = await import('../src/themes.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lineatur-imp-'));
  const file = (name) => ({ name, data: Buffer.from('export default { name: "x", page: () => "" };') });
  await assert.rejects(installTheme([file('theme.js'), file('../evil.js')], dir), /nicht erlaubt/);
  await assert.rejects(installTheme([file('a/theme.js'), file('a/sub/x.typ')], dir), /nicht erlaubt/);
  await assert.rejects(installTheme([file('x.typ')], dir), /keine theme\.js/);
  assert.deepEqual(fs.readdirSync(dir), []);
});
