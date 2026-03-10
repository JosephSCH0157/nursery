import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const defaultStorageState = path.join(repoRoot, "apps", "nursery", "playwright", ".auth", "state.json");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ? path.resolve(repoRoot, process.env.PLAYWRIGHT_STORAGE_STATE)
  : defaultStorageState;

const missing = [];
if (!process.env.FORGE_TEST_WORKSPACE_ID) missing.push("FORGE_TEST_WORKSPACE_ID");
if (!process.env.FORGE_TEST_WORKPIECE_ID) missing.push("FORGE_TEST_WORKPIECE_ID");
if (!fs.existsSync(storageStatePath)) missing.push(`PLAYWRIGHT_STORAGE_STATE (${storageStatePath})`);

const shouldRequire = process.env.CI === "true" || process.env.REQUIRE_HEARTH_PHASE4_SMOKE === "1";

if (missing.length > 0) {
  const message = `[smoke:hearth-phase4] missing prerequisites: ${missing.join(", ")}`;
  if (shouldRequire) {
    console.error(message);
    process.exit(1);
  }
  console.log(`${message}; skipping outside CI.`);
  process.exit(0);
}

const result = spawnSync("pnpm", ["smoke:hearth-phase4"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
