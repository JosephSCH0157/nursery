import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "playwright/test";
import { applyFixtureManifestToEnvironment } from "./scripts/browser-fixture-authority.mts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
applyFixtureManifestToEnvironment();

const baseURL = process.env.FORGE_SMOKE_BASE_URL
  ?? process.env.FORGE_TEST_BASE_URL
  ?? process.env.PLAYWRIGHT_BASE_URL
  ?? "http://127.0.0.1:5173";

if (baseURL.includes(":4173")) {
  throw new Error("Playwright baseURL port 4173 is deprecated. Use http://127.0.0.1:5173.");
}

const hasExternalBaseURL = Boolean(
  process.env.FORGE_SMOKE_BASE_URL
  ?? process.env.FORGE_TEST_BASE_URL
  ?? process.env.PLAYWRIGHT_BASE_URL,
);
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ?? path.resolve(__dirname, "playwright/.auth/state.json");
const hasStorageState = fs.existsSync(storageStatePath);

export default defineConfig({
  testDir: path.resolve(__dirname, "playwright"),
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    storageState: hasStorageState ? storageStatePath : undefined,
  },
  webServer: hasExternalBaseURL
    ? undefined
    : {
      // Browser verification is read-only with respect to generated workspace
      // assets. Bypass the package predev generator and serve the checked-out
      // tree exactly as it stands.
      command: "pnpm --filter nursery exec node scripts/run-vite.mjs --configLoader runner --host 127.0.0.1 --port 5173",
      url: baseURL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
});
