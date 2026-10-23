// What Lineatur is built on, shown in the dashboard under "Lizenzen & Danksagung".
// Add a row here whenever a dependency, font or service is added.

export const SOURCE_URL = 'https://github.com/c-siegel/Lineatur';
export const OWN_LICENSE = { name: 'MIT-Lizenz', holder: '© 2026 Christian Siegel' };

const OFL = ['SIL Open Font License 1.1', 'https://openfontlicense.org'];

// [group, [[name, url, what it does in Lineatur, licence, licence url?]]]
export const ATTRIBUTIONS = [
  ['Software', [
    ['Typst', 'https://typst.app', 'Setzt Vorschau, PDF und Formeln', 'Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0'],
    ['typst.ts (Node-Compiler)', 'https://github.com/Myriad-Dreamin/typst.ts', 'Bindet Typst in den Server ein', 'Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0'],
    ['node-qrcode', 'https://github.com/soldair/node-qrcode', 'Erzeugt die QR-Codes', 'MIT', 'https://opensource.org/license/mit'],
    ['Electron', 'https://www.electronjs.org', 'Desktop-App (portable .exe)', 'MIT', 'https://opensource.org/license/mit'],
    ['electron-builder', 'https://www.electron.build', 'Baut die portable App', 'MIT', 'https://opensource.org/license/mit'],
  ]],
  ['Schriften für Arbeitsblätter', [
    ['Open Sans, Source Sans 3, Maven Pro, Roboto, Comic Neue, Lora, Kalam, Fraunces, Montserrat, Nunito, BioRhyme, Caveat',
      'https://fonts.google.com', 'Schriftarten der Blätter, eingebettet in PDF und HTML', ...OFL],
    ['OpenDyslexic', 'https://opendyslexic.org', 'Schrift für Lesende mit Legasthenie', ...OFL],
    ['Libertinus Serif', 'https://github.com/alerque/libertinus', 'Ersatzschrift, in Typst enthalten', ...OFL],
    ['New Computer Modern („Modern Roman“)', 'https://ctan.org/pkg/newcomputermodern', 'Formelsatz, in Typst enthalten', 'GUST Font License', 'https://ctan.org/license/gfl'],
    ['DejaVu Sans Mono', 'https://dejavu-fonts.github.io', 'Quellcode und Rätselgitter, in Typst enthalten', 'Bitstream-Vera-Lizenz (frei)', 'https://dejavu-fonts.github.io/License.html'],
  ]],
  ['Schriften der Oberfläche', [
    ['Atkinson Hyperlegible', 'https://www.brailleinstitute.org/freefont/', 'Text der Oberfläche (Braille Institute)', ...OFL],
    ['Schibsted Grotesk', 'https://github.com/schibsted/schibsted-grotesk', 'Überschriften und Logo-Schriftzug', ...OFL],
  ]],
  ['Dienste und Inhalte', [
    ['Openverse', 'https://openverse.org', 'Suche nach frei lizenzierten Bildern (WordPress Foundation). Jedes Bild behält seine eigene Lizenz; sie steht im Bildnachweis.', 'je Bild (CC-Lizenzen, gemeinfrei)', 'https://creativecommons.org/licenses/'],
  ]],
  ['Eigene Teile', [
    ['Editor, Generatoren, Symbole', null, 'Editor, Rätsel- und Diagrammgeneratoren, Funktionsplots, Broschürendruck und die Symbole der Oberfläche', 'MIT', 'https://opensource.org/license/mit'],
  ]],
];
