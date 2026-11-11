// Projektheft – page design of the XtremLab student lab booklets
// (Institut für Didaktik der Physik). A5 pages, printed two per A4 sheet,
// folded in the middle: the red and light-blue triangles of two facing pages
// meet at the fold and carry the page numbers.
//
// Standalone use:
//
//   #import "projektheft.typ": *
//   #show: projektheft.with(title: "Klimawandel", institute: "Institut für Didaktik der Physik")
//   #ph-cover(title: "Schülerlabor", subtitle: "Klimawandel", tagline: "In 8 Missionen den Klimawandel verstehen.")
//   #pagebreak()
//   = Mission 1: Das Meer und die Eismassen
//   #ph-card(ph-colors.blue)[(1) Seit 1995 ist der Meeresspiegel um #ph-gap(3cm) gestiegen.]
//
// Lineatur (theme.js next to this file) imports it and only uses `ph-page` and `ph-heading`; all
// helper names contain a hyphen (user math cannot reach them).

#let ph-colors = (
  red: rgb("#b8302c"),
  coral: rgb("#d9524a"),
  pink: rgb("#f3b2a9"),
  sky: rgb("#86c5df"),
  // per-mission card colours
  blue: rgb("#a9c8ef"),
  teal: rgb("#6cc3bf"),
  rose: rgb("#e8939d"),
  lilac: rgb("#c49bd6"),
  magenta: rgb("#e891b5"),
  orange: rgb("#f5a35c"),
  yellow: rgb("#f2d43a"),
  periwinkle: rgb("#a3a9f5"),
)

// ------------------------------------------------------------------ pages --

// Shapes run past the page edges by `ph-bleed` (the page clips them). Ending exactly
// on the edge leaves a hairline of white in viewers and printers.
#let ph-bleed = 1.5mm

// Half of the fold design on one page. `x(d)` maps a distance from the fold to a
// page coordinate, so the same shapes serve left and right pages.
#let ph-fold(w, h, inner-left, number) = {
  let x(d) = if inner-left { d } else { w - d }
  let b = ph-bleed
  let apex = 0.75 * h
  let base = 21mm
  let band = 14mm
  let edge-at(y) = base * ((y - apex) / (h - apex))
  // light-blue wedge along the bottom edge
  place(top + left, curve(fill: ph-colors.sky, stroke: none,
    curve.move((x(-b), h - band)), curve.line((x(72mm), h + b)), curve.line((x(-b), h + b)), curve.close()))
  // red triangle from the fold
  place(top + left, curve(fill: ph-colors.red, stroke: none,
    curve.move((x(-b), apex)), curve.line((x(0mm), apex)), curve.line((x(edge-at(h + b)), h + b)), curve.line((x(-b), h + b)), curve.close()))
  // lighter red where it overlaps the blue wedge
  place(top + left, curve(fill: ph-colors.coral, stroke: none,
    curve.move((x(-b), h - band)), curve.line((x(edge-at(h - band)), h - band)),
    curve.line((x(edge-at(h + b)), h + b)), curve.line((x(-b), h + b)), curve.close()))
  if number != none {
    let d = 7.5mm
    place(top + left, dx: x(d) - 5mm, dy: h - 8.5mm,
      box(width: 10mm, align(center, text(size: 9pt, fill: white, weight: "bold", number))))
  }
}

// Angular shapes of the front cover (a right-hand page; the fold is on the left).
#let ph-front-shapes(w, h) = {
  let b = ph-bleed
  place(top + left, curve(fill: ph-colors.pink, stroke: none,
    curve.move((-b, h - 34mm)), curve.line((44mm, h - 27mm)), curve.line((-b, h - 22mm)), curve.close()))
  place(top + left, curve(fill: ph-colors.coral, stroke: none,
    curve.move((-b, h - 26mm)), curve.line((w + b, h - 42mm)), curve.line((w + b, h - 10mm)), curve.line((-b, h - 4mm)), curve.close()))
  place(top + left, curve(fill: ph-colors.red, stroke: none,
    curve.move((-b, h - 12mm)), curve.line((w + b, h - 30mm)), curve.line((w + b, h + b)), curve.line((-b, h + b)), curve.close()))
}

// Shapes of the back cover (a left-hand page; the fold is on the right).
// Drawn back to front so every shape starts underneath the previous one: no gaps.
#let ph-back-shapes(w, h) = {
  let b = ph-bleed
  // blue band from under the red triangle to the fold
  place(top + left, curve(fill: ph-colors.sky, stroke: none,
    curve.move((0.12 * w, 0.74 * h)), curve.line((w + b, h + b)), curve.line((0.12 * w, h + b)), curve.close()))
  // dark red triangle down the outer edge, reaching the bottom
  place(top + left, curve(fill: ph-colors.red, stroke: none,
    curve.move((-b, 0.4 * h)), curve.line((0.3 * w, h + b)), curve.line((-b, h + b)), curve.close()))
  // coral corner on top
  place(top + left, curve(fill: ph-colors.coral, stroke: none,
    curve.move((-b, 0.76 * h)), curve.line((0.38 * w, h + b)), curve.line((-b, h + b)), curve.close()))
}

