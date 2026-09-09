import { expect, test } from "playwright/test";

const expectOperator = process.env.FORGE_EXPECT_PLATFORM_OPERATOR === "1";

test("authenticated Ledger keeps OpenAI wholesale evidence behind the operator boundary", async ({ page }) => {
  await page.goto("/app/ledger");
  await expect(page.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible();

  const ownerConsole = page.getByRole("heading", { name: "Private pricing and financial control" });
  if (!expectOperator) {
    await expect(ownerConsole).toHaveCount(0);
    await expect(page.getByText("Organization source total", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Markup on cost", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Direct-provider ceiling", { exact: true })).toHaveCount(0);
    return;
  }

  await expect(ownerConsole).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenAI model catalog" })).toBeVisible();
  await expect(page.getByText("Project visibility: visible", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Organization source total/)).toBeVisible();
  await expect(page.getByText(/Unresolved source amount/)).toBeVisible();
  await expect(page.getByText(/Estimate replacement delta/)).toBeVisible();
  await expect(page.getByText("$0.04", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Pricing machinery: disabled", { exact: true })).toBeVisible();
  await expect(page.getByText("Customer settlement: disabled", { exact: true })).toBeVisible();
});
