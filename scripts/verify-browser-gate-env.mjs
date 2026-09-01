import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const manifestPath = process.env.FORGE_BROWSER_FIXTURE_MANIFEST
  ? path.resolve(process.env.FORGE_BROWSER_FIXTURE_MANIFEST)
  : path.join(root, "apps", "nursery", "playwright", ".cache", "browser-fixtures.v1.json");
let manifest = null;
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch { failures.push(`Invalid browser fixture manifest: ${manifestPath}`); }
} else failures.push(`Missing browser fixture manifest: ${manifestPath}`);
const requiredEnv = [
  "FORGE_TEST_WORKSPACE_ID",
  "FORGE_TEST_WORKPIECE_ID",
  "FORGE_TEST_HAMMER_WORKPIECE_ID",
];

for (const name of requiredEnv) {
  const fallback = name === "FORGE_TEST_WORKSPACE_ID" ? manifest?.workspace_id
    : name === "FORGE_TEST_WORKPIECE_ID" ? manifest?.hearth_workpiece_id
    : manifest?.hammer_workpiece_id;
  if (!String(process.env[name] ?? fallback ?? "").trim()) failures.push(`Missing required fixture identity: ${name}`);
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
