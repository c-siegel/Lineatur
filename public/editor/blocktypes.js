// Lineatur editor – The block types (palette groups, labels, icons, defaults) and the option lists of their settings.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import { randSeed } from './util.js';
import { row } from './docpanel.js';
import { mode } from '../app.js';

// Palette groups, in display order.
const GROUPS = [
  ['basic', 'Grundlagen'], ['exercise', 'Aufgaben'], ['puzzle', 'Rätsel'], ['mint', 'MINT'],
];

const TYPES = {
  heading: { group: 'basic', label: 'Überschrift', icon: 'H', make: () => ({ type: 'heading', level: 1, text: 'Neuer Abschnitt' }) },
  text: {
    group: 'basic', label: 'Text', icon: '¶',
    make: () => ({ type: 'text', text: 'Erklärender Text. Formeln im Text gehen auch: $x^2 + 1$.' }),
  },
  toc: {
    group: 'basic', label: 'Inhaltsverzeichnis', icon: '☰',
    make: () => ({ type: 'toc', title: 'Inhaltsverzeichnis', depth: 2, pageNumbers: true, dots: true }),
  },
  image: {
    group: 'basic', label: 'Bild', icon: '▣',
    make: () => ({ type: 'image', src: '', caption: '', credit: '', width: 100, align: 'center' }),
  },
  lines: {
    group: 'basic', label: 'Linien', icon: '≡',
    make: () => ({ type: 'lines', count: 4, lineStyle: 'ruled', spacing: 9 }),
  },
  squares: {
    group: 'basic', label: 'Kästchen', icon: '▦',
    make: () => ({ type: 'squares', rows: 6, size: 5, dots: false }),
  },
  qr: {
    group: 'basic', label: 'QR-Code', icon: '⊞',
    make: () => ({ type: 'qr', text: 'https://de.wikipedia.org/', caption: '', size: 28, align: 'center' }),
  },
  score: {
    group: 'basic', label: 'Punktezähler', icon: 'Σ',
    make: () => ({ type: 'score', label: '', max: 0, align: 'right' }),
  },
  assessment: {
    group: 'basic', label: 'Bewertung & Notenschlüssel', icon: '%',
    make: () => ({ type: 'assessment', title: 'Bewertung', table: true, scale: true, scaleLabel: '', thresholds: [...GRADE_THRESHOLDS] }),
  },
  pagebreak: {
    group: 'basic', label: 'Seitenumbruch', icon: '⤓', flowOnly: true,
    make: () => ({ type: 'pagebreak' }),
  },
  table: {
    group: 'basic', label: 'Tabelle', icon: '▤',
    make: () => ({
      type: 'table', title: '', rows: ' | Spalte A | Spalte B\nZeile 1 |  | \nZeile 2 | [[Antwort]] | ',
      header: 'both', look: 'filled', color: 'blue', rowHeight: 0, widths: '',
    }),
  },
  tchart: {
    group: 'basic', label: 'Gegenüberstellung', icon: '⊤',
    make: () => ({ type: 'tchart', text: '', columns: 'Gemeinsamkeiten | Unterschiede', lines: 3, solution: '' }),
  },
  infobox: {
    group: 'basic', label: 'Infokasten', icon: 'ℹ',
    make: () => ({ type: 'infobox', title: '', text: 'Merke: …', color: 'rose' }),
  },
  choice: {
    group: 'exercise', label: 'Multiple-Choice', icon: '☑',
    make: () => ({
      type: 'choice', text: 'Welche Aussage ist richtig?', points: 1, difficulty: 1,
      options: [
        { text: 'Antwort A', correct: true },
        { text: 'Antwort B', correct: false },
        { text: 'Antwort C', correct: false },
      ],
    }),
  },
  cloze: {
    group: 'exercise', label: 'Lückentext', icon: '_',
    make: () => ({ type: 'cloze', text: 'Fülle die [[Lücke]] und die [[Leerstelle|Lücke]] aus.', points: 2, difficulty: 1 }),
  },
  sorting: {
    group: 'exercise', label: 'Sortieraufgabe', icon: '⇅',
    make: () => ({
      type: 'sorting', text: 'Bringe die Schritte in die richtige Reihenfolge.', items: 'Erster Schritt\nZweiter Schritt\nDritter Schritt\nVierter Schritt',
      seed: randSeed(), points: 2, difficulty: 1,
    }),
  },
  matching: {
    group: 'exercise', label: 'Wörter zuordnen', icon: '⇄',
    make: () => ({
      type: 'matching', text: 'Ordne richtig zu.', pairs: 'Hund = dog\nKatze = cat\nHaus = house\nBaum = tree',
      seed: randSeed(), points: 4, difficulty: 1,
    }),
  },
  cycle: {
    group: 'exercise', label: 'Kreislauf', icon: '⟳',
    make: () => ({
      type: 'cycle', text: 'Vervollständige den Kreislauf.', items: 'Erster Schritt\n[[Zweiter Schritt]]\nDritter Schritt\n[[Vierter Schritt]]',
      color: 'lilac', direction: 'cw', wordbank: false, seed: randSeed(), points: 2, difficulty: 1,
    }),
  },
  chain: {
    group: 'exercise', label: 'Reihenfolge (Pfeile)', icon: '→',
    make: () => ({
      type: 'chain', text: 'Bringe in die richtige Reihenfolge.', items: '[[Erstens]]\n[[Zweitens]]\n[[Drittens]]\n[[Viertens]]',
      color: 'rose', direction: 'row', wordbank: true, seed: randSeed(), points: 2, difficulty: 1,
    }),
  },
  wordsearch: {
    group: 'puzzle', label: 'Wortsuchrätsel', icon: '⌗',
    make: () => ({
      type: 'wordsearch', text: 'Finde die versteckten Wörter.', words: 'Apfel, Banane, Kirsche, Traube',
      size: 10, difficulty: 1, seed: randSeed(), points: 0,
    }),
  },
  crossword: {
    group: 'puzzle', label: 'Kreuzworträtsel', icon: '✚',
    make: () => ({
      type: 'crossword', text: 'Löse das Kreuzworträtsel.',
      entries: 'Apfel: Rote oder grüne Frucht\nBanane: Lange gelbe Frucht\nZitrone: Saure gelbe Frucht\nMelone: Groß, rund und saftig\nPflaume: Kleine lila Frucht',
      seed: randSeed(), points: 5, difficulty: 2,
    }),
  },
  anagram: {
    group: 'puzzle', label: 'Anagramm', icon: '↻',
    make: () => ({ type: 'anagram', text: 'Wie heißen die Wörter richtig?', words: 'Apfel, Birne, Pflaume', seed: randSeed(), points: 3, difficulty: 1 }),
  },
  arithmetic: {
    group: 'mint', label: 'Rechenaufgaben', icon: '±',
    make: () => ({
      type: 'arithmetic', text: 'Rechne.', ops: ['+', '-'], min: 1, max: 20, count: 12, columns: 3,
      noNegative: true, seed: randSeed(), points: 3, difficulty: 1,
    }),
  },
  formula: {
    group: 'mint', label: 'Formel', icon: '∑',
    make: () => ({ type: 'formula', formula: 'a^2 + b^2 = c^2', size: 14, align: 'center' }),
  },
  function: {
    group: 'mint', label: 'Funktionsgraph', icon: '∿',
    make: () => ({
      type: 'function', text: '', fns: 'f(x) = x^2 - 2', xmin: -4, xmax: 4, ymin: -3, ymax: 6, step: 1,
      grid: 'squares', showGraphs: 'always', points: '', connect: false, legend: true, maxHeight: 110,
    }),
  },
  valuetable: {
    group: 'mint', label: 'Wertetabelle', icon: '⊟',
    make: () => ({ type: 'valuetable', text: 'Vervollständige die Wertetabelle.', fn: 'f(x) = 2x + 1', xs: '-2; -1; 0; 1; 2', mode: 'blank', showTerm: true }),
  },
  tree: {
    group: 'mint', label: 'Baumdiagramm', icon: '⋔',
    make: () => ({
      type: 'tree', text: '', spec: 'Kopf: 1/2\n  Kopf: 1/2\n  Zahl: 1/2\nZahl: 1/2\n  Kopf: 1/2\n  Zahl: 1/2',
      showProbs: 'always', showPaths: 'solution',
    }),
  },
  code: {
    group: 'mint', label: 'Quellcode', icon: '</>',
    make: () => ({ type: 'code', title: '', lang: 'python', code: 'for i in range(3):\n    print(i)', lineNumbers: true, size: 9 }),
  },
};

