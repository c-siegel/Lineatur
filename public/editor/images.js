// Lineatur editor – Images: reading and scaling uploads, the file picker, the image field and the Openverse search.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import { $, h } from './util.js';
import { changed, renderBlocks } from '../app.js';
import { more, row } from './docpanel.js';
import { ALIGN, choiceInput, numberInput, textInput } from './fields.js';

// ------------------------------------------------------------------ images --

/** Read an image (File or Blob), scale it down and return a data URL.
 *  Everything is re-encoded through a canvas, so only plain PNG/JPEG reaches the server. */
async function imageToDataUrl(blob, maxSide = 1600) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext('2d');
  const png = /png|gif|svg|webp/.test(blob.type);
  if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
}

function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.click();
  });
}

function imageFields(b) {
  const preview = h('div', { class: 'imgprev' });
  const draw = () => preview.replaceChildren(b.src ? h('img', { src: b.src, alt: '' }) : h('span', {}, 'Noch kein Bild'));
  draw();
  const credit = h('input', { type: 'text', value: b.credit || '', oninput: (e) => { b.credit = e.target.value; changed(); } });
  const setImage = (src, creditText) => {
    b.src = src;
    if (creditText !== undefined) { b.credit = creditText; credit.value = creditText; }
    draw(); changed(0);
  };
  return [
    preview,
    h('div', { class: 'row' },
      h('button', { class: 'small', onclick: async () => {
        const f = await pickFile();
        if (f) setImage(await imageToDataUrl(f), '');
      } }, 'Hochladen…'),
      h('button', { class: 'small', onclick: () => openImageSearch((src, c) => setImage(src, c)) }, 'Freie Bilder suchen…'),
      b.src ? h('button', { class: 'small', onclick: () => { setImage(''); renderBlocks(); } }, 'Entfernen') : null),
    textInput(b, 'caption', 'Bildunterschrift'),
    h('label', {}, 'Bildnachweis / Lizenz (bei gefundenen Bildern automatisch)', credit),
    h('div', { class: 'row' },
      numberInput(b, 'width', 'Breite (%)', { min: 10, max: 100, step: 5 }),
      choiceInput(b, 'align', 'Ausrichtung', ALIGN)),
  ];
}

const LICENSE_NAMES = { cc0: 'CC0', pdm: 'Public Domain', by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', 'by-nc': 'CC BY-NC', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND' };
const licenseName = (r) => `${LICENSE_NAMES[r.license] || r.license?.toUpperCase() || ''}${r.licenseVersion && !['cc0', 'pdm'].includes(r.license) ? ' ' + r.licenseVersion : ''}`;
/** TASL attribution: title, author, source, licence. */
const creditFor = (r) => {
  const url = (r.licenseUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `„${r.title || 'Ohne Titel'}“ – ${r.creator || 'unbekannt'} (${r.source || 'Openverse'}), ${licenseName(r)}${url ? ', ' + url : ''}`;
};

let imageSearchDone = null;
let imageSearchPage = 1;

function openImageSearch(onPick) {
  imageSearchDone = onPick;
  const dlg = $('dlg-images');
  dlg.showModal();
  $('img-q').focus();
}

async function runImageSearch(more = false) {
  const q = $('img-q').value.trim();
  if (!q) return;
  imageSearchPage = more ? imageSearchPage + 1 : 1;
  const status = $('img-status');
  status.textContent = 'Suche läuft…';
  if (!more) $('img-results').replaceChildren();
  try {
    const res = await fetch(`/api/images/search?q=${encodeURIComponent(q)}&page=${imageSearchPage}&license=${$('img-license').value}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    status.textContent = `${data.count.toLocaleString('de-DE')} frei lizenzierte Bilder (Openverse). Zum Verwenden anklicken.`;
    $('img-more').hidden = imageSearchPage >= data.pages;
    $('img-results').append(...data.results.map((r) => {
      const item = h('button', { class: 'imgres', title: creditFor(r), onclick: () => pickSearchResult(r, item) },
        h('img', { src: `/api/images/thumb/${r.id}`, alt: r.title || '', loading: 'lazy' }),
        h('span', {}, licenseName(r)));
      return item;
    }));
  } catch (e) {
    status.textContent = String(e.message || e);
  }
}

async function pickSearchResult(r, item) {
  item.classList.add('loading');
  $('img-status').textContent = 'Bild wird geladen…';
  try {
    const res = await fetch(`/api/images/file/${r.id}`);
    if (!res.ok) throw new Error('Das Bild konnte nicht geladen werden');
    const src = await imageToDataUrl(await res.blob());
    $('dlg-images').close();
    imageSearchDone?.(src, creditFor(r));
  } catch (e) {
    $('img-status').textContent = String(e.message || e);
  } finally {
    item.classList.remove('loading');
  }
}

export {
  LICENSE_NAMES, creditFor, imageFields, imageSearchDone, imageSearchPage, imageToDataUrl, licenseName,
  openImageSearch, pickFile, pickSearchResult, runImageSearch,
};
