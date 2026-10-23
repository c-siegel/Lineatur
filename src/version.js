// Version of Lineatur, read once from package.json (the only place it is set).
import fs from 'node:fs';

export const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** Short form for people: 1.0.0 -> "1.0", 1.2.3 -> "1.2.3". */
export const shortVersion = (v = VERSION) => v.replace(/\.0$/, '');
