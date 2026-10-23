// Lineatur editor – The document settings panel (Infos, Seite, Inhalte): its controls, header and footer zones, the
// own page design and the installed page designs.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import {
  BODY_W, DEFAULT_FONT, DEFAULT_GRID, FONTS, FOOTER_ZONES, FORMATS, MARGIN_BOTTOM, MARGIN_L, MARGIN_R,
  MARGIN_TOP, applyGeometry, footerItems, layoutOf, snapPosition, snapWidth,
} from '../layout.js';
import { listDocs } from '../store.js';
import { META, META_LABELS } from '../meta.js';
import {
  add, applyZoom, changed, cols, doc, fontLabel, headerSelected, info, isFree, renderBlocks, renderInspector,
  select, setAssessment, setLayoutMode, showTitle, syncTopbar,
} from '../app.js';
import { renderOverlay } from './canvas.js';
import { $, h, iconBtn, toast } from './util.js';
import { colorControl } from './fields.js';
import { FILL_OPTIONS, STROKE_OPTIONS } from './blocktypes.js';
import { imageToDataUrl, pickFile } from './images.js';

// --------------------------------------------------------- document panel --
// Built from code so every setting reads and writes the document directly.
// Each section has a reset button that restores its defaults.

let docTab = 'info';
const setDocTab = (t) => { docTab = t; };

const FOOTER_KINDS = [['title', 'Titel (oder Fußzeilentext)'], ['path', 'Fußzeilentext (Infos)'], ['page', 'Seite x / n'],
  ['date', 'Verwendungsdatum'], ['class', 'Klassenname'], ['text', 'Eigener Text']];
const SIZE_OPTIONS = [9, 10, 10.5, 11, 11.5, 12, 13, 14, 16].map((v) => [String(v), String(v).replace('.5', '½')]);

const getPath = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
function setPath(path, value) {
  const keys = path.split('.');
  let o = doc;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {});
  o[keys.at(-1)] = value;
}

/** Called after a setting changed. geometry=true: margins/format/grid, blocks may need rescaling. */
function docSetting({ geometry = false, rerender = true, delay = 0 } = {}) {
  if (geometry) geometryChanged();
  if (rerender) renderDocPanel();
  if (rerender && headerSelected) renderInspector();
  syncTopbar();
  changed(delay);
}

/** Page geometry changed: keep the blocks in proportion to the new body width. */
function geometryChanged() {
  const oldW = BODY_W;
  applyGeometry(doc);
  const ratio = BODY_W / oldW;
  if (Math.abs(ratio - 1) > 1e-6) {
    for (const b of doc.blocks) {
      if (!b.layout) continue;
      const l = layoutOf(b);
      const w = snapWidth(Math.min(BODY_W, l.w * ratio), 0, cols(), false);
      const pos = snapPosition(l.x * ratio, l.y, w, cols(), false);
      b.layout = { ...l, w, x: pos.x };
    }
  }
  applyZoom();
  renderBlocks(); renderOverlay();
}

// ---- small controls ----

const section = (title, onReset, ...kids) => h('section', { class: 'dsec' },
  h('div', { class: 'dsec-head' }, h('h3', {}, title),
    onReset ? iconBtn('reset', `„${title}“ zurücksetzen`, () => { onReset(); docSetting({ geometry: true }); }) : null),
  ...kids);
/** Small (i) button; a click shows its explanation in a bubble below it. */
const infoTip = (text) => h('button', {
  type: 'button', class: 'info', 'aria-label': `Erklärung: ${text}`, 'aria-expanded': 'false',
  onclick: (e) => { e.preventDefault(); e.stopPropagation(); toggleTip(e.currentTarget, text); },
}, 'i');

function closeTip() {
  const pop = $('tip-pop');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  pop.anchor?.setAttribute('aria-expanded', 'false');
  pop.anchor = null;
}

function toggleTip(btn, text) {
  let pop = $('tip-pop');
  if (!pop) {
    pop = h('div', { id: 'tip-pop', class: 'tip-pop', role: 'tooltip' });
    document.body.append(pop);
  }
  if (!pop.hidden && pop.anchor === btn) { closeTip(); return; }
  closeTip();
  pop.textContent = text;
  pop.hidden = false;
  pop.anchor = btn;
  btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  pop.style.top = `${r.bottom + 6}px`;
}
const field = (label, control, tip) => h('label', { class: 'field' }, h('span', { class: 'flabel' }, label, tip ? infoTip(tip) : null), control);
// the info icon sits right before the control, whether the label wraps or not
const row = (label, control, tip) => h('div', { class: 'drow' }, h('span', { class: 'flabel' }, label), tip ? infoTip(tip) : null, control);

