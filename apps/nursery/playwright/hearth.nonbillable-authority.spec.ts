import { expect, test } from "playwright/test";

test("deterministic Hearth authority remains usable with paid AI unavailable", async ({ page }) => {
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /(^|\.)openai\.com$|(^|\.)runwayml\.com$/i.test(url.hostname)
      || /\/api\/hearth\/chat|\/ai\/provider/i.test(url.pathname)
    ) providerRequests.push(request.url());
  });

  await page.goto("/playwright/fixtures/hearth-authority-offline.html");
  await expect(page.getByRole("status")).toContainText("Paid AI unavailable");
  await expect(page.getByRole("button", { name: "Approve Script" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark Ready" })).toBeDisabled();

  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Handled: acknowledge")).toBeVisible();
  await page.getByRole("button", { name: "Complete producer review" }).click();
  await expect(page.getByRole("button", { name: "Approve Script" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Mark Ready" })).toBeDisabled();

  await page.getByRole("button", { name: "Approve Script" }).click();
  await expect(page.getByText("Approved, not Ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Ready" })).toBeEnabled();
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await expect(page.getByRole("status")).toHaveText("Ready published by an explicit creator action.");
  expect(providerRequests).toEqual([]);
});
