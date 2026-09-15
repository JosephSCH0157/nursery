import { expect, test, type Page } from "playwright/test";
import { openAnvil } from "./helpers/hearth-phase4-actions";
import { expectCurrentReadyCandidates } from "./helpers/hearth-phase4-assertions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

async function seedLibrarySourceMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("forge_anvil_script_source_v1", "library");
    window.localStorage.removeItem("forge_anvil_recording_session_v1");
  });
}

test.describe("Hearth Phase 4 ready list behavior", () => {
  test("Anvil shows canonical ready candidates for the active workspace only", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    await seedLibrarySourceMode(page);
    const requiredWorkpieceIds = ["[fixture] Ready candidate Alpha", "[fixture] Ready candidate Beta"].map((title) => {
      const item = artifact.ready.visible_items.find((candidate) => candidate.title === title);
      expect(item, `Required seeded candidate ${title}`).toBeDefined();
      return item!.workpiece_id;
    });
    await expectCurrentReadyCandidates(page, {
      workspaceId: artifact.workspace_id,
      requiredWorkpieceIds,
      hiddenWorkpieceIds: artifact.ready.hidden_items.map((item) => item.workpiece_id),
      hiddenTitles: artifact.ready.hidden_titles,
    }, () => openAnvil(page, { workspaceId: artifact.workspace_id }));
    await expect(page).toHaveURL(/\/anvil\/teleprompter_pro\.html/);
    // Initialization and the completed canonical refresh use these two labels
    // for the same Library mode; neither permits a Session-mode result.
    await expect(page.locator("#scriptSourceIndicator")).toHaveText(/^(?:Source: )?Library$/);

    for (const hiddenTitle of artifact.ready.hidden_titles) {
      await expect(page.locator("#scriptSelectSidebar option", { hasText: hiddenTitle })).toHaveCount(0);
    }
  });
});
