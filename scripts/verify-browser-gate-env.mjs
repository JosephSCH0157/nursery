import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const COHERENCE_CODE = "SUPABASE_PROJECT_COHERENCE_MISMATCH";
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

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function decodeJwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")); }
  catch { return null; }
}

try {
  const configuredUrl = new URL(process.env.TONGS_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "");
  const storageState = JSON.parse(fs.readFileSync(storageStatePath, "utf8"));
  const forgeAuth = storageState.origins?.flatMap((origin) => origin.localStorage ?? []).find((entry) => entry.name === "forge-auth")?.value;
  const session = forgeAuth ? JSON.parse(forgeAuth) : null;
  const payload = decodeJwtPayload(session?.access_token ?? "");
  const issuerUrl = new URL(String(payload?.iss ?? ""));
  const configuredLocal = isLocalHost(configuredUrl.hostname);
  const issuerLocal = isLocalHost(issuerUrl.hostname);
  const manifestLocal = manifest?.project_ref === "local";
  const remoteProject = configuredUrl.hostname.endsWith(".supabase.co") ? configuredUrl.hostname.split(".")[0] : null;
  if (configuredLocal !== issuerLocal || configuredLocal !== manifestLocal || (!configuredLocal && remoteProject !== manifest?.project_ref)) {
    failures.push(`${COHERENCE_CODE}: configured API, token issuer, and fixture manifest identify different Supabase projects.`);
  }
} catch {
  failures.push(`${COHERENCE_CODE}: unable to validate configured API, token issuer, and fixture manifest.`);
}

if (failures.length > 0) {
  console.error("Browser gate prerequisite failure:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Browser gate prerequisites passed.");
}
