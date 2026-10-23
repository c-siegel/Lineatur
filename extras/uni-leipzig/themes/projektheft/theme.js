// Seitendesign "Projektheft": the student lab booklets of the Institut für Didaktik der
// Physik (Universität Leipzig). Red and light-blue triangles meet at the fold and carry the
// page numbers; title and series in the header, institute and logo in the footer.
// Loaded by src/themes.js when this folder sits in themes/ (see ../../README.md).
export default {
  name: 'projektheft',
  label: 'Projektheft (Schülerlabor)',
  hint: 'Kopfzeile, Fußzeile und Hintergrund sind fest vorgegeben: Dreiecke an der Falz mit den Seitenzahlen, Reihe und Titel oben, Einrichtung und Logo unten. Gedacht für A5-Broschüren.',
  fields: [
    { key: 'series', label: 'Reihe (neben dem Titel in der Kopfzeile)', placeholder: 'Projektheft' },
    { key: 'title', label: 'Titel in der Kopfzeile', placeholder: '{title}' },
    { key: 'institute', label: 'Einrichtung (Fußzeile linker Seiten)', placeholder: 'z. B. Institut für Didaktik der Physik' },
  ],
  logo: 'Logo in der Fußzeile',

  setup: (dir) => `#import "${dir}/projektheft.typ": ph-page, ph-heading
#show heading.where(level: 1): it => ph-heading(it.body)`,

  page(doc, t) {
    const o = doc.themeOptions || {};
    return `ph-page(width: ${t.width}mm, height: ${t.height}mm, title: ${t.S(o.title || doc.title || '')}, series: ${t.S(o.series ?? 'Projektheft')},
    institute: ${t.S(o.institute || '')}, logo: ${t.image(o.logo, 6)},
    cover: ${t.cover}, back-cover: ${t.backCover})`;
  },
};
