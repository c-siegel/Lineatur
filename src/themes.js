// Page designs as add-ons (Dokument → Seite → Seitendesign).
//
// A design is a folder with a theme.js and its Typst files, e.g. themes/projektheft/.
// The server loads every folder in themes/ at startup; the core app ships none
// (designs tied to one institution live in extras/ and are copied in when wanted).
//
// theme.js exports default {
//   name, label, hint,                  // id (stored as doc.theme), name in the list, explanation
//   fields: [{ key, label, placeholder }],   // text settings, stored in doc.themeOptions[key]
//   logo: 'Label',                      // optional: an image setting (doc.themeOptions.logo)
//   setup(dir),                         // Typst code before the page setup; dir = folder path for #import
//   page(doc, t),                       // arguments for #set page(..), see pageTools below
// }
// The Typst import path is fixed by the folder, so user input never reaches an import.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const themes = new Map();

/** Runs a design's theme.js and checks it (a version suffix makes an updated file load anew). */
async function importTheme(file, version = '') {
  const theme = (await import(pathToFileURL(file).href + version)).default;
  if (!theme?.name || theme.name === 'custom' || typeof theme.page !== 'function') throw new Error('name and page() are required');
  return theme;
}

async function loadOne(file, typstDir, files) {
  const theme = await importTheme(file);
  themes.set(theme.name, { ...theme, dir: typstDir, files, folder: path.dirname(file) });
}

/** Loads all designs from the given folders (relative to root, which is Typst's workspace). */
export async function loadThemes(root, dirs) {
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      const file = path.join(abs, name, 'theme.js');
      if (!fs.existsSync(file)) continue;
      try {
        await loadOne(file, '/' + path.relative(root, path.dirname(file)).split(path.sep).join('/'), []);
      } catch (e) {
        console.warn(`Seitendesign ${name} nicht geladen: ${e.message}`);
      }
    }
  }
  return [...themes.keys()];
}

/**
 * Loads designs from a folder outside the app (e.g. "themes" next to the portable .exe).
 * Typst can only import from its workspace, so the design's files are handed over as virtual
 * files under /ext-themes/<folder>/ (see themeFiles).
 */
export async function loadExternalThemes(absDir) {
  if (!absDir || !fs.existsSync(absDir)) return [];
  const loaded = [];
  for (const name of fs.readdirSync(absDir)) {
    const folder = path.join(absDir, name);
    const file = path.join(folder, 'theme.js');
    if (!fs.existsSync(file)) continue;
    try {
      await loadOne(file, `/ext-themes/${name}`, virtualFiles(folder, name));
      loaded.push(name);
    } catch (e) {
      console.warn(`Seitendesign ${name} nicht geladen: ${e.message}`);
    }
  }
  return loaded;
}

/** The Typst files of a design folder as virtual files under /ext-themes/<name>/. */
function virtualFiles(folder, name) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((f) => f.isFile() && !f.name.endsWith('.js'))
    .map((f) => [`ext-themes/${name}/${f.name}`, fs.readFileSync(path.join(folder, f.name))]);
}

// ----------------------------------------------------------- import / remove --
// Installing a design runs its theme.js on the server, so the server only offers this while it is
// reachable from this computer alone (see server.js). A package holds flat files, optionally inside
// one folder; the design goes into its own folder in `targetDir` and is usable at once.

const FILE_OK = /^[\w-][\w.-]*\.(js|typ|png|jpe?g|svg|gif|ttf|otf|json|md|txt)$/i;

/** Files of an unpacked package [{ name, data }] -> installed design { name, label }. */
export async function installTheme(entries, targetDir, nameHint = '') {
  const names = entries.map((e) => e.name.replace(/\\/g, '/'));
  const tops = new Set(names.map((n) => (n.includes('/') ? n.split('/')[0] : '')));
  const prefix = tops.size === 1 && !tops.has('') ? `${[...tops][0]}/` : '';
  const files = entries.map((e, i) => ({ name: names[i].slice(prefix.length), data: e.data }));
  for (const f of files) {
    if (!FILE_OK.test(f.name)) throw new Error(`Datei nicht erlaubt: ${f.name} (nur Dateien ohne Unterordner, z. B. theme.js, .typ, Bilder, Schriften)`);
  }
  if (!files.some((f) => f.name === 'theme.js')) throw new Error('Das Paket enthält keine theme.js.');
  const folder = (prefix.slice(0, -1) || nameHint).toLowerCase().replace(/\.zip$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'design';
  fs.mkdirSync(targetDir, { recursive: true });
  const dest = path.join(targetDir, folder);
  const tmp = path.join(targetDir, `.import-${folder}-${Date.now()}`);
  fs.mkdirSync(tmp);
  try {
    for (const f of files) fs.writeFileSync(path.join(tmp, f.name), f.data);
    const theme = await importTheme(path.join(tmp, 'theme.js'), `?v=${Date.now()}`);
    const old = themes.get(theme.name);
    if (old && path.resolve(old.folder || '') !== path.resolve(dest)) {
      throw new Error(`Ein Design mit dem Namen „${theme.name}“ ist schon installiert. Erst entfernen.`);
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
    themes.set(theme.name, { ...theme, dir: `/ext-themes/${folder}`, files: virtualFiles(dest, folder), folder: dest });
    return { name: theme.name, label: theme.label || theme.name };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Remove an installed design (only one that lives in targetDir, not one shipped with the app). */
export function removeTheme(name, targetDir) {
  const t = themes.get(name);
  if (!t) throw new Error('Unbekanntes Design');
  if (!t.folder || path.dirname(path.resolve(t.folder)) !== path.resolve(targetDir)) throw new Error('Dieses Design gehört zur Installation und lässt sich hier nicht entfernen.');
  fs.rmSync(t.folder, { recursive: true, force: true });
  themes.delete(name);
}

/** Virtual files [path relative to the workspace, bytes] of the designs loaded from outside the app. */
export const themeFiles = () => [...themes.values()].flatMap((t) => t.files || []);

export const getTheme = (name) => themes.get(name);

/** What the editor needs to offer the designs and their settings. */
export const themeList = (importDir = null) => [...themes.values()].map(({ name, label, hint, fields, logo, folder }) => ({
  name, label, hint, fields: fields || [], logo: logo || null,
  removable: !!importDir && !!folder && path.dirname(path.resolve(folder)) === path.resolve(importDir),
}));
