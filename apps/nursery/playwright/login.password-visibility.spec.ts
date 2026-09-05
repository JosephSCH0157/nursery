import { expect, test } from "playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login password can be revealed for verification and hidden again", async ({ page }) => {
  await page.goto("/login");

  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", { name: "Show password" });

  await password.fill("temporary-secret");
  await expect(password).toHaveAttribute("type", "password");
  await expect(showPassword).toHaveAttribute("aria-pressed", "false");

  await showPassword.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(password).toHaveValue("temporary-secret");

  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("temporary-secret");
});
