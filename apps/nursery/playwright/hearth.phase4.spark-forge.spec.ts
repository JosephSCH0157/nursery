import crypto from "node:crypto";
import { expect, test } from "playwright/test";
import {
  captureCurrentWorkpieceContext,
  openBarstock,
  openHearth,
} from "./helpers/hearth-phase4-actions";
import { expectCanonicalWorkpieceContext } from "./helpers/hearth-phase4-assertions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

test.describe("Hearth Phase 4 spark forge restore", () => {
  test("Spark -> Forge -> refresh reopens the same workpiece with stable rail count", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();
    const sparkText = `Phase 4 spark ${Date.now()} ${crypto.randomUUID().slice(0, 8)}`;

    await openHearth(page, { workspaceId: artifact.workspace_id });
    await expect(page.locator(".hs-workpieces-list")).toBeVisible();
    await expect(page.getByText("Loading workspace projects...")).toHaveCount(0);

    const beforeCount = await page.locator(".hs-workpiece-card").count();

    await openBarstock(page, { workspaceId: artifact.workspace_id });
    await page.getByLabel("New spark text").fill(sparkText);
    await page.getByRole("button", { name: "Add Spark" }).click();

    const sparkCard = page.locator(".barstock-spark-card", {
      has: page.getByText(sparkText, { exact: true }),
    }).first();
    await expect(sparkCard).toBeVisible();
    await sparkCard.getByRole("button", { name: "Send to Hearth" }).click();

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/apps/hearth");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("workpiece_id"))
      .not.toBeNull();

    const forgedContext = await captureCurrentWorkpieceContext(page);
    if (!forgedContext.workpieceId) {
      throw new Error("Forge flow did not resolve a workpiece_id.");
    }

    const afterCount = await page.locator(".hs-workpiece-card").count();
    expect(afterCount).toBe(beforeCount + 1);
    await expect(page.locator(".hs-workpiece-card.is-active")).toHaveCount(1);

    await page.reload({ waitUntil: "load" });

    await expectCanonicalWorkpieceContext(page, {
      workspaceId: artifact.workspace_id,
      workpieceId: forgedContext.workpieceId,
      pathnamePrefix: "/apps/hearth",
    });
    await expect(page.locator(".hs-workpiece-card.is-active")).toHaveCount(1);
    await expect(page.locator(".hs-workpieces-list")).toBeVisible();
    expect(await page.locator(".hs-workpiece-card").count()).toBe(afterCount);
  });
});
