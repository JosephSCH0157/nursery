import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsRoot = join(packageRoot, "tests");
const baselineManifestPath = join(testsRoot, "stabilization-baseline-tests.json");
const executableTestPattern = /(?:\.test\.tsx?|\.node\.cjs)$/i;
const typescriptTestPattern = /\.test\.tsx?$/i;

function normalized(path) {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

function packageRelative(path) {
  return relative(packageRoot, path).replaceAll("\\", "/");
}

function discoverTests(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && executableTestPattern.test(entry.name)) files.push(resolve(path));
    }
  };
  visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function runNode(args, capture = false) {
  return spawnSync(process.execPath, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

function assertSuccessful(result, message) {
  if (result.status === 0) return;
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  throw new Error(message);
}

function verifyFrozenBaseline(discovered) {
  const manifest = JSON.parse(readFileSync(baselineManifestPath, "utf8"));
  if (!Array.isArray(manifest) || manifest.some((entry) => typeof entry !== "string")) {
    throw new Error("Hearth stabilization baseline manifest is malformed.");
  }

  const discoveredByRelativePath = new Map(discovered.map((path) => [packageRelative(path), path]));
  const missing = manifest.filter((path) => !discoveredByRelativePath.has(path));
  if (missing.length) {
    for (const path of missing) console.error(`Missing baseline test: ${path}`);
    throw new Error(`Hearth stabilization baseline shrank: baseline=${manifest.length}, missing=${missing.length}.`);
  }

  const additions = discovered.map(packageRelative).filter((path) => !manifest.includes(path));
  console.log(
    `Hearth stabilization baseline verified: baseline=${manifest.length}, discovered=${discovered.length}, additions=${additions.length}.`,
  );
  for (const path of additions) console.log(`Stabilization regression: ${path}`);
}

function verifyStrictTestBoundary(discovered) {
  const tscPath = join(packageRoot, "node_modules", "typescript", "bin", "tsc");
  const configPath = "tsconfig.stabilization-tests.json";

  const compiled = runNode([tscPath, "-p", configPath, "--noEmit"], true);
  assertSuccessful(compiled, "Strict Hearth stabilization test compilation failed.");

  const listed = runNode([tscPath, "-p", configPath, "--listFilesOnly"], true);
  assertSuccessful(listed, "Unable to enumerate strictly compiled Hearth tests.");

  const compiledTests = String(listed.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => typescriptTestPattern.test(line))
    .map((line) => resolve(line))
    .sort((left, right) => left.localeCompare(right));
  const discoveredTypescriptTests = discovered.filter((path) => typescriptTestPattern.test(path));
  const discoveredSet = new Set(discoveredTypescriptTests.map(normalized));
  const compiledSet = new Set(compiledTests.map(normalized));
  const missing = discoveredTypescriptTests.filter((path) => !compiledSet.has(normalized(path)));
  const stale = compiledTests.filter((path) => !discoveredSet.has(normalized(path)));

  if (missing.length || stale.length || discoveredTypescriptTests.length !== compiledTests.length) {
    for (const path of missing) console.error(`Not strict-compiled: ${packageRelative(path)}`);
    for (const path of stale) console.error(`Strict-only stale test: ${packageRelative(path)}`);
    throw new Error(
      `Hearth strict test mismatch: discovered-ts=${discoveredTypescriptTests.length}, strict=${compiledTests.length}.`,
    );
  }

  console.log(
    `Hearth strict test boundary verified: discovered-ts=${discoveredTypescriptTests.length}, strict=${compiledTests.length}.`,
  );
}

function shuffle(items, seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output;
}

const discovered = discoverTests(testsRoot);
verifyFrozenBaseline(discovered);
verifyStrictTestBoundary(discovered);

const seedFlag = process.argv.find((argument) => argument.startsWith("--shuffle-seed="));
const seed = seedFlag ? Number(seedFlag.slice("--shuffle-seed=".length)) : null;
if (seedFlag && !Number.isInteger(seed)) throw new Error("--shuffle-seed must be an integer.");
const ordered = seed == null ? discovered : shuffle(discovered, seed);
if (seed != null) console.log(`Hearth stabilization test order shuffled with seed ${seed}.`);

let passed = 0;
for (const testPath of ordered) {
  const label = packageRelative(testPath);
  console.log(`\n[hearth:stabilization] ${label}`);
  const result = testPath.endsWith(".node.cjs")
    ? runNode([testPath])
    : runNode(["--import", "tsx", testPath]);
  if (result.status !== 0) {
    console.error(`Hearth stabilization test failed: ${label}`);
    process.exit(result.status ?? 1);
  }
  passed += 1;
}

console.log(`\nHearth stabilization gate passed ${passed}/${discovered.length}.`);
