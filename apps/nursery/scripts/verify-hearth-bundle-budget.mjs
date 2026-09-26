import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "dist/.vite/manifest.json"), "utf8"));
const entry = Object.values(manifest).find((item) => item.name === "HearthStandalone" && item.isDynamicEntry);
if (!entry) throw new Error("Hearth route is absent from the production manifest.");

const visited = new Set();
const files = [];
function visit(item, includeDynamic = false) {
  if (!item || visited.has(item.file)) return;
  visited.add(item.file);
  files.push(item.file);
  for (const key of item.imports ?? []) visit(manifest[key]);
  if (includeDynamic) {
    for (const key of item.dynamicImports ?? []) visit(manifest[key]);
  }
}
visit(entry, true);

const sizes = files.filter((file) => file.endsWith(".js")).map((file) => ({
  file,
  bytes: statSync(resolve(root, "dist", file)).size,
}));
const totalBytes = sizes.reduce((sum, item) => sum + item.bytes, 0);
const maxChunkBytes = Math.max(0, ...sizes.map((item) => item.bytes));
const TOTAL_BUDGET = 1_800_000;
// Restore the original ~16% regression headroom over the certified 954,312-byte
// HearthShell, including verified production-configuration variance.
const CHUNK_BUDGET = 1_106_000;
if (totalBytes > TOTAL_BUDGET || maxChunkBytes > CHUNK_BUDGET) {
  throw new Error(`Hearth bundle budget exceeded: total=${totalBytes}/${TOTAL_BUDGET}, max=${maxChunkBytes}/${CHUNK_BUDGET}`);
}
console.log(`Hearth bundle budget passed: ${sizes.length} JS chunks, total=${totalBytes}, max=${maxChunkBytes}.`);
