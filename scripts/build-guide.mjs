// Builds the how-to page of the dashboard (Für den Einstieg → Anleitung).
// The guide is an ordinary Lineatur worksheet (samples/anleitung.json); this script
// 1. writes the chapter "Alle Bausteine" into it, from the same texts as the help
//    cards in the editor's inspector (public/help.js), and
// 2. runs it through the same HTML export as "Herunterladen → Digital (HTML)" and
//    writes public/guide/anleitung.html.
// Run after editing the guide or public/help.js: npm run guide.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { toHtml } from '../src/toHtml.js';
import { setMathValidator } from '../src/typst-util.js';
import { BLOCK_HELP, HELP_GROUPS } from '../public/help.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = path.join(root, 'fonts');
const compiler = NodeCompiler.create({ workspace: root, fontArgs: [{ fontPaths: [fontDir] }] });
setMathValidator((m) => !compiler.compile({ mainFileContent: `$${m}$` }).hasError());

/** Same as snippetSvg in server.js: one block (or formula) -> standalone SVG. */
function snippetSvg(typst, assets) {
  compiler.resetShadow();
  for (const [p, bytes] of assets) compiler.mapShadow(path.join(root, p), bytes);
  const res = compiler.compile({ mainFileContent: typst });
  if (res.hasError() || !res.result) return { error: res.takeDiagnostics()?.shortDiagnostics?.map((d) => d.message).join('\n') };
  return { svg: compiler.plainSvg(res.result) };
}

// ---- chapter "Alle Bausteine" (ids start with "bz-"; replaced on every run)
const GENERATED = 'bz-';
function blocksChapter() {
  const out = [
    { id: `${GENERATED}h`, type: 'heading', level: 1, text: 'Alle Bausteine' },
    { id: `${GENERATED}intro`, type: 'text', text: 'Dieselben Erklärungen finden Sie im Editor: Wählen Sie einen Baustein aus und klicken Sie im Inspektor rechts auf das Fragezeichen. Dort fügt „Beispiel einfügen“ auch gleich ein fertiges Beispiel ein.' },
  ];
  for (const [group, groupLabel] of HELP_GROUPS) {
    out.push({ id: `${GENERATED}g-${group}`, type: 'heading', level: 2, text: groupLabel });
    for (const [type, help] of Object.entries(BLOCK_HELP)) {
      if (help.group !== group) continue;
      const text = [help.purpose, help.syntax ? `So geht es: ${help.syntax}` : '', `Auf dem Lösungsblatt: ${help.solution}`]
        .filter(Boolean).join('\n');
      out.push({ id: `${GENERATED}${type}`, type: 'infobox', title: help.label, text, color: 'gray' });
      if (help.example) {
        out.push({ id: `${GENERATED}${type}-ex`, type: 'code', title: 'Beispiel', lang: 'text', code: help.example, lineNumbers: false, size: 9 });
      }
    }
  }
  return out;
}

const docFile = path.join(root, 'samples', 'anleitung.json');
const doc = JSON.parse(fs.readFileSync(docFile, 'utf8'));
const own = doc.blocks.filter((b) => !String(b.id).startsWith(GENERATED));
// the chapter goes before the closing quiz ("Kurz geprüft"), or at the end
const at = own.findIndex((b) => b.id === 'h-test');
doc.blocks = at < 0 ? [...own, ...blocksChapter()] : [...own.slice(0, at), ...blocksChapter(), ...own.slice(at)];
fs.writeFileSync(docFile, JSON.stringify(doc, null, 2) + '\n');

const out = path.join(root, 'public', 'guide', 'anleitung.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, toHtml(doc, { snippetSvg, fontDir }));
console.log('ok', path.relative(root, out), `${Math.round(fs.statSync(out).size / 1024)} KB`, `${doc.blocks.length} blocks`);
