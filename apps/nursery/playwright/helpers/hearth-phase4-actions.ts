import { expect, type Page } from "playwright/test";
import { buildAnvilUrl, buildBarstockUrl, buildHearthUrl } from "./hearth-phase4-fixtures";

const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_STORAGE_KEYS = [
  "forge_active_workpiece_id_v1",
  "forge_workpiece_id_v1",
  "forge_hearth_script_workpiece_id_v1",
  "tp_workpiece_id",
];
const WORKSPACE_CACHE_KEY = "forge_workspaces_cache_v1";

export async function clearPersistedWorkspaceSelection(page: Page): Promise<void> {
  await page.goto("/app", { waitUntil: "load" });
  await page.evaluate((args) => {
    for (const key of args.workspaceKeys) {
      window.localStorage.removeItem(key);
    }
    for (const key of args.workpieceKeys) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem(args.workspaceCacheKey);
  }, {
    workspaceKeys: [...WORKSPACE_STORAGE_KEYS],
    workpieceKeys: [...WORKPIECE_STORAGE_KEYS],
    workspaceCacheKey: WORKSPACE_CACHE_KEY,
  });
}

export async function openHearth(page: Page, args: {
  workspaceId?: string | null;
  workpieceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
} = {}): Promise<void> {
  await page.goto(buildHearthUrl(args), { waitUntil: "load" });
}

export async function openAnvil(page: Page, args: {
  workspaceId?: string | null;
  workpieceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
} = {}): Promise<void> {
  await page.goto(buildAnvilUrl(args), { waitUntil: "load" });
}

export async function openBarstock(page: Page, args: {
  workspaceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
} = {}): Promise<void> {
  await page.goto(buildBarstockUrl(args), { waitUntil: "load" });
}

export async function openWorkpieceInHearth(page: Page, workpieceTitle: string): Promise<void> {
  await page
    .locator(".hs-workpiece-button", { has: page.getByText(workpieceTitle, { exact: true }) })
    .first()
    .click();
}

export async function clickOpenInAnvil(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open in Anvil" }).first().click();
}

export async function captureCurrentWorkpieceContext(page: Page): Promise<{
  pathname: string;
  workspaceId: string | null;
  workpieceId: string | null;
}> {
  return page.evaluate(() => {
    const url = new URL(window.location.href);
    return {
      pathname: url.pathname,
      workspaceId: url.searchParams.get("workspace_id"),
      workpieceId: url.searchParams.get("workpiece_id"),
    };
  });
}

export async function assertSelfHealReplaceBehavior(page: Page, args: {
  initialUrl: string;
  expectedWorkspaceId: string;
  expectedWorkpieceId?: string | null;
  expectedPathPrefix?: string;
  previousUrl?: string;
}): Promise<void> {
  if (args.previousUrl) {
    await page.goto(args.previousUrl, { waitUntil: "load" });
  }

  await page.goto(args.initialUrl, { waitUntil: "load" });

  await expect.poll(async () => {
    const current = await captureCurrentWorkpieceContext(page);
    return {
      pathname: current.pathname,
      workspaceId: current.workspaceId,
      workpieceId: current.workpieceId,
    };
  }).toEqual({
    pathname: args.expectedPathPrefix
      ? expect.stringMatching(new RegExp(`^${args.expectedPathPrefix}`))
      : expect.any(String),
    workspaceId: args.expectedWorkspaceId,
    workpieceId: args.expectedWorkpieceId ?? null,
  });

  const currentUrl = page.url();
  expect(currentUrl).not.toContain("workspace_id=00000000");
  if (args.previousUrl) {
    await page.goBack({ waitUntil: "load" });
    await expect(page).toHaveURL(new RegExp(args.previousUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  }
}