function dText(path, { placeholder = '', type = 'text', area = false, onInput } = {}) {
  const attrs = { placeholder, oninput: (e) => { setPath(path, e.target.value); onInput?.(); docSetting({ rerender: false, delay: 250 }); } };
  return area
    ? h('textarea', { rows: 3, ...attrs }, getPath(path) ?? '')
    : h('input', { type, value: getPath(path) ?? '', ...attrs });
}
function dSelect(path, options, { def = '', num = false, geometry = false, onChange } = {}) {
  const cur = String(getPath(path) ?? def);
  return h('select', { onchange: (e) => {
    setPath(path, num ? Number(e.target.value) : e.target.value);
    onChange?.(e.target.value);
    docSetting({ geometry });
  } }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === cur }, t)));
}
function dToggle(path, { def = false, geometry = false, onChange } = {}) {
  const on = getPath(path) ?? def;
  return h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked: on, role: 'switch', onchange: (e) => {
      setPath(path, e.target.checked); onChange?.(e.target.checked); docSetting({ geometry });
    } }),
    h('span', { class: 'slider', 'aria-hidden': 'true' }));
}
function dStepper(path, { min = 0, max = 99, step = 1, def = 0, geometry = false } = {}) {
  const value = () => Number(getPath(path) ?? def);
  const set = (v) => {
    const n = Math.min(max, Math.max(min, Math.round(v / step) * step));
    setPath(path, Number(n.toFixed(2)));
    docSetting({ geometry });
  };
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'weniger', onclick: () => set(value() - step), disabled: value() <= min || null }, '−'),
    h('input', { type: 'text', inputmode: 'decimal', value: String(value()).replace('.', ','), 'aria-label': path,
      onchange: (e) => set(Number(e.target.value.replace(',', '.')) || 0) }),
    h('button', { type: 'button', 'aria-label': 'mehr', onclick: () => set(value() + step), disabled: value() >= max || null }, '+'));
}
/** Colour setting of the document (palette or own RGB colour). */
const dColor = (path, options, def, first) => colorControl(getPath(path), options, def, (v, final) => {
  setPath(path, v);
  // while the picker is dragged, keep the panel (and the picker) as it is
  docSetting({ rerender: final, delay: final ? 0 : 250 });
}, first);

/** Row of small toggle buttons; options: [value, content, title]. */
const moreOpen = new Set();
/** Folded group of rarely used settings; remembers whether it is open while the panel re-renders. */
const more = (key, ...kids) => h('details', {
  class: 'dmore-sec', open: moreOpen.has(key) || null,
  ontoggle: (e) => { if (e.target.open) moreOpen.add(key); else moreOpen.delete(key); },
}, h('summary', {}, 'Mehr'), ...kids);

function dSeg(path, options, { def = '' } = {}) {
  const cur = getPath(path) ?? def;
  return h('div', { class: 'seg2', role: 'radiogroup' }, options.map(([v, content, title]) =>
    h('button', { type: 'button', class: v === cur ? 'on' : '', title, 'aria-label': title, role: 'radio', 'aria-checked': String(v === cur),
      onclick: () => { setPath(path, v); docSetting(); } }, content)));
}

// ---- tabs ----

