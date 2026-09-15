import { expect, test } from "playwright/test";
import { clickOpenInAnvil, openWorkpieceInHearth } from "./helpers/hearth-phase4-actions";
import {
  expectCanonicalWorkpieceContext,
  expectNoPasteFallback,
} from "./helpers/hearth-phase4-assertions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

test.describe("Hearth Phase 4 Anvil handoff", () => {
  test("Open in Anvil loads the expected canonical script without paste fallback", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    const hearthParams = new URLSearchParams({
      workspace_id: artifact.workspace_id,
      workpiece_id: artifact.workpiece_id,
    });
    await page.goto(`/apps/hearth?${hearthParams.toString()}`, { waitUntil: "load" });

    await expectCanonicalWorkpieceContext(page, {
      workspaceId: artifact.workspace_id,
      workpieceId: artifact.workpiece_id,
      pathnamePrefix: "/apps/hearth",
    });
    await expect(page.locator(".hs-workpiece-button", { has: page.getByText(artifact.handoff.title, { exact: true }) }).first()).toBeVisible({ timeout: 30_000 });
    await openWorkpieceInHearth(page, artifact.handoff.title);
    const readyPill = page.locator(".hs-episode-ready-pill");
    if ((await readyPill.textContent())?.trim() !== "Ready") {
      const review = page.getByRole("button", { name: "Review for recording", exact: true });
      await expect(review).toBeEnabled({ timeout: 30_000 });
      await review.click();
      const producerReview = page.getByRole("region", { name: "Producer review", exact: true });
      await expect(producerReview).toBeVisible();
      // Review only the known synthetic-fixture findings, never arbitrary blockers.
      // "verify" describes this test fixture; it is not an unfinished script instruction.
      const fixtureFindings = [
        { message: "Remove or resolve the unfinished placeholder before approval.", excerpt: "The material is synthetic and exists only to verify bounded creator workflows.", action: "Mark resolved", handled: "resolve" },
        { message: "A superlative or absolute claim needs evidence matching that strength.", excerpt: "The material is synthetic and exists only to verify bounded creator workflows.", action: "Acknowledge", handled: "acknowledge" },
        { message: "The wording is stronger than the available evidence warrants.", excerpt: "This authenticated non-production fixture proves canonical script access.", action: "Acknowledge", handled: "acknowledge" },
      ];
      await expect(producerReview.getByRole("listitem")).toHaveCount(fixtureFindings.length);
      for (const finding of fixtureFindings) {
        const item = producerReview.getByRole("listitem").filter({ hasText: finding.message }).filter({ hasText: finding.excerpt });
        await expect(item).toHaveCount(1);
        await item.getByRole("button", { name: finding.action, exact: true }).click();
        await expect(item).toContainText(`Handled: ${finding.handled}`);
      }
      await producerReview.getByRole("button", { name: "Complete producer review", exact: true }).click();
      const approve = page.getByRole("button", { name: "Approve Script", exact: true });
      await expect(approve).toBeEnabled();
      await approve.click();
      const markReady = page.getByRole("button", { name: "Mark Ready", exact: true });
      await expect(markReady).toBeEnabled();
      await markReady.click();
      await expect(readyPill).toHaveText("Ready");
    }
    await clickOpenInAnvil(page);

    await expectCanonicalWorkpieceContext(page, {
      workspaceId: artifact.workspace_id,
      workpieceId: artifact.workpiece_id,
      pathnamePrefix: "/anvil/teleprompter_pro.html",
    });

    await expect
      .poll(() => new URL(page.url()).searchParams.get("script_path"))
      .toBe(artifact.handoff.script_path);
    await expect(page.locator("#script")).toContainText(artifact.handoff.script_snippet);
    await expectNoPasteFallback(page);
  });
});
