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
      // Creator-readiness v4 atomically commits the exact current approval and
      // its Ready receipt. Optional editorial review is not a recording gate.
      const approve = page.getByRole("button", { name: "Approve Script", exact: true });
      await expect(approve).toBeEnabled({ timeout: 30_000 });
      await approve.click();
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