function infoTab() {
  return [
    section('Allgemeine Informationen', null,
      field('Titel', dText('title', { onInput: showTitle })),
      field('Name des Lösungsblatts', dText('solutionTitle', { placeholder: doc.title || 'wie der Titel' }),
        'Titel auf dem Lösungsblatt'),
      field('Klassenname', dText('className', { placeholder: 'z. B. 7b' }), 'Wird in das Feld „Klasse“ der Namenszeile eingetragen'),
      field('Fußzeile', dText('pathTitle', { placeholder: 'z. B. Mathe › Funktionen › Stetigkeit' }),
        'Text für die Fußzeile, z. B. ein Pfad. Steht dort statt des Titels'),
      row('Titelkopf (Titel, Logo, Linie)', dToggle('titleHeader', { def: true }), 'Ausschalten, wenn Sie eine eigene Titelseite gestalten'),
      row('Zeile für Name, Klasse und Datum', dToggle('nameLine', { def: true }), 'Beschriftungen und Position: Kopfbereich auf der Seite anklicken'),
      row('Klassenarbeit: Bewertungstabelle + Notenschlüssel', h('label', { class: 'switch' },
        h('input', { type: 'checkbox', role: 'switch', checked: doc.blocks.some((b) => b.type === 'assessment'),
          onchange: (e) => setAssessment(e.target.checked) }),
        h('span', { class: 'slider', 'aria-hidden': 'true' })), 'Fügt den Baustein „Bewertung & Notenschlüssel“ ein, den Sie frei verschieben und bearbeiten können'),
      more('info',
        field('Untertitel', dText('subtitle')),
        field('Verwendungsdatum', dText('date', { type: 'date' }), 'Wird in das Feld „Datum“ der Namenszeile eingetragen'),
        field('Beschreibung und Begriffe', dText('description', { area: true, placeholder: 'Wird in den PDF-Eigenschaften gespeichert' })))),
    section('Metadaten', null,
      field('Sprache', dSelect('lang', [['de', 'Deutsch (DE)'], ['en', 'English (EN)']], { def: 'de' })),
      ...META_LABELS
        .map(([k, label]) => field(label, dSelect(`meta.${k}`, [['', '–'], ...META[k].map((v) => [v, v])])))),
  ];
}

function pageTab() {
  const mirrored = doc.pageSide === 'both';
  return [
    section('Format', null,
      row('Seitenformat', dSelect('format', Object.entries(FORMATS).map(([k, f]) => [k, f.label]), {
        def: 'a4', geometry: true, onChange: () => { delete doc.margins; } })),
      row('Seitenlage', dSelect('pageSide', [['right', 'Nur rechts'], ['both', 'Doppelseitig (gespiegelt)']], { def: 'right', geometry: true }),
        'Doppelseitig: Innen- und Außenrand tauschen auf linken Seiten'),
      row('Layout', h('select', { onchange: (e) => { setLayoutMode(e.target.value); renderDocPanel(); } },
        [['free', 'Raster – frei platzieren'], ['flow', 'Fluss – untereinander']].map(([v, t]) => h('option', { value: v, selected: doc.layoutMode === v }, t))))),
    bookletSection(),
    themeSection(),
    doc.theme === 'custom' ? section('Kopfzeile', () => { delete doc.header; },
      ...footerZones('header'),
      h('p', { class: 'hint' }, 'Steht über jeder Seite, in der Hauptfarbe des Designs. Das Logo kommt dazu.')) : null,
    section('Seitenränder', () => { delete doc.margins; },
      row(mirrored ? 'Innen' : 'Links', dStepper('margins.left', { def: MARGIN_L, max: 60, geometry: true })),
      row(mirrored ? 'Außen' : 'Rechts', dStepper('margins.right', { def: MARGIN_R, max: 60, geometry: true })),
      row('Oben', dStepper('margins.top', { def: MARGIN_TOP, max: 60, geometry: true })),
      row('Unten', dStepper('margins.bottom', { def: MARGIN_BOTTOM, max: 60, geometry: true })),
      row('Druckrand simulieren', dToggle('printMargin', { onChange: () => renderOverlay() }), 'Zeigt die 5 mm, die die meisten Drucker nicht bedrucken')),
    section('Fußzeile', () => { delete doc.footer; doc.punchMarks = false; },
      ...footerZones('footer'),
      row('Lochhilfe anzeigen', dToggle('punchMarks'))),
    isFree() ? section('Raster', () => { doc.grid = { ...DEFAULT_GRID }; },
      row('Spalten', dSeg('grid.cols', [[3, '3', '3 Spalten'], [6, '6', '6 Spalten'], [12, '12', '12 Spalten']], { def: 3 }),
        'Bausteine rasten an diesen Spalten ein. Mit gedrückter Alt-Taste lassen sie sich frei platzieren'),
      more('grid',
        row('Spaltenanzahl', dStepper('grid.cols', { def: 3, min: 1, max: 24 })),
        row('Spaltenabstand (mm)', dStepper('grid.gutter', { def: 3, min: 0, max: 10, step: 0.5, geometry: true })),
        row('Vertikales Raster (mm)', dStepper('grid.row', { def: 5, min: 0, max: 20, step: 0.5, geometry: true }), '0 = kein vertikales Einrasten'))) : null,
    section('Rahmen & Hintergrund', () => { doc.pageFrame = { style: 'none', color: 'gray' }; doc.pageTint = 'none'; },
      row('Seitenrahmen', dSelect('pageFrame.style', [['none', 'keine'], ['line', 'Linie'], ['thick', 'dicke Linie'], ['double', 'Doppellinie'],
        ['rounded', 'abgerundet'], ['dashed', 'gestrichelt'], ['dotted', 'Punkte'], ['corners', 'Ecken']], { def: 'none' })),
      row('Rahmenfarbe', dColor('pageFrame.color', STROKE_OPTIONS, 'gray')),
      row('Seitenhintergrund', dColor('pageTint', FILL_OPTIONS, 'none', '#f7f9fc'))),
    section('Schullogo', () => { doc.logo = ''; },
      h('div', { class: 'logo-row' },
        h('div', { class: 'logo-prev' }, doc.logo ? h('img', { src: doc.logo, alt: 'Logo' }) : 'kein Logo'),
        h('button', { class: 'btn small', onclick: async () => {
          const f = await pickFile();
          if (!f) return;
          doc.logo = await imageToDataUrl(f, 600);
          docSetting();
        } }, 'Hochladen…'),
        doc.logo ? h('button', { class: 'btn small', onclick: () => { doc.logo = ''; docSetting(); } }, 'Entfernen') : null)),
  ];
}

