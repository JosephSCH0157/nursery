import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseURL = process.env.FORGE_TEST_BASE_URL
  ?? process.env.PLAYWRIGHT_BASE_URL
  ?? "http://127.0.0.1:4173";
const hasExternalBaseURL = Boolean(process.env.FORGE_TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL);
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
      command: "pnpm --filter nursery dev --host 127.0.0.1 --port 4173",
      url: baseURL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
});
