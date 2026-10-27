import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { toTypst } from './src/toTypst.js';
import { toHtml } from './src/toHtml.js';
import { setMathValidator } from './src/typst-util.js';
import { zip } from './src/zip.js';
import { previewParts, rememberAssets, restoreAssets } from './src/preview.js';
import { VERSION } from './src/version.js';
import { loadThemes, loadExternalThemes, themeFiles, themeList } from './src/themes.js';
import { bookletOrder, imposeTypst, BOOKLET_SRC } from './src/booklet.js';
import { PAGE_W, PAGE_H } from './public/layout.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
// Only this computer can reach the server, unless HOST says otherwise
// (HOST=0.0.0.0 opens it to the network, e.g. for a shared classroom installation).
const HOST = process.env.HOST || '127.0.0.1';

// One long-lived compiler instance so Typst can reuse its caches between edits.
// fonts/ holds the open-licensed families (npm run fonts downloads them).
const fontDir = path.join(ROOT, 'fonts');
// page designs (add-ons in themes/, see themes/README.md)
// LINEATUR_THEMES: extra folder with designs outside the app (the portable .exe sets it to "themes" next to itself)
await loadThemes(ROOT, ['themes']);
await loadExternalThemes(process.env.LINEATUR_THEMES);
const themeNames = themeList().map((t) => t.name);
if (themeNames.length) console.log(`Seitendesigns: ${themeNames.join(', ')}`);

const compiler = NodeCompiler.create({
  workspace: ROOT,
  ...(fs.existsSync(fontDir) ? { fontArgs: [{ fontPaths: [fontDir] }] } : {}),
});

// Each distinct math snippet is test-compiled once. A snippet that does not
// compile on its own is shown as plain text, so it cannot break the sheet.
const mathCache = new Map();
setMathValidator((m) => {
  if (mathCache.has(m)) return mathCache.get(m);
  const ok = !compiler.compile({ mainFileContent: `$${m}$` }).hasError();
  if (mathCache.size > 5000) mathCache.clear();
  mathCache.set(m, ok);
  return ok;
});

/** Images and QR codes reach Typst as virtual files under /assets/. */
function mapAssets(assets) {
  compiler.resetShadow();
  for (const [p, bytes] of assets) compiler.mapShadow(path.join(ROOT, p), bytes);
  for (const [p, bytes] of themeFiles()) compiler.mapShadow(path.join(ROOT, p), bytes);
}

function compileSource(typst, assets) {
  mapAssets(assets);
  const res = compiler.compile({ mainFileContent: typst });
  if (res.hasError() || !res.result) {
    const diag = res.takeDiagnostics();
    const messages = (diag?.shortDiagnostics || []).map((d) => d.message);
    return { error: messages.join('\n') || 'Typst compile error' };
  }
  return { compiled: res.result };
}

/** Document JSON -> Typst source -> compiled document (or readable errors). */
function build(doc, solutions) {
  const assets = new Map();
  const warnings = new Map(); // block id -> problem, shown in the editor's inspector
  const typst = toTypst(doc, { solutions, assets, warnings });
  return { typst, warnings, ...compileSource(typst, assets) };
}

/** Booklet for printing: the pages imposed two per sheet (folded in the middle).
 *  Returns { pdf } or { error }. */
function bookletPdf(doc, solutions) {
  const r = build(doc, solutions);
  if (r.error) return r;
  const { sides } = bookletOrder(r.compiled.numOfPages, { backCover: !!doc.booklet?.backCover });
  // build() applied the document's geometry, so PAGE_W / PAGE_H are its page size
  const imposed = compileSource(imposeTypst(sides, { w: PAGE_W, h: PAGE_H }), new Map([[BOOKLET_SRC, compiler.pdf(r.compiled)]]));
  return imposed.error ? imposed : { pdf: compiler.pdf(imposed.compiled) };
}

/** PDF of a document: normal or, with booklet = true, imposed for folding. */
function documentPdf(doc, solutions, booklet) {
  if (booklet) return bookletPdf(doc, solutions);
  const r = build(doc, solutions);
  return r.error ? r : { pdf: compiler.pdf(r.compiled) };
}

