import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");
const baselinePath = join(packageRoot, "type-safety-baseline.json");
const sourcePattern = /\.(ts|tsx)$/i;
const suppressionPattern = /@ts-(?:nocheck|ignore|expect-error)|eslint-disable[^\n]*no-explicit-any/g;
const criticalPrefixes = [
  "src/persistence/",
  "src/visuals/",
  "src/transcript/",
  "src/media/",
  "src/features/auto-placement/",
  "src/features/visual-effects/",
  "src/features/eye-contact-assist/",
];
const criticalFiles = new Set([
  "src/editor/hammerAuthorityOps.ts",
  "src/editor/hammerOpenHydration.ts",
  "src/editor/hammerPlacementPersistenceGuard.ts",
  "src/editor/hammerRenderAssembly.ts",
  "src/editor/hammerTranscriptSelection.ts",
  "src/editor/hammerWorkspaceHistory.ts",
  "src/editor/hammerWorkspaceSnapshot.ts",
]);

function discoverSourceFiles() {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && sourcePattern.test(entry.name) && !/\.test\.tsx?$/i.test(entry.name)) files.push(path);
    }
  };
  visit(sourceRoot);
  return files.sort((a, b) => a.localeCompare(b));
}

function inspectFile(path) {
  const text = readFileSync(path, "utf8");
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  let explicitAny = 0;
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) explicitAny += 1;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { explicitAny, suppressions: [...text.matchAll(suppressionPattern)].length };
}

const files = discoverSourceFiles();
const currentFiles = {};
let totalExplicitAny = 0;
let totalSuppressions = 0;
let criticalExplicitAny = 0;
let criticalSuppressions = 0;
for (const path of files) {
  const key = relative(packageRoot, path).replaceAll("\\", "/");
  const result = inspectFile(path);
  if (result.explicitAny || result.suppressions) currentFiles[key] = result;
  totalExplicitAny += result.explicitAny;
  totalSuppressions += result.suppressions;
  const critical = criticalFiles.has(key) || criticalPrefixes.some((prefix) => key.startsWith(prefix));
  if (critical) {
    criticalExplicitAny += result.explicitAny;
    criticalSuppressions += result.suppressions;
  }
}

const current = {
  schemaVersion: 1,
  totalExplicitAny,
  totalSuppressions,
  criticalExplicitAny,
  criticalSuppressions,
  files: currentFiles,
};
if (process.argv.includes("--print-current")) {
  console.log(JSON.stringify(current, null, 2));
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const failures = [];
if (criticalExplicitAny !== 0) failures.push(`Authority-critical explicit any count must be zero; found ${criticalExplicitAny}.`);
if (criticalSuppressions !== 0) failures.push(`Authority-critical suppression count must be zero; found ${criticalSuppressions}.`);
if (totalExplicitAny > baseline.totalExplicitAny) failures.push(`Explicit any count increased: baseline=${baseline.totalExplicitAny}, current=${totalExplicitAny}.`);
if (totalSuppressions > baseline.totalSuppressions) failures.push(`Suppression count increased: baseline=${baseline.totalSuppressions}, current=${totalSuppressions}.`);
for (const [path, result] of Object.entries(currentFiles)) {
  const allowed = baseline.files[path];
  if (!allowed && (result.explicitAny || result.suppressions)) failures.push(`New unsafe type escape file: ${path}.`);
  else if (allowed && result.explicitAny > allowed.explicitAny) failures.push(`Explicit any increased in ${path}: baseline=${allowed.explicitAny}, current=${result.explicitAny}.`);
  else if (allowed && result.suppressions > allowed.suppressions) failures.push(`Suppressions increased in ${path}: baseline=${allowed.suppressions}, current=${result.suppressions}.`);
}
if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log(`Hammer type-safety ratchet passed: critical any=0, critical suppressions=0, total any=${totalExplicitAny}/${baseline.totalExplicitAny}, suppressions=${totalSuppressions}/${baseline.totalSuppressions}.`);
