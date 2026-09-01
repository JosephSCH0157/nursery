import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "playwright/test";
import { applyFixtureManifestToEnvironment } from "./scripts/browser-fixture-authority.mts";

const directory = path.dirname(fileURLToPath(import.meta.url));
applyFixtureManifestToEnvironment();
const baseURL = process.env.FORGE_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const storageState = path.resolve(directory, "playwright/.auth/state.json");

export default defineConfig({
  testDir: path.resolve(directory, "playwright"),
  testMatch: "hammer.preview-performance.spec.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: false,
    storageState: fs.existsSync(storageState) ? storageState : undefined,
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
    launchOptions: { args: ["--enable-gpu-rasterization", "--enable-zero-copy"] },
  },
  projects: [
    { name: "chrome-stable-hardware", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "edge-stable-hardware", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
  webServer: process.env.FORGE_TEST_BASE_URL ? undefined : {
    command: "pnpm --filter nursery exec node scripts/run-vite.mjs --configLoader runner --host 127.0.0.1 --port 5173 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
