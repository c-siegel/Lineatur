// Lineatur editor – Small helpers shared by the editor modules: element lookup and creation, ids, toast.
// Shared editor state and the other parts come from ../app.js and the sibling modules.

import { svgIcon } from '../icons.js';

const uid = () => 'b' + Math.random().toString(36).slice(2, 9);
const docUid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const randSeed = () => 1 + Math.floor(Math.random() * 99999);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- dom util --

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

const iconBtn = (icon, title, onclick, cls = '') => {
  const b = h('button', { class: 'iconbtn ' + cls, title, 'aria-label': title, onclick });
  b.append(svgIcon(icon));
  return b;
};

/** Short message at the bottom of the window. */
let toastTimer = null;
function toast(text) {
  let el = $('toast');
  if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

export { $, docUid, h, iconBtn, randSeed, toast, toastTimer, uid };
