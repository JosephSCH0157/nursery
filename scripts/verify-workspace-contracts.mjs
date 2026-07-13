import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const activePackages = [
  ["teleprompter", "apps/anvil"],
  ["@nursery/bar-stock", "apps/bar-stock"],
  ["@forge/bellows", "apps/bellows"],
  ["@forge/hammer", "apps/hammer"],
  ["@nursery/hearth", "apps/hearth"],
  ["nursery", "apps/nursery"],
  ["@forge/quench", "apps/quench"],
  ["@forge/contracts", "packages/contracts"],
  ["@forge/shared", "packages/shared"],
  ["@forge/tongs", "packages/tongs"],
  ["@forge/ui-mobile", "packages/ui-mobile"],
];
const requiredScripts = ["typecheck", "lint", "build", "test"];
const errors = [];

function walkFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", "coverage"].includes(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target, predicate) : predicate(target) ? [target] : [];
  });
}

function normalizedRelative(base, file) {
  return path.relative(base, file).replaceAll("\\", "/");
}

for (const [expectedName, relativeDir] of activePackages) {
  const manifestPath = path.join(root, relativeDir, "package.json");
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${relativeDir}: missing package.json`);
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.name !== expectedName) {
    errors.push(`${relativeDir}: expected name ${expectedName}, received ${manifest.name ?? "<missing>"}`);
  }
  for (const script of requiredScripts) {
    if (typeof manifest.scripts?.[script] !== "string" || !manifest.scripts[script].trim()) {
      errors.push(`${relativeDir}: missing required script ${script}`);
    }
  }

  const packageRoot = path.join(root, relativeDir);
  const unitTests = walkFiles(packageRoot, (file) => /\.test\.(?:[cm]?[jt]sx?)$/i.test(file));
  const autoInventory = new Set([
    "apps/anvil",
    "apps/hammer",
    "apps/hearth",
    "apps/nursery",
  ]);
  const scriptsCorpus = JSON.stringify(manifest.scripts ?? {}).replaceAll("\\", "/");
  if (!autoInventory.has(relativeDir)) {
    for (const testFile of unitTests) {
      const relativeTest = normalizedRelative(packageRoot, testFile);
      if (!scriptsCorpus.includes(relativeTest)) {
        errors.push(`${relativeDir}: unregistered test file ${relativeTest}`);
      }
    }
  } else if (relativeDir === "apps/hearth" && manifest.scripts?.["test:all"] !== "node scripts/run-tests.mjs") {
    errors.push("apps/hearth: test:all must use the complete inventory runner");
  } else if (relativeDir === "apps/nursery" && manifest.scripts?.test !== "node scripts/run-tests.mjs") {
    errors.push("apps/nursery: test must use the complete inventory runner");
  } else if (relativeDir === "apps/hammer" && !String(manifest.scripts?.test).includes("test:all")) {
    errors.push("apps/hammer: test must use the strict-registration runner");
  } else if (relativeDir === "apps/anvil" && !String(manifest.scripts?.test).includes("jest")) {
    errors.push("apps/anvil: test must use Jest discovery");
  }
  if (manifest.engines?.node !== "20.20.0" || manifest.volta?.node !== "20.20.0") {
    errors.push(`${relativeDir}: engines.node and volta.node must both equal 20.20.0`);
  }
}

const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const browserScriptFiles = [
  ...walkFiles(path.join(root, "scripts"), (file) => /\.(?:mjs|mts|js|ts)$/i.test(file)),
  ...walkFiles(path.join(root, "apps/nursery/scripts"), (file) => /\.(?:mjs|mts|js|ts)$/i.test(file)),
];
const browserCorpus = [
  JSON.stringify(rootManifest.scripts ?? {}),
  JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "apps/nursery/package.json"), "utf8")).scripts ?? {}),
  ...browserScriptFiles.map((file) => fs.readFileSync(file, "utf8")),
].join("\n").replaceAll("\\", "/");
const browserSpecs = walkFiles(path.join(root, "apps/nursery/playwright"), (file) => /\.spec\.tsx?$/i.test(file));
for (const spec of browserSpecs) {
  const basename = path.basename(spec);
  const phase4Wildcard = basename.startsWith("hearth.phase4.") && browserCorpus.includes("hearth.phase4.*.spec.ts");
  if (!browserCorpus.includes(basename) && !phase4Wildcard) {
    errors.push(`apps/nursery: unregistered browser test playwright/${basename}`);
  }
}

const discovered = ["apps", "packages"].flatMap((base) =>
  fs.readdirSync(path.join(root, base), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, base, entry.name, "package.json")))
    .map((entry) => `${base}/${entry.name}`),
);
const registered = new Set(activePackages.map(([, relativeDir]) => relativeDir));
for (const relativeDir of discovered) {
  if (!registered.has(relativeDir)) errors.push(`${relativeDir}: workspace package is not registered as active`);
}

if (errors.length) {
  console.error(`Workspace contract preflight failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Workspace contract preflight passed for ${activePackages.length} active packages.`);
