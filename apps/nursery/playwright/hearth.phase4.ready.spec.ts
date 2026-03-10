import { expect, test } from "playwright/test";
import { openAnvil } from "./helpers/hearth-phase4-actions";
import { expectReadyCandidateTitles } from "./helpers/hearth-phase4-assertions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

async function ensureScriptsPanelVisible(page: Parameters<typeof test>[0]["page"]): Promise<void> {
  const sidebarSelect = page.locator("#scriptSelectSidebar");
  if (await sidebarSelect.isVisible().catch(() => false)) {
    return;
  }
  await page.locator("#sidebarDrawerBtn").click();
  await expect(sidebarSelect).toBeVisible();
}

test.describe("Hearth Phase 4 ready list behavior", () => {
  test("Anvil shows canonical ready candidates for the active workspace only", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    await openAnvil(page, { workspaceId: artifact.workspace_id });
    await ensureScriptsPanelVisible(page);

    await expect(page.locator("#scriptSourceIndicator")).toContainText("Source: Library");
    await expectReadyCandidateTitles(page, artifact.ready.visible_titles);

    for (const hiddenTitle of artifact.ready.hidden_titles) {
      await expect(page.locator("#scriptSelectSidebar option", { hasText: hiddenTitle })).toHaveCount(0);
    }
  });
});