/** Where every block ended up, for the editor's selection overlay.
 *  Free layout: measured heights. Flow layout: start/end position of each block. */
function measurements(compiled, free) {
  const out = { heights: {}, natural: {}, headerH: 0, examH: 0, flow: {} };
  if (!free) {
    try {
      for (const r of compiler.query(compiled, { selector: '<bp>', field: 'value' }) || []) {
        const f = (out.flow[r.id] ??= {});
        if (r.e === 's') Object.assign(f, { page: r.page - 1, y0: r.y });
        else Object.assign(f, { page1: r.page - 1, y1: r.y });
      }
    } catch (e) {
      console.warn('position query failed:', e.message);
    }
    return out;
  }
  try {
    const rows = compiler.query(compiled, { selector: '<bh>', field: 'value' }) || [];
    for (const r of rows) {
      if (r.id === '__header') out.headerH = r.h;
      else if (r.id === '__exam') out.examH = r.h;
      else {
        out.heights[r.id] = r.h;
        if (r.n !== undefined) out.natural[r.id] = r.n;
      }
    }
  } catch (e) {
    console.warn('measure query failed:', e.message);
  }
  return out;
}

/** Used by the HTML export: one block (or formula) -> standalone SVG. */
function snippetSvg(typst, assets) {
  const r = compileSource(typst, assets);
  if (r.error) return { error: r.error };
  return { svg: compiler.plainSvg(r.compiled) };
}

// ------------------------------------------------------- free image search --
// Openverse (openverse.org, WordPress Foundation) indexes ~800 million openly
// licensed images. The server proxies it so the browser only talks to us.

