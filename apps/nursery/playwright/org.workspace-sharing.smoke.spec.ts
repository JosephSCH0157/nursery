import { expect, test } from "playwright/test";

test.describe("Org/workspace sharing smoke", () => {
  test("org context and workspace source grouping render", async ({ page }) => {
    await page.goto("/app/settings/org", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
    await expect(page.getByLabel("Organization context")).toBeVisible();
    await expect(page.getByText("Current org", { exact: true })).toBeVisible();
    await expect(page.getByText("Your role", { exact: true })).toBeVisible();

    const orgContextChip = page.locator(".settings-org__context-chip").first();
    await expect(orgContextChip).toBeVisible();
    await expect(orgContextChip).toContainText(/Organization/);

    const workspaceAccessPanel = page.getByRole("heading", { name: "Workspace Access" }).first();
    await expect(workspaceAccessPanel).toBeVisible();

    const assignmentScopeCopy = page.getByText(
      "Assignments in this panel apply to organization-owned workspaces only.",
    );
    await expect(assignmentScopeCopy).toBeVisible();

    const grantButton = page.getByRole("button", { name: "Grant Access" });
    await expect(grantButton).toBeVisible();

    await page.goto("/app", { waitUntil: "domcontentloaded" });

    const workspaceSelect = page.getByLabel("Workspace");
    await expect(workspaceSelect).toBeVisible();

    const personalGroup = workspaceSelect.locator("optgroup[label='Personal']");
    await expect(personalGroup).toHaveCount(1);

    const sharedGroup = workspaceSelect.locator("optgroup[label='Shared with You']");
    const sharedCount = await sharedGroup.count();

    test.info().annotations.push({
      type: "shared-group",
      description: sharedCount > 0
        ? "Shared with You group rendered for this account."
        : "No shared workspaces currently visible for this account.",
    });
  });
});
