import { test } from "playwright/test";
import { assertSelfHealReplaceBehavior } from "./helpers/hearth-phase4-actions";
import {
  buildAnvilUrl,
  buildHearthUrl,
  readHearthPhase4Artifact,
} from "./helpers/hearth-phase4-fixtures";

test.describe("Hearth Phase 4 workspace self-heal", () => {
  test("Hearth self-heals invalid workspace query via replace semantics", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    await assertSelfHealReplaceBehavior(page, {
      previousUrl: "/app",
      initialUrl: buildHearthUrl({
        workspaceId: artifact.invalid_workspace_id,
        workpieceId: artifact.workpiece_id,
      }),
      expectedWorkspaceId: artifact.selected_workspace_id,
      expectedWorkpieceId: artifact.workpiece_id,
      expectedPathPrefix: "/apps/hearth",
    });
  });

  test("Anvil self-heals invalid workspace query via replace semantics", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    await assertSelfHealReplaceBehavior(page, {
      previousUrl: "/app",
      initialUrl: buildAnvilUrl({
        workspaceId: artifact.invalid_workspace_id,
        workpieceId: artifact.workpiece_id,
      }),
      expectedWorkspaceId: artifact.selected_workspace_id,
      expectedWorkpieceId: artifact.workpiece_id,
      expectedPathPrefix: "/anvil/teleprompter_pro.html",
    });
  });
});
