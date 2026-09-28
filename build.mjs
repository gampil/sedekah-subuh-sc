#!/usr/bin/env node
/**
 * build.mjs — Meng-"chunk" situs statis Sedekah Subuh Haramain TANPA server runtime.
 *
 * Yang dilakukan:
 *  1. Validasi sintaks seluruh JS proyek (parser bawaan Node — tanpa dependensi).
 *  2. (opsional --minify) Minifikasi JS & CSS sederhana ke folder dist/.
 *  3. Menandai semua <script>/<link> aset dengan content-hash ?v=<hash> sehingga
 *     browser dapat mencache selamanya (immutable chunk) dan deploy = ganti hash.
 *  4. Menyalin file yang dibutuhkan ke dist/ siap upload ke hosting statis apa pun.
 *
 * Gunakan:
 *    npm run check   -> hanya cek sintaks
 *    npm run build   -> hasil minified + hashed di dist/
 *    npm run dev     -> build + server dev lokal (localhost:5173)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const MINIFY = process.argv.includes('--minify');
const CHECK_ONLY = process.argv.includes('--check');

const JS_DIR = 'assets/js';
const CSS_DIR = 'assets/css';

/* ------------------------------ util ------------------------------ */
function walk(dir, filterFn, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
      walk(full, filterFn, out);
    } else if (filterFn(full)) out.push(full);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

/* --------------------------- 1. syntax check --------------------------- */
console.log('→ Memeriksa sintaks JavaScript…');
const jsFiles = walk(path.join(ROOT, JS_DIR), (f) => f.endsWith('.js'));
let failed = false;
for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(src, { filename: rel(file) });
  } catch (err) {
    failed = true;
    console.error(`✖ ${rel(file)}: ${err.message}`);
  }
}
if (failed) { console.error('Build dibatalkan: ada file JS dengan sintaks error.'); process.exit(1); }
console.log(`✓ ${jsFiles.length} file JS valid.`);
if (CHECK_ONLY) process.exit(0);

/* --------------------------- 2. minifier sederhana --------------------------- */
function minifyJs(code) {
  // Minifikasi konservatif: buang komentar & whitespace baris berlebih
  // tanpa menyentuh isi string/template — aman untuk IIFE ES5-style proyek ini.
  let out = '';
  let i = 0, n = code.length;
  let state = 'code'; // code | squote | dquote | template | line-comment | block-comment | regex-ish
  let prevSig = '';
  while (i < n) {
    const c = code[i], next = code[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line-comment'; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block-comment'; i += 2; continue; }
      if (c === "'") { state = 'squote'; out += c; i++; continue; }
      if (c === '"') { state = 'dquote'; out += c; i++; continue; }
      if (c === '`') { state = 'template'; out += c; i++; continue; }
      if (/\s/.test(c)) {
        // collapse whitespace; keep single space only when needed between identifiers
        let j = i; while (j < n && /\s/.test(code[j])) j++;
        const after = code[j];
        const needSpace = /[A-Za-z0-9_$)\]'"`]/.test(prevSig) && /[A-Za-z0-9_$'"`(]/.test(after || '');
        if (needSpace) out += ' ';
        i = j; continue;
      }
      out += c; prevSig = c; i++; continue;
    }
    if (state === 'line-comment') { if (c === '\n') { state = 'code'; } i++; continue; }
    if (state === 'block-comment') { if (c === '*' && next === '/') { state = 'code'; i += 2; continue; } i++; continue; }
    // inside strings/templates: copy verbatim, honor escapes
    out += c;
    if (c === '\\') { out += next || ''; i += 2; continue; }
    if (state === 'squote' && c === "'") state = 'code';
    else if (state === 'dquote' && c === '"') state = 'code';
    else if (state === 'template' && c === '`') state = 'code';
    prevSig = c;
    i++;
  }
  return out;
}
function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
}

/* --------------------------- 3. prepare dist --------------------------- */
console.log('→ Menyusun chunk ke dist/ …');
fs.rmSync(DIST, { recursive: true, force: true });

const ASSET_DIRS = [JS_DIR, CSS_DIR, 'assets/img', 'assets/images'];
for (const dir of ASSET_DIRS) {
  const files = walk(path.join(ROOT, dir), () => true);
  for (const f of files) {
    const target = path.join(DIST, rel(f));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let data = fs.readFileSync(f);
    if (MINIFY && f.endsWith('.js')) data = Buffer.from(minifyJs(data.toString('utf8')), 'utf8');
    if (MINIFY && f.endsWith('.css')) data = Buffer.from(minifyCss(data.toString('utf8')), 'utf8');
    fs.writeFileSync(target, data);
  }
}

/* Hash map utk versi aset */
const versionMap = {};
for (const f of walk(path.join(DIST, 'assets'), (x) => /\.(js|css)$/.test(x))) {
  versionMap[rel(f)] = hash(fs.readFileSync(f));
}

/* Salin halaman HTML + aset root lainnya */
const htmlFiles = walk(ROOT, (f) => f.endsWith('.html'));
const rootCopies = ['manifest.webmanifest', 'favicon.png', 'robots.txt', 'sitemap.xml', '.htaccess', 'netlify.toml', 'vercel.json'];
for (const f of htmlFiles.concat(rootCopies.map((r) => path.join(ROOT, r)).filter(fs.existsSync))) {
  const target = path.join(DIST, rel(f));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(f, target);
}

/* Rewrite ?v=... memakai content-hash agar cache permanen aman */
for (const f of walk(DIST, (x) => x.endsWith('.html'))) {
  let html = fs.readFileSync(f, 'utf8');
  html = html.replace(/(src|href)="(\/assets\/[^"?]+)\?v=[^"]*"/g, (m, attr, p) => {
    const v = versionMap[p.slice(1)] || versionMap[p] || 'static';
    return `${attr}="${p}?v=${v}"`;
  });
  fs.writeFileSync(f, html);
}

/* Backend Apps Script ikut ter-distribusi (untuk clasp push) */
const gsFiles = walk(path.join(ROOT, 'backend-appscript'), (x) => x.endsWith('.gs'));
for (const f of gsFiles) {
  const target = path.join(DIST, rel(f));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(f, target);
}

console.log(`✓ Build selesai${MINIFY ? ' (minified)' : ''}: ${walk(DIST, () => true).length} file di dist/`);
console.log('  Upload isi dist/ ke hosting statis (Netlify/Vercel/cPanel) — tidak butuh server Node saat runtime.');
