import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const testDir = path.join(root, "tests");
const tests = fs.readdirSync(testDir)
  .filter((name) => /\.test\.(?:ts|tsx|mts)$/.test(name))
  .sort();

if (tests.length === 0) {
  console.error("Hearth test inventory is empty.");
  process.exit(1);
}

const tsxCli = path.resolve(root, "node_modules/tsx/dist/cli.mjs");
for (const name of tests) {
  console.log(`\n[hearth:test] ${name}`);
  const result = spawnSync(process.execPath, [tsxCli, path.join(testDir, name)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`Hearth test failed: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nHearth tests passed (${tests.length}).`);
