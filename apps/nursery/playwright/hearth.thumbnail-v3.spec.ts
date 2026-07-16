import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "playwright/test";
import { createTongsCommitService } from "../../../packages/tongs/src/workpiece-commit-api";

const BLUE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const ORANGE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");
const RECOVERABLE_CONCEPTS = Array.from({ length: 5 }, (_, index) => [
  `### **THUMBNAIL_0${index + 1}**`, `- **Headline:** Recovered concept ${index + 1}`,
  `- **Image concept:** Recovered distinct scene ${index + 1}`, `- **Mood/style:** recovered editorial ${index + 1}`,
].join("\n")).join("\n\n");
const RECOVERABLE_SEO = ["SEO_TITLES:", "SAFE: Durable title one", "SPICY: Durable title two",
  "BALANCED_1: Durable title three", "BALANCED_2: Durable title four", "BALANCED_3: Durable title five", "",
  "SHORT_DESCRIPTION:", "A durable short description.", "", "LONG_DESCRIPTION:", "A durable long description for authenticated recovery."].join("\n");
const RECOVERABLE_TAGS = "TAGS_FULL:\ndurable one, durable two, durable three, durable four, durable five";

type Fixture = {
  admin: SupabaseClient;
  bucket: string;
  orgId: string;
  workspaceId: string;
  workpieceId: string;
  ownerId: string;
  session: Session;
  service: ReturnType<typeof createTongsCommitService>;
};

