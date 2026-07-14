import assert from "node:assert/strict";
import test from "node:test";
import {
  formatThumbnailPanelMeta,
  resolveThumbnailPreviewStatus,
  resolveThumbnailVersionSourceLabel,
  resolveThumbnailWorkspaceGuidance,
} from "../src/lib/hearth-thumbnail-workflow";
import { loadWorkspaceThumbnailBrandLogoPreview } from "../src/lib/hearth-thumbnail-brand-templates";

test("hearthThumbnailWorkflow: panel meta emphasizes briefs and image versions", () => {
  assert.equal(formatThumbnailPanelMeta(1, 2), "1 brief · 2 image versions");
  assert.equal(formatThumbnailPanelMeta(3, 1), "3 briefs · 1 image version");
});

test("hearthThumbnailWorkflow: source labels make upload flow read as outside-tool handoff", () => {
  assert.equal(resolveThumbnailVersionSourceLabel("upload"), "Outside tool");
  assert.equal(resolveThumbnailVersionSourceLabel("openai"), "Forge AI");
  assert.equal(resolveThumbnailVersionSourceLabel("midjourney"), "Midjourney");
});

test("hearthThumbnailWorkflow: preview status explains next step when no version is selected", () => {
  assert.match(
    resolveThumbnailPreviewStatus({ selectedVersionId: null, selectedVersionProvider: null }),
    /bring it back here/i,
  );
});

test("hearthThumbnailWorkflow: preview status keeps selected source visible", () => {
  const message = resolveThumbnailPreviewStatus({
    selectedVersionId: "thumb-version-12345678",
    selectedVersionProvider: "upload",
  });
  assert.match(message, /this is version/i);
  assert.match(message, /outside tool/i);
});

test("hearthThumbnailWorkflow: guidance makes the next step explicit", () => {
  const noFramingYet = resolveThumbnailWorkspaceGuidance({ conceptCount: 0, versionCount: 0, titleCount: 0 });
  assert.match(noFramingYet.stateCue, /framing comes first/i);
  assert.equal(noFramingYet.primaryAction, "generate_titles");
  assert.equal(noFramingYet.primaryActionLabel, "Generate Titles");
  assert.match(noFramingYet.cardLead, /start with a title/i);

  const noBriefYet = resolveThumbnailWorkspaceGuidance({ conceptCount: 0, versionCount: 0, titleCount: 2 });
  assert.match(noBriefYet.stateCue, /outside forge/i);
  assert.equal(noBriefYet.primaryAction, "draft_brief");
  assert.equal(noBriefYet.primaryActionLabel, "Draft Concept Brief");
  assert.match(noBriefYet.cardLead, /start with the concept brief/i);

  const readyForUpload = resolveThumbnailWorkspaceGuidance({ conceptCount: 2, versionCount: 0, titleCount: 2 });
  assert.equal(readyForUpload.primaryAction, "generate_prompt");
  assert.equal(readyForUpload.primaryActionLabel, "Generate Prompt Pack");
  assert.match(readyForUpload.cardLead, /generate the prompt pack/i);
  assert.match(readyForUpload.note, /planning space/i);

  const withImage = resolveThumbnailWorkspaceGuidance({ conceptCount: 2, versionCount: 1, titleCount: 2 });
  assert.equal(withImage.primaryAction, "upload_image");
  assert.match(withImage.cardLead, /image is back in/i);
});

test("brand-logo preview coalesces duplicate in-flight reads", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  let fetchCount = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async () => {
    fetchCount += 1;
    await gate;
    return new Response(JSON.stringify({ error: "missing" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
  (globalThis as { window?: unknown }).window = {
    __forgeTongsApiToken: "test-token",
    location: { search: "" },
    localStorage: { getItem: () => null },
  };
  try {
    const args = {
      workpieceId: "38a538ff-b49c-4955-ba28-ec1e9191b8b8",
      assetPath: "assets/thumbnail-brand-logos/template/missing.png",
    };
    const first = loadWorkspaceThumbnailBrandLogoPreview(args);
    const second = loadWorkspaceThumbnailBrandLogoPreview(args);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCount, 1);
    release?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.ok, false);
    assert.equal(secondResult.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});
