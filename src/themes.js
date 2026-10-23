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

/** Loads all designs from the given folders (relative to root, which is Typst's workspace). */
export async function loadThemes(root, dirs) {
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      const file = path.join(abs, name, 'theme.js');
      if (!fs.existsSync(file)) continue;
      try {
        const theme = (await import(pathToFileURL(file).href)).default;
        if (!theme?.name || theme.name === 'custom' || typeof theme.page !== 'function') throw new Error('name and page() are required');
        const typstDir = '/' + path.relative(root, path.dirname(file)).split(path.sep).join('/');
        themes.set(theme.name, { ...theme, dir: typstDir });
      } catch (e) {
        console.warn(`Seitendesign ${name} nicht geladen: ${e.message}`);
      }
    }
  }
  return [...themes.keys()];
}

export const getTheme = (name) => themes.get(name);

/** What the editor needs to offer the designs and their settings. */
export const themeList = () => [...themes.values()].map(({ name, label, hint, fields, logo }) => ({ name, label, hint, fields: fields || [], logo: logo || null }));
