// Page arguments of the example design "Randleiste" (see theme.js). Without Lineatur:
//   #import "beispiel.typ": bsp-page
//   #set page(margin: 20mm, ..bsp-page(title: "Mein Blatt"))

#let bsp-page(
  width: 210mm, height: 297mm,
  mirrored: false,              // double-sided: the strip changes sides with the page
  title: "", series: "", footer: "",
  color: rgb("#2f6fdb"), logo: none,
  cover: false, back-cover: false,
) = {
  let strip = 6mm
  // page 1 of a booklet with cover is the cover, the last page the back cover
  let plain() = {
    let p = here().page()
    (cover and p == 1) or (back-cover and p > 1 and p == counter(page).final().first())
  }
  // without mirroring the strip stays on the right; with it, it is on the outside
  let strip-right() = not mirrored or calc.odd(here().page())

  (
    header: context if not plain() {
      set text(size: 8pt, fill: luma(60))
      grid(columns: (1fr, auto), align: (left + bottom, right + bottom),
        text(weight: "bold", title), series)
      v(-4pt)
      line(length: 100%, stroke: 0.6pt + color)
    },
    footer: context if not plain() {
      set text(size: 8pt, fill: luma(110))
      grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
        footer, if logo != none { box(height: 6mm, logo) })
    },
    background: context if not plain() {
      let p = here().page()
      let shown = if cover { p - 1 } else { p }
      let x = if strip-right() { width - strip } else { 0mm }
      place(top + left, dx: x, rect(width: strip, height: height, fill: color))
      place(top + left, dx: x, dy: height - 16mm,
        box(width: strip, align(center, text(size: 8pt, fill: white, weight: "bold", str(shown)))))
    },
  )
}
