import { expect, type Page, type Request, type Response } from "playwright/test";

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

type ReadyCandidate = { value: string; title: string };
type ReadyListAuthority = {
  workspaceId: string;
  requiredWorkpieceIds: string[];
  hiddenWorkpieceIds: string[];
  hiddenTitles: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeReadyTitle = (title: string): string => title.replace(/\s+—\s+Ready by.+$/u, "").trim();

// Independent test oracle: do not use Anvil's parser, which could hide invalid
// rows, or deduplicate the rendered options before comparing canonical identity.
export function assertCanonicalReadyCandidates(
  payload: unknown,
  rendered: ReadyCandidate[],
  authority: ReadyListAuthority,
): void {
  expect(authority.workspaceId).toMatch(UUID);
  expect(payload).toMatchObject({ ok: true });
  const data = (payload as { data: unknown }).data;
  const rows = Array.isArray(data) ? data : (data as { scripts?: unknown } | null)?.scripts;
  expect(Array.isArray(rows), "Canonical Ready response must contain scripts").toBe(true);
  const workpieceIds = new Set<string>();
  const expected: ReadyCandidate[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    expect(row.workspace_id, "Ready row must belong to the active workspace").toBe(authority.workspaceId);
    expect(row.workpiece_id).toEqual(expect.stringMatching(UUID));
    const id = row.workpiece_id as string;
    expect(workpieceIds.has(id), `Duplicate canonical workpiece ${id}`).toBe(false);
    workpieceIds.add(id);
    expect(row.hidden_at == null, `Hidden canonical workpiece ${id}`).toBe(true);
    expect(authority.hiddenWorkpieceIds, "Hidden fixture must remain excluded").not.toContain(id);
    expect(row.title).toEqual(expect.any(String));
    const title = normalizeReadyTitle(row.title as string);
    expect(authority.hiddenTitles.map(normalizeReadyTitle)).not.toContain(title);
    const path = row.primary_script_path ?? row.path;
    expect(path).toEqual(expect.any(String));
    expect(typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("..")).toBe(true);
    expected.push({ value: `ready:${id}:${path}`, title });
  }
  for (const id of authority.requiredWorkpieceIds) {
    expect(workpieceIds.has(id), `Required seeded Ready workpiece ${id} is missing`).toBe(true);
  }
  const actual = rendered.map((item) => ({ value: item.value, title: normalizeReadyTitle(item.title) }));
  expect(new Set(actual.map((item) => item.value)).size, "Duplicate rendered Ready candidate").toBe(actual.length);
  const byIdentity = (a: ReadyCandidate, b: ReadyCandidate): number => a.value.localeCompare(b.value);
  expect(actual.sort(byIdentity), "Rendered Ready identities must exactly match current canonical authority")
    .toEqual(expected.sort(byIdentity));
}

export async function expectCurrentReadyCandidates(
  page: Page,
  authority: ReadyListAuthority,
  open: () => Promise<void>,
): Promise<void> {
  let latestRequest: Request | undefined;
  let latest: { payload?: unknown; error?: string } | undefined;
  const isReadyRequest = (request: Request): boolean => {
    const url = new URL(request.url());
    return request.method() === "GET"
      && url.pathname === `/tongs/workspaces/${authority.workspaceId}/ready-scripts`
      && url.search === "?unrecorded=1";
  };
  const onRequest = (request: Request): void => {
    if (!isReadyRequest(request)) return;
    latestRequest = request;
    latest = undefined;
  };
  const onResponse = async (response: Response): Promise<void> => {
    const request = response.request();
    if (request !== latestRequest) return;
    let result: NonNullable<typeof latest>;
    try {
      // Check presence only: never include the authenticated header in evidence.
      const authenticated = Boolean(await request.headerValue("x-forge-user-authorization"));
      if (!authenticated || new URL(response.url()).origin !== new URL(page.url()).origin || response.status() !== 200) {
        result = { error: "Ready response must be authenticated, same-origin and HTTP 200" };
      } else {
        result = { payload: await response.json() };
      }
    } catch {
      result = { error: "Unable to consume the current canonical Ready response" };
    }
    if (request === latestRequest) latest = result;
  };
  const onFailure = (request: Request): void => {
    if (request === latestRequest) latest = { error: "Current canonical Ready request failed" };
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onFailure);
  try {
    await open();
    await expect(async () => {
      const snapshot = latest;
      expect(snapshot, "Waiting for Anvil's current authenticated Ready response").toBeDefined();
      expect(snapshot?.error).toBeUndefined();
      const rendered = await page.locator("#scriptSelectSidebar option[value^='ready:']").evaluateAll((options) =>
        options.map((option) => ({ value: (option as HTMLOptionElement).value, title: option.textContent ?? "" })),
      );
      expect(latest, "Canonical Ready response changed during assertion").toBe(snapshot);
      assertCanonicalReadyCandidates(snapshot?.payload, rendered, authority);
    }).toPass({ timeout: 15_000, intervals: [100, 250, 500] });
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("requestfailed", onFailure);
  }
}
