// Small line icons (own drawings, 24x24, stroke = currentColor).

const PATHS = {
  home: 'M3 11 12 3l9 8M5.5 9.5V21h5v-6h3v6h5V9.5',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  frame: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 9h8M8 13h8M8 17h5',
  book: 'M12 6.5C10 5 7 4.5 3.5 4.5v14c3.5 0 6.5.5 8.5 2 2-1.5 5-2 8.5-2v-14C17 4.5 14 5 12 6.5Zm0 0v14',
  blocks: 'M4 4h16v5H4zM4 11.5h16v4H4zM4 18h10v2H4z',
  layers: 'M12 3 2.5 8 12 13l9.5-5L12 3ZM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5',
  settings: 'M6 3h8l4 4v6M6 3v18h7M14 3v4h4M17.5 15.5v1.2m0 4.6v1.2m3-3.5h-1.2m-3.6 0h-1.2m4.3-2.1-.9.9m-2.4 2.4-.9.9m4.2 0-.9-.9m-2.4-2.4-.9-.9M17.5 17a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z',
  sidebar: 'M4 4h16v16H4zM9.5 4v16',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5m5 5H9.5a5.5 5.5 0 0 0 0 11H13',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  font: 'M4 19 9.5 5h1L16 19M6.2 14h7.6M17 19v-6.5m-2.5 0h5',
  size: 'M3 18 7.5 6h1L13 18M4.6 14h5.8M14.5 18l3-8 3 8m-5-2.5h4',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  check: 'M6 3h8l4 4v14H6zM14 3v4h4M9 14l2 2 4-4.5',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  chevron: 'm7 10 5 5 5-5',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.8-4.8',
  close: 'M6 6l12 12M18 6 6 18',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6M12 16.8h.01',
  trash: 'M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13M10 11v6m4-6v6',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  up: 'M12 19V5m-6 6 6-6 6 6',
  down: 'M12 5v14m-6-6 6 6 6-6',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  eyeOff: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 4l16 16',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  folder: 'M3 6.5h6.5l2 2.5H21v10H3z',
  folderPlus: 'M3 6.5h6.5l2 2.5H21v10H3zM12 12v5m-2.5-2.5h5',
  docPlus: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6m-3-3h6',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4.5 20.5c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  dot: 'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  license: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM14.8 9.4a3.5 3.5 0 1 0 0 5.2',
  clipboard: 'M8.5 4.5h-2v16h11v-16h-2M8.5 3h7v3h-7z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  toc: 'M4 6h2M9 6h11M4 12h2M9 12h11M7 18h2M12 18h8',
  group: 'M3.5 3.5h9v9h-9zM11.5 11.5h9v9h-9zM3.5 16v4.5H8M20.5 8V3.5H16',
  ungroup: 'M3.5 3.5h8v8h-8zM12.5 12.5h8v8h-8z',
  alignLeft: 'M4 3v18M8 6.5h12v4H8zM8 13.5h7v4H8z',
  alignCenterH: 'M12 3v3.5m0 4v3m0 4V21M6 6.5h12v4H6zM8.5 13.5h7v4h-7z',
  alignRight: 'M20 3v18M4 6.5h12v4H4zM9 13.5h7v4H9z',
  alignTop: 'M3 4h18M6.5 8h4v12h-4zM13.5 8h4v7h-4z',
  alignMiddleV: 'M3 12h3.5m4 0h3m4 0H21M6.5 6h4v12h-4zM13.5 8.5h4v7h-4z',
  alignBottom: 'M3 20h18M6.5 4h4v12h-4zM13.5 9h4v7h-4z',
  distH: 'M4 4v16M20 4v16M9.5 7h5v10h-5z',
  distV: 'M4 4h16M4 20h16M7 9.5h10v5H7z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 8.5h.01',
};

export function svgIcon(name) {
  const d = PATHS[name];
  if (!d) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** Put the icon named in data-icon in front of each element's content. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.querySelector(':scope > svg')) return;
    const svg = svgIcon(el.dataset.icon);
    if (svg) el.prepend(svg);
  });
}
