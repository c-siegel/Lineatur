// Document metadata (Dokument → Infos → Metadaten), also used as dashboard filters.

export const META = {
  subject: ['Deutsch', 'Mathematik', 'Englisch', 'Französisch', 'Spanisch', 'Latein', 'Biologie', 'Chemie', 'Physik',
    'Informatik', 'Geschichte', 'Geographie', 'Politik', 'Wirtschaft', 'Religion / Ethik', 'Kunst', 'Musik',
    'Sport', 'Sachunterricht', 'Sonstiges'],
  grade: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'Erwachsenenbildung'],
};

// Values of earlier versions (English), in the same order as META.
const LEGACY = {
  subject: ['German', 'Mathematics', 'English', 'French', 'Spanish', 'Latin', 'Biology', 'Chemistry', 'Physics',
    'Computer science', 'History', 'Geography', 'Politics', 'Economics', 'Religion / Ethics', 'Art', 'Music',
    'Sports', 'Primary science (Sachunterricht)', 'Other'],
  grade: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'Adult education'],
};

/** Metadata with values of earlier (English) versions translated and dropped fields removed. */
export function normalizeMeta(meta) {
  const { track, method, social, ...out } = meta || {}; // Bildungsgang, Arbeitsmethode, Sozialform are no longer used
  for (const [k, old] of Object.entries(LEGACY)) {
    const i = old.indexOf(out[k]);
    if (i >= 0) out[k] = META[k][i];
  }
  return out;
}

// Licences a block can carry (quick menu → licence information).
export const LICENSES = [
  ['own', 'Eigenes Werk', ''],
  ['pd', 'Gemeinfrei (Public Domain)', 'https://creativecommons.org/publicdomain/mark/1.0/deed.de'],
  ['cc0', 'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/deed.de'],
  ['by', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/deed.de'],
  ['by-sa', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/deed.de'],
  ['by-nd', 'CC BY-ND 4.0', 'https://creativecommons.org/licenses/by-nd/4.0/deed.de'],
  ['by-nc', 'CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/deed.de'],
  ['by-nc-sa', 'CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de'],
  ['by-nc-nd', 'CC BY-NC-ND 4.0', 'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.de'],
  ['other', 'Andere Lizenz', ''],
];

/** One line of licence information (TASL: title, author, source, licence), or '' if there is none. */
export function licenseText(b) {
  const l = b?.license || {};
  if (!l.license && !l.author && !l.title && !l.source) return b?.type === 'image' && b.credit ? b.credit : '';
  const name = l.license === 'other' ? (l.licenseName || 'Andere Lizenz') : (LICENSES.find(([k]) => k === l.license)?.[1] || '');
  return [l.title ? `„${l.title}“` : '', l.author ? `von ${l.author}` : '', name, l.source].filter(Boolean).join(', ');
}

export const META_LABELS = [
  ['subject', 'Fach'], ['grade', 'Klassenstufe'],
];
