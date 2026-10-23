// Downloads the open-licensed worksheet fonts into fonts/ (run once: npm run fonts).
//
// All fonts are under the SIL Open Font License 1.1 (Roboto: Apache 2.0 / OFL),
// so they may be bundled, embedded in PDFs and redistributed. Each family's
// licence text is stored next to its files.
//
// Google Fonts hands out static TrueType files when asked without a browser
// user agent; Typst needs static files (it cannot pick weights of variable fonts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');

// [family on Google Fonts, folder in github.com/google/fonts]
export const GOOGLE_FAMILIES = [
  ['Open Sans', 'ofl/opensans'],
  ['Source Sans 3', 'ofl/sourcesans3'],
  ['Maven Pro', 'ofl/mavenpro'],
  ['Roboto', 'ofl/roboto'],
  ['Comic Neue', 'ofl/comicneue'],
  ['Lora', 'ofl/lora'],
  ['Kalam', 'ofl/kalam'],
  ['Fraunces', 'ofl/fraunces'],
  ['Montserrat', 'ofl/montserrat'],
  ['Nunito', 'ofl/nunito'],
  ['BioRhyme', 'ofl/biorhyme'],
  ['Caveat', 'ofl/caveat'],
];

const OPEN_DYSLEXIC = 'https://raw.githubusercontent.com/antijingoist/opendyslexic/master';

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Try the richest style set first; not every family has italics or a bold cut. */
async function googleCss(family) {
  const f = encodeURIComponent(family).replace(/%20/g, '+');
  const variants = [':ital,wght@0,400;0,700;1,400;1,700', ':wght@400;700', ''];
  for (const v of variants) {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${f}${v}`);
    if (res.ok) return res.text();
  }
  throw new Error(`Google Fonts has no CSS for ${family}`);
}

async function fetchGoogle(family, repoDir) {
  const css = await googleCss(family);
  const faces = [...css.matchAll(/font-style:\s*(\w+);\s*font-weight:\s*(\d+);[^}]*?url\((https:[^)]+\.ttf)\)/g)];
  const slug = family.replace(/\s+/g, '');
  const dir = path.join(FONT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [, style, weight, url] of faces) {
    const name = `${slug}-${weight}${style === 'italic' ? 'Italic' : ''}.ttf`;
    fs.writeFileSync(path.join(dir, name), await get(url));
  }
  for (const lic of ['OFL.txt', 'LICENSE.txt']) {
    try {
      fs.writeFileSync(path.join(dir, lic), await get(`https://raw.githubusercontent.com/google/fonts/main/${repoDir}/${lic}`));
      break;
    } catch { /* try the next licence file name */ }
  }
  console.log('ok', family, faces.length, 'styles');
}

async function fetchOpenDyslexic() {
  const dir = path.join(FONT_DIR, 'OpenDyslexic');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['Regular', 'Bold', 'Italic', 'Bold-Italic']) {
    fs.writeFileSync(path.join(dir, `OpenDyslexic-${f}.otf`), await get(`${OPEN_DYSLEXIC}/compiled/OpenDyslexic-${f}.otf`));
  }
  fs.writeFileSync(path.join(dir, 'OFL.txt'), await get(`${OPEN_DYSLEXIC}/OFL.txt`));
  console.log('ok OpenDyslexic 4 styles');
}

await fetchOpenDyslexic();
for (const [family, repoDir] of GOOGLE_FAMILIES) {
  try {
    await fetchGoogle(family, repoDir);
  } catch (e) {
    console.warn('skipped', family, '-', e.message);
  }
}
