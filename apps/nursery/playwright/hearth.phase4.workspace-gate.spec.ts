import { test } from "playwright/test";
import {
  expectNoAnvilShellMounted,
  expectNoHearthShellMounted,
  expectWorkspaceRequiredNotice,
} from "./helpers/hearth-phase4-assertions";
import { clearPersistedWorkspaceSelection } from "./helpers/hearth-phase4-actions";
import { buildAnvilUrl, buildHearthUrl } from "./helpers/hearth-phase4-fixtures";

test.describe("Hearth Phase 4 workspace gate", () => {
  test("Hearth shows workspace-required notice without a workspace context", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await clearPersistedWorkspaceSelection(page);
    await page.goto(buildHearthUrl(), { waitUntil: "load" });

    await expectWorkspaceRequiredNotice(page, "Hearth");
    await expectNoHearthShellMounted(page);

    await context.close();
  });

  test("Anvil shows workspace-required notice without a workspace context", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await clearPersistedWorkspaceSelection(page);
    await page.goto(buildAnvilUrl(), { waitUntil: "load" });

    await expectWorkspaceRequiredNotice(page, "Anvil");
    await expectNoAnvilShellMounted(page);

    await context.close();
  });
});