async function config() {
  const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const values = Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    return match ? [[match[1], match[2]!.trim().replace(/^(['"])(.*)\1$/, "$2")]] : [];
  }));
  return { url: values.TONGS_SUPABASE_URL || values.VITE_SUPABASE_URL,
    anonKey: values.VITE_SUPABASE_ANON_KEY, serviceKey: values.TONGS_SERVICE_ROLE_KEY,
    bucket: values.TONGS_WORKPIECE_BUCKET || "forge-workpieces" };
}

function episodePackage(workpieceId: string) {
  const now = "2026-07-15T12:00:00.000Z";
  const setId = randomUUID();
  const titleId = randomUUID();
  const concepts = Array.from({ length: 5 }, (_, index) => ({
    concept_lineage_id: randomUUID(), concept_revision_id: randomUUID(), revision_number: 1,
    supersedes_revision_id: null, concept_set_id: setId, headline: `Browser concept ${index + 1}`,
    image_concept: `Distinct browser image direction ${index + 1}`,
    mood_style: `Editorial mood ${index + 1}`, normalized_prompt_basis: `Editorial portrait direction ${index + 1}`,
    created_at: now, provenance: { source: "authenticated_browser_fixture" },
  }));
  const recipeId = randomUUID();
  return {
    schema: "forge.episode.package.v3", seo: { titles: [{ id: titleId, label: "A", text: "Browser authority",
      thumbnail_text: "COLD BOOT", is_primary: true, revision: 1 }], tags: [], description_short: null, description_long: null },
    thumbnail: {
      concept_sets: [{ id: setId, name: "Cold Boot Concepts", created_at: now, state: "active",
        approved_script_version: 1, generation_provenance: { source: "fixture" },
        prompt_schema_version: "hearth-thumbnail-concepts-v1", source_response_hash: "a".repeat(64),
        concept_revision_ids: concepts.map((entry) => entry.concept_revision_id) }],
      concept_revisions: concepts, active_concept_set_id: setId,
      render_recipes: [{ id: recipeId, revision: 1, concept_revision_id: concepts[0]!.concept_revision_id,
        title_id: titleId, title_revision: 1, provider_id: "forge", intended_aspect_ratio: "16:9",
        brand_template_id: null, brand_template_revision: null, title_text: "COLD BOOT",
        treatment: { typography: { color: "#ffffff", max_lines: 2 }, placement: { vertical: "bottom", horizontal_padding_percent: 8 },
          safe_zone: { enabled: true }, shadow: { color: "#000000", opacity: 0.7 }, treatment: {} },
        prompt_template_version: "hearth-thumbnail-prompt-v1", composition_engine_version: "forge-thumbnail-compositor-v1",
        prompt_review_state: "reviewed", last_reviewed_template_version: "hearth-thumbnail-prompt-v1",
        created_at: now, updated_at: now }], active_render_recipe_id: recipeId,
      base_versions: [], primary_base_version_id: null, launch_variant_revisions: [], publication_events: [],
    },
    launch_variants: [], spoken_beats: [],
    media_map: { id: randomUUID(), workpiece_id: workpieceId, script_version_id: "1", status: "draft", scope: "images_only",
      coverage_level: "low", beats: [], generated_at: now, updated_at: now },
    image_map: { entries: [] }, broll_plan: { id: randomUUID(), workpiece_id: workpieceId, version: 1, beats: [], generated_at: now },
    cdc_plan: { id: randomUUID(), workpiece_id: workpieceId, version: 1, entries: [], generated_at: now },
  };
}

let fixture: Fixture;

test.beforeAll(async () => {
  const env = await config();
  if (!env.url || !env.anonKey || !env.serviceKey) throw new Error("Live thumbnail browser verification requires linked Supabase credentials.");
  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const orgId = randomUUID(); const workspaceId = randomUUID(); const workpieceId = randomUUID();
  const email = `forge-thumbnail-browser-${randomUUID()}@example.invalid`; const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const ownerId = created.data.user.id;
  const tongs = admin.schema("tongs");
  for (const [table, row] of [
    ["orgs", { id: orgId, name: "Thumbnail browser verification", created_by: ownerId }],
    ["org_members", { org_id: orgId, user_id: ownerId, org_role: "owner", created_by: ownerId }],
    ["workspaces", { id: workspaceId, org_id: orgId, name: "Thumbnail browser verification", created_by: ownerId }],
    ["episodes", { id: workpieceId, workspace_id: workspaceId, label: "Thumbnail browser verification" }],
  ] as const) {
    const result = await tongs.from(table).insert(row);
    if (result.error) throw result.error;
  }
  const auth = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("No authenticated browser session.");
  const service = createTongsCommitService({ supabaseUrl: env.url, supabaseServiceRoleKey: env.serviceKey, bucket: env.bucket });
  await service.commitFile(workpieceId, { path: "metadata.json", content_type: "application/json",
    json: { workspace_id: workspaceId, status: "approved", episode: episodePackage(workpieceId) },
    written_by: { tool: "hearth", tool_version: "3", lane: "canonical" } });
  await service.commitFile(workpieceId, { path: "production/v1/thumbnails.json", content_type: "application/json",
    json: { script_version: 1, generated_at: "2026-07-15T12:00:00.000Z", action: "thumbnails", raw_text: RECOVERABLE_CONCEPTS },
    written_by: { tool: "hearth", tool_version: "3", lane: "canonical" } });
  for (const [path, action, rawText] of [
    ["production/v1/seo.json", "seo", RECOVERABLE_SEO], ["production/v1/tags.json", "tags", RECOVERABLE_TAGS],
  ] as const) await service.commitFile(workpieceId, { path, content_type: "application/json",
    json: { script_version: 1, generated_at: "2026-07-15T12:00:00.000Z", action, raw_text: rawText },
    written_by: { tool: "hearth", tool_version: "3", lane: "canonical" } });
  fixture = { admin, bucket: env.bucket, orgId, workspaceId, workpieceId, ownerId, session: signedIn.data.session, service };
});

test.afterAll(async () => {
  if (!fixture) return;
  const tongs = fixture.admin.schema("tongs");
  const assets = await tongs.from("assets").select("storage_key").eq("workpiece_id", fixture.workpieceId);
  const keys = (assets.data ?? []).map((entry) => entry.storage_key).filter((value): value is string => typeof value === "string");
  keys.push(`workpieces/${fixture.workpieceId}/metadata.json`);
  await fixture.admin.storage.from(fixture.bucket).remove(keys);
  await tongs.from("assets").delete().eq("workpiece_id", fixture.workpieceId);
  await tongs.from("episodes").delete().eq("id", fixture.workpieceId);
  await tongs.from("workspace_members").delete().eq("workspace_id", fixture.workspaceId);
  await tongs.from("workspaces").delete().eq("id", fixture.workspaceId);
  await tongs.from("org_members").delete().eq("org_id", fixture.orgId);
  await tongs.from("orgs").delete().eq("id", fixture.orgId);
  await fixture.admin.auth.admin.deleteUser(fixture.ownerId);
});

test("authenticated cold boot preserves recipe and both renderers converge on v3 base authority", async ({ page }) => {
  await page.addInitScript(({ session, workspaceId }) => {
    localStorage.setItem("forge-auth", JSON.stringify(session)); localStorage.setItem("forge-auth-tongs", JSON.stringify(session));
    localStorage.setItem("forge_workspace_id_v1", workspaceId); localStorage.setItem("barstock_workspace_id", workspaceId);
  }, { session: fixture.session, workspaceId: fixture.workspaceId });
  let forgeRequests = 0;
  await page.route(`**/tongs/workpieces/${fixture.workpieceId}/generate-thumbnail`, async (route) => {
    forgeRequests += 1;
    const requestBody = route.request().postDataJSON() as { operation_id?: string };
    const forgeAsset = await fixture.service.stageThumbnailAsset(fixture.workpieceId, {
      workspace_id: fixture.workspaceId, operation_id: requestBody.operation_id ?? randomUUID(),
      asset_kind: "thumbnail_image", mime_type: "image/png", bytes_base64: BLUE_PNG.toString("base64"),
      provider: "forge-browser-fixture", provider_request_id: "provider-browser-fixture", prompt: null,
      metadata: { source_type: "forge_ai", verification: true },
    }, { userAccessToken: fixture.session.access_token });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true,
      data: { canonical_stage_only: true, asset: forgeAsset } }) });
  });
  await page.goto(`/apps/hearth?workspace_id=${fixture.workspaceId}&workpiece_id=${fixture.workpieceId}`);
  const scriptTab = page.getByRole("tab", { name: "Script" });
  await scriptTab.click();
  await expect(scriptTab).toHaveAttribute("aria-selected", "true");
  const fixFormatting = page.getByRole("button", { name: "Fix formatting (no AI)" });
  if (await fixFormatting.isVisible().catch(() => false)) {
    await fixFormatting.click();
    await expect(fixFormatting).toHaveCount(0, { timeout: 30_000 });
  }
  const approve = page.getByRole("button", { name: /^Approve(?: & Replace)? Script$/ });
  await expect(approve).toBeVisible({ timeout: 30_000 });
  page.once("dialog", (dialog) => dialog.accept());
  await approve.click();
  await page.getByRole("tab", { name: "Visuals" }).click();
  const panel = page.locator("#hearth-thumbnail-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Open" }).click();
  await expect(panel.getByLabel("Concept set").locator("option:checked")).toHaveText("Cold Boot Concepts");
  const overlay = panel.getByLabel("Overlay text");
  await expect(overlay).toHaveValue("COLD BOOT");
  await overlay.fill("COLD BOOT SAVED");
  await panel.getByRole("button", { name: "Save recipe" }).click();
  await expect(panel.getByText("saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Visuals" })).toContainText("5 briefs");
  await page.getByRole("tab", { name: "Visuals" }).click();
  await page.locator("#hearth-thumbnail-panel").getByRole("button", { name: "Open" }).click();
  await expect(page.locator("#hearth-thumbnail-panel").getByLabel("Overlay text")).toHaveValue("COLD BOOT SAVED");
  const currentPanel = page.locator("#hearth-thumbnail-panel");
  await currentPanel.getByRole("button", { name: "Review and approve prompt" }).click();
  await expect(currentPanel.getByRole("button", { name: "Reviewed" })).toBeVisible();
  await expect(currentPanel.getByRole("button", { name: "Generate with Forge AI" })).toBeEnabled();
  const upload = currentPanel.locator('input[type="file"]');
  await upload.setInputFiles({ name: "outside.png", mimeType: "image/png", buffer: ORANGE_PNG });
  await expect(currentPanel.getByText(/outside_tool · 16:9 · ready/)).toBeVisible();
  await currentPanel.getByRole("button", { name: "Generate with Forge AI" }).click();
  await expect(currentPanel.getByText(/forge_ai · 16:9 · ready/)).toBeVisible();
  await currentPanel.getByRole("button", { name: "Commit immutable launch composite" }).click();
  await expect(currentPanel.getByText(/Revision 1 · ready/)).toBeVisible({ timeout: 30_000 });
  expect(forgeRequests).toBe(1);
  const canonical = await fixture.admin.schema("tongs").from("assets")
    .select("status,content_hash,provider").eq("workpiece_id", fixture.workpieceId).eq("asset_kind", "thumbnail_image");
  expect(canonical.error).toBeNull();
  expect(canonical.data?.filter((asset) => asset.status === "ready" && /^[a-f0-9]{64}$/.test(asset.content_hash ?? "")).length).toBeGreaterThanOrEqual(2);
  expect(createHash("sha256").update(ORANGE_PNG).digest("hex")).toBe(canonical.data?.find((asset) => asset.provider === "outside_tool")?.content_hash);
  const composites = await fixture.admin.schema("tongs").from("assets")
    .select("status,content_hash").eq("workpiece_id", fixture.workpieceId).eq("asset_kind", "thumbnail_composite");
  expect(composites.error).toBeNull();
  expect(composites.data?.some((asset) => asset.status === "ready" && /^[a-f0-9]{64}$/.test(asset.content_hash ?? ""))).toBe(true);
  await currentPanel.getByRole("button", { name: "Recover last generation" }).click();
  await expect(currentPanel.getByText("saved", { exact: true })).toBeVisible();
  const recovered = await fixture.service.readWorkpieceJson(fixture.workpieceId, "metadata.json");
  expect((recovered.data as { episode?: { thumbnail?: { concept_sets?: unknown[] } } }).episode?.thumbnail?.concept_sets).toHaveLength(2);
  expect(forgeRequests).toBe(1);
  await page.getByRole("tab", { name: "Framing" }).click();
  await page.getByRole("button", { name: "Recover generated titles and tags" }).click();
  await expect.poll(async () => {
    const metadata = await fixture.service.readWorkpieceJson(fixture.workpieceId, "metadata.json");
    const episode = (metadata.data as { episode?: { seo?: { titles?: unknown[]; tags?: unknown[] } } }).episode;
    return [episode?.seo?.titles?.length ?? 0, episode?.seo?.tags?.length ?? 0];
  }).toEqual([5, 5]);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Framing" })).toContainText("5 titles · 5 tags · Complete");
  await expect(page.getByRole("tab", { name: "Visuals" })).toContainText("10 briefs");
});
