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
    await expect(page.locator(".hs-home-title")).toContainText(artifact.handoff.title);

    await openWorkpieceInHearth(page, artifact.handoff.title);
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
