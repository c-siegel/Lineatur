// Smoke test: compile every sample worksheet (student + solution) and build its
// HTML export, without the HTTP layer. Output goes to out/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { toTypst } from '../src/toTypst.js';
import { toHtml } from '../src/toHtml.js';
import { setMathValidator } from '../src/typst-util.js';
import { bookletOrder, imposeTypst, BOOKLET_SRC } from '../src/booklet.js';
import { PAGE_W, PAGE_H } from '../public/layout.js';
import { loadThemes } from '../src/themes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = path.join(root, 'fonts');
const compiler = NodeCompiler.create({ workspace: root, fontArgs: [{ fontPaths: [fontDir] }] });
setMathValidator((m) => !compiler.compile({ mainFileContent: `$${m}$` }).hasError());
fs.mkdirSync(path.join(root, 'out'), { recursive: true });

function compile(typst, assets) {
  compiler.resetShadow();
  for (const [p, bytes] of assets) compiler.mapShadow(path.join(root, p), bytes);
  const res = compiler.compile({ mainFileContent: typst });
  if (res.hasError() || !res.result) return { error: res.takeDiagnostics()?.shortDiagnostics?.map((d) => d.message).join('\n') };
  return { result: res.result };
}

// the installed designs, plus the team extras so their design and template are tested too
await loadThemes(root, ['themes', 'extras/uni-leipzig/themes']);

let failed = false;
const SAMPLES = { anleitung: 'samples/anleitung.json', projektheft: 'extras/uni-leipzig/vorlagen/projektheft.json' };
for (const [sample, file] of Object.entries(SAMPLES)) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  for (const solutions of [false, true]) {
    const assets = new Map();
    const t0 = Date.now();
    const r = compile(toTypst(doc, { solutions, assets }), assets);
    const ms = Date.now() - t0;
    if (r.error) {
      console.error('FAILED', sample, solutions, r.error);
      failed = true;
      continue;
    }
    const name = `${sample}-${solutions ? 'solutions' : 'student'}.pdf`;
    const pdf = compiler.pdf(r.result);
    fs.writeFileSync(path.join(root, 'out', name), pdf);
    console.log('ok', name, 'pages:', r.result.numOfPages, `${ms} ms`);
    // booklets: also impose the pages for folding (same steps as server.js)
    if (doc.booklet?.on && !solutions) {
      const n = r.result.numOfPages;
      const { sides, blanks } = bookletOrder(n, { backCover: !!doc.booklet.backCover });
      const b = compile(imposeTypst(sides, { w: PAGE_W, h: PAGE_H }), new Map([[BOOKLET_SRC, pdf]]));
      const want = Math.ceil(n / 4) * 2;
      if (b.error || b.result.numOfPages !== want) {
        console.error('FAILED', sample, 'booklet', b.error || `${b.result.numOfPages} sheet sides, expected ${want}`);
        failed = true;
      } else {
        fs.writeFileSync(path.join(root, 'out', `${sample}-booklet.pdf`), compiler.pdf(b.result));
        console.log('ok', `${sample}-booklet.pdf`, 'sheet sides:', want, 'blank pages:', blanks);
      }
    }
  }
  const html = toHtml(doc, {
    fontDir,
    snippetSvg: (typst, assets) => {
      const r = compile(typst, assets);
      return r.error ? { error: r.error } : { svg: compiler.plainSvg(r.result) };
    },
  });
  if (html.includes('class="warn"')) {
    console.error('FAILED', sample, 'html export has render errors');
    failed = true;
  }
  fs.writeFileSync(path.join(root, 'out', `${sample}.html`), html);
  console.log('ok', `${sample}.html`, Math.round(html.length / 1024), 'KB');
}
process.exit(failed ? 1 : 0);