const OPENVERSE = 'https://api.openverse.org/v1/images/';
const UA = { 'User-Agent': `Lineatur/${VERSION} (worksheet editor)` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function imageSearch(params) {
  const q = String(params.get('q') || '').slice(0, 200);
  const page = Math.min(50, Math.max(1, parseInt(params.get('page')) || 1));
  const lt = ['commercial', 'modification'].includes(params.get('license')) ? params.get('license') : 'all';
  const url = `${OPENVERSE}?q=${encodeURIComponent(q)}&page=${page}&page_size=20&license_type=${lt}`; // 20 = maximum without an API key
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Openverse antwortete mit ${res.status}`);
  const data = await res.json();
  return {
    count: data.result_count,
    pages: data.page_count,
    results: (data.results || []).map((r) => ({
      id: r.id, title: r.title, creator: r.creator, license: r.license, licenseVersion: r.license_version,
      licenseUrl: r.license_url, landing: r.foreign_landing_url, source: r.source, width: r.width, height: r.height,
    })),
  };
}

async function proxyImage(res, id, full) {
  if (!UUID.test(id)) return json(res, 400, { ok: false, error: 'bad id' });
  const up = await fetch(`${OPENVERSE}${id}/thumb/${full ? '?full_size=true' : ''}`, { headers: UA, signal: AbortSignal.timeout(20000) });
  const type = up.headers.get('content-type') || '';
  if (!up.ok || !type.startsWith('image/')) return json(res, 502, { ok: false, error: 'Bild nicht verfügbar' });
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.length > 15_000_000) return json(res, 413, { ok: false, error: 'Bild zu groß' });
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
  res.end(buf);
}

// ------------------------------------------------------------------- http --

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function readBody(req, limit = 30_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

const baseName = (doc) => String(doc?.title || 'worksheet').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'worksheet';
const fileName = (doc, suffix, ext) => `attachment; filename*=UTF-8''${encodeURIComponent(baseName(doc) + suffix)}.${ext}`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    // Editor preview. Images may come as "asset:<hash>" (see src/preview.js); unknown ones
    // are answered with { missing }, and the editor repeats the request with their data.
    // Pages and shared definitions the editor already shows ("have") are sent as hashes only.
    if (req.method === 'POST' && url.pathname === '/api/render') {
      const { doc, solutions, assets, have, haveShared, haveImages, withSource } = JSON.parse(await readBody(req));
      rememberAssets(assets);
      const missing = restoreAssets(doc || {});
      if (missing.length) return json(res, 200, { ok: false, missing });
      const r = build(doc || {}, !!solutions);
      if (r.error) return json(res, 200, { ok: false, error: r.error, typst: withSource ? r.typst : undefined });
      return json(res, 200, {
        ok: true,
        ...previewParts(compiler.svg(r.compiled), { have, haveShared, haveImages }),
        info: measurements(r.compiled, doc?.layoutMode === 'free'),
        warnings: Object.fromEntries(r.warnings),
        typst: withSource ? r.typst : undefined,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/pdf') {
      const { doc, solutions, booklet } = JSON.parse(await readBody(req));
      const r = documentPdf(doc || {}, !!solutions, !!booklet);
      if (r.error) return json(res, 422, { ok: false, error: r.error });
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': fileName(doc, `${booklet ? ' - Broschuere' : ''}${solutions ? ' - Loesung' : ''}`, 'pdf'),
      });
      return res.end(r.pdf);
    }

    // several worksheets at once (dashboard): one ZIP with a PDF per sheet,
    // optionally with the solution sheets
    if (req.method === 'POST' && url.pathname === '/api/pdf-zip') {
      const { docs, solutions, booklet } = JSON.parse(await readBody(req, 150_000_000));
      if (!Array.isArray(docs) || !docs.length || docs.length > 200) return json(res, 400, { ok: false, error: 'Keine Dokumente' });
      const files = [];
      const used = new Set();
      const unique = (name) => {
        let n = name;
        for (let i = 2; used.has(n.toLowerCase()); i++) n = name.replace(/\.pdf$/, ` (${i}).pdf`);
        used.add(n.toLowerCase());
        return n;
      };
      for (const d of docs) {
        for (const sol of solutions ? [false, true] : [false]) {
          // booklet: only documents set up as booklets are imposed
          const imposed = !!booklet && !!d?.booklet?.on;
          const r = documentPdf(d || {}, sol, imposed);
          if (r.error) return json(res, 422, { ok: false, error: `${baseName(d)}: ${r.error}` });
          files.push({ name: unique(`${baseName(d)}${imposed ? ' - Broschuere' : ''}${sol ? ' - Loesung' : ''}.pdf`), data: r.pdf });
        }
      }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`Arbeitsblaetter (${docs.length})`)}.zip`,
      });
      return res.end(zip(files));
    }

    if (req.method === 'POST' && url.pathname === '/api/html') {
      const { doc } = JSON.parse(await readBody(req));
      const html = toHtml(doc || {}, { snippetSvg, fontDir });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': fileName(doc, ' - digital', 'html'),
      });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/api/images/search') {
      try {
        return json(res, 200, { ok: true, ...(await imageSearch(url.searchParams)) });
      } catch (e) {
        return json(res, 502, { ok: false, error: `Bildersuche nicht verfügbar (${e.message})` });
      }
    }
    const img = url.pathname.match(/^\/api\/images\/(thumb|file)\/([\w-]+)$/);
    if (req.method === 'GET' && img) return await proxyImage(res, img[2], img[1] === 'file');

    if (req.method === 'GET' && url.pathname === '/api/version') return json(res, 200, { version: VERSION });

    if (req.method === 'GET' && url.pathname === '/api/themes') return json(res, 200, themeList());

    if (req.method === 'GET' && url.pathname === '/api/sample') {
      // the only built-in sample is the how-to; other templates are imported by the user
      const file = path.join(ROOT, 'samples', 'anleitung.json');
      return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
    }

    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(PUBLIC, rel);
      if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        return fs.createReadStream(file).pipe(res);
      }
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { ok: false, error: String(err.message || err) });
  }
});

// Resolves once the server listens; the desktop app (electron/main.cjs) waits for it.
export const ready = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, HOST, () => {
    console.log(`Lineatur ${VERSION} running at http://${HOST || 'localhost'}:${PORT}`);
    resolve(PORT);
  });
});

if (!process.versions.electron) {
  ready.catch((err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`Port ${PORT} is already in use (is Lineatur already running?). Try another port, e.g.: PORT=4000 npm start`);
    process.exit(1);
  });
}
