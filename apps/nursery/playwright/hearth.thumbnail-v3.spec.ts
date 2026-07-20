import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "playwright/test";
import { createTongsCommitService } from "../../../packages/tongs/src/workpiece-commit-api";
import { canonicalSerialize } from "../../hearth/src/lib/episode-package-v3";

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
  user: SupabaseClient;
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
  fixture = { admin, user: auth, bucket: env.bucket, orgId, workspaceId, workpieceId, ownerId, session: signedIn.data.session, service };
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

test("workspace brand default does not bind the workpiece before its first thumbnail render", async () => {
  const rpc=(name:string,args:Record<string,unknown>)=>fixture.user.schema("tongs").rpc(name as never,args as never) as unknown as Promise<{data:unknown;error:{message:string}|null}>;
  const rules={public_identity:{program_name:"Browser Brand",tagline:"Canonical"},palette:{primary:"#111827",secondary:"#f8fafc",accent:"#f97316"},typography:{heading_family:"bold_sans",body_family:"sans-serif",heading_weight:700,body_weight:400},logo:{placement:"bottom_right",watermark_opacity:0.7},audio:{music_volume:0.2,ducking:0.35},asset_revision_ids:{}};
  const created=await rpc("create_brand_profile",{p_workspace_id:fixture.workspaceId,p_internal_label:"Browser Brand",p_rules:rules,p_operation_id:randomUUID()});expect(created.error).toBeNull();const brand=created.data as {profile_id:string;profile_revision_id:string;bindable:boolean};expect(brand.bindable).toBe(true);
  const selected=await rpc("set_workspace_default_brand_profile",{p_workspace_id:fixture.workspaceId,p_profile_id:brand.profile_id});expect(selected.error).toBeNull();
  const rows=await fixture.admin.schema("tongs").from("workpiece_brand_bindings").select("id").eq("workpiece_id",fixture.workpieceId);expect(rows.error).toBeNull();expect(rows.data).toHaveLength(0);
});

