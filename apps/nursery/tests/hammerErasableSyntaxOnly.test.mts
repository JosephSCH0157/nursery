import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const nurseryRoot = path.resolve(import.meta.dirname, "..");
const tsc = path.resolve(nurseryRoot, "node_modules/typescript/bin/tsc");
const result = spawnSync(
  process.execPath,
  [tsc, "-p", "tsconfig.hammer-integration.json", "--noEmit", "--pretty", "false", "--incremental", "false"],
  { cwd: nurseryRoot, encoding: "utf8" },
);

assert.equal(
  result.status,
  0,
  `Nursery Hammer integration must compile with erasableSyntaxOnly.\n${result.stdout}${result.stderr}`,
);

console.log("Nursery Hammer erasable-syntax production configuration test passed.");
