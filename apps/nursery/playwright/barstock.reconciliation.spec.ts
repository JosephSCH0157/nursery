import { expect, test } from "playwright/test";
import { openBarstock } from "./helpers/hearth-phase4-actions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

function retryKey(workspaceId: string): string {
  return `barstock_retry_v3:${workspaceId.toLowerCase()}`;
}

function testWorkspaceId(): string {
  return process.env.FORGE_TEST_WORKSPACE_ID?.trim().toLowerCase()
    || readHearthPhase4Artifact().workspace_id;
}

test.describe("Barstock reconciliation", () => {
  test("an unresolved operation is attempted once during stable online rendering", async ({ page }) => {
    const workspaceId = testWorkspaceId();
    const assignmentId = crypto.randomUUID();
    const updatedAt = Date.now();
    const operationId = [
      workspaceId,
      "assignment",
      "create",
      assignmentId,
      "create",
      updatedAt,
    ].join(":");
    let mutationCalls = 0;

    await page.route("**/rest/v1/rpc/barstock_apply_assignment", async (route) => {
      mutationCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ outcome: "denied", row: null }),
      });
    });
    await page.addInitScript(({ key, operation }) => {
      window.localStorage.setItem(key, JSON.stringify([operation]));
    }, {
      key: retryKey(workspaceId),
      operation: {
        operationId,
        workspaceId,
        kind: "assignment",
        action: "create",
        entityId: assignmentId,
        expectedRevision: null,
        idempotencyKey: `barstock:${workspaceId}:assignment:${assignmentId}:create`,
        intent: {
          id: assignmentId,
          name: "Denied reconciliation fixture",
          revision: 0,
          createdAt: updatedAt,
          updatedAt,
        },
        attempts: 0,
      },
    });

    await openBarstock(page, { workspaceId });
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Status: DENIED");
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Retry cache: 1");
    await page.waitForTimeout(1_500);
    expect(mutationCalls).toBe(1);

    await page.evaluate((key) => window.localStorage.removeItem(key), retryKey(workspaceId));
  });

  test("offline creation reconciles once and survives canonical refresh", async ({ context, page }) => {
    const workspaceId = testWorkspaceId();
    const sparkBody = `Barstock offline reconciliation ${Date.now()} ${crypto.randomUUID()}`;
    let mutationCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/rest/v1/rpc/barstock_apply_spark")) mutationCalls++;
    });

    await openBarstock(page, { workspaceId });
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Status: SAVED");
    await context.setOffline(true);
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Status: OFFLINE");

    await page.getByLabel("New spark text").fill(sparkBody);
    await page.getByRole("button", { name: "Add Spark" }).click();
    await expect(page.getByText(sparkBody, { exact: true })).toBeVisible();
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Retry cache: 1");
    expect(mutationCalls).toBe(0);

    await context.setOffline(false);
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Status: SAVED", { timeout: 30_000 });
    await expect(page.locator(".barstock-sidebar__sync-status")).toContainText("Retry cache: 0");
    expect(mutationCalls).toBe(1);

    await page.reload({ waitUntil: "load" });
    await page.getByLabel("Search sparks").fill(sparkBody);
    const card = page.locator(".barstock-spark-card", { has: page.getByText(sparkBody, { exact: true }) }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "More" }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    const deleteButton = card.getByRole("button", { name: "Delete" });
    await deleteButton.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveCount(0, { timeout: 30_000 });

    await page.reload({ waitUntil: "load" });
    await page.getByLabel("Search sparks").fill(sparkBody);
    await expect(page.getByText(sparkBody, { exact: true })).toHaveCount(0);
  });
});
