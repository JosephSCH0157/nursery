import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ?? path.resolve(__dirname, ".auth/state.json");

test.use({
  headless: false,
  storageState: undefined,
});

test("capture_auth_state", async ({ page, baseURL }) => {
  test.setTimeout(10 * 60 * 1000);

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL. Set FORGE_TEST_BASE_URL if needed.");
  }

  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  if (fs.existsSync(storageStatePath)) {
    // Overwrite by design so this remains a one-command refresh flow.
    console.log(`[playwright-auth] Overwriting existing storage state at ${storageStatePath}`);
  }

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Podcaster's Forge" })).toBeVisible();

  console.log("[playwright-auth] Log in in the opened browser window. Waiting for /app redirect...");
  await page.waitForURL((url) => url.pathname.startsWith("/app"), {
    timeout: 10 * 60 * 1000,
  });

  await page.context().storageState({ path: storageStatePath });
  console.log(`[playwright-auth] Saved storage state to ${storageStatePath}`);
});
