// Lineatur editor – Inspector fields: inputs bound to a block, colour controls, the settings of every block type,
// the help card and frame / background controls.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import { svgIcon } from '../icons.js';
import { isTask } from '../layout.js';
import { BLOCK_HELP } from '../help.js';
import { $, h, iconBtn, randSeed, toast } from './util.js';
import {
  assessmentFields, changed, doc, isFree, mode, renderBlocks, renderInspector, select, setInspectGroup,
  setInspectorOpen, ungroupSelection,
} from '../app.js';
import { field, row, section } from './docpanel.js';
import { imageFields } from './images.js';
import {
  CODE_LANGS, DIAGRAM_COLOR_OPTIONS, FILL_OPTIONS, STROKE_OPTIONS, TABLE_COLOR_OPTIONS, TINT_OPTIONS,
} from './blocktypes.js';
import { renderOverlay } from './canvas.js';

function textInput(b, key, label) {
  return h('label', {}, label, h('input', {
    type: 'text', value: b[key] ?? '', oninput: (e) => { b[key] = e.target.value; changed(); },
  }));
}
function textArea(b, key, label, rows = 3) {
  return h('label', {}, label, h('textarea', {
    rows, oninput: (e) => { b[key] = e.target.value; changed(); },
  }, b[key] ?? ''));
}
function numberInput(b, key, label, { min = 0, max = 999, step = 1, def = 0 } = {}) {
  return h('label', {}, label, h('input', {
    type: 'number', min, max, step, value: b[key] ?? def,
    oninput: (e) => { b[key] = e.target.value === '' ? 0 : Number(e.target.value); changed(); },
  }));
}
function selectInput(b, key, label, options) {
  return h('label', {}, label, h('select', {
    onchange: (e) => { b[key] = Number(e.target.value); changed(); },
  }, options.map(([v, t]) => h('option', { value: v, selected: Number(b[key]) === v }, t))));
}
/** Like selectInput, for string values. */
function choiceInput(b, key, label, options, onchange) {
  return h('label', {}, label, h('select', {
    onchange: (e) => { b[key] = e.target.value; onchange?.(); changed(); },
  }, options.map(([v, t]) => h('option', { value: v, selected: String(b[key] ?? '') === v }, t))));
}
function checkInput(b, key, label, def = false) {
  return h('label', { class: 'check' }, h('input', {
    type: 'checkbox', checked: b[key] ?? def, onchange: (e) => { b[key] = e.target.checked; changed(); },
  }), label);
}
const codeArea = (b, key, label, rows) => {
  const el = textArea(b, key, label, rows);
  el.querySelector('textarea').classList.add('mono');
  el.querySelector('textarea').spellcheck = false;
  return el;
};

// ---- colours: palette names or any RGB colour, stored as "#rrggbb" (the engine accepts exactly that form)

const HEX = /^#[0-9a-f]{6}$/i;

