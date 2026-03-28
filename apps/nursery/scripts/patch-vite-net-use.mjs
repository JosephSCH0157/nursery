#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitePackageJsonPath = require.resolve("vite/package.json");
const viteDir = path.dirname(vitePackageJsonPath);
const chunksDir = path.join(viteDir, "dist", "node", "chunks");
const NEEDLE_RE = /exec\("net use", \(([^)]*)\) => \{/g;
const REPLACEMENT = '((cb) => cb(new Error("net use disabled for Forge dev startup"), ""))(($1) => {';

if (!fs.existsSync(chunksDir)) {
  console.warn(`[patch-vite-net-use] chunk directory not found: ${chunksDir}`);
  process.exit(0);
}

let patchedAny = false;
for (const entry of fs.readdirSync(chunksDir)) {
  if (!entry.endsWith(".js")) continue;
  const chunkPath = path.join(chunksDir, entry);
  const source = fs.readFileSync(chunkPath, "utf8");
  if (!NEEDLE_RE.test(source)) continue;
  NEEDLE_RE.lastIndex = 0;
  if (source.includes("net use disabled for Forge dev startup")) {
    patchedAny = true;
    continue;
  }
  const next = source.replace(NEEDLE_RE, REPLACEMENT);
  if (next !== source) {
    fs.writeFileSync(chunkPath, next, "utf8");
    patchedAny = true;
    console.log(`[patch-vite-net-use] patched ${chunkPath}`);
  }
}

if (!patchedAny) {
  console.log("[patch-vite-net-use] no patch needed");
}
