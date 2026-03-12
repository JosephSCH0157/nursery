import { expect, test } from "playwright/test";
import { openAnvil } from "./helpers/hearth-phase4-actions";
import { expectReadyCandidateTitles } from "./helpers/hearth-phase4-assertions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

async function seedLibrarySourceMode(page: Parameters<typeof test>[0]["page"]): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("forge_anvil_script_source_v1", "library");
    window.localStorage.removeItem("forge_anvil_recording_session_v1");
  });
}

test.describe("Hearth Phase 4 ready list behavior", () => {
  test("Anvil shows canonical ready candidates for the active workspace only", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    await seedLibrarySourceMode(page);
    await openAnvil(page, { workspaceId: artifact.workspace_id });
    await expect(page).toHaveURL(/\/anvil\/teleprompter_pro\.html/);
    await expect(page.locator("#scriptSourceIndicator")).toContainText("Source: Library");
    await expectReadyCandidateTitles(page, artifact.ready.visible_titles);

    for (const hiddenTitle of artifact.ready.hidden_titles) {
      await expect(page.locator("#scriptSelectSidebar option", { hasText: hiddenTitle })).toHaveCount(0);
    }
  });
});