/** "#rrggbb", "rrggbb" or "r, g, b" (0–255) -> "#rrggbb"; null if it is not a colour. */
function parseColor(t) {
  const v = String(t || '').trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(v);
  if (hex) return `#${hex[1].toLowerCase()}`;
  const rgb = /^(?:rgb\s*\()?\s*(\d{1,3})\s*[,; ]\s*(\d{1,3})\s*[,; ]\s*(\d{1,3})\s*\)?$/i.exec(v);
  if (!rgb) return null;
  const parts = rgb.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Palette select plus "Eigene Farbe (RGB)…", which shows a colour picker and a field for
 *  #rrggbb or r, g, b. set(value, final): final is false while the picker is being dragged.
 *  first: the colour the picker starts with (pale for backgrounds). */
function colorControl(cur, options, def, set, first = '#2f6fdb') {
  const custom = HEX.test(String(cur ?? ''));
  const start = custom ? String(cur).toLowerCase() : first;
  const picker = h('input', { type: 'color', value: start, title: 'Farbe wählen', 'aria-label': 'Farbe wählen' });
  const text = h('input', { type: 'text', class: 'hex', value: start, title: '#rrggbb oder r, g, b (0–255)', 'aria-label': 'RGB-Farbe', spellcheck: false });
  const box = h('span', { class: 'colorcustom', hidden: !custom || null }, picker, text);
  picker.addEventListener('input', () => { text.value = picker.value; text.classList.remove('bad'); set(picker.value, false); });
  picker.addEventListener('change', () => set(picker.value, true));
  text.addEventListener('change', () => {
    const c = parseColor(text.value);
    text.classList.toggle('bad', !c);
    if (!c) return;
    text.value = c; picker.value = c;
    set(c, true);
  });
  const select = h('select', { onchange: (e) => {
    const own = e.target.value === '__custom';
    box.hidden = !own;
    set(own ? picker.value : e.target.value, true);
  } },
  options.map(([v, t]) => h('option', { value: v, selected: !custom && String(cur ?? def) === v }, t)),
  h('option', { value: '__custom', selected: custom || null }, 'Eigene Farbe (RGB)…'));
  return h('span', { class: 'colorctl' }, select, box);
}

/** Colour setting of a block. */
const colorInput = (b, key, label, options, def, first) =>
  h('label', {}, label, colorControl(b[key], options, def, (v) => { b[key] = v; changed(); }, first));

/** "Als Aufgabe": a content block becomes a numbered exercise with points and an instruction
 *  above its content (a text block is its own instruction). */
function taskFields(b) {
  const on = isTask(b);
  return h('div', { class: 'taskbox' + (on ? ' on' : '') },
    h('label', { class: 'check' }, h('input', {
      type: 'checkbox', checked: on,
      onchange: (ev) => { b.task = ev.target.checked; changed(0); renderBlocks(); renderOverlay(); },
    }), 'Als Aufgabe: mit Nummer und Punkten'),
    on && b.type !== 'text' ? textArea(b, 'taskText', 'Arbeitsauftrag (steht über dem Inhalt)', 2) : null,
    on ? h('div', { class: 'row' }, ...scoring(b)) : null);
}

/** Points + difficulty, used by every exercise. */
const scoring = (b) => [
  numberInput(b, 'points', 'Punkte', { step: 0.5 }),
  numberInput(b, 'bonus', 'Zusatzpunkte', { step: 0.5 }),
  selectInput(b, 'difficulty', 'Schwierigkeit', DIFF),
];

/** Button that draws a new random arrangement (the seed is stored, so the sheet stays the same until then). */
function shuffleRow(b, label = '⟳ Neu mischen') {
  return h('div', { class: 'row' },
    h('button', { class: 'small', onclick: () => { b.seed = randSeed(); changed(); } }, label));
}

const ALIGN = [['left', 'links'], ['center', 'mittig'], ['right', 'rechts']];

const DIFF = [[0, 'keine'], [1, '● leicht'], [2, '●● mittel'], [3, '●●● schwer']];

// ---------------------------------------------------------- block editors --

function fieldsFor(b) {
  switch (b.type) {
    case 'heading':
      return [
        textInput(b, 'text', 'Text'),
        h('div', { class: 'row' }, selectInput(b, 'level', 'Ebene', [[1, 'Abschnitt'], [2, 'Unterabschnitt']]),
          checkInput(b, 'rule', 'Linie darunter', true)),
        h('div', { class: 'row' }, checkInput(b, 'numbered', 'Nummerieren', true), checkInput(b, 'toc', 'Im Inhaltsverzeichnis', true)),
        doc.headingNumbering ? null : h('div', { class: 'mini' }, 'Die Nummerierung schalten Sie unter Dokument → Inhalte → Überschriften ein.'),
      ];
    case 'toc':
      return [
        textInput(b, 'title', 'Titel (leer = ohne Titel)'),
        h('div', { class: 'row' },
          selectInput(b, 'depth', 'Umfang', [[1, 'nur Abschnitte'], [2, 'mit Unterabschnitten']])),
        h('div', { class: 'row' }, checkInput(b, 'pageNumbers', 'Seitenzahlen', true), checkInput(b, 'dots', 'Füllpunkte', true)),
        h('div', { class: 'mini' }, 'Listet alle Überschriften-Bausteine des Arbeitsblatts auf. Einzelne Überschriften lassen sich in ihren Eigenschaften ausnehmen.'),
      ];
    case 'text':
      return [
        textArea(b, 'text', 'Text (Formeln zwischen $…$)', 3),
        h('div', { class: 'row' },
          choiceInput(b, 'size', 'Größe', [['small', 'klein'], ['', 'normal'], ['large', 'groß'], ['title', 'Titel']]),
          choiceInput(b, 'align', 'Ausrichtung', [['', 'links'], ['center', 'mittig'], ['right', 'rechts']])),
        h('div', { class: 'row' }, checkInput(b, 'bold', 'Fett'), checkInput(b, 'italic', 'Kursiv')),
      ];
    case 'assessment':
      return assessmentFields(b);
    case 'choice': {
      const list = h('div');
      const draw = () => {
        list.replaceChildren(...b.options.map((o, i) => h('div', { class: 'opt' },
          h('input', { type: 'checkbox', checked: o.correct, title: 'Richtige Antwort',
            onchange: (e) => { o.correct = e.target.checked; changed(); } }),
          h('input', { type: 'text', value: o.text, oninput: (e) => { o.text = e.target.value; changed(); } }),
          h('button', { class: 'iconbtn del', title: 'Antwort entfernen', onclick: () => {
            b.options.splice(i, 1); draw(); changed();
          } }, '✕'))));
      };
      draw();
      return [
        textArea(b, 'text', 'Frage', 2),
        h('div', { class: 'mini' }, 'Antworten (Haken = richtig)'),
        list,
        h('div', { class: 'row' }, h('button', { class: 'small', onclick: () => {
          b.options.push({ text: 'Neue Antwort', correct: false }); draw(); changed();
        } }, '+ Antwort hinzufügen')),
        h('div', { class: 'row' }, ...scoring(b)),
        choiceInput(b, 'arrange', 'Anordnung', [['list', 'untereinander'], ['row', 'nebeneinander']]),
      ];
    }
    case 'cloze':
      return [
        textArea(b, 'text', 'Text – Lücken in [[doppelte eckige Klammern]]', 3),
        h('div', { class: 'row' }, ...scoring(b)),
        checkInput(b, 'wordbank', 'Wortspeicher: Lückenwörter gemischt darüber anzeigen'),
        b.wordbank ? shuffleRow(b) : null,
      ];
    case 'wordsearch':
      return [
        textArea(b, 'text', 'Arbeitsauftrag', 2),
        textArea(b, 'words', 'Wörter (durch Komma oder Zeilenumbruch getrennt)', 2),
        h('div', { class: 'row' },
          numberInput(b, 'size', 'Rastergröße', { min: 6, max: 18 }),
          selectInput(b, 'difficulty', 'Richtungen', [[1, '→ ↓'], [2, '+ diagonal'], [3, '+ rückwärts']])),
        h('div', { class: 'row' },
          numberInput(b, 'points', 'Punkte', { step: 0.5 }),
          numberInput(b, 'bonus', 'Zusatzpunkte', { step: 0.5 })),
        shuffleRow(b),
      ];
    case 'crossword':
      return [
        textArea(b, 'text', 'Arbeitsauftrag', 2),
        textArea(b, 'entries', 'Ein Wort pro Zeile: WORT: Hinweis', 5),
        h('div', { class: 'row' }, ...scoring(b)),
        shuffleRow(b, '⟳ Neu anordnen'),
      ];
    case 'sorting':
      return [
        textArea(b, 'text', 'Arbeitsauftrag', 2),
        textArea(b, 'items', 'Einträge in RICHTIGER Reihenfolge, einer pro Zeile (auf dem Blatt gemischt)', 4),
        h('div', { class: 'row' }, ...scoring(b)),
        shuffleRow(b),
      ];
    case 'matching':
      return [
        textArea(b, 'text', 'Arbeitsauftrag', 2),
        textArea(b, 'pairs', 'Paare, eins pro Zeile: links = rechts', 4),
        h('div', { class: 'row' }, ...scoring(b)),
        shuffleRow(b),
      ];
    case 'anagram':
      return [
        textArea(b, 'text', 'Arbeitsauftrag', 2),
        textArea(b, 'words', 'Wörter (durch Komma oder Zeilenumbruch getrennt)', 2),
        h('div', { class: 'row' }, ...scoring(b)),
        shuffleRow(b),
      ];
    case 'arithmetic': {
      const ops = h('div', { class: 'row ops' }, ...[['+', '+'], ['-', '−'], ['*', '·'], ['/', ':']].map(([op, sign]) =>
        h('label', { class: 'check' }, h('input', {
          type: 'checkbox', checked: (b.ops || []).includes(op),
          onchange: (e) => {
            const set = new Set(b.ops || []);
            if (e.target.checked) set.add(op); else set.delete(op);
            b.ops = [...set];
            changed();
          },
        }), sign)));
      return [
        textArea(b, 'text', 'Arbeitsauftrag', 1),
        h('div', { class: 'mini' }, 'Rechenarten (Divisionen gehen immer auf)'),
        ops,
        h('div', { class: 'row' },
          numberInput(b, 'min', 'Von', { min: -9999, max: 99999 }),
          numberInput(b, 'max', 'Bis', { min: -9999, max: 99999 }),
          numberInput(b, 'count', 'Aufgaben', { min: 1, max: 60 }),
          numberInput(b, 'columns', 'Spalten', { min: 1, max: 4 })),
        checkInput(b, 'noNegative', 'Keine negativen Ergebnisse bei −', true),
        h('div', { class: 'row' }, ...scoring(b)),
        shuffleRow(b, '⟳ Neue Aufgaben'),
      ];
    }
    case 'image':
      return imageFields(b);
    case 'lines':
      return [
        textInput(b, 'label', 'Beschriftung (optional, z. B. „Beobachtung:“)'),
        h('div', { class: 'row' },
          numberInput(b, 'count', 'Anzahl', { min: 1, max: 40 }),
          choiceInput(b, 'lineStyle', 'Stil', [['ruled', 'liniert'], ['school', 'Grundschule (4 Linien)'], ['dotted', 'gepunktet']]),
          numberInput(b, 'spacing', 'Abstand (mm)', { min: 2.5, max: 20, step: 0.5 })),
        textArea(b, 'solution', 'Musterlösung (ersetzt die Linien auf dem Lösungsblatt)', 2),
      ];
    case 'squares':
      return [h('div', { class: 'row' },
        numberInput(b, 'rows', 'Zeilen', { min: 1, max: 60 }),
        numberInput(b, 'size', 'Kästchengröße (mm)', { min: 3, max: 12, step: 0.5 })),
      checkInput(b, 'dots', 'Punktraster statt Linien')];
    case 'qr':
      return [
        textInput(b, 'text', 'Link oder Text'),
        textInput(b, 'caption', 'Beschriftung (optional)'),
        h('div', { class: 'row' },
          numberInput(b, 'size', 'Größe (mm)', { min: 12, max: 120 }),
          choiceInput(b, 'align', 'Ausrichtung', ALIGN),
          choiceInput(b, 'captionStyle', 'Beschriftungsstil', [['text', 'Text'], ['badge', 'Etikett (schwarz)']])),
      ];
    case 'score':
      return [
        h('div', { class: 'mini' }, 'Zeigt „Punkte: ___ / Gesamt“ – die Summe aller Aufgaben, wenn kein Maximum gesetzt ist.'),
        h('div', { class: 'row' },
          textInput(b, 'label', 'Beschriftung (Standard: Punkte)'),
          numberInput(b, 'max', 'Maximum (0 = automatisch)', { step: 0.5 }),
          choiceInput(b, 'align', 'Ausrichtung', ALIGN)),
      ];
    case 'formula':
      return [
        codeArea(b, 'formula', 'Formel – Typst-Mathematik (x^2, sqrt(x), (a)/(b)) oder LaTeX (\\frac{a}{b})', 2),
        h('div', { class: 'row' },
          numberInput(b, 'size', 'Größe (pt)', { min: 8, max: 30 }),
          choiceInput(b, 'align', 'Ausrichtung', ALIGN)),
      ];
    case 'code':
      return [
        h('div', { class: 'row' },
          textInput(b, 'title', 'Titel / Dateiname'),
          choiceInput(b, 'lang', 'Sprache', CODE_LANGS.map((l) => [l, l])),
          numberInput(b, 'size', 'Schriftgröße (pt)', { min: 6, max: 14 })),
        codeArea(b, 'code', 'Code', 6),
        checkInput(b, 'lineNumbers', 'Zeilennummern', true),
      ];
    case 'function':
      return [
        textArea(b, 'text', 'Arbeitsauftrag (optional)', 1),
        codeArea(b, 'fns', 'Funktionen, eine pro Zeile, z. B. f(x) = 0,5x^2 - 1 · sin(x) · sqrt(x)', 2),
        h('div', { class: 'row' },
          numberInput(b, 'xmin', 'x von', { min: -999, max: 999 }),
          numberInput(b, 'xmax', 'x bis', { min: -999, max: 999 }),
          numberInput(b, 'ymin', 'y von', { min: -999, max: 999 }),
          numberInput(b, 'ymax', 'y bis', { min: -999, max: 999 }),
          numberInput(b, 'step', 'Achsenschritt (0 = automatisch)', { min: 0, max: 100, step: 0.5 })),
        h('div', { class: 'row' },
          choiceInput(b, 'grid', 'Raster', [['squares', 'Kästchenpapier'], ['lines', 'Einheitslinien'], ['none', 'keines']]),
          choiceInput(b, 'showGraphs', 'Graphen', [['always', 'anzeigen'], ['solution', 'nur auf dem Lösungsblatt'], ['never', 'leeres Koordinatensystem']]),
          numberInput(b, 'maxHeight', 'Max. Höhe (mm)', { min: 30, max: 250, def: 110 })),
        codeArea(b, 'points', 'Punkte, einer pro Zeile: A(1|2)', 2),
        h('div', { class: 'row' }, checkInput(b, 'connect', 'Punkte zu einer Figur verbinden'), checkInput(b, 'legend', 'Legende', true)),
      ];
    case 'valuetable':
      return [
        textArea(b, 'text', 'Arbeitsauftrag (optional)', 1),
        h('div', { class: 'row' }, textInput(b, 'fn', 'Funktion'), textInput(b, 'xs', 'x-Werte (durch ; getrennt)')),
        h('div', { class: 'row' },
          choiceInput(b, 'mode', 'y-Werte', [['blank', 'zum Ausfüllen (Lösungsblatt zeigt sie)'], ['full', 'vorgegeben']]),
          checkInput(b, 'showTerm', 'Funktionsterm anzeigen', true)),
      ];
    case 'tree':
      return [
        textArea(b, 'text', 'Arbeitsauftrag (optional)', 1),
        codeArea(b, 'spec', 'Äste – „Beschriftung: Wahrscheinlichkeit“, nächste Stufe eingerückt', 6),
        h('div', { class: 'row' },
          choiceInput(b, 'showProbs', 'Astwahrscheinlichkeiten', [['always', 'anzeigen'], ['solution', 'Kästchen zum Ausfüllen']]),
          choiceInput(b, 'showPaths', 'Pfadwahrscheinlichkeiten', [['none', 'keine'], ['solution', 'zum Berechnen'], ['always', 'anzeigen']])),
      ];
    case 'table':
      return [
        textInput(b, 'title', 'Titel (optional, z. B. „Experiment A: …“)'),
        codeArea(b, 'rows', 'Zeilen – Zellen mit | trennen, [[Antwort]] = Lücke (Hilfe: ?)', 5),
        h('div', { class: 'row' },
          choiceInput(b, 'header', 'Kopf', [['row', 'erste Zeile'], ['col', 'erste Spalte'], ['both', 'beide'], ['none', 'keiner']]),
          choiceInput(b, 'look', 'Aussehen', [['filled', 'gefüllte Zellen'], ['grid', 'Gitterlinien'], ['zebra', 'Zebrastreifen']]),
          colorInput(b, 'color', 'Farbe', TABLE_COLOR_OPTIONS, 'blue', '#dbe5f1')),
        h('div', { class: 'row' },
          numberInput(b, 'rowHeight', 'Zeilenhöhe (mm, 0 = automatisch)', { min: 0, max: 80, step: 1 }),
          textInput(b, 'widths', 'Spaltenbreiten (z. B. 2;1;1)')),
      ];
    case 'tchart':
      return [
        textArea(b, 'text', 'Titel / Arbeitsauftrag (optional)', 1),
        textInput(b, 'columns', 'Spaltenköpfe, mit | getrennt (2–4)'),
        numberInput(b, 'lines', 'Linien pro Spalte', { min: 1, max: 30 }),
        textArea(b, 'solution', 'Musterlösung: pro Zeile die Einträge der Spalten mit | trennen', 3),
      ];
    case 'pagebreak':
      return [h('div', { class: 'mini' }, 'Alles danach beginnt auf einer neuen Seite. Mehrere Umbrüche hintereinander ergeben leere Seiten. „+ Seite“ über den Seiten fügt am Ende einen Umbruch ein.')];
    case 'infobox':
      return [
        textInput(b, 'title', 'Überschrift (optional)'),
        textArea(b, 'text', 'Text (Formeln zwischen $…$)', 3),
        colorInput(b, 'color', 'Farbe', TINT_OPTIONS, 'rose', '#f0979d'),
      ];
    case 'cycle':
    case 'chain':
      return [
        textArea(b, 'text', 'Arbeitsauftrag (optional)', 1),
        codeArea(b, 'items', `Einträge ${b.type === 'cycle' ? 'im Uhrzeigersinn' : 'der Reihe nach'}, einer pro Zeile – [[Eintrag]] = leeres Kästchen`, 5),
        h('div', { class: 'row' },
          colorInput(b, 'color', 'Farbe (eigene Farbe: Pfeile; Kästchen heller)', DIAGRAM_COLOR_OPTIONS, b.type === 'cycle' ? 'lilac' : 'rose', '#9654b1'),
          b.type === 'cycle'
            ? choiceInput(b, 'direction', 'Richtung', [['cw', 'im Uhrzeigersinn'], ['ccw', 'gegen den Uhrzeigersinn']])
            : choiceInput(b, 'direction', 'Richtung', [['row', 'nebeneinander'], ['column', 'untereinander']])),
        checkInput(b, 'wordbank', 'Bausteine: leere Einträge gemischt darüber anzeigen'),
        h('div', { class: 'row' }, ...scoring(b)),
        b.wordbank ? shuffleRow(b) : null,
      ];
    default:
      return [];
  }
}

let helpFor = null; // id of the block whose help card is open; any other block starts with it closed
const setHelpFor = (id) => { helpFor = id; };

/** Help card of a block (texts in help.js, shared with the Anleitung). */
function helpCard(b) {
  const help = BLOCK_HELP[b.type];
  if (!help) return null;
  const insert = () => {
    Object.assign(b, structuredClone(help.sample));
    if (b.seed !== undefined) b.seed = randSeed();
    renderBlocks(); renderOverlay(); changed(0);
    toast('Beispiel eingefügt. Strg+Z stellt den vorherigen Inhalt wieder her.');
  };
  return h('section', { class: 'helpcard', 'aria-label': `Hilfe: ${help.label}` },
    h('p', {}, help.purpose),
    help.syntax ? h('h5', {}, 'So geht es') : null,
    help.syntax ? h('p', {}, help.syntax) : null,
    help.example ? h('pre', {}, help.example) : null,
    h('h5', {}, 'Auf dem Lösungsblatt'),
    h('p', {}, help.solution),
    h('div', { class: 'helpcard-foot' },
      help.sample ? h('button', { class: 'btn small', disabled: b.locked || null, onclick: insert,
        title: 'Ersetzt den Inhalt dieses Bausteins durch ein Beispiel (Strg+Z macht es rückgängig)' }, 'Beispiel einfügen') : null,
      h('a', { class: 'linkish', href: '#/guide' }, 'Alle Bausteine in der Anleitung')));
}

/** Frame and background of any block. */
function styleFields(b) {
  if (!b.style || typeof b.style !== 'object') b.style = {};
  const st = b.style;
  return h('details', { class: 'stylebox', open: frameActive(st) || null },
    h('summary', {}, 'Rahmen & Hintergrund'),
    frameControls(st, () => changed()));
}

const frameActive = (st) => (st.frame && st.frame !== 'none') || (st.fill && st.fill !== 'none');

/** Frame, frame colour and background of st ({ frame, color, fill }); onChange after every change. */
function frameControls(st, onChange) {
  const set = (key, v) => { st[key] = v; onChange(); };
  return h('div', { class: 'row' },
    h('label', {}, 'Rahmen', h('select', { onchange: (e) => set('frame', e.target.value) },
      [['none', 'keine'], ['solid', 'Linie'], ['thick', 'dick'], ['dashed', 'gestrichelt'], ['dotted', 'gepunktet'], ['left', 'Balken links'], ['card', 'Karte (abgerundet)']]
        .map(([v, t]) => h('option', { value: v, selected: (st.frame ?? 'none') === v }, t)))),
    h('label', {}, 'Rahmenfarbe', colorControl(st.color, STROKE_OPTIONS, 'gray', (v) => set('color', v))),
    h('label', {}, 'Hintergrund', colorControl(st.fill, FILL_OPTIONS, 'none', (v) => set('fill', v), '#eef3fb')));
}

/** Inspector of a group: one frame and background around all its members. The setting is
 *  stored on every member (groupFrame), so copies, duplicates and undo keep it. */
function groupInspector(g) {
  const members = doc.blocks.filter((b) => b.group === g);
  const st = { ...(members.find((b) => b.groupFrame)?.groupFrame || {}) };
  const apply = () => {
    members.forEach((b) => { if (frameActive(st)) b.groupFrame = { ...st }; else delete b.groupFrame; });
    changed();
  };
  return [
    h('div', { class: 'insp-head' },
      h('div', { class: 'insp-title' }, h('span', { class: 'ic' }, svgIcon('group')), 'Gruppe', h('span', { class: 'num' }, String(members.length))),
      iconBtn('ungroup', 'Gruppierung aufheben', ungroupSelection),
      iconBtn('close', 'Schließen', () => { setInspectorOpen(false); setInspectGroup(null); renderInspector(); })),
    h('fieldset', { class: 'insp-body' },
      h('h4', {}, 'Rahmen & Hintergrund der Gruppe'),
      frameControls(st, apply),
      h('div', { class: 'mini' }, isFree()
        ? 'Der Rahmen umschließt alle Bausteine der Gruppe mit 3 mm Abstand und wächst mit ihnen.'
        : 'Aufeinanderfolgende Bausteine der Gruppe stehen gemeinsam in einem Rahmen.')),
  ];
}

export {
  ALIGN, DIFF, HEX, checkInput, choiceInput, codeArea, colorControl, colorInput, fieldsFor, frameActive,
  frameControls, groupInspector, helpCard, helpFor, numberInput, parseColor, scoring, selectInput, setHelpFor,
  shuffleRow, styleFields, taskFields, textArea, textInput,
};
