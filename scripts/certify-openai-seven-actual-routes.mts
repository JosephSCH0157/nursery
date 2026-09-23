import assert from "node:assert/strict";
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHearthAiHandler } from "../apps/nursery/server/hearth/create-hearth-ai-handler.ts";
import type { HearthRuntimeConfig } from "../apps/nursery/server/hearth/hearth-runtime-config.ts";
import { createHammerPrepMiddleware } from "../apps/nursery/scripts/mw-hammer-prep.ts";
import { createTongsCommitApiHandler } from "../packages/tongs/src/workpiece-commit-api.ts";
import { OpenAiTextTestCertificationGate } from "../apps/nursery/server/billing/openai-text-test-certification.ts";
import { fingerprintOpenAiTextPaidRequest, type OpenAiTextPaidExecutionHandle } from "../packages/tongs/src/providers/paid-openai-text-route-execution.ts";
import type { OpenAiTextGateClient } from "../packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts";
import { fingerprintHammerShortsValue } from "../apps/hammer/src/editor/hammerShortsResolver.ts";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message?: string } | null };
type Route = "hearth.research_synthesis" | "visual.unified_plan" | "visual.narrative_interpretation" | "motion.broll_interpretation" | "hammer.transcript_cleanup" | "shorts.discovery" | "quench.metadata";
type Scenario = "success" | "validation_failure" | "persistence_failure";

