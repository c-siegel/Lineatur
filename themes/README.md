# Seitendesigns (Erweiterungen)

Jeder Unterordner hier ist ein Seitendesign, das unter Dokument → Seite → Seitendesign erscheint.
Lineatur lädt sie beim Start (`src/themes.js`). Die allgemeine Ausgabe bringt keine mit; ohne
Erweiterung gibt es „keines“ und „Eigenes Design“ (aus Einstellungen, ohne Code).

Ein Design besteht aus einer `theme.js` und den Typst-Dateien, die sie importiert. Ein Beispiel mit
Erklärung liegt in `extras/uni-leipzig/themes/projektheft/`; zum Installieren den Ordner hierher
kopieren und Lineatur neu starten.

`theme.js` exportiert:

```js
export default {
  name: 'meindesign',             // gespeichert im Dokument (doc.theme)
  label: 'Mein Design',           // Name in der Auswahl
  hint: 'Was das Design macht',   // Erklärung neben der Auswahl
  fields: [{ key: 'series', label: 'Reihe', placeholder: '…' }],  // Texteinstellungen ('{title}' = Titel des Blatts)
  logo: 'Logo in der Fußzeile',   // optional: Bild-Einstellung
  setup: (dir) => `#import "${dir}/meindesign.typ": md-page`,
  page: (doc, t) => `md-page(width: ${t.width}mm, height: ${t.height}mm, title: ${t.S(doc.title)})`,
};
```

`page` liefert die Argumente für `#set page(..)`; `t` bietet `width`, `height`, `cover`, `backCover`,
`S` (Typst-Zeichenkette) und `image(dataUrl, höheMm)`.
