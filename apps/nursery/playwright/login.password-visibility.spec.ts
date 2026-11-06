import { expect, test } from "playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const demoUrl = "https://www.youtube-nocookie.com/embed/lH1E6ojjSsg?rel=0&modestbranding=1";
test.beforeEach(async ({ page }) => {
  // This suite tests login controls, never remote video playback. Keep the
  // exact navigation local; every unexpected destination still hits the proxy.
  await page.route(demoUrl, async (route) => {
    expect(route.request().isNavigationRequest()).toBe(true);
    expect(route.request().frame().parentFrame()).not.toBeNull();
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><meta charset="utf-8"><p data-testid="offline-demo">Offline login demo fixture</p>',
    });
  });
});

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

  await page.locator('iframe[title="Anvil intro and demo"]').scrollIntoViewIfNeeded();
  await expect(page.frameLocator('iframe[title="Anvil intro and demo"]').getByTestId("offline-demo")).toBeVisible();
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`Google sign-in and password fallback are visible on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login?next=%2Fapp%2Fhearth%3Fview%3Drecent");

    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot password" })).toBeVisible();
  });
}

test("Bellows dependency imports through the browser's Vite module path", async ({ page }) => {
  await page.goto("/login");
  const repositoryType = await page.evaluate(async (modulePath) => {
    const repository = await import(modulePath);
    return typeof repository.createBellowsTongsRepository;
  }, "/src/lib/bellows/bellowsTongsRepository.ts");
  expect(repositoryType).toBe("function");
});
