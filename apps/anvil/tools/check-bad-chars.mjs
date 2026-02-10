// Simple encoding guard: fails on smart punctuation / replacement chars in source files.
// Keeps the codebase ASCII-clean to avoid mojibake when encodings drift.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BAD_RE = /[…—–“”’→➜�]/g; // ellipsis, em/en dash, curly quotes, arrows, replacement char
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.ts']);
const DEFAULT_IGNORES = new Set(['dist', 'node_modules', '.git']);
const TARGETS = [
  path.join(ROOT, 'teleprompter_pro.html'),
  path.join(ROOT, 'teleprompter_pro.css'),
  path.join(ROOT, 'display.html'),
  path.join(ROOT, 'login.html'),
  path.join(ROOT, 'account.html'),
];

const hits = [];
const ignoreDirs = (() => {
  const set = new Set(DEFAULT_IGNORES);
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--ignore') continue;
    const raw = String(argv[i + 1] || '').trim();
    if (!raw) continue;
    const normalized = raw.replace(/[\\/]+/g, '/').replace(/^\.\/+/, '');
    if (normalized) {
      const base = path.posix.basename(normalized);
      if (base) set.add(base);
    }
    i += 1;
  }
  return set;
})();

function scanFile(full) {
  const ext = path.extname(full);
  if (!ALLOWED_EXT.has(ext)) return;
  const data = fs.readFileSync(full, 'utf8');
  let m;
  while ((m = BAD_RE.exec(data)) !== null) {
    const before = Math.max(0, m.index - 15);
    const after = m.index + 15;
    hits.push({
      file: path.relative(ROOT, full),
      index: m.index,
      char: m[0],
      context: data.slice(before, after).replace(/\n/g, '\\n'),
    });
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      walk(full);
      continue;
    }
    scanFile(full);
  }
}

for (const target of TARGETS) {
  if (!fs.existsSync(target)) continue;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    walk(target);
  } else {
    scanFile(target);
  }
}

if (hits.length) {
  console.error(`Bad characters detected (${hits.length}):`);
  for (const hit of hits) {
    console.error(`- ${hit.file} @${hit.index}: "${hit.char}" ...${hit.context}...`);
  }
  process.exit(1);
}