/** Footer (or header, with key 'header') editor: one list per zone; entries move by dragging
 *  their grip (⠿), also into another zone. Double-sided: the zones read inside / middle / outside. */
function footerZones(key = 'footer') {
  const items = footerItems(doc, key);
  const commit = (list, opts) => { doc[key] = { preset: false, items: list }; docSetting(opts); };
  const copy = () => items.map((it) => ({ ...it }));
  const labels = doc.pageSide === 'both'
    ? { left: 'Innen', center: 'Mitte', right: 'Außen' }
    : { left: 'Links', center: 'Mitte', right: 'Rechts' };
  let dragging = null; // index in items
  /** Moves entry from to zone, before entry at (index in items; null = at the end). */
  const move = (from, zone, at) => {
    const list = copy();
    const [it] = list.splice(from, 1);
    it.zone = zone;
    const pos = at == null ? list.length : at > from ? at - 1 : at;
    list.splice(pos, 0, it);
    commit(list);
  };
  const clearMarks = (root) => root.querySelectorAll('.drop-before, .drop-after, .over').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'over'));
  const entry = (it, i) => {
    const r = h('div', { class: 'frow' },
      h('span', { class: 'grip', title: 'Ziehen: verschieben, auch in einen anderen Bereich',
        onmousedown: () => { r.draggable = true; }, onmouseup: () => { r.draggable = false; } }, '⠿'),
      h('select', { 'aria-label': 'Inhalt', onchange: (e) => {
        const list = copy();
        list[i] = { kind: e.target.value, zone: it.zone, ...(e.target.value === 'text' ? { text: it.text || '' } : {}) };
        commit(list);
      } }, FOOTER_KINDS.map(([v, t]) => h('option', { value: v, selected: v === it.kind }, t))),
      it.kind === 'text'
        ? h('input', { type: 'text', value: it.text || '', placeholder: 'Text', 'aria-label': 'Eigener Text', oninput: (e) => {
          const list = copy();
          list[i].text = e.target.value;
          items[i].text = e.target.value;
          commit(list, { rerender: false, delay: 250 });
        } })
        : null,
      iconBtn('trash', 'Eintrag entfernen', () => commit(items.filter((_, j) => j !== i)), 'danger'));
    r.addEventListener('dragstart', (e) => { dragging = i; e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
    r.addEventListener('dragend', () => { r.draggable = false; dragging = null; r.classList.remove('dragging'); clearMarks(r.closest('.dsec') || document); });
    r.addEventListener('dragover', (e) => {
      if (dragging == null || dragging === i) return;
      e.preventDefault();
      e.stopPropagation();
      const after = e.offsetY > r.offsetHeight / 2;
      r.classList.toggle('drop-before', !after);
      r.classList.toggle('drop-after', after);
    });
    r.addEventListener('dragleave', () => r.classList.remove('drop-before', 'drop-after'));
    r.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragging == null || dragging === i) return;
      move(dragging, it.zone, r.classList.contains('drop-after') ? i + 1 : i);
    });
    return r;
  };
  return FOOTER_ZONES.map((zone) => {
    const mine = items.map((it, i) => [it, i]).filter(([it]) => it.zone === zone);
    const box = h('div', { class: 'fzone' },
      h('div', { class: 'fzone-head' }, h('span', {}, labels[zone]),
        h('button', { class: 'linkish', type: 'button', onclick: () => commit([...copy(), { kind: 'text', text: '', zone }]) }, '+ Eintrag')),
      ...(mine.length ? mine.map(([it, i]) => entry(it, i)) : [h('div', { class: 'fzone-empty' }, 'leer – Einträge hierher ziehen')]));
    box.addEventListener('dragover', (e) => { if (dragging == null) return; e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('over'); });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragging != null) move(dragging, zone, null);
    });
    return box;
  });
}