// Share of the total points needed for grades 1..5 (same defaults as src/toTypst.js).
const GRADE_THRESHOLDS = [92, 81, 67, 50, 30];
const HEADER_LABELS = { de: { name: 'Name', klass: 'Klasse', date: 'Datum' }, en: { name: 'Name', klass: 'Class', date: 'Date' } };

const CODE_LANGS = ['python', 'java', 'javascript', 'c', 'cpp', 'csharp', 'html', 'css', 'sql', 'bash', 'json', 'xml', 'php', 'kotlin', 'go', 'rust', 'text'];

// Colour choices (names match src/typst-util.js).
const FILL_OPTIONS = [
  ['none', 'keine'], ['gray1', 'hellgrau'], ['gray2', 'grau'], ['gray3', 'dunkelgrau'], ['blue', 'blau'],
  ['green', 'grün'], ['yellow', 'gelb'], ['orange', 'orange'], ['red', 'rot'], ['purple', 'lila'],
  ['sky', 'himmelblau (pastell)'], ['teal', 'türkis (pastell)'], ['rose', 'rosé (pastell)'], ['lilac', 'flieder (pastell)'],
  ['pink', 'pink (pastell)'], ['periwinkle', 'lavendel (pastell)'],
];
const STROKE_OPTIONS = [
  ['gray', 'grau'], ['dark', 'dunkelgrau'], ['black', 'schwarz'], ['blue', 'blau'], ['green', 'grün'],
  ['yellow', 'gelb'], ['orange', 'orange'], ['red', 'rot'], ['purple', 'lila'],
  ['sky', 'himmelblau (pastell)'], ['teal', 'türkis (pastell)'], ['rose', 'rosé (pastell)'], ['lilac', 'flieder (pastell)'],
  ['pink', 'pink (pastell)'], ['periwinkle', 'lavendel (pastell)'],
];
// Info boxes (src/typst-util.js TINTS), tables (src/tables.js) and diagrams (src/diagrams.js).
const TINT_OPTIONS = [['rose', 'rosé'], ['periwinkle', 'lavendel'], ['orange', 'orange'], ['sky', 'himmelblau'], ['teal', 'türkis'],
  ['yellow', 'gelb'], ['lilac', 'flieder'], ['green', 'grün'], ['gray', 'grau']];
const TABLE_COLOR_OPTIONS = [['blue', 'blau'], ['yellow', 'gelb'], ['green', 'grün'], ['rose', 'rosé'], ['lilac', 'flieder'], ['gray', 'grau']];
const DIAGRAM_COLOR_OPTIONS = [['lilac', 'flieder'], ['orange', 'orange'], ['blue', 'blau'], ['teal', 'türkis'], ['rose', 'rosé'], ['gray', 'grau']];

export {
  CODE_LANGS, DIAGRAM_COLOR_OPTIONS, FILL_OPTIONS, GRADE_THRESHOLDS, GROUPS, HEADER_LABELS, STROKE_OPTIONS,
  TABLE_COLOR_OPTIONS, TINT_OPTIONS, TYPES,
};