/// Last level-1 heading on or before the current page (the running section title).
#let ph-section() = {
  let here-page = here().page()
  let hs = query(heading.where(level: 1)).filter(it => it.location().page() <= here-page)
  if hs.len() > 0 { hs.last().body } else { none }
}

/// Arguments for `set page(..)`: background with header, footer and fold design.
/// cover: page 1 is the front cover (no header, numbering starts on page 2 with 1).
/// back-cover: the last page is the back cover.
#let ph-page(
  width: 148mm, height: 210mm,
  title: "", series: "Projektheft", institute: "", logo: none,
  cover: true, back-cover: false,
) = (
  header: none,
  footer: none,
  // clipped to the page, so the bleed never reaches a neighbouring page (the editor's SVG stacks them)
  background: context box(width: width, height: height, clip: true, {
    let p = here().page()
    let last = counter(page).final().first()
    let pw = width
    let ph = height
    let right-page = calc.odd(p)
    if cover and p == 1 {
      ph-front-shapes(pw, ph)
    } else if back-cover and p == last and p > 1 {
      ph-back-shapes(pw, ph)
    } else {
      let shown = if cover { p - 1 } else { p }
      ph-fold(pw, ph, right-page, str(shown))
      set text(size: 8pt, fill: luma(40))
      if right-page {
        // section title, right aligned, rule to the outer edge
        place(top + left, dy: 7.2mm, box(width: pw - 17mm, align(right, ph-section())))
        place(top + left, dx: pw - 15mm, dy: 9.1mm, line(length: 15mm, stroke: 0.6pt + luma(40)))
      } else {
        place(top + left, dy: 9.1mm, line(length: 15mm, stroke: 0.6pt + luma(40)))
        place(top + left, dx: 17mm, dy: 7.2mm, [#text(weight: "bold", title)#if series != "" [ | #series]])
        // footer: logo and institute on left-hand pages
        place(top + left, dx: 8mm, dy: ph - 12mm, box(height: 7mm, {
          set align(horizon)
          if logo != none { box(height: 6mm, logo); h(2.5mm) }
          text(size: 7.5pt, fill: luma(30), institute)
        }))
      }
    }
  }),
)

/// Section heading: centred, bold, underlined.
#let ph-heading(body) = block(width: 100%, above: 1.2em, below: 0.9em, breakable: false,
  align(center, text(size: 1.2em, weight: "bold", underline(offset: 2.5pt, stroke: 0.8pt, body))))

// ---------------------------------------------------------- components --

/// Rounded card with a coloured frame (the task boxes of each mission).
#let ph-card(color, body) = block(width: 100%, inset: 8pt, radius: 9pt, stroke: 1.6pt + color, breakable: false, body)

/// Filled info box.
#let ph-info(color, body) = block(width: 100%, inset: 9pt, radius: 11pt, fill: color, breakable: false, body)

/// Grey gap to fill in.
#let ph-gap(width) = box(width: width, height: 1.3em, baseline: 0.3em, fill: luma(240))

/// Front cover: logos, title, italic subtitle, tagline, name line, optional QR code.
#let ph-cover(title: "", subtitle: "", tagline: "", institute: "", logo-left: none, logo-right: none,
  name-label: "Name", qr: none, qr-label: "") = {
  grid(columns: (auto, 1fr, auto), column-gutter: 8pt, align: horizon,
    if logo-left != none { box(height: 18mm, logo-left) },
    text(size: 8pt, institute),
    if logo-right != none { box(height: 22mm, logo-right) })
  v(16mm)
  align(center)[
    #text(size: 18pt, weight: "bold", title) \
    #v(2pt)
    #text(size: 18pt, weight: "bold", style: "italic", subtitle)
    #v(6mm)
    #text(size: 10pt, tagline)
  ]
  v(10mm)
  grid(columns: (auto, 1fr), column-gutter: 6pt, [#name-label:], box(width: 100%, height: 1em, stroke: (bottom: 0.5pt)))
  if qr != none {
    v(6mm)
    align(center, stack(spacing: 2mm, box(width: 34mm, qr),
      if qr-label != "" { box(fill: black, radius: 3pt, inset: (x: 10pt, y: 4pt), text(fill: white, size: 8pt, qr-label)) }))
  }
}

/// Whole-document setup for standalone use.
#let projektheft(
  title: "", series: "Projektheft", institute: "", logo: none,
  cover: true, back-cover: false, font: "Open Sans", size: 10pt, lang: "de",
  body,
) = {
  set page(width: 148mm, height: 210mm,
    margin: (inside: 14mm, outside: 14mm, top: 16mm, bottom: 18mm),
    ..ph-page(title: title, series: series, institute: institute, logo: logo, cover: cover, back-cover: back-cover))
  set text(font: (font, "Libertinus Serif"), size: size, lang: lang)
  show heading.where(level: 1): it => ph-heading(it.body)
  body
}
