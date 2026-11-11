// Minimal ZIP reader for design packages (stored or deflated entries, read from the central
// directory). No dependency: Node's zlib inflates. Limits keep a hostile archive small.

import zlib from 'node:zlib';

/**
 * Buffer with a ZIP archive -> [{ name, data }] (folders left out).
 * Throws on anything unusual: encryption, ZIP64, other compression, too many or too large files.
 */
export function unzip(buf, { maxFiles = 50, maxTotal = 25_000_000 } = {}) {
  // end of central directory: the last record with the signature (a comment may follow it)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine ZIP-Datei');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > maxFiles) throw new Error(`Zu viele Dateien (höchstens ${maxFiles})`);
  const out = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP-Datei beschädigt');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // a folder
    if (flags & 1) throw new Error('Verschlüsselte ZIP-Dateien werden nicht unterstützt');
    if (csize === 0xffffffff || size === 0xffffffff) throw new Error('ZIP64 wird nicht unterstützt');
    total += size;
    if (total > maxTotal) throw new Error('Inhalt zu groß');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP-Datei beschädigt');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, size) });
    else throw new Error('Unbekannte Kompression in der ZIP-Datei');
    if (data.length !== size) throw new Error('ZIP-Datei beschädigt');
    out.push({ name, data });
  }
  return out;
}
