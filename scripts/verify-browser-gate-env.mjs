import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const requiredEnv = [
  "FORGE_TEST_WORKSPACE_ID",
  "FORGE_TEST_WORKPIECE_ID",
  "FORGE_TEST_HAMMER_WORKPIECE_ID",
];

for (const name of requiredEnv) {
  if (!String(process.env[name] ?? "").trim()) failures.push(`Missing required env: ${name}`);
}

const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ? path.resolve(process.env.PLAYWRIGHT_STORAGE_STATE)
  : path.join(root, "apps", "nursery", "playwright", ".auth", "state.json");
if (!fs.existsSync(storageStatePath)) {
  failures.push(`Missing Playwright auth state: ${storageStatePath}`);
}

if (failures.length > 0) {
  console.error("Browser gate prerequisite failure:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Browser gate prerequisites passed.");
}
