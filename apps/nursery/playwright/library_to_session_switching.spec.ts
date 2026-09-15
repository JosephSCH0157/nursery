import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ID = process.env.FORGE_TEST_WORKSPACE_ID ?? "";
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ?? path.resolve(__dirname, ".auth/state.json");
const hasStorageState = fs.existsSync(storageStatePath);

type PlanRow = {
  title: string;
  scriptPath: string;
};

async function readPlanRows(page: Page): Promise<PlanRow[]> {
  return page.locator('section:has-text("Session Plan") li[draggable="true"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const divs = Array.from(node.querySelectorAll("div"));
      const title = (divs[1]?.textContent ?? "").trim();
      const scriptPath = (divs[2]?.textContent ?? "").trim();
      return { title, scriptPath };
    }),
  );
}

test("library_to_session_switching", async ({ page }) => {
  test.skip(
    !hasStorageState,
    "Missing playwright/.auth/state.json — run pnpm --filter nursery test:playwright:auth",
  );
  test.skip(
    !WORKSPACE_ID,
    "Missing FORGE_TEST_WORKSPACE_ID — set it to a workspace UUID",
  );

  await page.goto(`/app/tongs?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`);
  await expect(page).toHaveURL(/\/app\/tongs/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recording Sessions" })).toBeVisible();

  const sessionTitle = `[fixture:forge-browser-release-v1] PW Session ${Date.now()}`;
  await page.getByRole("button", { name: "Create Session" }).click();
  await page.getByPlaceholder("Recording Session").fill(sessionTitle);
  await page.locator("div").filter({ hasText: "Create Session" }).first().getByRole("button", { name: "Create" }).click();

  const createdSessionButton = page.locator("button.trs-session-row__select").filter({ hasText: sessionTitle }).first();
  await expect(createdSessionButton).toBeVisible();
  await createdSessionButton.click();

  const readyCards = page.locator('section:has-text("Ready Candidates") li');
  await expect.poll(() => readyCards.count(), {
    message: "At least two canonical Ready candidates must become available",
    timeout: 30_000,
  }).toBeGreaterThanOrEqual(2);

  await readyCards.nth(0).getByRole("button", { name: "Add" }).click();
  await readyCards.nth(1).getByRole("button", { name: "Add" }).click();

  const initialPlanRows = await readPlanRows(page);
  expect(initialPlanRows.length).toBeGreaterThanOrEqual(2);
  const expectedPlanRows = initialPlanRows.slice(0, 2);

  const saveButton = page.getByRole("button", { name: "Save Plan" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText(/Saved \d+ items?\./)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Recording Sessions" })).toBeVisible();
  await page.locator("button.trs-session-row__select").filter({ hasText: sessionTitle }).first().click();

  await expect.poll(async () => (await readPlanRows(page)).slice(0, 2)).toEqual(expectedPlanRows);

  await page.goto(`/app/anvil?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`);
  await page.waitForURL(/\/anvil\/teleprompter_pro\.html/);
  await page.waitForFunction(() => (window as typeof window & { __tp_init_done?: boolean }).__tp_init_done === true, null, {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settingsOverlay = page.locator("#settingsOverlay");
  await expect(settingsOverlay).toBeVisible({ timeout: 10_000 });
  await settingsOverlay.locator('[data-settings-tab="media"]').click({ timeout: 10_000 });

  const sourceSelect = page.locator("#scriptSourceSelect");
  await expect(sourceSelect).toBeVisible();
  await sourceSelect.selectOption("session");

  const sessionSelect = page.locator("#recordingSessionSelect");
  await expect(sessionSelect).toBeVisible();
  await expect.poll(async () => {
    return sessionSelect.evaluate((select, title) => {
      const match = Array.from(select.options).find((option) => option.textContent?.trim() === title);
      return match?.value ?? null;
    }, sessionTitle);
  }).not.toBeNull();
  const sessionOptionValue = await sessionSelect.evaluate((select, title) => {
    const match = Array.from(select.options).find((option) => option.textContent?.trim() === title);
    return match?.value ?? "";
  }, sessionTitle);
  await sessionSelect.selectOption(sessionOptionValue);
  await expect(page.locator("#scriptSourceIndicator")).toHaveText(/Source: Session .*\(2 scripts\)/);

  const scriptSelect = page.locator("#scriptSelectSidebar");
  await expect(scriptSelect).toBeVisible();
  await expect.poll(async () => {
    const titles = (await scriptSelect.locator("option").allTextContents())
      .map((text) => text.trim())
      .filter(Boolean)
      .slice(0, 2);
    return titles.length === expectedPlanRows.length
      && titles.every((title, index) => title.startsWith(expectedPlanRows[index]!.title));
  }).toBe(true);

  await sourceSelect.selectOption("library");
  await expect(page.locator("#scriptSourceIndicator")).toHaveText(/Source: Library/);
  await expect(page.locator("#recordingSessionRow")).toBeHidden();

  const selectedSessionAfterLibrary = await page.evaluate(
    () => window.localStorage.getItem("forge_anvil_recording_session_v1"),
  );
  expect(selectedSessionAfterLibrary).toBeNull();
});
