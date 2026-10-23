Fonts for worksheets. All families here are under open licences (SIL Open Font
License 1.1; each folder contains its licence file), so they may be bundled,
embedded in PDFs and HTML exports, and redistributed.

  npm run fonts      re-downloads them (Google Fonts static TTFs + OpenDyslexic)

Typst additionally embeds Libertinus Serif, New Computer Modern ("Modern Roman")
and DejaVu Sans Mono (used for source code and puzzle grids).

To add another font, drop its .ttf/.otf files into a subfolder named like the
family without spaces (e.g. fonts/AtkinsonHyperlegible/) and add the family name
to FONTS in public/layout.js.