/** Broschüre: A5 pages, printed two per A4 sheet and folded. */
function bookletSection() {
  const on = !!doc.booklet?.on;
  const pages = $('pages').querySelectorAll('.page').length;
  const padded = Math.ceil(Math.max(1, pages) / 4) * 4;
  return section('Broschüre (A4 gefaltet)', () => { doc.booklet = { on: false }; },
    row('Als Broschüre drucken', dToggle('booklet.on', { geometry: true, onChange: (v) => {
      if (v) {
        doc.format = 'a5';
        doc.pageSide = 'both';
        delete doc.margins;
        doc.booklet.cover ??= true;
      }
    } }), 'A5-Seiten; „Herunterladen → PDF – Broschüre“ setzt je zwei auf ein A4-Blatt, zum Falten und Heften'),
    on ? row('Erste Seite ist Titelseite', dToggle('booklet.cover', { def: true }), 'Ohne Seitenzahl; die Zählung beginnt auf der zweiten Seite mit 1') : null,
    on ? row('Letzte Seite ist Rückseite', dToggle('booklet.backCover'), 'Leere Seiten werden davor eingefügt') : null,
    on && pages ? h('p', { class: 'hint' }, padded === pages
      ? `${pages} Seiten = ${padded / 4} gefaltete${padded / 4 === 1 ? 's' : ''} A4-Blatt/Blätter.`
      : `${pages} Seiten → ${padded} (${padded - pages} leere Seite${padded - pages === 1 ? '' : 'n'} werden eingefügt), ${padded / 4} A4-Blatt/Blätter.`) : null,
    on ? h('p', { class: 'hint' }, 'Drucken: beidseitig, an der kurzen Kante wenden.') : null);
}

/** Seitendesign: an own design or a built-in one from templates/ (header, footer, background).
 *  Not called "Vorlage": that word belongs to the dashboard's templates (whole sheets to copy). */
const ACCENT_OPTIONS = [['blue', 'blau'], ['green', 'grün'], ['teal', 'petrol'], ['red', 'rot'], ['purple', 'lila'], ['orange', 'orange'], ['gray', 'grau']];

/** Own page design: colours, a shape, a logo and the header (section "Kopfzeile").
 *  Stored in the document (doc.design, doc.header); no Typst code involved. */
