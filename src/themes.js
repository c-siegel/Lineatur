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

async function loadOne(file, typstDir, files) {
  const theme = (await import(pathToFileURL(file).href)).default;
  if (!theme?.name || theme.name === 'custom' || typeof theme.page !== 'function') throw new Error('name and page() are required');
  themes.set(theme.name, { ...theme, dir: typstDir, files });
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
      const files = fs.readdirSync(folder, { withFileTypes: true })
        .filter((f) => f.isFile() && !f.name.endsWith('.js'))
        .map((f) => [`ext-themes/${name}/${f.name}`, fs.readFileSync(path.join(folder, f.name))]);
      await loadOne(file, `/ext-themes/${name}`, files);
      loaded.push(name);
    } catch (e) {
      console.warn(`Seitendesign ${name} nicht geladen: ${e.message}`);
    }
  }
  return loaded;
}

/** Virtual files [path relative to the workspace, bytes] of the designs loaded from outside the app. */
export const themeFiles = () => [...themes.values()].flatMap((t) => t.files || []);

export const getTheme = (name) => themes.get(name);

/** What the editor needs to offer the designs and their settings. */
export const themeList = () => [...themes.values()].map(({ name, label, hint, fields, logo }) => ({ name, label, hint, fields: fields || [], logo: logo || null }));
