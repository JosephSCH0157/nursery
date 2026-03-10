import { expect, test } from "playwright/test";
import {
  openHearth,
  openBarstock,
} from "./helpers/hearth-phase4-actions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

async function ensureWorkpieceRailVisible(page: Parameters<typeof test>[0]["page"]): Promise<void> {
  const railList = page.locator(".hs-rail .hs-workpieces-list");

  await expect(page.locator(".hs-rail")).toBeVisible();
  if (await railList.isVisible().catch(() => false)) {
    return;
  }

  const episodesButton = page.getByRole("button", { name: "Episodes (In Progress)" });
  await expect(episodesButton).toBeVisible();
  await episodesButton.click();
  await expect(railList).toBeVisible();
}

async function waitForStableWorkpieceCount(
  page: Parameters<typeof test>[0]["page"],
  args: { minCount?: number; timeout?: number } = {},
): Promise<number> {
  const minCount = args.minCount ?? 1;
  const timeout = args.timeout ?? 30_000;
  const loadingIndicator = page.getByText("Loading workspace projects...");
  const railCards = page.locator(".hs-rail .hs-workpiece-card");
  const startedAt = Date.now();
  let lastCount = -1;
  let stableRounds = 0;

  while (Date.now() - startedAt < timeout) {
    const count = await railCards.count();
    const loadingCount = await loadingIndicator.count();
    if (count >= minCount) {
      stableRounds = count === lastCount ? stableRounds + 1 : 1;
      lastCount = count;
      if ((loadingCount === 0 && stableRounds >= 2) || stableRounds >= 4) {
        return count;
      }
    } else {
      lastCount = count;
      stableRounds = 0;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for stable workpiece count >= ${minCount}`);
}

test.describe("Hearth Phase 4 spark forge restore", () => {
  test("Spark -> Forge -> refresh reopens the same workpiece with stable rail count", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();
    const sparkTitle = `Phase 4 spark ${Date.now()} ${Math.random().toString(16).slice(2, 10)}`;

    await openHearth(page, { workspaceId: artifact.workspace_id });
    await ensureWorkpieceRailVisible(page);
    const beforeCount = await waitForStableWorkpieceCount(page);

    await openBarstock(page, { workspaceId: artifact.workspace_id });
    const newSparkInput = page.getByLabel("New spark text");
    const addSparkButton = page.getByRole("button", { name: "Add Spark" });
    await newSparkInput.fill(sparkTitle);
    await expect(addSparkButton).toBeEnabled();
    await addSparkButton.click();
    await expect(newSparkInput).toHaveValue("");
    await page.reload({ waitUntil: "load" });
    await page.getByLabel("Search sparks").fill(sparkTitle);
    const sourceSparkCard = page.locator(".barstock-spark-card", {
      has: page.getByText(sparkTitle, { exact: true }),
    }).first();
    await expect(sourceSparkCard).toBeVisible({ timeout: 30_000 });
    await expect(sourceSparkCard).toContainText(sparkTitle);
    const forgedRailCard = page.locator(".hs-rail .hs-workpiece-card", {
      has: page.getByText(sparkTitle, { exact: true }),
    }).first();
    await sourceSparkCard.getByRole("button", { name: "Send to Hearth" }).click();

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/apps/hearth");
    await expect(page.getByText(`Opening ${sparkTitle} from Bar Stock.`, { exact: true })).toBeVisible();

    await expect(forgedRailCard).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".hs-rail .hs-workpiece-card", {
      has: page.getByText(sparkTitle, { exact: true }),
    })).toHaveCount(1);
    const afterCount = await waitForStableWorkpieceCount(page, { minCount: beforeCount + 1, timeout: 60_000 });
    expect(afterCount).toBe(beforeCount + 1);
    await expect(page.locator(".hs-rail .hs-workpiece-card.is-active")).toHaveCount(1);

    await page.reload({ waitUntil: "load" });
    await ensureWorkpieceRailVisible(page);

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          pathname: url.pathname,
          workspaceId: url.searchParams.get("workspace_id"),
        };
      })
      .toEqual({
        pathname: "/apps/hearth",
        workspaceId: artifact.workspace_id,
      });
    await expect(page.locator(".hs-rail .hs-workpiece-card.is-active")).toHaveCount(1);
    await expect(page.locator(".hs-rail .hs-workpieces-list")).toBeVisible();
    await expect(forgedRailCard).toBeVisible();
    await expect(page.locator(".hs-rail .hs-workpiece-card", {
      has: page.getByText(sparkTitle, { exact: true }),
    })).toHaveCount(1);
    expect(await waitForStableWorkpieceCount(page, { minCount: afterCount, timeout: 60_000 })).toBe(afterCount);
  });
});
