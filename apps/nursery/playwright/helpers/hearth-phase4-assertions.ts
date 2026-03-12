import { expect, type Page } from "playwright/test";

export async function expectWorkspaceRequiredNotice(page: Page, toolName: string): Promise<void> {
  await expect(
    page.getByRole("heading", { name: `${toolName} requires a workspace.` }),
  ).toBeVisible();
  await expect(
    page.getByText("Workspace ID is missing. Go to Home and select a workspace before continuing."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Home and Select Workspace" }),
  ).toBeVisible();
}

export async function expectNoHearthShellMounted(page: Page): Promise<void> {
  await expect(page.locator(".hearth-standalone")).toHaveCount(0);
  await expect(page.locator(".hs-rail")).toHaveCount(0);
  await expect(page.locator(".hs-home-title")).toHaveCount(0);
}

export async function expectNoAnvilShellMounted(page: Page): Promise<void> {
  await expect(page.locator("#sidebarDrawerBtn")).toHaveCount(0);
  await expect(page.locator("#scriptSelectSidebar")).toHaveCount(0);
  await expect(page.locator("#script")).toHaveCount(0);
}

export async function expectCanonicalWorkpieceContext(
  page: Page,
  args: {
    workspaceId: string;
    workpieceId: string;
    pathnamePrefix?: string;
  },
): Promise<void> {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        workspaceId: url.searchParams.get("workspace_id"),
        workpieceId: url.searchParams.get("workpiece_id"),
      };
    })
    .toEqual({
      pathname: args.pathnamePrefix ? expect.stringMatching(new RegExp(`^${args.pathnamePrefix}`)) : expect.any(String),
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
    });
}

export async function expectNoPasteFallback(page: Page): Promise<void> {
  const hasHandoffError = await page.evaluate(() => Boolean((window as Window & {
    __tpWorkpieceScriptLoadError?: unknown;
  }).__tpWorkpieceScriptLoadError));
  expect(hasHandoffError).toBe(false);

  const visiblePasteHints = await page.locator(".tp-paste-hint:visible, .empty-msg:visible").count();
  expect(visiblePasteHints).toBe(0);
}

export async function expectReadyCandidateTitles(page: Page, titles: string[]): Promise<void> {
  const normalizeReadyTitle = (value: string): string => value.replace(/\s+—\s+Ready by.+$/u, "").trim();
  await expect
    .poll(async () => page.locator("#scriptSelectSidebar option[value^='ready:']").evaluateAll((options) =>
      options
        .map((option) => (option.textContent?.trim() ?? "").replace(/\s+—\s+Ready by.+$/u, "").trim())
        .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index),
    ))
    .toEqual(titles.map(normalizeReadyTitle));
}
