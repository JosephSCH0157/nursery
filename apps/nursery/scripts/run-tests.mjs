import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const testDir = path.join(root, "tests");
const tests = fs.readdirSync(testDir)
  .filter((name) => /\.test\.(?:mts|ts)$/.test(name))
  .sort();

if (tests.length === 0) {
  console.error("Nursery test inventory is empty.");
  process.exit(1);
}

const tsxCli = path.resolve(root, "node_modules/tsx/dist/cli.mjs");
const failures = [];
for (const name of tests) {
  console.log(`\n[nursery:test] ${name}`);
  const result = spawnSync(process.execPath, [tsxCli, path.join(testDir, name)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) failures.push(name);
}

if (failures.length > 0) {
  console.error(`\nNursery tests failed (${failures.length}/${tests.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nNursery tests passed (${tests.length}).`);
