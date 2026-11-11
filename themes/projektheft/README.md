# Page designs (templates)

Typst files that give a document a complete page design: header, footer and background.
In the editor they are selected under **Dokument → Seite → Seitendesign** (after copying this folder into `themes/`, see ../../README.md). They also work without
Lineatur in any Typst ≥ 0.14 project.

## `projektheft.typ`: student lab booklets

A5 pages, printed two per A4 sheet and folded in the middle. The red and light-blue triangles of two
facing pages meet at the fold and carry the page numbers. Left-hand pages show the title and series at
the top and the institute (with an optional logo) at the bottom. Right-hand pages show the current
section, which is the last level-1 heading. The cover and the back cover get angular red/blue shapes.

```typst
#import "projektheft.typ": *

#show: projektheft.with(
  title: "Klimawandel",
  series: "Projektheft",
  institute: "Institut für Didaktik der Physik",
  logo: image("logo.png"),   // optional
  cover: true,               // page 1 is the cover; numbering starts on page 2 with 1
  back-cover: true,          // the last page is the back cover
)

#ph-cover(
  title: "Schülerlabor", subtitle: "Klimawandel",
  tagline: "In 8 Missionen den Klimawandel verstehen.",
  institute: "Institut für Didaktik der Physik",
)
#pagebreak()

= Mission 1: Das Meer und die Eismassen

#ph-card(ph-colors.blue)[
  (1) Seit 1995 ist der Meeresspiegel um #ph-gap(3cm) gestiegen.
]
#ph-info(ph-colors.rose)[
  Der Albedo-Wert gibt Auskunft darüber, wie viel Sonnenstrahlung eine Oberfläche zurückwirft.
]
```

| Name | Purpose |
|---|---|
| `projektheft.with(..)` | whole-document setup: A5 page, margins, design, font, section headings |
| `ph-page(..)` | only the page arguments: `set page(..ph-page(title: …))` (Lineatur uses this) |
| `ph-heading(body)` | centred, bold, underlined section heading |
| `ph-cover(..)` | cover content: logos, title, italic subtitle, tagline, name line, QR code with label |
| `ph-card(color, body)` | rounded task card with a coloured frame |
| `ph-info(color, body)` | filled info box |
| `ph-gap(width)` | grey gap to fill in |
| `ph-colors` | red, coral, pink, sky and the mission colours (blue, teal, rose, lilac, magenta, orange, yellow, periwinkle) |

To print it as a booklet, impose the A5 PDF two pages per A4 sheet (in Lineatur, after installing:
**Herunterladen → PDF – Broschüre**; see `src/booklet.js`).

The shapes copy the look of the printed booklets. The logos are not part of the template: upload
them in the editor, or pass `logo:` here.