function designFields() {
  const d = (doc.design ??= {});
  const shape = (name) => h('span', { class: `shp ${name}` });
  const copyFrom = h('select', { 'aria-label': 'Design aus einem anderen Blatt übernehmen', onchange: async (e) => {
    const src = (await listDocs()).find((x) => x.id === e.target.value)?.doc;
    if (!src) return;
    doc.design = structuredClone(src.design || {});
    if (src.header) doc.header = structuredClone(src.header); else delete doc.header;
    docSetting();
    toast(`Design von „${src.title || 'Ohne Titel'}“ übernommen.`);
  } }, h('option', { value: '' }, 'Design übernehmen von …'));
  // the other sheets with an own design, filled in as soon as the library answers
  listDocs().then((all) => all.filter((x) => x.id !== doc.id && x.doc?.theme === 'custom')
    .forEach((x) => copyFrom.append(h('option', { value: x.id }, x.title || 'Ohne Titel'))));
  return [
    row('Hauptfarbe', dColor('design.color', ACCENT_OPTIONS, 'blue'), 'Form und Text der Kopfzeile'),
    row('Zweitfarbe', dColor('design.color2', ACCENT_OPTIONS, 'gray'), 'Zweite Form und Linie unter der Kopfzeile'),
    row('Form', dSeg('design.shape', [['none', '–', 'keine Form'], ['corners', shape('corners'), 'Ecken unten außen'],
      ['band', shape('band'), 'Band oben'], ['side', shape('side'), 'Streifen am Außenrand']], { def: 'none' })),
    h('div', { class: 'logo-row' },
      h('div', { class: 'logo-prev' }, d.logo ? h('img', { src: d.logo, alt: 'Logo' }) : 'kein Logo'),
      h('button', { class: 'btn small', onclick: async () => {
        const f = await pickFile();
        if (!f) return;
        doc.design.logo = await imageToDataUrl(f, 600);
        docSetting();
      } }, 'Logo…'),
      d.logo ? h('button', { class: 'btn small', onclick: () => { doc.design.logo = ''; docSetting(); } }, 'Entfernen') : null,
      d.logo ? dSelect('design.logoPos', [['right', 'rechts'], ['left', 'links']], { def: 'right' }) : null),
    row('Linie unter der Kopfzeile', dToggle('design.line', { def: true })),
    row('Kopfzeile auf der ersten Seite', dToggle('design.firstPage', { def: true }),
      'Ausschalten, wenn die erste Seite schon einen Titelkopf oder eine Titelseite hat'),
    copyFrom,
  ];
}

// Page designs installed on the server (add-ons in themes/), loaded once at start.
let installedThemes = [];
const setInstalledThemes = (list) => { installedThemes = list; };

function themeSection() {
  const o = (doc.themeOptions ??= {});
  const theme = installedThemes.find((t) => t.name === doc.theme);
  const missing = doc.theme && doc.theme !== 'custom' && !theme;
  const options = [['', 'keines'], ['custom', 'Eigenes Design'], ...installedThemes.map((t) => [t.name, t.label])];
  if (missing) options.push([doc.theme, `${doc.theme} (nicht installiert)`]);
  const hint = ['Eigenes Design: Farben, Form, Logo und Kopfzeile stellen Sie hier ein; Fußzeile und Seitenrahmen gelten weiter.',
    ...installedThemes.map((t) => `${t.label}: ${t.hint || ''}`)].join(' ');
  return section('Seitendesign', () => { doc.theme = ''; doc.themeOptions = {}; },
    row('Design', dSelect('theme', options, { def: '' }), hint),
    ...(doc.theme === 'custom' ? designFields() : []),
    ...(theme ? theme.fields.map((fd) => field(fd.label, dText(`themeOptions.${fd.key}`, {
      placeholder: fd.placeholder === '{title}' ? (doc.title || 'wie der Titel') : fd.placeholder || '',
    }))) : []),
    theme?.logo ? h('div', { class: 'logo-row' },
      h('div', { class: 'logo-prev' }, o.logo ? h('img', { src: o.logo, alt: theme.logo }) : theme.logo),
      h('button', { class: 'btn small', onclick: async () => {
        const file = await pickFile();
        if (!file) return;
        doc.themeOptions.logo = await imageToDataUrl(file, 600);
        docSetting();
      } }, 'Hochladen…'),
      o.logo ? h('button', { class: 'btn small', onclick: () => { doc.themeOptions.logo = ''; docSetting(); } }, 'Entfernen') : null) : null,
    missing ? h('p', { class: 'hint' }, 'Dieses Seitendesign ist hier nicht installiert. Das Blatt erscheint ohne sein Design; die Inhalte bleiben erhalten.') : null);
}

