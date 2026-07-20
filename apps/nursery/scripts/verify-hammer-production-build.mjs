import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const nurseryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(nurseryRoot, "node_modules", ".hammer-production-gate");
const manifestPath = join(outputRoot, ".vite", "manifest.json");
const ENTRY_JS_BUDGET_BYTES = 225_000;
const TOTAL_JS_BUDGET_BYTES = 275_000;
const TOTAL_ASSET_GZIP_BUDGET_BYTES = 90_000;
if (!existsSync(manifestPath)) throw new Error("Hammer production manifest was not generated.");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entry = Object.values(manifest).find((item) => item?.isEntry && String(item.src || "").endsWith("hammer-production-gate-entry.tsx"));
if (!entry?.file) throw new Error("Hammer production entry is absent from the Vite manifest.");
const entryPath = join(outputRoot, entry.file);
if (!existsSync(entryPath) || statSync(entryPath).size < 10_000) throw new Error("Hammer production JavaScript artifact is missing or unexpectedly empty.");
const assetFiles = readdirSync(join(outputRoot, "assets")).map((file) => `assets/${file}`);
const jsFiles = assetFiles.filter((file) => file.endsWith(".js"));
const entryBytes = statSync(entryPath).size;
const totalJsBytes = jsFiles.reduce((total, file) => total + statSync(join(outputRoot, file)).size, 0);
const cssFiles = Array.isArray(entry.css) ? entry.css : [];
if (cssFiles.length === 0) throw new Error("Hammer production entry emitted no CSS artifacts.");
for (const cssFile of cssFiles) {
  const cssPath = join(outputRoot, cssFile);
  if (!existsSync(cssPath) || statSync(cssPath).size === 0) throw new Error(`Hammer CSS artifact is missing or empty: ${cssFile}`);
}
const totalAssetGzipBytes = [...jsFiles, ...cssFiles].reduce((total, file) => total + gzipSync(readFileSync(join(outputRoot, file))).length, 0);
if (entryBytes > ENTRY_JS_BUDGET_BYTES) throw new Error(`Hammer entry bundle budget exceeded: entry=${entryBytes}/${ENTRY_JS_BUDGET_BYTES}.`);
if (totalJsBytes > TOTAL_JS_BUDGET_BYTES) throw new Error(`Hammer JS bundle budget exceeded: total=${totalJsBytes}/${TOTAL_JS_BUDGET_BYTES}.`);
if (totalAssetGzipBytes > TOTAL_ASSET_GZIP_BUDGET_BYTES) throw new Error(`Hammer gzip bundle budget exceeded: total=${totalAssetGzipBytes}/${TOTAL_ASSET_GZIP_BUDGET_BYTES}.`);
console.log(`Hammer production integration verified: entry=${entry.file}, css=${cssFiles.length}, entryBytes=${entryBytes}/${ENTRY_JS_BUDGET_BYTES}, totalJsBytes=${totalJsBytes}/${TOTAL_JS_BUDGET_BYTES}, totalGzipBytes=${totalAssetGzipBytes}/${TOTAL_ASSET_GZIP_BUDGET_BYTES}.`);
