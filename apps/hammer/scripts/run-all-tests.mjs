import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testPattern = /\.test\.tsx?$/i;

function discoverTests(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && testPattern.test(entry.name)) files.push(resolve(path));
    }
  };
  visit(join(root, "tests"));
  visit(join(root, "src"));
  return files.sort((a, b) => a.localeCompare(b));
}

function runNode(args, capture = false) {
  return spawnSync(process.execPath, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

const normalized = (path) => resolve(path).replaceAll("\\", "/").toLowerCase();

function verifyStrictRegistration(discovered) {
  const tscPath = join(packageRoot, "node_modules", "typescript", "bin", "tsc");
  const listed = runNode([tscPath, "-p", "tsconfig.test-boundary.json", "--listFilesOnly"], true);
  if (listed.status !== 0) {
    process.stderr.write(listed.stdout || "");
    process.stderr.write(listed.stderr || "");
    throw new Error("Strict Hammer test compilation failed.");
  }
  const compiledTests = String(listed.stdout).split(/\r?\n/)
    .map((line) => line.trim()).filter((line) => testPattern.test(line)).map((line) => resolve(line))
    .sort((a, b) => a.localeCompare(b));
  const discoveredSet = new Set(discovered.map(normalized));
  const compiledSet = new Set(compiledTests.map(normalized));
  const missing = discovered.filter((path) => !compiledSet.has(normalized(path)));
  const stale = compiledTests.filter((path) => !discoveredSet.has(normalized(path)));
  if (missing.length || stale.length || discovered.length !== compiledTests.length) {
    for (const path of missing) console.error(`Not strict-compiled: ${relative(packageRoot, path)}`);
    for (const path of stale) console.error(`Strict-only stale test: ${relative(packageRoot, path)}`);
    throw new Error(`Hammer test registration mismatch: discovered=${discovered.length}, strict=${compiledTests.length}.`);
  }
  console.log(`Hammer test registration verified: discovered=${discovered.length}, strict=${compiledTests.length}.`);
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

const discovered = discoverTests(packageRoot);
verifyStrictRegistration(discovered);
const seedFlag = process.argv.find((arg) => arg.startsWith("--shuffle-seed="));
const seed = seedFlag ? Number(seedFlag.slice("--shuffle-seed=".length)) : null;
if (seedFlag && !Number.isInteger(seed)) throw new Error("--shuffle-seed must be an integer.");
const ordered = seed == null ? discovered : shuffle(discovered, seed);
if (seed != null) console.log(`Hammer test order shuffled with seed ${seed}.`);

let passed = 0;
for (const testPath of ordered) {
  const label = relative(packageRoot, testPath).replaceAll("\\", "/");
  console.log(`\n[hammer:test] ${label}`);
  const result = runNode(["--import", "tsx", testPath]);
  if (result.status !== 0) {
    console.error(`Hammer test failed: ${label}`);
    process.exit(result.status ?? 1);
  }
  passed += 1;
}
console.log(`\nHammer test:all passed ${passed}/${discovered.length}.`);
