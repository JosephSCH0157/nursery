import { expect, test, type Page } from "playwright/test";
import { openHearth, openWorkpieceInHearth } from "./helpers/hearth-phase4-actions";
import { expectCanonicalWorkpieceContext } from "./helpers/hearth-phase4-assertions";
import { readHearthPhase4Artifact } from "./helpers/hearth-phase4-fixtures";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function ensureImageMapEntry(page: Page): Promise<void> {
  const rows = page.getByRole("navigation", { name: "Planned episode images" }).getByRole("button");
  const addImageButton = page.locator(".hs-episode-images-empty button.is-primary");
  await expect.poll(async () => ({ rows: await rows.count(), add: await addImageButton.count() })).not.toEqual({ rows: 0, add: 0 });
  if (await rows.count()) return;

  await expect(addImageButton).toBeVisible({ timeout: 15_000 });
  await addImageButton.click();
  await expect(rows.first()).toBeVisible();
}

async function openImageMapWorkpiece(page: Page, artifact: ReturnType<typeof readHearthPhase4Artifact>): Promise<{
  workpieceId: string;
  title: string;
}> {
  const candidate = { workpieceId: artifact.workpiece_id, title: artifact.handoff.title };
  await page.getByRole("button", { name: "Episodes (In Progress)" }).click();
  await openWorkpieceInHearth(page, candidate.title);
  await expectCanonicalWorkpieceContext(page, {
    workspaceId: artifact.workspace_id,
    workpieceId: candidate.workpieceId,
    pathnamePrefix: "/apps/hearth",
  });
  const readyPill = page.locator(".hs-episode-ready-pill");
  await expect(readyPill, "Canonical Hearth workpiece must finish loading as Ready").toHaveText("Ready", {
    timeout: 30_000,
  });
  const startRecording = page.getByRole("button", { name: "Start Recording", exact: true });
  await expect(startRecording, "Ready authority must expose Start Recording").toBeVisible({ timeout: 30_000 });
  await expect(startRecording, "Ready authority must permit Start Recording").toBeEnabled({ timeout: 30_000 });
  await page.getByRole("tab", { name: /^Visuals/u }).click();
  const workflow = page.getByRole("region", { name: "Episode visual production workflow" });
  await expect(workflow).toBeVisible({ timeout: 20_000 });
  await workflow.getByRole("button", { name: /^3\. Images/u }).click();
  await expect(page.getByRole("region", { name: "Episode Images" }).last()).toBeVisible();
  return candidate;
}

async function readCanonicalImageMap(page: Page, workpieceId: string): Promise<unknown> {
  return page.evaluate(async (targetWorkpieceId) => {
    function readString(value: unknown): string | null {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function extractAccessToken(value: unknown): string | null {
      if (!value) return null;
      if (Array.isArray(value)) {
        for (const entry of value) {
          const token = extractAccessToken(entry);
          if (token) return token;
        }
        return null;
      }
      if (!isRecord(value)) return null;

      const direct = readString(value.access_token);
      if (direct) return direct;

      const currentSession = value.currentSession;
      if (isRecord(currentSession)) {
        const token = readString(currentSession.access_token);
        if (token) return token;
      }

      const session = value.session;
      if (isRecord(session)) {
        const token = readString(session.access_token);
        if (token) return token;
      }

      const nested = value.data;
      return nested ? extractAccessToken(nested) : null;
    }

    function resolveAccessToken(): string | null {
      const keys = ["forge-auth"];
      try {
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (!key || key === "forge-auth") continue;
          if (/^sb-[a-z0-9-]+-auth-token$/i.test(key)) {
            keys.push(key);
          }
        }
      } catch {
        // ignore storage enumeration failures
      }

      for (const key of keys) {
        try {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const trimmed = readString(raw);
          if (trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            return trimmed;
          }
          const parsed = JSON.parse(raw) as unknown;
          const token = extractAccessToken(parsed);
          if (token) return token;
        } catch {
          // keep scanning keys
        }
      }

      return null;
    }

    const accessToken = resolveAccessToken();
    if (!accessToken) {
      throw new Error("Missing browser access token for canonical image map readback.");
    }
    const apiToken = readString(window.localStorage.getItem("forge_tongs_api_token_v1"));
    if (!apiToken) {
      throw new Error("Missing Tongs API token for canonical image map readback.");
    }

    const response = await fetch(`/tongs/workpieces/${encodeURIComponent(targetWorkpieceId)}/image-map`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "x-forge-user-authorization": `Bearer ${accessToken}`,
      },
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  }, workpieceId);
}

