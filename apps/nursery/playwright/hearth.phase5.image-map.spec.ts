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
  const panel = page.getByLabel("Image map panel");
  const rows = panel.locator(".hs-imap-row");
  if (await rows.count()) return;

  await panel.getByRole("button", { name: "New Entry" }).click();
  await expect(rows.first()).toBeVisible();
}

async function tryActivateImageMapPanel(page: Page): Promise<boolean> {
  const panel = page.getByLabel("Image map panel");
  if (await panel.isVisible().catch(() => false)) {
    return true;
  }

  const fixFormattingButton = page.getByRole("button", { name: "Fix formatting (no AI)" });
  if (await fixFormattingButton.count()) {
    await expect(fixFormattingButton).toBeVisible({ timeout: 15_000 });
    await fixFormattingButton.click();
    await page.waitForTimeout(1_500);
    if (await fixFormattingButton.count()) {
      return false;
    }
    if (await panel.isVisible().catch(() => false)) {
      return true;
    }
  }

  const approveButton = page.getByRole("button", { name: "Approve Script" });
  if (!(await approveButton.isVisible().catch(() => false))) {
    return false;
  }

  await approveButton.click();
  try {
    await expect(page.locator(".hs-production-mode-status")).toContainText("approved", {
      timeout: 20_000,
    });
  } catch {
    return await panel.isVisible().catch(() => false);
  }
  return await panel.isVisible().catch(() => false);
}

function buildImageMapCandidates(artifact: ReturnType<typeof readHearthPhase4Artifact>): Array<{
  workpieceId: string;
  title: string;
}> {
  const raw = [
    { workpieceId: artifact.workpiece_id, title: artifact.handoff.title },
    ...artifact.ready.visible_items.map((entry) => ({
      workpieceId: entry.workpiece_id,
      title: entry.title,
    })),
  ];

  const seenTitles = new Set<string>();
  const out: Array<{ workpieceId: string; title: string }> = [];
  for (const entry of raw) {
    if (seenTitles.has(entry.title)) continue;
    seenTitles.add(entry.title);
    out.push(entry);
  }
  return out;
}

async function openImageMapWorkpiece(page: Page, artifact: ReturnType<typeof readHearthPhase4Artifact>): Promise<{
  workpieceId: string;
  title: string;
}> {
  const candidates = buildImageMapCandidates(artifact).slice(0, 8);

  for (const candidate of candidates) {
    await page.getByRole("button", { name: "Episodes (In Progress)" }).click();
    await openWorkpieceInHearth(page, candidate.title);
    await expectCanonicalWorkpieceContext(page, {
      workspaceId: artifact.workspace_id,
      workpieceId: candidate.workpieceId,
      pathnamePrefix: "/apps/hearth",
    });

    if (await tryActivateImageMapPanel(page)) {
      return candidate;
    }
  }

  throw new Error("No seeded workpiece in the fixture workspace mounted the image-map surface.");
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

    const response = await fetch(`/tongs/workpieces/${encodeURIComponent(targetWorkpieceId)}/image-map`, {
      method: "GET",
      headers: {
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
  test("save -> reload -> canonical readback preserves image-map entries", async ({ page }) => {
    const artifact = readHearthPhase4Artifact();
    const descriptionMarker = `Slice 1 image map ${Date.now().toString(36)}`;

    await openHearth(page, {
      workspaceId: artifact.workspace_id,
    });

    const imageMapWorkpiece = await openImageMapWorkpiece(page, artifact);
    const imageMapWorkpieceId = imageMapWorkpiece.workpieceId;

    const panel = page.getByLabel("Image map panel");
    await expect(panel).toBeVisible();
    await ensureImageMapEntry(page);

    const saveState = panel.locator(".hs-imap-save-state");
    const descriptionField = panel.getByLabel("Description");
    await expect(descriptionField).toBeVisible();
    await descriptionField.fill(descriptionMarker);
    await expect(saveState).toContainText("Editing");
    await expect(saveState).toContainText("Saved", { timeout: 30_000 });
    await expect(panel.locator(".hs-error-text-small")).toHaveCount(0);

    await page.reload({ waitUntil: "load" });

    await expectCanonicalWorkpieceContext(page, {
      workspaceId: artifact.workspace_id,
      workpieceId: imageMapWorkpieceId,
      pathnamePrefix: "/apps/hearth",
    });
    await expect(panel).toBeVisible();

    const matchingRow = panel.locator(".hs-imap-row", {
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