const ROUTES: Route[] = [
  "hearth.research_synthesis", "visual.unified_plan", "visual.narrative_interpretation",
  "motion.broll_interpretation", "hammer.transcript_cleanup", "shorts.discovery", "quench.metadata",
];
const BRAD_ID = "71daf61b-57b3-4e5f-a8c8-64befecb5950";
const OPERATOR_ID = "42c3de1d-bd24-41fe-abd9-640f17518b2c";
const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const DEPOSIT_ID = "f54dab36-5391-4ad6-a00c-67c5eaf65dbd";
const SHA_A = "a".repeat(64), SHA_B = "b".repeat(64), SHA_C = "c".repeat(64), SHA_D = "d".repeat(64);
const SCRIPT = "The Test lighthouse beam crosses the quiet harbor.\n\nA small research boat travels home through its light.";

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
function row(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function rows(value: unknown): Row[] { return Array.isArray(value) ? value.filter((x): x is Row => Boolean(x) && typeof x === "object" && !Array.isArray(x)) : []; }
function number(value: unknown): number { const parsed = Number(value); assert.ok(Number.isSafeInteger(parsed)); return parsed; }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function rpc(schema: ReturnType<SupabaseClient["schema"]>, name: string, args: Row = {}): Promise<unknown> {
  const result = await (schema as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown RPC error"}`);
  return result.data;
}
async function must<T extends { error: { message?: string } | null }>(result: PromiseLike<T>, label: string): Promise<T> {
  const value = await result; if (value.error) throw new Error(`${label}: ${value.error.message ?? "unknown error"}`); return value;
}

const supabaseUrl = required("CERT_SUPABASE_URL");
const serviceRoleKey = required("CERT_SERVICE_ROLE_KEY");
const anonKey = required("CERT_ANON_KEY");
const dbContainer = process.env.CERT_DB_CONTAINER?.trim() || "supabase_db_forge-seven-adapter-isolated";
assert.match(supabaseUrl, /^http:\/\/(127\.0\.0\.1|localhost):55321\/?$/, "certification must use the isolated local Supabase API");
assert.equal(dbContainer, "supabase_db_forge-seven-adapter-isolated", "certification DB container must be the isolated project");

const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tongs = service.schema("tongs");
const password = `Forge-Isolated-${randomUUID()}!aA1`;

async function ensureUser(id: string, email: string): Promise<void> {
  const existing = await service.auth.admin.getUserById(id);
  if (!existing.data.user) {
    const created = await service.auth.admin.createUser({ id, email, password, email_confirm: true });
    if (created.error) throw created.error;
  } else {
    const updated = await service.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (updated.error) throw updated.error;
  }
}

await ensureUser(BRAD_ID, "bradjscott79@yahoo.com");
await ensureUser(OPERATOR_ID, "jschramer@gmail.com");
const ordinaryId = randomUUID(), ordinaryEmail = `ordinary-${ordinaryId}@example.test`;
await ensureUser(ordinaryId, ordinaryEmail);
const orgResult = await must(tongs.from("orgs").select("id").eq("personal_owner_user_id", BRAD_ID).single(), "Brad personal org");
const orgId = String(orgResult.data.id);
await must(tongs.from("workspaces").upsert({ id: WORKSPACE_ID, org_id: orgId, created_by: BRAD_ID, name: "Brad isolated actual-route certification" }, { onConflict: "id" }), "workspace");
await must(tongs.from("workspace_members").upsert([
  { workspace_id: WORKSPACE_ID, user_id: BRAD_ID, role: "owner" },
  { workspace_id: WORKSPACE_ID, user_id: ordinaryId, role: "viewer" },
], { onConflict: "workspace_id,user_id" }), "memberships");
await rpc(tongs, "set_platform_operator", { p_user_id: OPERATOR_ID, p_enabled: true, p_reason: "Isolated actual seven-route certification" });

const deposits = await must(tongs.from("customer_deposits").select("id").eq("id", DEPOSIT_ID), "deposit lookup");
if (deposits.data.length === 0) {
  await rpc(tongs, "record_customer_deposit", {
    p_deposit_id: DEPOSIT_ID, p_user_id: BRAD_ID,
    p_stripe_event_id: "evt_1UDV9Q1OSG3CCNl8rhG7lydw", p_stripe_session_id: "cs_test_isolated_mirror_1UDV9Q",
    p_stripe_payment_intent_id: "pi_test_isolated_mirror_1UDV9Q", p_livemode: false, p_pack_id: "ai_large",
    p_gross_amount_micros: 40_000_000, p_currency: "USD", p_credit_units: 15_000,
    p_received_at: "2026-09-08T19:57:53.593881Z",
    p_metadata_json: { isolated_verified_test_mirror: true, source_project: "wtvdjndyxegudufrompx", source_event_id: "evt_1UDV9Q1OSG3CCNl8rhG7lydw" },
  });
}
// The route policy still requires Brad's already-verified Creator entitlement.
// This isolated row mirrors access only; it grants no Test credits or Live funds.
await rpc(tongs, "upsert_billing_subscription", {
  p_user_id: BRAD_ID, p_stripe_customer_id: "cus_test_brad_isolated_mirror",
  p_stripe_subscription_id: "sub_test_brad_creator_isolated_mirror", p_purchase_type: "subscription",
  p_item_id: "creator", p_interval: "monthly", p_status: "active", p_price_id: "price_test_creator_isolated_mirror",
  p_current_period_start: "2026-09-01T00:00:00.000Z", p_current_period_end: "2026-10-01T00:00:00.000Z",
  p_cancel_at_period_end: false, p_canceled_at: null,
  p_metadata: { isolated_entitlement_mirror: true, live_funding: false, test_funding_granted: false },
});
await rpc(tongs, "recompute_account_balance", { p_user_id: BRAD_ID });

const bradClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const bradSignIn = await bradClient.auth.signInWithPassword({ email: "bradjscott79@yahoo.com", password });
if (bradSignIn.error || !bradSignIn.data.session) throw bradSignIn.error ?? new Error("Brad isolated sign-in failed");
const bradToken = bradSignIn.data.session.access_token;
const bradTongs = bradClient.schema("tongs");
const ordinaryClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ordinarySignIn = await ordinaryClient.auth.signInWithPassword({ email: ordinaryEmail, password });
if (ordinarySignIn.error || !ordinarySignIn.data.session) throw ordinarySignIn.error ?? new Error("ordinary isolated sign-in failed");
const ordinaryToken = ordinarySignIn.data.session.access_token;

const terms = ROUTES.map((route) => {
  const large = ["hearth.research_synthesis", "hammer.transcript_cleanup", "shorts.discovery", "quench.metadata"].includes(route);
  return {
    route_code: route, model: large ? "gpt-5.3" : "gpt-5-mini", maximum_input_units: 65_536,
    maximum_output_units: large ? 1024 : 768, maximum_attempts: 1,
    input_micros_per_million_tokens: 1000, output_micros_per_million_tokens: 4000,
    direct_provider_ceiling_micros: large ? 5000 : 3000, supporting_cost_ceiling_micros: large ? 2000 : 1500,
    failure_exposure_ceiling_micros: large ? 5000 : 3000, markup_basis_points: 3300,
    customer_price_ceiling_micros: 10000, customer_credit_units: 1, rate_evidence_status: "synthetic_test",
    supporting_cost_policy: { scope: "validation_and_tongs_persistence_only", search_allowed: false, external_enrichment_allowed: false, extraction_allowed: false, transcription_allowed: false, synthetic_test: true },
  };
});

type Batch = { id: string; invocationToken: string };
async function openBatch(label: string): Promise<Batch> {
  const id = randomUUID(), invocationToken = `actual-route-${randomUUID()}-${randomUUID()}`;
  const opened = row(await rpc(tongs, "open_openai_text_test_certification", {
    p_batch_id: id, p_actor_id: OPERATOR_ID, p_user_id: BRAD_ID, p_workspace_id: WORKSPACE_ID, p_deposit_id: DEPOSIT_ID,
    p_invocation_token_hash: createHash("sha256").update(invocationToken).digest("hex"),
    p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), p_terms: terms,
    p_reason: `Actual endpoint certification ${label}; simulated provider only`,
  }));
  assert.equal(opened.real_provider_authorized, false);
  return { id, invocationToken };
}

const primaryBatch = await openBatch("success and validation");
const recoveryBatch = await openBatch("domain persistence faults and post-persistence recovery");
const gateBase = new OpenAiTextTestCertificationGate(service as never);
class FaultGate implements OpenAiTextGateClient {
  readonly failGenericPersist = new Set<string>(); readonly failed = new Set<string>();
  async rpc(name: string, args: Row): Promise<RpcResult> {
    const reservationId = String(args.p_reservation_id ?? "");
    if (name === "persist_openai_text_paid_result" && this.failGenericPersist.has(reservationId) && !this.failed.has(reservationId)) {
      this.failed.add(reservationId); return { data: null, error: { message: "injected post-domain billing persistence interruption" } };
    }
    const result = await gateBase.rpc(name, args);
    if (result.error) process.stderr.write(`[cert-gate] ${name}: ${result.error.message ?? "unknown"}\n`);
    return result;
  }
}
const gate = new FaultGate();

type Fixture = { workpieceId: string; scriptApprovalId: string; imageMapRevisionId?: string; imageMomentId?: string; beatId?: string; basisLockId?: string; basisFingerprint?: string };
async function createBaseFixture(label: string, withImageMap = false): Promise<Fixture> {
  const workpieceId = randomUUID(), scriptApprovalId = randomUUID();
  await must(tongs.from("episodes").insert({ id: workpieceId, workspace_id: WORKSPACE_ID, label: `TEST CERT ${label}`, created_by: BRAD_ID, creation_origin: "isolated_actual_route_certification", lifecycle_state: "active" }), "episode fixture");
  await must(tongs.from("script_approval_revisions").insert({
    id: scriptApprovalId, workspace_id: WORKSPACE_ID, workpiece_id: workpieceId, approval_revision: 1,
    source_file_path: "script/script.md", source_file_revision: 1, script_content_hash: SHA_A,
    semantic_state_hash: SHA_B, immutable_revision_hash: SHA_C, script_text: SCRIPT,
    approval_contract_version: "forge.script-approval.v1", creator_version_label: "isolated Test", created_by: BRAD_ID,
  }), "script approval fixture");
  await must(tongs.from("workpiece_script_approval_sequences").upsert({ workspace_id: WORKSPACE_ID, workpiece_id: workpieceId, current_approval_id: scriptApprovalId, current_revision: 1 }, { onConflict: "workspace_id,workpiece_id" }), "script approval sequence");
  const fixture: Fixture = { workpieceId, scriptApprovalId };
  if (withImageMap) {
    fixture.imageMapRevisionId = randomUUID(); fixture.imageMomentId = `moment-${randomUUID()}`;
    await must(tongs.from("image_map_revisions").insert({
      id: fixture.imageMapRevisionId, workspace_id: WORKSPACE_ID, workpiece_id: workpieceId, revision: 1,
      source_script_approval_id: scriptApprovalId, source_script_approval_revision: 1, source_script_content_hash: SHA_A,
      anchor_contract_version: "forge.image-map.anchor.v1", provenance_state: "current",
      document_json: { entries: [{ id: fixture.imageMomentId, context_focus: SCRIPT }] }, document_content_hash: SHA_A,
      semantic_state_hash: SHA_B, immutable_revision_hash: SHA_C, created_by: BRAD_ID,
    }), "image map fixture");
    await must(tongs.from("workpiece_image_map_sequences").upsert({ workspace_id: WORKSPACE_ID, workpiece_id: workpieceId, current_revision_id: fixture.imageMapRevisionId, current_revision: 1 }, { onConflict: "workspace_id,workpiece_id" }), "image map sequence");
  }
  return fixture;
}

async function createMotionFixture(label: string): Promise<Fixture> {
  const fixture = await createBaseFixture(label);
  const beatId = randomUUID();
  const planOperationId = `forge:broll:actual-cert-plan:${randomUUID()}`;
  const beats = [{ beat_id: beatId, context_before: "", context_focus: "A small research boat travels home through its light.", context_after: "", canonical_anchor_assessment: { state: "current" }, narrative_purpose: "Show the boat following the lighthouse beam", placement_hint: "during the second Test sentence", duration_target_ms: 5000, shot_type: "tracking", motion_intent: "Track the boat moving toward shore", mood_pacing: "calm and steady", asset_category: "generated", trim_guidance: {} }];
  const committed = row(await rpc(bradTongs, "commit_broll_plan", {
    p_workspace_id: WORKSPACE_ID, p_workpiece_id: fixture.workpieceId, p_expected_revision_id: null, p_expected_revision: 0,
    p_script_approval_id: fixture.scriptApprovalId, p_source_context_contract_version: "forge.actual-certification.broll-plan.v1",
    p_beats: beats, p_operation_id: planOperationId, p_operation_fingerprint: sha({ planOperationId, beats }), p_actor_id: BRAD_ID,
  }));
  assert.equal(committed.disposition, "committed", `motion fixture plan: ${JSON.stringify(committed)}`);
  fixture.beatId = beatId;
  return fixture;
}

async function createShortsFixture(label: string): Promise<Fixture> {
  const fixture = await createBaseFixture(label);
  const canonicalId = randomUUID(), revisionId = randomUUID(), epochId = randomUUID(), headId = randomUUID(), basisLockId = randomUUID();
  const basisFingerprint = sha({ label, basisLockId });
  const transcriptPath = `hammer/revisions/${revisionId}/transcript.json`;
  const timelinePath = `hammer/revisions/${revisionId}/visual-timeline.json`;
  const placementsPath = `hammer/revisions/${revisionId}/visual-placements.json`;
  const audioPath = `hammer/revisions/${revisionId}/audio-polish.json`;
  const editorialPath = `hammer/revisions/${revisionId}/editorial-authority.json`;
  const epochPath = `hammer/revisions/${revisionId}/history/epochs/${epochId}.v1.json`;
  const archivePath = `hammer/revisions/${revisionId}/history/archive/${SHA_A}.history.v1.json`;
  const headPath = `hammer/revisions/${revisionId}/history/epochs/${epochId}/heads/${headId}.history.v1.json`;
  const components = JSON.stringify({ transcript: SHA_A, visual_timeline: SHA_B, visual_placements: SHA_C, audio: SHA_D, editorial_authority: SHA_A });
  const authority = JSON.stringify({ transcript: { path: transcriptPath, sha256: SHA_A }, visual_timeline: { path: timelinePath, sha256: SHA_B }, visual_placements: { path: placementsPath, sha256: SHA_C }, audio: { path: audioPath, sha256: SHA_D }, editorial_authority: { path: editorialPath, sha256: SHA_A } });
  psql(`
insert into tongs.canonical_recordings(id,workspace_id,workpiece_id,status,media_path,media_content_type,media_bytes,media_duration_ms,media_id,created_by,updated_by)
values('${canonicalId}','${WORKSPACE_ID}','${fixture.workpieceId}','sealed','recordings/${fixture.workpieceId}/test.mp4','video/mp4',1024,30000,'isolated-test-media','${BRAD_ID}','${BRAD_ID}');
insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,label,revision_transcript_path,audio_polish_path,visual_timeline_path,visual_placements_path,history_path,editorial_authority_path,created_by,updated_by)
values('${revisionId}','${WORKSPACE_ID}','${fixture.workpieceId}','${canonicalId}','active','isolated Test','${transcriptPath}','${audioPath}','${timelinePath}','${placementsPath}','${headPath}','${editorialPath}','${BRAD_ID}','${BRAD_ID}');
update tongs.episodes set canonical_recording_id='${canonicalId}',active_revision_id='${revisionId}' where id='${fixture.workpieceId}';
insert into tongs.hammer_history_epochs(epoch_id,workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,artifact_path,artifact_sha256,artifact_bytes,artifact_registry_revision,artifact_registry_updated_at,base_editor_state_hash,base_component_sha256,creation_reason,predecessor_original_path,predecessor_archive_path,predecessor_sha256,predecessor_bytes,predecessor_registry_revision,predecessor_registry_updated_at,archive_registry_revision,archive_registry_updated_at,initiating_user_id)
values('${epochId}','${WORKSPACE_ID}','${fixture.workpieceId}','${canonicalId}','${revisionId}','${epochPath}','${SHA_B}',100,1,now(),'hammer-state:1234abcd','${components}'::jsonb,'legacy_history_unrecoverable','hammer/revisions/${revisionId}/history.json','${archivePath}','${SHA_A}',100,1,now(),1,now(),'${BRAD_ID}');
alter table tongs.hammer_history_epoch_heads disable trigger trg_hammer_history_epoch_heads_parent;
insert into tongs.hammer_history_epoch_heads(head_id,epoch_id,workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,sequence,artifact_path,artifact_sha256,artifact_bytes,artifact_registry_revision,artifact_registry_updated_at,parent_kind,parent_path,parent_sha256,parent_registry_revision,parent_registry_updated_at,base_editor_state_hash,base_component_sha256,result_editor_state_hash,result_component_authority,initiated_by)
values('${headId}','${epochId}','${WORKSPACE_ID}','${fixture.workpieceId}','${canonicalId}','${revisionId}',1,'${headPath}','${SHA_C}',100,1,now(),'epoch_anchor','${epochPath}','${SHA_B}',1,now(),'hammer-state:1234abcd','${components}'::jsonb,'hammer-state:1234abcd','${authority}'::jsonb,'${BRAD_ID}');
alter table tongs.hammer_history_epoch_heads enable trigger trg_hammer_history_epoch_heads_parent;
insert into tongs.hammer_shorts_basis_locks(id,workspace_id,parent_workpiece_id,canonical_recording_id,recording_revision_id,history_epoch_id,history_head_id,history_sequence,editor_state_hash,transcript_fingerprint,timeline_fingerprint,render_assembly_fingerprint,output_time_map_fingerprint,basis_fingerprint,operation_id,operation_fingerprint,locked_by)
values('${basisLockId}','${WORKSPACE_ID}','${fixture.workpieceId}','${canonicalId}','${revisionId}','${epochId}','${headId}',1,'hammer-state:1234abcd','${SHA_A}','${SHA_B}','${SHA_C}','${SHA_D}','${basisFingerprint}','forge:shorts:basis:${randomUUID()}','${SHA_B}','${BRAD_ID}');
`);
  fixture.basisLockId = basisLockId; fixture.basisFingerprint = basisFingerprint;
  return fixture;
}

type Prepared = { route: Route; scenario: Scenario; batch: Batch; operationId: string; reservationId: string; fingerprint: string; handle: OpenAiTextPaidExecutionHandle; fixture: Fixture; body: Row };
async function prepare(batch: Batch, route: Route, scenario: Scenario, fixture: Fixture, body: Row, fingerprintPayload: unknown): Promise<Prepared> {
  const operationRecordId = randomUUID(), reservationId = randomUUID();
  const operationId = String(body.operation_id ?? `actual:${route}:${randomUUID()}`);
  const fingerprint = await fingerprintOpenAiTextPaidRequest(fingerprintPayload);
  body.operation_id = operationId; body.operation_fingerprint = fingerprint;
  body.paid_execution = { operation_id: operationId, reservation_id: reservationId, request_fingerprint: fingerprint };
  await rpc(tongs, "prepare_openai_text_test_certification_operation", {
    p_operation_record_id: operationRecordId, p_batch_id: batch.id, p_route_code: route, p_scenario: scenario,
    p_operation_id: operationId, p_workpiece_id: fixture.workpieceId, p_request_fingerprint: fingerprint,
    p_request_json: fingerprintPayload, p_actor_id: OPERATOR_ID,
  });
  await rpc(tongs, "reserve_openai_text_test_certification_operation", { p_reservation_id: reservationId, p_operation_record_id: operationRecordId, p_idempotency_key: `${operationId}:reservation` });
  return { route, scenario, batch, operationId, reservationId, fingerprint, handle: { operationId, reservationId, requestFingerprint: fingerprint }, fixture, body };
}

let current: { route: Route; malformed: boolean; operationId: string } | null = null;
const providerCalls = new Map<string, number>();
function counted(): void { assert(current); providerCalls.set(current.operationId, (providerCalls.get(current.operationId) ?? 0) + 1); }
const usage = { inputTokens: 120, outputTokens: 60, totalTokens: 180 };
const validUnifiedPlan = { images: [{ context_before: "", context_focus: "The Test lighthouse beam crosses the quiet harbor.", context_after: "", description: "A lighthouse beam sweeping over a quiet harbor", visual_intent: "Establish the source of guidance", creator_direction: "Neutral documentary Test image", style: "documentary", placement_hint: "during the lighthouse sentence", source_keys: [], source_relationship: "none", source_rationale: "No external source is required." }], broll: [{ context_before: "", context_focus: "A small research boat travels home through its light.", context_after: "", narrative_purpose: "Show the boat following the light", placement_hint: "during the boat sentence", duration_target_ms: 5000, shot_type: "tracking", motion_intent: "Track the boat moving toward shore", mood_pacing: "calm and steady", asset_category: "generated", source_keys: [], source_relationship: "none", source_rationale: "No external source is required." }], reference_clips: [], reference_visuals: [] };
const validNarrativeBrief = { narrative_purpose: "Show the lighthouse guiding the research boat", central_message: "Reliable guidance brings a small crew home", primary_subjects: ["stone lighthouse", "small research boat"], relationship_or_action: "The lighthouse beam points across the harbor toward the boat", emotional_tone: "calm relief", visual_mode: "documentary", setting: "A quiet harbor at blue hour", composition: "Wide harbor view with the lighthouse at left and the boat following the beam at right", essential_visual_evidence: ["visible lighthouse beam", "small research boat", "calm harbor water"], avoid: ["storm waves", "military vessels", "crowded marina"], source_context: { before: "The harbor is dark.", focus: SCRIPT, after: "The crew arrives safely." } };
const validMotionBrief = { narrative_purpose: "Show guidance unfolding over time", central_message: "The moving beam leads the boat home", visible_subjects: ["lighthouse beam", "small research boat", "harbor water"], action_over_time: "The beam moves across the water and reveals the boat traveling toward shore", camera_behavior: "The camera tracks slowly beside the boat and pans toward the lighthouse", start_frame: "A wide dark harbor with the boat distant", end_frame: "A closer boat entering the illuminated harbor", target_duration: "5 seconds", pacing: "slow and steady", setting: "A quiet harbor at blue hour", mood: "calm relief", continuity: "Keep the same boat, shoreline, and light direction throughout", must_include: ["moving lighthouse beam", "forward boat motion", "visible shoreline"], avoid: ["storm waves", "fast cuts", "camera shake"], loopability: "The final pan can return to the opening harbor angle" };

const tongsHandler = createTongsCommitApiHandler({
  supabaseUrl, supabaseServiceRoleKey: serviceRoleKey, bucket: "forge-workpieces", openAiTextGate: gate,
  unifiedVisualPlanProvider: { generate: async ({ model }) => { counted(); return { plan: current?.malformed ? { images: [], broll: [], reference_clips: [], reference_visuals: [] } : validUnifiedPlan, rawResponse: { synthetic_test: true }, rawResponseText: JSON.stringify({ synthetic_test: true }), parseError: null, providerRequestId: `sim-unified-${current?.operationId}`, ...usage, model: model ?? "gpt-5.6-luna" }; } },
  narrativeInterpretationProvider: { interpret: async ({ model }) => { counted(); return { brief: current?.malformed ? { ...validNarrativeBrief, central_message: "appropriate context" } : validNarrativeBrief, rawResponse: { synthetic_test: true }, providerRequestId: `sim-narrative-${current?.operationId}`, ...usage, model: model ?? "gpt-5-mini" }; } },
  brollMotionInterpretationProvider: { interpret: async ({ model }) => { counted(); return { brief: current?.malformed ? { ...validMotionBrief, action_over_time: "static image" } : validMotionBrief, rawResponse: { synthetic_test: true }, providerRequestId: `sim-motion-${current?.operationId}`, ...usage, model: model ?? "gpt-5-mini" }; } },
});

const runtimeConfig: HearthRuntimeConfig = {
  textApiKey: "simulated-only", imageApiKey: null, researchApiKey: null, apiKey: "simulated-only", model: "gpt-5.3", sttModel: "gpt-4o-mini-transcribe",
  configuredBillingMode: "forge", initialTokenBalance: 15_000, supabaseUrl, supabaseServiceRoleKey: serviceRoleKey, supabaseRpcKey: anonKey,
  sttBucket: "forge-workpieces", disableForgeLaneAi: false, disableUserKeys: false, disableExpensiveAiActions: false, disableCdcGeneration: false,
  openAiTextGate: gate, resolveUserIdForAccessToken: async () => BRAD_ID,
  researchRuntime: { run: async () => { throw new Error("search is forbidden in supplied-source certification"); } },
  researchSourceExtractor: async ({ url, sourceId }) => ({ sourceId, sourceType: "web_article", ingestMode: "creator_url", title: "Supplied Test lighthouse note", publisher: "Fixture", author: "Test", url, originalUrl: url, resolvedUrl: url, canonicalUrl: url, domain: "fixture.invalid", publishedAt: "2026-09-01T00:00:00.000Z", updatedAt: null, retrievedAt: "2026-09-09T00:00:00.000Z", warnings: [], transcriptAvailable: false, snippet: SCRIPT, extractedText: SCRIPT, transcript: null, transcriptSegments: null, transcriptMeta: null, attributedQuotes: [], extractionStatus: "success", extractionError: null, provenance: null }),
  openAiProviderFetch: (async () => { counted(); const content = current?.malformed ? "" : "The supplied Test source shows a lighthouse guiding a research boat safely home."; return Response.json({ id: `sim-hearth-${current?.operationId}`, choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 60 } }); }) as typeof fetch,
};
const hearthHandler = createHearthAiHandler(runtimeConfig);