test("authenticated cold boot preserves recipe and both renderers converge on v3 base authority", async ({ page }) => {
  test.setTimeout(420_000);
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
  await expect(panel.getByText("unresolved", { exact: true })).toBeVisible();
  await expect(panel.getByText(/resolved by Tongs when the first thumbnail render begins/i)).toBeVisible();
  await expect(panel.locator('input[placeholder="Optional template ID"]')).toHaveCount(0);
  await expect(panel.locator('label').filter({ hasText: /^Brand template revision$/ }).locator('input[type="number"]')).toHaveCount(0);
  const beforeRenderBindings=await fixture.admin.schema("tongs").from("workpiece_brand_bindings").select("id").eq("workpiece_id",fixture.workpieceId);expect(beforeRenderBindings.data).toHaveLength(0);
  await expect(panel.locator("span").filter({ hasText: "Concept set: Cold Boot Concepts" })).toBeVisible();
  await expect(panel.getByLabel("Concept set")).toHaveCount(0);
  await expect(panel.getByText("Exact title text:")).toBeVisible();
  await expect(panel.getByText("COLD BOOT", { exact: true }).first()).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Editorial Memory" })).toBeVisible();
  await expect(panel.getByText("0 launch facts", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Save concept/title pairing" }).click();
  await expect(panel.locator(".hs-thumb-pair-state.is-saved")).toHaveText("saved");
  await expect(panel.getByRole("heading", { name: "Controlled Creative Expansion" })).toBeVisible();
  await panel.getByRole("button", { name: "Generate controlled recipe variations" }).click();
  await expect(panel.getByText("strict brand · 3 alternatives · 0 AI credits", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Promote as new canonical recipe" }).click();
  await expect(panel.getByRole("button", { name: "Promoted" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Visuals" })).toContainText("5 briefs");
  await page.getByRole("tab", { name: "Visuals" }).click();
  await page.locator("#hearth-thumbnail-panel").getByRole("button", { name: "Open" }).click();
  await expect(page.locator("#hearth-thumbnail-panel").getByText("COLD BOOT", { exact: true }).first()).toBeVisible();
  const currentPanel = page.locator("#hearth-thumbnail-panel");
  await expect(currentPanel.getByRole("button", { name: "Promoted" })).toBeDisabled();
  await currentPanel.getByRole("button", { name: "Review and approve prompt" }).click();
  await expect(currentPanel.getByRole("button", { name: "Reviewed" })).toBeVisible();
  await expect(currentPanel.getByRole("button", { name: "Generate with Forge AI" })).toBeEnabled();
  const upload = currentPanel.locator('input[type="file"]');
  await upload.setInputFiles({ name: "outside.png", mimeType: "image/png", buffer: ORANGE_PNG });
  await expect(currentPanel.getByText(/outside_tool · 16:9 · ready/)).toBeVisible({ timeout: 30_000 });
  await currentPanel.getByRole("button", { name: "Generate with Forge AI" }).click();
  await expect(currentPanel.getByText(/forge_ai · 16:9 · ready/)).toBeVisible();
  await currentPanel.getByRole("button", { name: "Commit immutable launch composite" }).click();
  await expect(currentPanel.getByText(/Revision 1 · ready/)).toBeVisible({ timeout: 30_000 });
  await expect(currentPanel.getByText("1 launch facts", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(currentPanel.getByRole("heading", { name: "Readability correction" })).toBeVisible();
  await expect(currentPanel.getByText(/against the 4\.5:1 threshold/)).toBeVisible();
  await expect(currentPanel.getByText(/forge-thumbnail-contrast-evaluator-v1/)).toBeVisible();
  await currentPanel.getByLabel("Readability treatment").selectOption("backing");
  await currentPanel.getByRole("button", { name: "Save concept/title pairing" }).click();
  await expect(currentPanel.locator(".hs-thumb-pair-state.is-saved")).toHaveText("saved");
  await currentPanel.getByRole("button", { name: "Review and approve prompt" }).click();
  await expect(currentPanel.getByRole("button", { name: "Reviewed" })).toBeVisible();
  await expect(currentPanel.getByRole("heading", { name: "Ledger Intelligence" })).toBeVisible();
  const renderBindings=await fixture.admin.schema("tongs").from("workpiece_brand_bindings").select("id,revision,state,profile_revision_id,profile_content_hash,asset_revision_ids").eq("workpiece_id",fixture.workpieceId);expect(renderBindings.error).toBeNull();expect(renderBindings.data).toHaveLength(1);expect(renderBindings.data?.[0]?.state).toBe("profile");
  await currentPanel.getByLabel("Workspace editorial note").fill("The close-up treatment should be varied in the next episode.");
  await currentPanel.getByRole("button", { name: "Save interpretation revision" }).click();
  await expect(currentPanel.getByText("The close-up treatment should be varied in the next episode.", { exact: true })).toBeVisible();
  expect(forgeRequests).toBe(1);
  const canonical = await fixture.admin.schema("tongs").from("assets")
    .select("status,content_hash,provider").eq("workpiece_id", fixture.workpieceId).eq("asset_kind", "thumbnail_image");
  expect(canonical.error).toBeNull();
  expect(canonical.data?.filter((asset) => asset.status === "ready" && /^[a-f0-9]{64}$/.test(asset.content_hash ?? "")).length).toBeGreaterThanOrEqual(2);
  expect(createHash("sha256").update(ORANGE_PNG).digest("hex")).toBe(canonical.data?.find((asset) => asset.provider === "outside_tool")?.content_hash);
  const composites = await fixture.admin.schema("tongs").from("assets")
    .select("id,status,content_hash,metadata_json").eq("workpiece_id", fixture.workpieceId).eq("asset_kind", "thumbnail_composite");
  expect(composites.error).toBeNull();
  expect(composites.data?.some((asset) => asset.status === "ready" && /^[a-f0-9]{64}$/.test(asset.content_hash ?? ""))).toBe(true);
  expect((composites.data?.[0]?.metadata_json as {brand_application_provenance?:{binding_id?:string}})?.brand_application_provenance?.binding_id).toBe(renderBindings.data?.[0]?.id);
  const canonicalPackage=await fixture.service.readWorkpieceJson(fixture.workpieceId,"metadata.json"); const episode=(canonicalPackage.data as {episode:{thumbnail:{concept_revisions:Array<{concept_revision_id:string}>}}}).episode;
  // Canonical metadata is schemaless JSON at this live-test boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original=composites.data?.[0] as {id:string;content_hash:string;metadata_json:Record<string,any>}; const baseId=String(original.metadata_json.base_asset_id); const snapshots=[original];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for(const concept of episode.thumbnail.concept_revisions.slice(1,3)){const recipe={...original.metadata_json.recipe_snapshot,id:randomUUID(),concept_revision_id:concept.concept_revision_id,title_text:`COLD BOOT ${snapshots.length+1}`};const recipeHash=createHash("sha256").update(Buffer.from(canonicalSerialize(recipe))).digest("hex");const rendered=await fixture.service.renderThumbnailComposite(fixture.workpieceId,{workspace_id:fixture.workspaceId,operation_id:randomUUID(),base_asset_id:baseId,recipe_snapshot:recipe,composition_recipe:recipe,recipe_snapshot_hash:recipeHash,width:1280,height:720,encoding:{format:"png",quality:100}},{userAccessToken:fixture.session.access_token});const metadataRead=await fixture.service.readWorkpieceJson(fixture.workpieceId,"metadata.json");const metadataDocument=structuredClone(metadataRead.data) as Record<string,any>;metadataDocument.episode.thumbnail.gate_candidate_asset_id=rendered.id;await fixture.service.commitThumbnailAssetReference(fixture.workpieceId,{workspace_id:fixture.workspaceId,asset_id:rendered.id,expected_metadata_updated_at:metadataRead.file_row?.updated_at??null,metadata_document:metadataDocument,reference_pointer:"/episode/thumbnail/gate_candidate_asset_id"},{userAccessToken:fixture.session.access_token});const ready=await fixture.service.transitionThumbnailAsset(fixture.workpieceId,{workspace_id:fixture.workspaceId,asset_id:rendered.id,target_status:"ready"},{userAccessToken:fixture.session.access_token});snapshots.push({id:ready.id,content_hash:ready.content_hash!,metadata_json:ready.metadata as Record<string,any>});}
  const candidatePayload=snapshots.map((asset)=>({new_candidate_revision_id:randomUUID(),recipe_id:asset.metadata_json.recipe_snapshot.id,recipe_revision:asset.metadata_json.recipe_snapshot.revision,recipe_hash:asset.metadata_json.recipe_snapshot_hash,recipe_snapshot:asset.metadata_json.recipe_snapshot,title_revision_id:randomUUID(),title_revision:asset.metadata_json.recipe_snapshot.title_revision,concept_revision_id:asset.metadata_json.recipe_snapshot.concept_revision_id,base_artwork_asset_id:asset.metadata_json.base_asset_id,base_artwork_content_hash:asset.metadata_json.base_asset_hash,structural_composition:{layout_family:"title-subject",title_block_zone:asset.metadata_json.recipe_snapshot.placement,title_alignment:"center",crop_mode:"cover"},composite_asset_id:asset.id,composite_content_hash:asset.content_hash,candidate_binding_id:asset.metadata_json.brand_application_provenance.binding_id,candidate_binding_revision:asset.metadata_json.brand_application_provenance.binding_revision,candidate_binding_content_hash:asset.metadata_json.brand_application_provenance.profile_content_hash,readability_contract_version:asset.metadata_json.readability_evidence.contract_version,readability_evaluator_version:asset.metadata_json.readability_evidence.evaluator_version,readability_evidence_hash:asset.metadata_json.readability_evidence.evaluation_hash,compositor_version:asset.metadata_json.composition_engine_version}));
  const candidateOperation=randomUUID();const committed=await fixture.service.commitThumbnailCandidateSet(fixture.workpieceId,{workspace_id:fixture.workspaceId,expected_current_revision:0,candidates:candidatePayload,operation_id:candidateOperation,operation_fingerprint:createHash("sha256").update(canonicalSerialize(candidatePayload)).digest("hex")},{userAccessToken:fixture.session.access_token});expect(committed.disposition).toBe("committed");expect(committed.candidate_count).toBe(3);
  await page.reload();
  await page.getByRole("tab", { name: "Visuals" }).click();
  await page.locator("#hearth-thumbnail-panel").getByRole("button", { name: "Open" }).click();
  await expect(page.locator("#hearth-thumbnail-panel").getByText("stale projection", { exact: true })).toBeVisible();
  await expect(page.locator("#hearth-thumbnail-panel").getByText(/Brand Profile:\s*Browser Brand/)).toBeVisible();
  await expect(page.locator("#hearth-thumbnail-panel").getByLabel("Readability treatment")).toHaveValue("backing");
  await expect(page.locator("#hearth-thumbnail-panel").getByText(/forge-thumbnail-contrast-evaluator-v1/)).toBeVisible();
  await expect(page.locator("#hearth-thumbnail-panel").getByText("Revision 1",{exact:true})).toBeVisible();
  const candidateWorkspace=page.locator("#hearth-thumbnail-panel .hs-thumbnail-candidates");
  await expect(candidateWorkspace.getByRole("heading",{name:"Candidate comparison"})).toBeVisible();
  await expect(candidateWorkspace.locator(".hs-thumbnail-candidate-card")).toHaveCount(3);
  await expect(candidateWorkspace.getByText("3 of 3",{exact:false})).toBeVisible();
  await expect(candidateWorkspace.getByText(/Included in current Quench handoff/)).toHaveCount(3);
  await expect(candidateWorkspace.getByText(/Distinct by:/)).toHaveCount(3);
  await expect(candidateWorkspace.getByText(/Readability evidence/)).toHaveCount(3);
  await expect(candidateWorkspace.getByRole("button",{name:"Revise this candidate"}).first()).toBeVisible();
  await currentPanel.getByRole("button", { name: "Recover last generation" }).click();
  await expect(currentPanel.locator(".hs-thumb-pair-state.is-saved")).toHaveText("saved");
  const recovered = await fixture.service.readWorkpieceJson(fixture.workpieceId, "metadata.json");
  expect((recovered.data as { episode?: { thumbnail?: { concept_sets?: unknown[] } } }).episode?.thumbnail?.concept_sets).toHaveLength(2);
  await currentPanel.getByRole("button", { name: "Recover last generation" }).click();
  await expect(currentPanel.getByText(/already recovered/i)).toBeVisible();
  const recoveredAgain = await fixture.service.readWorkpieceJson(fixture.workpieceId, "metadata.json");
  expect((recoveredAgain.data as { episode?: { thumbnail?: { concept_sets?: unknown[] } } }).episode?.thumbnail?.concept_sets).toHaveLength(2);
  expect(forgeRequests).toBe(1);
  await page.getByRole("tab", { name: "Framing" }).click();
  await page.getByRole("button", { name: "Recover generated titles and tags" }).click();
  await expect(page.getByRole("region", { name: "Generated tag suggestion" })).toBeVisible();
  await page.getByRole("button", { name: "Replace canonical tags" }).click();
  await expect.poll(async () => {
    const metadata = await fixture.service.readWorkpieceJson(fixture.workpieceId, "metadata.json");
    const episode = (metadata.data as { episode?: { seo?: { titles?: unknown[]; tags?: unknown[] } } }).episode;
    return [episode?.seo?.titles?.length ?? 0, episode?.seo?.tags?.length ?? 0];
  }).toEqual([5, 5]);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Framing" })).toContainText("5 titles · 5 tags · Needs work");
  await expect(page.getByRole("tab", { name: "Visuals" })).toContainText("10 briefs");
  const committedMembers=await fixture.admin.schema("tongs").from("thumbnail_candidate_set_members").select("candidate_revision_id,candidate_ordinal").eq("candidate_set_id",committed.candidate_set_id).order("candidate_ordinal");expect(committedMembers.error).toBeNull();expect(committedMembers.data).toHaveLength(3);
  const carriedPayload=(committedMembers.data??[]).map((entry)=>({candidate_revision_id:entry.candidate_revision_id}));const carried=await fixture.service.commitThumbnailCandidateSet(fixture.workpieceId,{workspace_id:fixture.workspaceId,expected_current_revision:1,candidates:carriedPayload,operation_id:randomUUID(),operation_fingerprint:createHash("sha256").update(canonicalSerialize(carriedPayload)).digest("hex")},{userAccessToken:fixture.session.access_token});expect(carried.disposition).toBe("committed");
  const manifest={version:1,packet_kind:"quench_release_packet",generated_by:"Hammer",generated_at:new Date().toISOString(),workpiece_id:fixture.workpieceId,workspace_id:fixture.workspaceId,episode_title:"Cold Boot Canonical Release",duration_seconds:120,audio:{kind:"polished",media_id:"audio-browser-proof",local_relpath:null,workpiece_path:"exports/audio.mp3",mime_type:"audio/mpeg",source_label:"browser proof"},captions:{srt_path:"hammer/release-packet/captions.srt",vtt_path:"hammer/release-packet/captions.vtt"},transcript:{text_path:"hammer/release-packet/transcript.txt",source_layer_id:null,source_recipe_ref:null,source_kind:"derived"},visuals:{placements_path:"hammer/release-packet/visuals.json",count:0},readiness:{status:"ready",ready_for_quench:true,overall_status:"ready",reason_codes:[],reasons_detail:[],blocking_reason_codes:[],blocking_reasons_detail:[],review_reason_codes:[],review_reasons_detail:[],reasons:[]}};
  await fixture.service.commitFile(fixture.workpieceId,{path:"hammer/release-packet/manifest.v1.json",content_type:"application/json",json:manifest,written_by:{tool:"hammer",tool_version:"1",lane:"canonical"}});
  await page.goto(`/app/quench?workspace_id=${fixture.workspaceId}&workpiece_id=${fixture.workpieceId}`);
  await expect(page.getByText("Canonical release authority is verified through Tongs.")).toBeVisible({timeout:30_000});
  await expect(page.getByText("Canonical Hammer Release",{exact:true})).toBeVisible();
  await expect(page.getByText("canonical",{exact:true})).toBeVisible();
  await expect(page.getByText("development fixtures")).toHaveCount(0);
  await expect(page.getByText(/Tongs-verified manifest/)).toBeVisible();
  const quenchCandidates=page.getByRole("region",{name:"Canonical thumbnail candidates"});await expect(quenchCandidates).toBeVisible();await expect(quenchCandidates.getByRole("article")).toHaveCount(3);await expect(quenchCandidates.getByText("provenance verified",{exact:true})).toHaveCount(3);await expect(quenchCandidates.locator("img")).toHaveCount(3);await expect(quenchCandidates.getByText("Historical candidate sets (1)")).toBeVisible();
  await quenchCandidates.getByRole("button",{name:"Select candidate"}).first().click();await expect(quenchCandidates.getByRole("status")).toContainText("Canonical thumbnail selection committed");
  const selectedCandidateId=carriedPayload[0]?.candidate_revision_id as string;const scopeId="81000000-0000-4000-8000-000000000001";const decisionProjection=await fixture.service.getQuenchCanonicalReleaseProjection(fixture.workpieceId,fixture.workspaceId,{userAccessToken:fixture.session.access_token});const current=decisionProjection.current_decisions.find((entry)=>entry.destination_scope_id===scopeId);expect(current?.current_revision).toBe(1);const noChangeOperation=randomUUID();const noChangeInput={workspace_id:fixture.workspaceId,destination_scope_id:scopeId,candidate_revision_id:selectedCandidateId,expected_decision_id:String(current?.current_decision_id),expected_revision:1,operation_id:noChangeOperation};const noChange=await fixture.service.commitQuenchSingleCandidate(fixture.workpieceId,noChangeInput,{userAccessToken:fixture.session.access_token});expect(noChange.disposition).toBe("no_change");const replay=await fixture.service.commitQuenchSingleCandidate(fixture.workpieceId,noChangeInput,{userAccessToken:fixture.session.access_token});expect(replay.disposition).toBe("replayed");const stale=await fixture.service.commitQuenchSingleCandidate(fixture.workpieceId,{...noChangeInput,candidate_revision_id:carriedPayload[1]?.candidate_revision_id as string,expected_decision_id:null,expected_revision:0,operation_id:randomUUID()},{userAccessToken:fixture.session.access_token});expect(stale.disposition).toBe("revision_conflict");
  await page.reload();await expect(page.getByText("Canonical release authority is verified through Tongs.")).toBeVisible({timeout:30_000});const coldCandidates=page.getByRole("region",{name:"Canonical thumbnail candidates"});await expect(coldCandidates.getByText("provenance verified",{exact:true})).toHaveCount(3);await expect(coldCandidates.getByText("Selection authority: current")).toBeVisible();await expect(coldCandidates.getByRole("button",{name:"Selected"})).toHaveCount(1);
  const experiment=page.getByRole("region",{name:"Thumbnail launch experiment"});await expect(experiment.getByText("Candidate experiment planning supported")).toBeVisible();await expect(experiment.getByText("Automatic thumbnail rotation is unsupported and not active.")).toBeVisible();await expect(experiment.getByPlaceholder(/64-character hash/)).toHaveCount(0);await experiment.getByRole("radio").first().check();await experiment.getByRole("checkbox").nth(1).check();await experiment.getByRole("button",{name:"Commit experiment plan"}).click();await expect(experiment.getByText("Canonical experiment intent planned. Automatic thumbnail rotation is not active.")).toBeVisible();
  const experimentProjection=await fixture.service.getQuenchCanonicalReleaseProjection(fixture.workpieceId,fixture.workspaceId,{userAccessToken:fixture.session.access_token});const experimentCurrent=experimentProjection.current_decisions.find((entry)=>entry.destination_scope_id===scopeId);expect(experimentCurrent?.current_revision).toBe(2);expect(experimentCurrent?.assignments).toHaveLength(2);const experimentOperation=randomUUID();const experimentInput={workspace_id:fixture.workspaceId,destination_scope_id:scopeId,expected_decision_id:String(experimentCurrent?.current_decision_id),expected_revision:2,operation_id:experimentOperation,assignments:[{candidate_revision_id:carriedPayload[0]?.candidate_revision_id as string,assignment_role:"control" as const,assignment_ordinal:1,allocation_basis_points:null},{candidate_revision_id:carriedPayload[1]?.candidate_revision_id as string,assignment_role:"variant" as const,assignment_ordinal:2,allocation_basis_points:null}]};expect((await fixture.service.commitQuenchExperiment(fixture.workpieceId,experimentInput,{userAccessToken:fixture.session.access_token})).disposition).toBe("no_change");expect((await fixture.service.commitQuenchExperiment(fixture.workpieceId,experimentInput,{userAccessToken:fixture.session.access_token})).disposition).toBe("replayed");expect((await fixture.service.commitQuenchExperiment(fixture.workpieceId,{...experimentInput,expected_decision_id:String(current?.current_decision_id),expected_revision:1,operation_id:randomUUID()},{userAccessToken:fixture.session.access_token})).disposition).toBe("revision_conflict");
  await page.reload();await expect(page.getByRole("region",{name:"Thumbnail launch experiment"}).getByRole("radio").first()).toBeChecked();await expect(page.getByRole("region",{name:"Thumbnail launch experiment"}).getByRole("checkbox").nth(1)).toBeChecked();await page.getByRole("region",{name:"Thumbnail launch experiment"}).getByRole("button",{name:"Cancel experiment plan"}).click();await expect(page.getByText(/does not restore the previous selected thumbnail/)).toBeVisible();const cancelledProjection=await fixture.service.getQuenchCanonicalReleaseProjection(fixture.workpieceId,fixture.workspaceId,{userAccessToken:fixture.session.access_token});const cancelled=cancelledProjection.current_decisions.find((entry)=>entry.destination_scope_id===scopeId);expect(cancelled?.decision?.intent_state).toBe("cancelled");expect(cancelled?.assignments).toHaveLength(0);expect((cancelled?.recent_history??[]).length).toBeGreaterThanOrEqual(3);
  const evidenceDirectory=new URL("../../../test-results/",import.meta.url);await mkdir(evidenceDirectory,{recursive:true});await writeFile(new URL("slice7-thumbnail-golden-path.json",evidenceDirectory),JSON.stringify({schema:"forge.thumbnail-mvp-gate-evidence.v1",generated_at:new Date().toISOString(),run:{workspace_id:fixture.workspaceId,workpiece_id:fixture.workpieceId,retention:"deleted_after_gate"},contracts:{release_projection:cancelledProjection.contract_version,candidate_distinction:"forge.thumbnail-candidate-distinction.v1",structural_composition:"forge.thumbnail-structural-composition.v1",readability:"forge.thumbnail-readability.v1"},candidate_set:{id:cancelledProjection.thumbnails.candidate_set?.id,revision:cancelledProjection.thumbnails.candidate_set?.revision,content_hash:cancelledProjection.thumbnails.candidate_set?.content_hash,candidate_ids:cancelledProjection.thumbnails.candidates.map((candidate)=>candidate.id),candidate_hashes:cancelledProjection.thumbnails.candidates.map((candidate)=>candidate.composite_content_hash)},decisions:(cancelled?.recent_history??[]).map((decision)=>({id:decision.id,revision:decision.revision,kind:decision.decision_kind,intent_state:decision.intent_state,content_hash:decision.decision_content_hash}))},null,2));
});