function contentTab() {
  const gapIcon = (style) => h('span', { class: 'gapicon ' + style });
  const sym = [['none', '–', 'kein Symbol'], ['star', '☆', 'Stern'], ['check', '✓', 'Haken'], ['diamond', '◆', 'Raute'], ['flag', '⚑', 'Flagge']];
  const fontOpts = FONTS.map((f) => [f, fontLabel(f)]);
  return [
    section('Schrift', () => { Object.assign(doc, { font: DEFAULT_FONT, fontSize: 12, hyphenate: false, mathFont: false, accent: 'blue' }); },
      row('Schriftart', dSelect('font', fontOpts, { def: DEFAULT_FONT })),
      row('Schriftgröße', dSelect('fontSize', SIZE_OPTIONS, { def: '12', num: true })),
      row('Silbentrennung', dToggle('hyphenate')),
      row('Bausteinschrift für Formeln nutzen', dToggle('mathFont'), 'Formeln in der Schrift des Blatts statt in der Mathematikschrift'),
      row('Akzentfarbe', dColor('accent', ACCENT_OPTIONS, 'blue'))),
    section('Lücken', () => { doc.gaps = {}; },
      row('Lückenstil', dSeg('gaps.style', [['filled', gapIcon('filled'), 'gefülltes Kästchen'], ['box', gapIcon('box'), 'Kästchen'],
        ['line', gapIcon('line'), 'Linie'], ['dotted', gapIcon('dotted'), 'gepunktete Linie'], ['bracket', gapIcon('bracket'), 'Klammer']], { def: 'line' })),
      h('p', { class: 'hint' }, 'Gilt für Lückentexte, Rechenergebnisse und Anagramme.'),
      more('gaps',
        row('Schriftart Lücken', dSelect('gaps.font', [['', 'wie Schrift'], ...fontOpts])),
        row('Schriftgröße Lücken', dSelect('gaps.size', [['0', 'wie Schrift'], ...SIZE_OPTIONS], { def: '0', num: true })))),
    section('Punkte', () => { doc.points = {}; },
      row('Kürzel für Punkte', dText('points.abbr', { placeholder: doc.lang === 'en' ? 'pts' : 'P.' })),
      row('Kürzel für Zusatzpunkte', dText('points.bonusAbbr', { placeholder: doc.lang === 'en' ? 'bonus' : 'ZP' }),
        'Zusatzpunkte werden pro Aufgabe vergeben und zählen nicht zur Gesamtpunktzahl'),
      more('points',
        row('Symbol für Punkte', dSeg('points.symbol', sym, { def: 'none' })),
        row('Symbol für Zusatzpunkte', dSeg('points.bonusSymbol', sym, { def: 'none' })),
        row('Schmale Punktzahlen', dToggle('points.narrow'), 'Kein Leerzeichen zwischen Zahl und Kürzel'))),
    section('Überschriften', () => { delete doc.headingNumbering; },
      row('Nummerierung', dSeg('headingNumbering', [['', '–', 'keine Nummerierung'], ['1', '1.', '1. / 1.1'], ['I', 'I.', 'I. / I.1'], ['A', 'A.', 'A. / A.1']], { def: '' })),
      h('p', { class: 'hint' }, 'Gilt für alle Überschriften-Bausteine (Abschnitt 1., Unterabschnitt 1.1). Einzelne lassen sich in ihren Eigenschaften ausnehmen. Ein Inhaltsverzeichnis fügen Sie als Baustein ein.')),
    section('Aufgabennummerierung', () => { doc.numbering = {}; },
      row('Nummerierungsart', dSeg('numbering.format', [['1', '1', '1, 2, 3'], ['a', 'a)', 'a), b), c)'], ['A', 'A)', 'A), B), C)'], ['(', '(1)', '(1), (2), (3)']], { def: '1' })),
      row('Bei jeder Abschnittsüberschrift neu beginnen', dToggle('numbering.restart'), 'Zum Beispiel (1), (2), … neu in jedem Kapitel'),
      row('Aufgabenstil', dSeg('numbering.style', [['filled', h('span', { class: 'nb filled' }, '1'), 'gefüllt'], ['circle', h('span', { class: 'nb circle' }, '1'), 'Kreis'],
        ['box', h('span', { class: 'nb box' }, '1'), 'Kasten'], ['plain', h('span', { class: 'nb plain' }, '1'), 'schlicht']], { def: 'filled' }))),
  ];
}

function renderDocPanel() {
  const pane = $('docpanel');
  if (!pane) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === docTab));
  closeTip();
  pane.replaceChildren(...{ info: infoTab, page: pageTab, content: contentTab }[docTab]().filter(Boolean));
}

export {
  ACCENT_OPTIONS, FOOTER_KINDS, SIZE_OPTIONS, bookletSection, closeTip, contentTab, dColor, dSeg, dSelect,
  dStepper, dText, dToggle, designFields, docSetting, docTab, field, footerZones, geometryChanged, getPath,
  infoTab, infoTip, installedThemes, more, moreOpen, pageTab, renderDocPanel, row, section, setDocTab,
  setInstalledThemes, setPath, themeSection, toggleTip,
};