const hammerProviderFetch = (async (_input: RequestInfo | URL) => {
  counted();
  if (current?.route === "hammer.transcript_cleanup") return Response.json({ id: `sim-cleanup-${current.operationId}`, choices: [{ message: { content: current.malformed ? JSON.stringify({ changes: [] }) : JSON.stringify({ changes: [{ segment_id: "seg-1", cleaned_text: "We should start this over." }] }) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
  if (current?.route === "quench.metadata") return Response.json({ id: `sim-quench-${current.operationId}`, choices: [{ message: { content: current.malformed ? JSON.stringify({ title: "", description: "", tags: [] }) : JSON.stringify({ title: "The Test Lighthouse", description: "A supplied Test episode about a lighthouse guiding a research boat home.", tags: ["lighthouse", "research", "test"] }) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
  if (current?.route === "shorts.discovery") return Response.json({ id: `sim-shorts-${current.operationId}`, output_text: current.malformed ? "not-json" : JSON.stringify({ proposals: [{ proposal_id: "proposal-1", rank: 1, first_segment_id: "seg-1", last_segment_id: "seg-3", rationale: "A complete neutral Test thought", goal_fit: "Works as a standalone Test clip" }] }), usage: { input_tokens: 120, output_tokens: 60 } });
  throw new Error("No external provider or supporting-service request is permitted by this certification");
}) as typeof fetch;

const hammerMiddleware = createHammerPrepMiddleware({ runtimeConfig, openAiTextGate: gate, openAiProviderFetch: hammerProviderFetch });
const hammerServer = http.createServer((req, res) => hammerMiddleware(req, res, (error) => { res.statusCode = error ? 500 : 404; res.end(error ? String(error) : "not found"); }));
await new Promise<void>((resolve) => hammerServer.listen(0, "127.0.0.1", resolve));
const hammerAddress = hammerServer.address(); if (!hammerAddress || typeof hammerAddress === "string") throw new Error("failed to start isolated endpoint server");
const hammerOrigin = `http://127.0.0.1:${hammerAddress.port}`;

async function startIsolatedHandlerServer(handler: (request: Request) => Promise<Response>): Promise<{ server: http.Server; origin: string }> {
  const server = http.createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("isolated handler address unavailable");
      const appResponse = await handler(new Request(`http://127.0.0.1:${address.port}${request.url ?? "/"}`, {
        method: request.method, headers: request.headers as HeadersInit,
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
      }));
      response.statusCode = appResponse.status;
      appResponse.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await appResponse.arrayBuffer()));
    } catch (error) {
      response.statusCode = 500; response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("failed to start isolated application server");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}
const isolatedTongs = await startIsolatedHandlerServer(tongsHandler);
const isolatedHearth = await startIsolatedHandlerServer(hearthHandler);

async function endpointRequest(path: string, body: Row, kind: "tongs" | "hammer" | "hearth", accessToken = bradToken): Promise<{ status: number; payload: Row }> {
  const origin = kind === "hammer" ? hammerOrigin : kind === "tongs" ? isolatedTongs.origin : isolatedHearth.origin;
  const request = new Request(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forge-user-authorization": `Bearer ${accessToken}`, authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) });
  const response = await fetch(request);
  return { status: response.status, payload: row(await response.json().catch(() => ({}))) };
}

function psql(sql: string): void {
  const result = spawnSync("docker", ["exec", "-i", dbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`isolated psql failed: ${result.stderr || result.stdout}`);
}

psql(`
create schema if not exists forge_actual_certification;
create table if not exists forge_actual_certification.persistence_faults(route_code text not null,workpiece_id uuid not null,primary key(route_code,workpiece_id));
create or replace function forge_actual_certification.raise_selected_fault() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
  if exists(select 1 from forge_actual_certification.persistence_faults f where f.route_code=TG_ARGV[0] and f.workpiece_id=new.workpiece_id) then raise exception 'injected actual domain persistence failure for %',TG_ARGV[0]; end if; return new;
end $$;
drop trigger if exists cert_fault_hearth on tongs.hearth_research_synthesis_results;
create trigger cert_fault_hearth before insert on tongs.hearth_research_synthesis_results for each row execute function forge_actual_certification.raise_selected_fault('hearth.research_synthesis');
drop trigger if exists cert_fault_cleanup on tongs.hammer_transcript_cleanup_assist_results;
create trigger cert_fault_cleanup before insert on tongs.hammer_transcript_cleanup_assist_results for each row execute function forge_actual_certification.raise_selected_fault('hammer.transcript_cleanup');
drop trigger if exists cert_fault_quench on tongs.quench_metadata_assist_results;
create trigger cert_fault_quench before insert on tongs.quench_metadata_assist_results for each row execute function forge_actual_certification.raise_selected_fault('quench.metadata');
drop trigger if exists cert_fault_narrative on tongs.image_map_prompt_revisions;
create trigger cert_fault_narrative before insert on tongs.image_map_prompt_revisions for each row execute function forge_actual_certification.raise_selected_fault('visual.narrative_interpretation');
drop trigger if exists cert_fault_unified_image on tongs.image_map_revisions;
create trigger cert_fault_unified_image before insert on tongs.image_map_revisions for each row execute function forge_actual_certification.raise_selected_fault('visual.unified_plan');
drop trigger if exists cert_fault_unified_broll on tongs.broll_plan_revisions;
create trigger cert_fault_unified_broll before insert on tongs.broll_plan_revisions for each row execute function forge_actual_certification.raise_selected_fault('visual.unified_plan');
drop trigger if exists cert_fault_motion on tongs.broll_prompt_revisions;
create trigger cert_fault_motion before insert on tongs.broll_prompt_revisions for each row execute function forge_actual_certification.raise_selected_fault('motion.broll_interpretation');
create or replace function forge_actual_certification.raise_selected_shorts_fault() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
  if exists(select 1 from forge_actual_certification.persistence_faults f join tongs.hammer_shorts_discoveries d on d.id=new.discovery_id where f.route_code='shorts.discovery' and f.workpiece_id=d.parent_workpiece_id) then raise exception 'injected actual domain persistence failure for shorts.discovery'; end if; return new;
end $$;
drop trigger if exists cert_fault_shorts on tongs.hammer_shorts_ai_proposals;
create trigger cert_fault_shorts before insert on tongs.hammer_shorts_ai_proposals for each row execute function forge_actual_certification.raise_selected_shorts_fault();
`);

const matrix: Row[] = [];

async function prepareSimple(route: Route, scenario: Scenario, recovery = false): Promise<Prepared> {
  const batch = recovery || scenario === "persistence_failure" ? recoveryBatch : primaryBatch;
  const fixtureLabel = `${route} ${scenario}${recovery ? " recovery" : ""}`;
  const fixture = route === "motion.broll_interpretation"
    ? await createMotionFixture(fixtureLabel)
    : route === "shorts.discovery"
      ? await createShortsFixture(fixtureLabel)
      : await createBaseFixture(fixtureLabel, route === "visual.narrative_interpretation");
  const operationPrefix = route === "visual.narrative_interpretation"
    ? "forge:image-prompt:actual-cert"
    : route === "motion.broll_interpretation"
      ? "forge:broll:actual-cert"
      : "actual-cert";
  const operationId = `${operationPrefix}:${scenario}${recovery ? ":recovery" : ""}:${randomUUID()}`;
  if (route === "visual.unified_plan") {
    const body: Row = { workspace_id: WORKSPACE_ID, script_approval_id: fixture.scriptApprovalId, expected_image_revision_id: null, expected_image_revision: 0, expected_broll_revision_id: null, expected_broll_revision: 0, expected_reference_revision_id: null, expected_reference_revision: 0, expected_reference_visual_revision_id: null, expected_reference_visual_revision: 0, creator_direction: "Neutral documentary Test image", generation_scope: "images_broll", operation_id: operationId };
    const payload = { workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, script_approval_id: fixture.scriptApprovalId, script_approval_revision: 1, script_content_hash: SHA_A, expected_image_revision_id: null, expected_image_revision: 0, expected_broll_revision_id: null, expected_broll_revision: 0, expected_reference_revision_id: null, expected_reference_revision: 0, expected_reference_visual_revision_id: null, expected_reference_visual_revision: 0, creator_direction: "Neutral documentary Test image", generation_scope: "images_broll", source_catalog: [], contract_version: "forge.unified-visual-plan.v3", provider_contract_version: "forge.unified-visual-plan-provider.v5", model_configuration: { model: "gpt-5.6-luna" } };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  if (route === "visual.narrative_interpretation") {
    const sourceContext = { before: "The harbor is dark.", focus: SCRIPT, after: "The boat arrives safely." };
    const body: Row = { workspace_id: WORKSPACE_ID, image_moment_id: fixture.imageMomentId, image_map_revision_id: fixture.imageMapRevisionId, script_approval_id: fixture.scriptApprovalId, expected_prompt_revision_id: null, expected_prompt_revision: 0, source_context: sourceContext, creator_direction: "Neutral documentary Test image", style: "documentary", operation_id: operationId };
    const payload = { workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, image_moment_id: fixture.imageMomentId, image_map_revision_id: fixture.imageMapRevisionId, script_approval_id: fixture.scriptApprovalId, expected_prompt_revision_id: null, expected_prompt_revision: 0, source_context: sourceContext, creator_direction: "Neutral documentary Test image", style: "documentary", contracts: { interpretation: "forge.image-prompt-interpretation.v2", validator: "forge.image-prompt-validator.v1", synthesis: "forge.image-prompt-synthesis.v3" } };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  if (route === "hammer.transcript_cleanup") {
    const segments = [{ segment_id: "seg-1", start_sec: 0, end_sec: 3, speaker: "S1", text: "um we should probably start this over" }];
    const body: Row = { workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, segment_ids: ["seg-1"], segments, operation_id: operationId };
    const payload = { schema: "forge.hammer.transcript-cleanup.paid.v1", route_code: route, workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, segments, model: "gpt-5.3" };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  if (route === "quench.metadata") {
    const body: Row = { workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, title: "Original Test title", description: "Original supplied Test description.", tags: ["test"], operation_id: operationId };
    const payload = { schema: "forge.quench.metadata.paid.v1", route_code: route, workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, title: body.title, description: body.description, tags: body.tags, model: "gpt-5.3" };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  if (route === "hearth.research_synthesis") {
    const requestText = "Research and synthesize only this supplied source: https://fixture.invalid/lighthouse";
    const source = await runtimeConfig.researchSourceExtractor!({ url: "https://fixture.invalid/lighthouse", sourceId: "link-1", brief: {} as never });
    const body: Row = { lane: "forge", action_id: operationId, messages: [{ role: "user", content: requestText }], user_authored_text: requestText, attachment_context: { include_episode_attachments: false, attachment_ids: [] }, episode_context: { episodeId: fixture.workpieceId, workspaceId: WORKSPACE_ID, title: "Test lighthouse", titleVariants: { A: "", B: "", C: "" }, outline: "", body: "", tonePreset: null, sources: [], sparks: [] }, operation_id: operationId };
    const payload = { schema: "forge.hearth.research-synthesis.paid.v1", route_code: route, workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, lane: "forge", user_authored_text: requestText, creator_supplied_sources: [source], supporting_paid_services: [], model: "gpt-5.3" };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  if (route === "motion.broll_interpretation") {
    const creatorDirection = "Neutral documentary Test motion";
    const currentInput = row(await rpc(bradTongs, "broll_current_creative_input", { p_workspace_id: WORKSPACE_ID, p_workpiece_id: fixture.workpieceId, p_beat_id: fixture.beatId, p_creator_direction: creatorDirection, p_interpretation_contract_version: "forge.broll-motion-interpretation.v1", p_synthesis_contract_version: "forge.broll-motion-synthesis.v1" }));
    assert.equal(currentInput.disposition, "current");
    const body: Row = { workspace_id: WORKSPACE_ID, beat_id: fixture.beatId, expected_prompt_revision_id: null, expected_prompt_revision: 0, creator_direction: creatorDirection, operation_id: operationId };
    const payload = { workspace_id: WORKSPACE_ID, workpiece_id: fixture.workpieceId, beat_id: fixture.beatId, expected_prompt_revision_id: null, expected_prompt_revision: 0, creator_direction: creatorDirection, creative_input_hash: currentInput.creative_input_hash, contracts: { interpretation: "forge.broll-motion-interpretation.v1", validator: "forge.broll-motion-validator.v1", synthesis: "forge.broll-motion-synthesis.v1" } };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  if (route === "shorts.discovery") {
    const outputSegments = [
      { segment_id: "seg-1", text: "The lighthouse beam crosses the harbor.", source_start_sec: 0, source_end_sec: 10, output_start_sec: 0, output_end_sec: 10 },
      { segment_id: "seg-2", text: "A research boat follows the light.", source_start_sec: 10, source_end_sec: 20, output_start_sec: 10, output_end_sec: 20 },
      { segment_id: "seg-3", text: "The crew reaches home safely.", source_start_sec: 20, source_end_sec: 30, output_start_sec: 20, output_end_sec: 30 },
    ];
    const body: Row = { workspace_id: WORKSPACE_ID, parent_workpiece_id: fixture.workpieceId, basis_lock_id: fixture.basisLockId, basis_fingerprint: fixture.basisFingerprint, goal: "standalone", duration_preset: "about_30s", minimum_duration_sec: 20, maximum_duration_sec: 40, target_candidate_count: 3, output_segments: outputSegments, operation_id: operationId };
    const requestUnsigned = { schema_version: "HammerShortsDiscoveryRequestV1", basis_lock_id: fixture.basisLockId, basis_fingerprint: fixture.basisFingerprint, goal: "standalone", duration_preset: "about_30s", minimum_duration_sec: 20, maximum_duration_sec: 40, target_candidate_count: 3, prompt_version: "hammer.shorts.discovery.prompt.v1", contract_version: "HammerShortsDiscoveryRequestV1", provider: "openai", model: "gpt-5.3" };
    const request = { ...requestUnsigned, request_fingerprint: await fingerprintHammerShortsValue(requestUnsigned) };
    const payload = { operation_id: operationId, request };
    return prepare(batch, route, scenario, fixture, body, payload);
  }
  throw new Error(`${route} requires a specialized fixture`);
}

function routeEndpoint(prepared: Prepared): { path: string; kind: "tongs" | "hammer" | "hearth" } {
  switch (prepared.route) {
    case "hearth.research_synthesis": return { path: "/api/hearth/chat", kind: "hearth" };
    case "visual.unified_plan": return { path: `/tongs/workpieces/${prepared.fixture.workpieceId}/visual-plan-v2/generate`, kind: "tongs" };
    case "visual.narrative_interpretation": return { path: `/tongs/workpieces/${prepared.fixture.workpieceId}/image-prompts/interpret`, kind: "tongs" };
    case "motion.broll_interpretation": return { path: `/tongs/workpieces/${prepared.fixture.workpieceId}/broll-v2/prompt-interpret`, kind: "tongs" };
    case "hammer.transcript_cleanup": return { path: "/api/hammer/editorial/transcript-cleanup", kind: "hammer" };
    case "shorts.discovery": return { path: "/api/hammer/shorts/discover", kind: "hammer" };
    case "quench.metadata": return { path: "/api/quench/metadata/assist", kind: "hammer" };
  }
}

async function domainCount(prepared: Prepared): Promise<number> {
  const table = prepared.route === "hearth.research_synthesis" ? "hearth_research_synthesis_results"
    : prepared.route === "visual.unified_plan" ? "unified_visual_plan_operations"
    : prepared.route === "visual.narrative_interpretation" ? "image_map_prompt_revisions"
    : prepared.route === "motion.broll_interpretation" ? "broll_prompt_revisions"
    : prepared.route === "hammer.transcript_cleanup" ? "hammer_transcript_cleanup_assist_results"
    : prepared.route === "shorts.discovery" ? "hammer_shorts_discoveries" : "quench_metadata_assist_results";
  const column = prepared.route === "shorts.discovery" ? "parent_workpiece_id" : "workpiece_id";
  const result = await must(tongs.from(table).select("*", { count: "exact", head: true }).eq(column, prepared.fixture.workpieceId), `domain count ${prepared.route}`);
  if (prepared.route === "visual.unified_plan") {
    const verified = await must(tongs.from(table).select("*", { count: "exact", head: true }).eq(column, prepared.fixture.workpieceId).eq("state", "verified"), `verified domain count ${prepared.route}`);
    return verified.count ?? 0;
  }
  if (prepared.route === "shorts.discovery") {
    const completed = await must(tongs.from(table).select("*", { count: "exact", head: true }).eq(column, prepared.fixture.workpieceId).eq("state", "completed"), `completed domain count ${prepared.route}`);
    return completed.count ?? 0;
  }
  return result.count ?? 0;
}

async function domainRecord(prepared: Prepared): Promise<Row | null> {
  const table = prepared.route === "hearth.research_synthesis" ? "hearth_research_synthesis_results"
    : prepared.route === "visual.unified_plan" ? "unified_visual_plan_operations"
    : prepared.route === "visual.narrative_interpretation" ? "image_map_prompt_revisions"
    : prepared.route === "motion.broll_interpretation" ? "broll_prompt_revisions"
    : prepared.route === "hammer.transcript_cleanup" ? "hammer_transcript_cleanup_assist_results"
    : prepared.route === "shorts.discovery" ? "hammer_shorts_discoveries" : "quench_metadata_assist_results";
  const column = prepared.route === "shorts.discovery" ? "parent_workpiece_id" : "workpiece_id";
  let query = tongs.from(table).select("*").eq(column, prepared.fixture.workpieceId);
  if (prepared.route === "visual.unified_plan") query = query.eq("state", "verified");
  if (prepared.route === "shorts.discovery") query = query.eq("state", "completed");
  const result = await must(query.limit(1), `domain readback ${prepared.route}`);
  return rows(result.data)[0] ?? null;
}

function linkedDomainId(route: Route, resultJson: Row): string | null {
  if (["hearth.research_synthesis", "hammer.transcript_cleanup", "quench.metadata"].includes(route)) {
    return typeof resultJson.domain_result_id === "string" ? resultJson.domain_result_id : null;
  }
  if (route === "visual.unified_plan") return typeof resultJson.operation_id === "string" ? resultJson.operation_id : null;
  if (route === "shorts.discovery") {
    const discovery = row(row(resultJson.data).discovery);
    return typeof discovery.id === "string" ? discovery.id : null;
  }
  const promptRevision = row(resultJson.prompt_revision);
  return typeof promptRevision.id === "string" ? promptRevision.id : null;
}

let authorizationMismatch: Row | null = null;
async function runSimpleCase(route: Route, scenario: Scenario, recovery = false): Promise<void> {
  const prepared = await prepareSimple(route, scenario, recovery);
  current = { route, malformed: scenario === "validation_failure", operationId: prepared.operationId };
  if (scenario === "persistence_failure") {
    psql(`insert into forge_actual_certification.persistence_faults(route_code,workpiece_id) values('${route}','${prepared.fixture.workpieceId}') on conflict do nothing;`);
  }
  if (recovery) gate.failGenericPersist.add(prepared.reservationId);
  const endpoint = routeEndpoint(prepared);
  if (route === "visual.unified_plan" && scenario === "success" && !recovery && authorizationMismatch === null) {
    const denied = await endpointRequest(endpoint.path, prepared.body, endpoint.kind, ordinaryToken);
    assert.notEqual(denied.status, 200, "viewer authorization mismatch must be rejected");
    assert.equal(providerCalls.get(prepared.operationId) ?? 0, 0, "authorization mismatch must be rejected before provider execution");
    assert.equal(await domainCount(prepared), 0, "authorization mismatch must not persist a domain result");
    authorizationMismatch = { route, http_status: denied.status, provider_execution_count: 0, domain_result_count: 0 };
  }
  const first = await endpointRequest(endpoint.path, prepared.body, endpoint.kind);
  const firstDomainCount = await domainCount(prepared);
  const firstProviderCalls = providerCalls.get(prepared.operationId) ?? 0;
  if (scenario === "success" && !recovery) assert.equal(first.status, 200, `${route} success: ${JSON.stringify(first.payload)}`);
  if (scenario !== "success") assert.notEqual(first.status, 200, `${route} ${scenario} must fail`);
  if (scenario === "persistence_failure") psql(`delete from forge_actual_certification.persistence_faults where route_code='${route}' and workpiece_id='${prepared.fixture.workpieceId}';`);
  const replay = await endpointRequest(endpoint.path, prepared.body, endpoint.kind);
  const finalDomainCount = await domainCount(prepared);
  const finalProviderCalls = providerCalls.get(prepared.operationId) ?? 0;
  if (recovery) assert.equal(replay.status, 200, `${route} recovery replay: ${JSON.stringify(replay.payload)}`);
  if (scenario === "success" && !recovery) assert.equal(replay.status, 200, `${route} replay`);
  assert.equal(finalProviderCalls, 1, `${route} provider boundary count`);
  assert.equal(finalDomainCount, scenario === "validation_failure" || scenario === "persistence_failure" ? firstDomainCount : 1, `${route} domain persistence count`);
  const canonical = await domainRecord(prepared);
  const genericResults = await must(tongs.from("openai_text_test_certification_results").select("id,result_json").eq("reservation_id", prepared.reservationId), `billing result ${route}`);
  const billingResult = rows(genericResults.data)[0] ?? null;
  const settlements = await must(tongs.from("openai_text_test_certification_settlements").select("id,outcome,customer_charge_micros,failure_class").eq("reservation_id", prepared.reservationId), `settlement ${route}`);
  const settlement = rows(settlements.data)[0] ?? null;
  const expenses = await must(tongs.from("openai_text_test_certification_expenses").select("id,amount_micros,evidence_status,component_kind").eq("reservation_id", prepared.reservationId), `expense ${route}`);
  const expenseRows = rows(expenses.data);
  assert.ok(settlement, `${route} must reach an economic settlement`);
  assert.ok(expenseRows.length >= 1, `${route} must preserve its synthetic supplier expense`);
  assert.ok(expenseRows.every((expense) => expense.evidence_status === "synthetic_test"), `${route} expenses must remain synthetic Test evidence`);
  if (scenario === "success") {
    assert.ok(canonical && billingResult, `${route} success must have canonical and billing result records`);
    const resultJson = row(billingResult.result_json);
    const link = linkedDomainId(route, resultJson);
    if (route === "visual.unified_plan") assert.equal(link, prepared.operationId, `${route} settlement result must link the canonical operation`);
    else assert.equal(link, String(canonical.id), `${route} settlement result must link the exact canonical domain record`);
    assert.equal(number(settlement.customer_charge_micros), 10_000, `${route} successful Test charge`);
  } else {
    assert.equal(canonical, null, `${route} failure must not leave a usable domain result`);
    assert.equal(billingResult, null, `${route} failure must not persist a billable result`);
    assert.equal(number(settlement.customer_charge_micros), 0, `${route} failure customer relief`);
    assert.equal(settlement.outcome, "nonbillable_failure", `${route} failure outcome`);
  }
  matrix.push({
    route, scenario: recovery ? "post_persistence_recovery" : scenario,
    operation_id: prepared.operationId, reservation_id: prepared.reservationId,
    first_http_status: first.status, replay_http_status: replay.status,
    provider_execution_count: finalProviderCalls, domain_result_count: finalDomainCount,
    domain_record_id: canonical?.id ?? null, billing_result_id: billingResult?.id ?? null,
    settlement_id: settlement.id, customer_charge_micros: settlement.customer_charge_micros,
    failure_class: settlement.failure_class ?? null,
    supplier_expense_ids: expenseRows.map((expense) => expense.id),
    supplier_expense_micros: expenseRows.reduce((sum, expense) => sum + number(expense.amount_micros), 0),
    expense_evidence: "synthetic_test",
  });
}

let certificationCompleted = false;
try {
  const before = row(await rpc(tongs, "read_customer_test_billing", { p_user_id: BRAD_ID }));
  const beforeBalance = number(before.test_credit_balance);
  assert.ok(beforeBalance >= 14, "Brad's verified Test deposit must have at least fourteen credits");
  for (const route of ROUTES) {
    await runSimpleCase(route, "success");
    await runSimpleCase(route, "validation_failure");
    await runSimpleCase(route, "success", true);
    await runSimpleCase(route, "persistence_failure");
  }
  for (const batch of [primaryBatch, recoveryBatch]) {
    const closed = row(await rpc(tongs, "close_openai_text_test_certification", {
      p_batch_id: batch.id, p_actor_id: OPERATOR_ID,
      p_reason: "All fourteen actual-route Test operations are terminal; close new reservations",
    }));
    assert.equal(closed.state, "closed");
    assert.equal(closed.new_reservations_authorized, false);
  }

  const after = row(await rpc(tongs, "read_customer_test_billing", { p_user_id: BRAD_ID }));
  const afterBalance = number(after.test_credit_balance);
  const operationIds = matrix.map((entry) => String(entry.operation_id));
  const batchEvidence = [] as Row[];
  for (const batch of [primaryBatch, recoveryBatch]) {
    const evidence = row(await rpc(tongs, "read_openai_text_test_certification", { p_batch_id: batch.id }));
    const batchRows = rows(evidence.batches), operations = rows(evidence.operations), expenses = rows(evidence.expenses);
    assert.equal(evidence.environment, "test");
    assert.equal(evidence.live_provider_authorized, false);
    assert.equal(batchRows.length, 1); assert.equal(batchRows[0].status, "closed");
    assert.equal(operations.length, 14);
    assert.equal(operations.filter((operation) => operation.reservation_state === "settled").length, 7);
    assert.equal(operations.filter((operation) => operation.reservation_state === "released").length, 7);
    assert.equal(operations.filter((operation) => number(operation.provider_execution_count) === 1).length, 14);
    assert.equal(operations.reduce((sum, operation) => sum + number(operation.customer_charge_micros ?? 0), 0), 70_000);
    assert.equal(expenses.length, 28);
    assert.equal(expenses.filter((expense) => expense.component_kind === "direct_provider").length, 14);
    assert.equal(expenses.filter((expense) => expense.component_kind === "supporting").length, 14);
    assert.ok(expenses.every((expense) => expense.evidence_status === "synthetic_test"));
    batchEvidence.push({ batch_id: batch.id, status: "closed", operation_count: operations.length, settled: 7, released: 7, customer_debit_micros: 70_000, supplier_expense_count: expenses.length, supplier_expense_evidence: "synthetic_test" });
  }
  assert.equal(afterBalance, beforeBalance - 14);
  assert.equal(matrix.filter((entry) => number(entry.customer_charge_micros) === 10_000).length, 14);
  assert.equal(matrix.filter((entry) => number(entry.customer_charge_micros) === 0).length, 14);
  assert.ok(matrix.every((entry) => number(entry.provider_execution_count) === 1));

  const customerReceipts = rows(after.receipts).filter((receipt) => operationIds.includes(String(receipt.operation_id)));
  assert.equal(customerReceipts.length, 28, "customer Test view must contain every success and relieved failure receipt");
  assert.equal(customerReceipts.filter((receipt) => number(receipt.customer_charge_micros) === 10_000).length, 14);
  assert.equal(customerReceipts.filter((receipt) => number(receipt.customer_charge_micros) === 0).length, 14);
  const customerJson = JSON.stringify(customerReceipts);
  assert.ok(!/markup|wholesale|contribution|supplier_expense|provider_cost/i.test(customerJson), "customer receipts must not disclose private pricing or supplier costs");

  const operatorClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const operatorSignIn = await operatorClient.auth.signInWithPassword({ email: "jschramer@gmail.com", password });
  if (operatorSignIn.error) throw operatorSignIn.error;
  const operatorRead = await (operatorClient.schema("tongs") as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc("read_openai_text_test_certification", { p_batch_id: primaryBatch.id });
  assert.equal(row(operatorRead.data).environment, "test", "authenticated platform operator reads private synthetic costs");
  const ordinaryRead = await (ordinaryClient.schema("tongs") as unknown as { rpc(name: string, args?: Row): Promise<RpcResult> }).rpc("read_openai_text_test_certification", { p_batch_id: primaryBatch.id });
  assert.ok(ordinaryRead.error, "ordinary workspace viewer cannot read private Test costs");
  const ordinaryDomainRead = await ordinaryClient.schema("tongs").from("hearth_research_synthesis_results").select("id").limit(1);
  assert.ok(ordinaryDomainRead.error || ordinaryDomainRead.data.length === 0, "service-only paid domain result tables remain private");

  const liveEvents = await must(tongs.from("accounting_journal_events").select("id", { count: "exact", head: true }).eq("environment", "live").in("source_id", operationIds), "Live accounting isolation");
  assert.equal(liveEvents.count ?? 0, 0);
  const testEvents = await must(tongs.from("accounting_journal_events").select("id", { count: "exact", head: true }).eq("environment", "test").in("source_id", operationIds), "Test accounting events");
  assert.equal(testEvents.count ?? 0, 14);

  await must(tongs.from("episodes").update({ lifecycle_state: "archived", archived_at: new Date().toISOString(), archived_by: BRAD_ID, archive_reason: "isolated actual-route billing certification" }).eq("creation_origin", "isolated_actual_route_certification"), "archive isolated Test workpieces");
  const activeFixtures = await must(tongs.from("episodes").select("id", { count: "exact", head: true }).eq("creation_origin", "isolated_actual_route_certification").eq("lifecycle_state", "active"), "active Test fixture check");
  assert.equal(activeFixtures.count ?? 0, 0, "Test workpieces must not remain active or publishable");

  certificationCompleted = true;
  process.stdout.write(`${JSON.stringify({
    ok: true,
    certification_environment: "isolated local application deployment with isolated Supabase database",
    source_revision: spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim(),
    primary_batch_id: primaryBatch.id, recovery_batch_id: recoveryBatch.id,
    before_test_credit_balance: beforeBalance, after_test_credit_balance: afterBalance,
    aggregate_customer_debit_micros: 140_000, successful_settlements: 14,
    zero_charge_failures: 14, duplicate_replays_verified: 28,
    provider_simulations: 28, real_provider_calls: 0, live_accounting_events: 0,
    authorization_mismatch: authorizationMismatch,
    authorizations: batchEvidence,
    customer_receipt_count: customerReceipts.length,
    test_workpieces_archived: true,
    matrix,
  }, null, 2)}\n`);
} finally {
  if (certificationCompleted) psql("drop schema if exists forge_actual_certification cascade;");
  await Promise.all([hammerServer, isolatedTongs.server, isolatedHearth.server].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
}
