import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const hammerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(hammerRoot, "src");
const summaryPath = resolve(hammerRoot, "node_modules/.hammer-coverage/coverage-summary.json");
const baselinePath = resolve(hammerRoot, "coverage-baseline.json");
const metrics = ["lines", "statements", "functions", "branches"];
const tolerance = 0.001;

const normalize = (path) => path.split(sep).join("/");
const isProductionSource = (path) => {
  const normalized = normalize(path);
  return /\.tsx?$/.test(normalized)
    && !/\.d\.ts$/.test(normalized)
    && !/\.test\.tsx?$/.test(normalized)
    && !normalized.includes("/__tests__/")
    && !normalized.startsWith("src/dev/");
};

async function discoverProductionSources(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await discoverProductionSources(path));
    else if (entry.isFile()) {
      const packagePath = normalize(relative(hammerRoot, path));
      if (isProductionSource(packagePath)) files.push(packagePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

const [summary, baseline, productionSources] = await Promise.all([
  readFile(summaryPath, "utf8").then(JSON.parse),
  readFile(baselinePath, "utf8").then(JSON.parse),
  discoverProductionSources(sourceRoot),
]);

if (baseline.schemaVersion !== 1) throw new Error("Unsupported Hammer coverage baseline schema.");
if (!summary.total) throw new Error("Hammer coverage summary has no global total.");

const coveredFiles = new Map();
for (const [file, result] of Object.entries(summary)) {
  if (file === "total") continue;
  const packagePath = normalize(relative(hammerRoot, file));
  if (isProductionSource(packagePath)) coveredFiles.set(packagePath, result);
}

const missing = productionSources.filter((file) => !coveredFiles.has(file));
const unexpected = [...coveredFiles.keys()].filter((file) => !productionSources.includes(file));
if (missing.length || unexpected.length) {
  for (const file of missing) console.error(`Missing from coverage: ${file}`);
  for (const file of unexpected) console.error(`Unexpected coverage entry: ${file}`);
  throw new Error(
    `Hammer production coverage manifest mismatch: discovered=${productionSources.length}, covered=${coveredFiles.size}.`,
  );
}

const regressions = [];
function compare(scope, current, floor) {
  for (const metric of metrics) {
    const currentPct = current?.[metric]?.pct;
    const floorPct = floor?.[metric];
    if (!Number.isFinite(currentPct) || !Number.isFinite(floorPct)) {
      regressions.push(`${scope} ${metric}: malformed coverage value`);
    } else if (currentPct + tolerance < floorPct) {
      regressions.push(`${scope} ${metric}: ${currentPct}% < ${floorPct}%`);
    }
  }
}

compare("global", summary.total, baseline.global);
for (const [file, floor] of Object.entries(baseline.criticalFiles)) {
  const current = coveredFiles.get(file);
  if (!current) regressions.push(`${file}: missing authority-critical coverage`);
  else compare(file, current, floor);
}

if (regressions.length) {
  regressions.forEach((failure) => console.error(`Coverage regression: ${failure}`));
  throw new Error(`Hammer coverage ratchet failed with ${regressions.length} regression(s).`);
}

console.log(
  `Hammer coverage manifest verified: production=${productionSources.length}, covered=${coveredFiles.size}.`,
);
console.log(
  `Hammer coverage ratchet passed: lines=${summary.total.lines.pct}%, branches=${summary.total.branches.pct}%, functions=${summary.total.functions.pct}%; critical=${Object.keys(baseline.criticalFiles).length}.`,
);
