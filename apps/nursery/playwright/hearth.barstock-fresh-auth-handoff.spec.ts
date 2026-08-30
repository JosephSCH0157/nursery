import { expect, test } from "playwright/test";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

test("fresh primary auth loads a Bar Stock handoff without a browser API token", async ({ page }) => {
  const workspaceId = process.env.FORGE_TEST_WORKSPACE_ID?.trim().toLowerCase()
    || readHearthPhase4Artifact().workspace_id;
  const sparkId = crypto.randomUUID();
  const sparkTitle = `Fresh auth Bar Stock handoff ${sparkId}`;
  let sparkRequestHeaders: Record<string, string> | null = null;

  await page.addInitScript(() => {
    window.localStorage.removeItem("forge-auth-tongs");
    window.localStorage.removeItem("forge_tongs_api_token_v1");
  });
  await page.route(`**/tongs/workspaces/${workspaceId}/sparks`, async (route) => {
    sparkRequestHeaders = await route.request().allHeaders();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          sparks: [{
            id: sparkId,
            workspace_id: workspaceId,
            assignment_id: null,
            title: sparkTitle,
            body: sparkTitle,
            tags: [],
            status: "raw",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        },
      }),
    });
  });
  await page.route(`**/tongs/workspaces/${workspaceId}/episodes**`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { episodes: [] } }),
  }));
  await page.route(`**/tongs/workspaces/${workspaceId}/ready-scripts**`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { scripts: [] } }),
  }));

  await page.goto(`/apps/hearth?workspace_id=${workspaceId}&spark_id=${sparkId}`, { waitUntil: "load" });

  await expect.poll(() => sparkRequestHeaders).not.toBeNull();
  expect(sparkRequestHeaders?.["x-forge-user-authorization"]).toMatch(/^Bearer\s+\S+$/);
  expect(sparkRequestHeaders?.authorization).toBeUndefined();
  await expect(page.getByText("Failed to load Bar Stock sparks.")).toHaveCount(0);
  await expect(page.getByText(sparkTitle, { exact: false }).first()).toBeVisible();
});