test.describe("Hearth Phase 5 Slice 1 image map", () => {
  test("shell-authenticated user loads canonical Reference Material without signing in again", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();

    await openHearth(page, {
      workspaceId: artifact.workspace_id,
    });
    await openImageMapWorkpiece(page, artifact);

    await expect(page.getByText(/^Logged in as /u)).toBeVisible();
    const workflow = page.getByRole("region", { name: "Episode visual production workflow" });
    await workflow.getByRole("button", { name: /^4\. Reference Material/u }).click();
    const panel = page.locator(".hs-reference-review");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Hearth is working")).toHaveCount(0);

    await page.evaluate(async () => {
      type RuntimeAuth = {
        getSession: () => Promise<{ data: { session: { access_token: string; refresh_token: string } | null } }>;
        refreshSession: () => Promise<unknown>;
        setSession: (session: { access_token: string; refresh_token: string }) => Promise<unknown>;
      };
      const runtime = window as Window & typeof globalThis & {
        __forge_supabase_client__?: { auth?: RuntimeAuth };
        __forge_test_restore_session__?: () => void;
      };
      const auth = runtime.__forge_supabase_client__?.auth;
      if (!auth) throw new Error("Forge shell did not expose its authenticated Supabase client.");
      const current = (await auth.getSession()).data.session;
      if (!current?.access_token || !current.refresh_token) {
        throw new Error("Forge shell did not expose an authenticated session.");
      }
      const getSession = auth.getSession.bind(auth);
      const refreshSession = auth.refreshSession.bind(auth);
      const authStorage = new Map<string, string>();
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || (key !== "forge-auth" && key !== "forge-auth-tongs" && !/^sb-[a-z0-9-]+-auth-token$/iu.test(key))) continue;
        const value = window.localStorage.getItem(key);
        if (value) authStorage.set(key, value);
      }
      auth.getSession = async () => ({ data: { session: null } });
      auth.refreshSession = async () => ({ data: { session: null } });
      for (const key of authStorage.keys()) window.localStorage.removeItem(key);
      runtime.__forge_test_restore_session__ = () => {
        auth.getSession = getSession;
        auth.refreshSession = refreshSession;
        for (const [key, value] of authStorage) window.localStorage.setItem(key, value);
        void auth.setSession({
          access_token: current.access_token,
          refresh_token: current.refresh_token,
        });
      };
      window.dispatchEvent(
        new CustomEvent("forge:canonical-reference-clips-changed"),
      );
    });
    await expect(panel.getByRole("alert")).toHaveText(
      "Sign in to load canonical Reference Clips.",
    );
    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/rest/v1/rpc/read_current_reference_clip_plan"),
      { timeout: 10_000 },
    );
    await page.evaluate(() => {
      const runtime = window as Window & typeof globalThis & {
        __forge_test_restore_session__?: () => void;
      };
      if (!runtime.__forge_test_restore_session__) {
        throw new Error("Missing delayed Forge session restore hook.");
      }
      runtime.__forge_test_restore_session__();
      delete runtime.__forge_test_restore_session__;
    });

    const request = await requestPromise;
    const authorization = request.headers().authorization;
    expect(authorization).toMatch(/^Bearer\s+\S+/u);
    const response = await request.response();
    expect(response?.status()).toBe(200);

    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Sign in to load canonical Reference Clips.", {
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("save -> reload -> canonical readback preserves image-map entries", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();
    const descriptionMarker = `Slice 1 image map ${Date.now().toString(36)}`;

    await openHearth(page, {
      workspaceId: artifact.workspace_id,
    });

    const imageMapWorkpiece = await openImageMapWorkpiece(page, artifact);
    const imageMapWorkpieceId = imageMapWorkpiece.workpieceId;

    const panel = page.getByRole("region", { name: "Episode Images" }).last();
    await expect(panel).toBeVisible();
    await ensureImageMapEntry(page);

    const saveState = panel.locator(".hs-episode-image-direction [role='status']").first();
    const descriptionField = panel.getByLabel("Image direction");
    await expect(descriptionField).toBeVisible();
    await descriptionField.fill(descriptionMarker);
    await expect(saveState).toContainText("Press Enter to save");
    await descriptionField.press("Enter");
    await expect(saveState).toContainText("Saved", { timeout: 30_000 });
    await expect(panel.locator(".hs-error-text-small")).toHaveCount(0);

    await page.reload({ waitUntil: "load" });

    await expectCanonicalWorkpieceContext(page, {
      workspaceId: artifact.workspace_id,
      workpieceId: imageMapWorkpieceId,
      pathnamePrefix: "/apps/hearth",
    });
    await page.getByRole("tab", { name: /^Visuals/u }).click();
    const workflow = page.getByRole("region", { name: "Episode visual production workflow" });
    await expect(workflow).toBeVisible();
    await workflow.getByRole("button", { name: /^3\. Images/u }).click();
    await expect(panel).toBeVisible();

    const matchingRow = page.getByRole("navigation", { name: "Planned episode images" }).getByRole("button", {
      has: page.getByText(descriptionMarker, { exact: false }),
    }).first();
    await expect(matchingRow).toBeVisible({ timeout: 30_000 });
    await matchingRow.click();
    await expect(descriptionField).toHaveValue(descriptionMarker);
    await expect(saveState).toContainText("Saved");

    await expect.poll(async () => {
      const payload = await readCanonicalImageMap(page, imageMapWorkpieceId);
      if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.body)) {
        return false;
      }

      const data = isRecord(payload.body.data) ? payload.body.data : null;
      const imageMap = data && isRecord(data.image_map) ? data.image_map : null;
      const asset = data && isRecord(data.asset) ? data.asset : null;
      const entries = imageMap && Array.isArray(imageMap.entries) ? imageMap.entries : [];
      const hasEntry = entries.some((entry) => (
        isRecord(entry)
        && readString(entry.description) === descriptionMarker
      ));
      const entryCount = asset && isRecord(asset.metadata_json) && typeof asset.metadata_json.entry_count === "number"
        ? asset.metadata_json.entry_count
        : null;

      return Boolean(
        imageMap
        && readString(imageMap.workpiece_id) === imageMapWorkpieceId
        && readString(imageMap.workspace_id) === artifact.workspace_id
        && hasEntry
        && asset
        && readString(asset.path) === "assets/image-map/image-map.v1.json"
        && readString(asset.asset_kind) === "image_map_json"
        && readString(asset.status) === "ready"
        && typeof entryCount === "number"
        && entryCount >= 1,
      );
    }, {
      message: "Expected canonical image-map readback to reflect the saved entry.",
      timeout: 30_000,
      intervals: [500, 1_000, 2_000],
    }).toBe(true);
  });
});
