import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nurseryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(nurseryRoot, "node_modules", ".hammer-production-gate");
const manifestPath = join(outputRoot, ".vite", "manifest.json");
if (!existsSync(manifestPath)) throw new Error("Hammer production manifest was not generated.");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entry = Object.values(manifest).find((item) => item?.isEntry && String(item.src || "").endsWith("hammer-production-gate-entry.tsx"));
if (!entry?.file) throw new Error("Hammer production entry is absent from the Vite manifest.");
const entryPath = join(outputRoot, entry.file);
if (!existsSync(entryPath) || statSync(entryPath).size < 10_000) throw new Error("Hammer production JavaScript artifact is missing or unexpectedly empty.");
const cssFiles = Array.isArray(entry.css) ? entry.css : [];
if (cssFiles.length === 0) throw new Error("Hammer production entry emitted no CSS artifacts.");
for (const cssFile of cssFiles) {
  const cssPath = join(outputRoot, cssFile);
  if (!existsSync(cssPath) || statSync(cssPath).size === 0) throw new Error(`Hammer CSS artifact is missing or empty: ${cssFile}`);
}
console.log(`Hammer production integration verified: entry=${entry.file}, css=${cssFiles.length}.`);
