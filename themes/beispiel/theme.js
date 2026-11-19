// Example page design: a coloured strip at the outer page edge with the page number, the
// title in the header and a footer line with logo. Meant as a starting point: copy the
// folder, rename it and change name, label and the Typst file (see README.md here).
// Also used by test/themes.test.mjs and scripts/smoke.mjs.

const DEFAULT_COLOR = '#2f6fdb';

export default {
  // stored in the document (doc.theme); must be unique and must not be "custom"
  name: 'beispiel',
  label: 'Beispiel: Randleiste',
  hint: 'Farbige Leiste am äußeren Seitenrand mit der Seitenzahl, Titel und Reihe in der Kopfzeile, Fußzeile mit Text und Logo. Titel- und Rückseite einer Broschüre bleiben frei.',

  // text settings in the editor, stored in doc.themeOptions[key]; '{title}' shows the sheet's title
  fields: [
    { key: 'series', label: 'Reihe (rechts in der Kopfzeile)', placeholder: 'z. B. Physik, Klasse 8' },
    { key: 'title', label: 'Titel in der Kopfzeile', placeholder: '{title}' },
    { key: 'footer', label: 'Text in der Fußzeile', placeholder: 'z. B. Name der Schule' },
    { key: 'color', label: 'Farbe der Leiste (#rrggbb)', placeholder: DEFAULT_COLOR },
  ],
  // an image setting (doc.themeOptions.logo, a data URL)
  logo: 'Logo in der Fußzeile',

  // Typst code before the page setup; dir is this folder's path for #import
  setup: (dir) => `#import "${dir}/beispiel.typ": bsp-page`,

  // the arguments for #set page(..); everything from the document goes through t.S (a Typst
  // string), and the colour is checked here, so no user input ends up as Typst code
  page(doc, t) {
    const o = doc.themeOptions || {};
    const color = /^#[0-9a-f]{6}$/i.test(String(o.color || '').trim()) ? o.color.trim() : DEFAULT_COLOR;
    return `bsp-page(width: ${t.width}mm, height: ${t.height}mm, mirrored: ${t.mirrored},
    title: ${t.S(o.title || doc.title || '')}, series: ${t.S(o.series || '')}, footer: ${t.S(o.footer || '')},
    color: rgb(${t.S(color)}), logo: ${t.image(o.logo, 6)},
    cover: ${t.cover}, back-cover: ${t.backCover})`;
  },
};
