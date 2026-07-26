import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createTongsCommitService } from "../packages/tongs/src/workpiece-commit-api.ts";
import { repairEntriesAgainstApprovedScript } from "../packages/tongs/src/image-map-anchor-authority.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localEnv(): Record<string, string> {
  const raw = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .flatMap((line) => {
        const m = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
        return m ? [[m[1], m[2]]] : [];
      }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

async function main() {
  const env = localEnv();
  const apiUrl = env.API_URL;
  const anonKey = env.ANON_KEY;
  const serviceRoleKey = env.SERVICE_ROLE_KEY;
  assert(apiUrl && anonKey && serviceRoleKey, "Missing local Supabase env vars");
  assert(new URL(apiUrl).hostname === "127.0.0.1", "Non-local Supabase endpoint refused");

  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const service = createTongsCommitService({
    supabaseUrl: apiUrl,
    supabaseServiceRoleKey: serviceRoleKey,
  });

  const freshService = () =>
    createTongsCommitService({
      supabaseUrl: apiUrl,
      supabaseServiceRoleKey: serviceRoleKey,
    });

  const suffix = crypto.randomUUID();
  const email = `authority-e2e-${suffix}@example.invalid`;
  const password = `Authority-${crypto.randomUUID()}!`;

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user, `create user failed: ${created.error?.message}`);
  const ownerId = created.data.user.id;

  const owner = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await owner.auth.signInWithPassword({ email, password });
  assert(!signIn.error && signIn.data.session, `sign in failed: ${signIn.error?.message}`);
  const token = signIn.data.session.access_token;

  const ws = await owner.schema("tongs").rpc("create_workspace_with_owner", { _name: `Authority E2E ${Date.now()}` });
  assert(!ws.error && Array.isArray(ws.data) && ws.data[0]?.id, `workspace create failed: ${ws.error?.message}`);
  const workspaceId = ws.data[0].id as string;

  const cradle = await service.createCradle({
    workspace_id: workspaceId,
    metadata: { title: "Authority E2E Workpiece", origin: { created_from: "authority-e2e" } },
    written_by: { tool: "hearth", tool_version: "0.0.0", lane: "forge-managed" },
    origin_tool: { name: "hearth", version: "0.0.0" },
    correlation_id: `authority-e2e:${suffix}`,
  });
  const workpieceId = cradle.cradle.id;

  const writer = { tool: "hearth", tool_version: "0.0.0", lane: "forge-managed" } as const;

  const scriptA = ["[s1]", "The orange vanished at dawn.", "The harbor lights flickered twice.", "[/s1]"].join("\n");
  const scriptACommit = await service.commitFile(workpieceId, {
    path: "script/script.md",
    content_type: "text/markdown; charset=utf-8",
    text: scriptA,
    written_by: writer,
    user_access_token: token,
    event_name: "hearth.script.edited.v1",
    correlation_id: `authority-e2e:scriptA:${suffix}`,
  });

  const opApproveA = `forge:script-approval:e2e:approveA:${suffix.slice(0, 12)}`;
  const approvalAResult = await service.commitCanonicalScriptApproval(workpieceId, {
    workspace_id: workspaceId,
    expected_current_revision: 0,
    creator_version_label: "A-v1",
    operation_id: opApproveA,
  }, { userAccessToken: token });
  assert(approvalAResult.disposition === "committed", "approval A not committed");

  const approvalA = isRecord(approvalAResult.approval) ? approvalAResult.approval : null;
  assert(approvalA, "approval A payload missing");

  const receiptA = await admin.schema("tongs").from("hearth_authority_operation_receipts")
    .select("operation_id,operation_fingerprint,mutation_kind,immutable_result_json")
    .eq("operation_id", opApproveA).single();
  assert(!receiptA.error && receiptA.data, `approval receipt fetch failed: ${receiptA.error?.message}`);

  const projectionA = await freshService().getCanonicalScriptApproval(workpieceId, { userAccessToken: token });

  await service.commitFile(workpieceId, {
    path: "notes/milestone.md",
    content_type: "text/markdown; charset=utf-8",
    text: "non-authority milestone note",
    written_by: writer,
    user_access_token: token,
    event_name: "hearth.note.saved.v1",
    correlation_id: `authority-e2e:milestone:${suffix}`,
  });
  const projectionAfterNote = await freshService().getCanonicalScriptApproval(workpieceId, { userAccessToken: token });

  const replaySameOp = await service.commitCanonicalScriptApproval(workpieceId, {
    workspace_id: workspaceId,
    expected_current_revision: 1,
    creator_version_label: "A-v1",
    operation_id: opApproveA,
  }, { userAccessToken: token });

  const opApproveANoChange = `forge:script-approval:e2e:approveA-nochange:${suffix.slice(0, 12)}`;
  const noChangeApproval = await service.commitCanonicalScriptApproval(workpieceId, {
    workspace_id: workspaceId,
    expected_current_revision: 1,
    creator_version_label: "A-v1",
    operation_id: opApproveANoChange,
  }, { userAccessToken: token });

  const opIdentityConflict = await service.commitCanonicalScriptApproval(workpieceId, {
    workspace_id: workspaceId,
    expected_current_revision: 0,
    creator_version_label: "A-v1",
    operation_id: opApproveA,
  }, { userAccessToken: token });

  const scriptSeqAfterB = await admin.schema("tongs").from("workpiece_script_approval_sequences")
    .select("current_revision,current_approval_id")
    .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).single();

  const scriptReceiptsCount = await admin.schema("tongs").from("hearth_authority_operation_receipts")
    .select("operation_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).eq("mutation_kind", "commit_script_approval");

  const entries = [
    {
      id: "moment-preserved",
      anchor: "The orange vanished at dawn.",
      script_anchor: {
        section_id: "s1", paragraph_id: "s1:p1", paragraph_order: 1,
        sentence_start: 1, sentence_end: 1, char_start: 0, char_end: 27,
        span_text: "The orange vanished at dawn.", speaker_block_id: "s1",
      },
      beat_anchor: null, anchor_scope: "attached",
      description: "Preserved anchor visual.", visual_intent: "Preserved anchor visual.", prompt_basis: "Preserved anchor visual.",
      style_preset: "photographic", intent: "cutaway", source_type: "ai", beat_order: 1, paragraph_beat_order: 1,
      candidate_assets: [{ asset_id: "asset-preserved-a", path: "assets/image-map/candidates/preserved-a.png", variant_label: "explainer", visual_mode: "illustrative", mime_type: "image/png" }],
      selected_asset_id: "asset-preserved-a", status: "selected", placement_hint: null,
    },
    {
      id: "moment-removed",
      anchor: "The harbor lights flickered twice.",
      script_anchor: {
        section_id: "s1", paragraph_id: "s1:p1", paragraph_order: 1,
        sentence_start: 2, sentence_end: 2, char_start: 28, char_end: 61,
        span_text: "The harbor lights flickered twice.", speaker_block_id: "s1",
      },
      beat_anchor: null, anchor_scope: "attached",
      description: "Anchor that will become stale.", visual_intent: "Anchor that will become stale.", prompt_basis: "Anchor that will become stale.",
      style_preset: "documentary", intent: "cutaway", source_type: "upload", beat_order: 2, paragraph_beat_order: 2,
      candidate_assets: [{ asset_id: "asset-removed-a", path: "assets/image-map/candidates/removed-a.png", variant_label: "explainer", visual_mode: "illustrative", mime_type: "image/png" }],
      selected_asset_id: "asset-removed-a", status: "selected", placement_hint: null,
    },
  ];

  const bootstrapDoc = {
    schema: "forge.image-map-authority.v1",
    entries: entries.map((entry) => ({
      ...entry,
      canonical_anchor_assessment: {
        state: "provenance_unknown",
        reason: "source_provenance_unknown",
        exact_anchor: null,
        evidence: { match_count: null, assessed_contract_version: "forge.image-map-anchor.v1" },
      },
    })),
  };
  const opBootstrap = `forge:image-map:e2e:bootstrap:${suffix.slice(0, 12)}`;
  const bootstrap = await admin.schema("tongs").rpc("commit_image_map_revision", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_expected_current_revision: 0,
    p_expected_current_revision_id: null,
    p_target_script_approval_id: null,
    p_anchor_contract_version: "forge.image-map-anchor.v1",
    p_document_json: bootstrapDoc,
    p_mutation_kind: "commit_image_map",
    p_affected_entry_ids: entries.map((entry) => String(entry.id)),
    p_normalized_mutation_inputs: {},
    p_operation_contract_version: "forge.image-map-operation.v1",
    p_operation_id: opBootstrap,
    p_actor_id: ownerId,
  });
  assert(!bootstrap.error && bootstrap.data, `image-map bootstrap failed: ${bootstrap.error?.message}`);

  const opRepairA = `forge:image-map:e2e:repairA:${suffix.slice(0, 12)}`;
  const repairedA = await service.repairWorkpieceImageMap(workpieceId, { workspace_id: workspaceId, operation_id: opRepairA }, { userAccessToken: token });
  const canonicalAfterA = await freshService().getWorkpieceImageMap(workpieceId, { userAccessToken: token });

  const scriptB = ["[s1]", "The orange vanished at dawn.", "The bay was silent under rain.", "[/s1]"].join("\n");
  const scriptBCommit = await service.commitFile(workpieceId, {
    path: "script/script.md", content_type: "text/markdown; charset=utf-8", text: scriptB,
    written_by: writer, user_access_token: token, event_name: "hearth.script.edited.v1",
    correlation_id: `authority-e2e:scriptB:${suffix}`,
  });

  const opApproveB = `forge:script-approval:e2e:approveB:${suffix.slice(0, 12)}`;
  const approvalBResult = await service.commitCanonicalScriptApproval(workpieceId, {
    workspace_id: workspaceId,
    expected_current_revision: 1,
    creator_version_label: "B-v1",
    operation_id: opApproveB,
  }, { userAccessToken: token });
  assert(approvalBResult.disposition === "committed", "approval B not committed");
  const approvalB = isRecord(approvalBResult.approval) ? approvalBResult.approval : null;
  assert(approvalB, "approval B payload missing");

  const approvalRows = await admin.schema("tongs").from("script_approval_revisions")
    .select("id,approval_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,source_file_revision,created_at")
    .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).order("approval_revision", { ascending: true });

  const mapBeforeRepairB = await freshService().getWorkpieceImageMap(workpieceId, { userAccessToken: token });

  const opRepairB = `forge:image-map:e2e:repairB:${suffix.slice(0, 12)}`;
  const repairedB = await service.repairWorkpieceImageMap(workpieceId, { workspace_id: workspaceId, operation_id: opRepairB }, { userAccessToken: token });
  const mapAfterRepairB = await freshService().getWorkpieceImageMap(workpieceId, { userAccessToken: token });

  const replayRepairSameOp = await service.repairWorkpieceImageMap(workpieceId, { workspace_id: workspaceId, operation_id: opRepairB }, { userAccessToken: token });

  const opRepairBNoChange = `forge:image-map:e2e:repairB-nochange:${suffix.slice(0, 12)}`;
  const replayRepairNewOp = await service.repairWorkpieceImageMap(workpieceId, { workspace_id: workspaceId, operation_id: opRepairBNoChange }, { userAccessToken: token });

  const conflictReuse = await admin.schema("tongs").rpc("commit_image_map_revision", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_expected_current_revision: 0,
    p_expected_current_revision_id: null,
    p_target_script_approval_id: (approvalB as Record<string, unknown>).id,
    p_anchor_contract_version: "forge.image-map-anchor.v1",
    p_document_json: { schema: "forge.image-map-authority.v1", entries: [] },
    p_mutation_kind: "reapply_visual_plan",
    p_affected_entry_ids: [],
    p_normalized_mutation_inputs: { altered: true },
    p_operation_contract_version: "forge.image-map-operation.v1",
    p_operation_id: opRepairB,
    p_actor_id: ownerId,
  });

  const unresolved = mapAfterRepairB.image_map.entries.find((entry: any) => entry.id === "moment-removed");
  assert(unresolved, "moment-removed missing");

  const paragraphText = "The orange vanished at dawn. The bay was silent under rain.";
  const manualSpan = "The bay was silent under rain.";
  const charStart = paragraphText.indexOf(manualSpan);
  assert(charStart >= 0, "manual span not found");

  const opManual = `forge:image-map:e2e:manual:${suffix.slice(0, 12)}`;
  const manualResolved = await service.resolveWorkpieceImageMapManualAnchor(workpieceId, {
    workspace_id: workspaceId,
    operation_id: opManual,
    entry_id: "moment-removed",
    script_anchor: {
      section_id: "s1", paragraph_id: "s1:p1", paragraph_order: 1,
      sentence_start: 2, sentence_end: 2,
      char_start: charStart, char_end: charStart + manualSpan.length,
      span_text: manualSpan, speaker_block_id: "s1",
    },
  }, { userAccessToken: token });

  const manualFresh = await freshService().getWorkpieceImageMap(workpieceId, { userAccessToken: token });

  const reassessedEntries = repairEntriesAgainstApprovedScript(manualFresh.image_map.entries as unknown as Array<Record<string, unknown>>, scriptB);

  const seqBefore = await admin.schema("tongs").from("workpiece_image_map_sequences")
    .select("current_revision,current_revision_id")
    .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).single();
  assert(!seqBefore.error && seqBefore.data, `sequence before reapply failed: ${seqBefore.error?.message}`);

  const opReapply = `forge:image-map:e2e:reapply:${suffix.slice(0, 12)}`;
  const reapply = await admin.schema("tongs").rpc("commit_image_map_revision", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_expected_current_revision: seqBefore.data.current_revision,
    p_expected_current_revision_id: seqBefore.data.current_revision_id,
    p_target_script_approval_id: (approvalB as Record<string, unknown>).id,
    p_anchor_contract_version: "forge.image-map-anchor.v1",
    p_document_json: { schema: "forge.image-map-authority.v1", entries: reassessedEntries },
    p_mutation_kind: "reapply_visual_plan",
    p_affected_entry_ids: reassessedEntries.map((entry) => String(entry.id)),
    p_normalized_mutation_inputs: { mode: "reassess_all_entries" },
    p_operation_contract_version: "forge.image-map-operation.v1",
    p_operation_id: opReapply,
    p_actor_id: ownerId,
  });
  assert(!reapply.error && reapply.data, `reapply rpc failed: ${reapply.error?.message}`);

  const seqAfterReapply = await admin.schema("tongs").from("workpiece_image_map_sequences")
    .select("current_revision,current_revision_id")
    .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).single();
  assert(!seqAfterReapply.error && seqAfterReapply.data, `sequence after reapply failed: ${seqAfterReapply.error?.message}`);

  const opRegenerate = `forge:image-map:e2e:regen:${suffix.slice(0, 12)}`;
  const regenerate = await admin.schema("tongs").rpc("commit_image_map_revision", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_expected_current_revision: seqAfterReapply.data.current_revision,
    p_expected_current_revision_id: seqAfterReapply.data.current_revision_id,
    p_target_script_approval_id: (approvalB as Record<string, unknown>).id,
    p_anchor_contract_version: "forge.image-map-anchor.v1",
    p_document_json: { schema: "forge.image-map-authority.v1", entries: reassessedEntries },
    p_mutation_kind: "regenerate_from_approved_script",
    p_affected_entry_ids: reassessedEntries.map((entry) => String(entry.id)),
    p_normalized_mutation_inputs: {
      source_approval_id: (approvalB as Record<string, unknown>).id,
      source_script_hash: (approvalB as Record<string, unknown>).script_content_hash,
      preserve_history: true,
    },
    p_operation_contract_version: "forge.image-map-operation.v1",
    p_operation_id: opRegenerate,
    p_actor_id: ownerId,
  });
  assert(!regenerate.error && regenerate.data, `regenerate rpc failed: ${regenerate.error?.message}`);

  const finalMap = await freshService().getWorkpieceImageMap(workpieceId, { userAccessToken: token });

  const opReceipts = await admin.schema("tongs").from("hearth_authority_operation_receipts")
    .select("operation_id,operation_fingerprint,mutation_kind,target_script_approval_id,target_script_approval_revision,immutable_result_json")
    .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId)
    .order("created_at", { ascending: true });

  const disallowedEvents = await admin.schema("tongs").from("workpiece_events")
    .select("event_name").eq("workpiece_id", workpieceId)
    .or("event_name.ilike.%image_map.candidate.generated%,event_name.ilike.%broll%,event_name.ilike.%hammer%,event_name.ilike.%quench%,event_name.ilike.%experiment%");

  const aiUsage = await admin.schema("tongs").from("ai_usage_events").select("id").eq("workpiece_id", workpieceId);

  const cleanup = {
    mode: "external_privileged_cleanup_required",
    reason: "authority revision immutability prevents ordinary cascade deletion",
  };

  const output = {
    local_db_url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ids: { workspaceId, workpieceId, ownerId, opApproveA, opApproveANoChange, opApproveB, opBootstrap, opRepairA, opRepairB, opRepairBNoChange, opManual, opReapply, opRegenerate },
    phase_a: { approvalAResult, projectionA, projectionAfterNote, milestone_note_non_authority: JSON.stringify(projectionA) === JSON.stringify(projectionAfterNote), scriptAFileRevision: scriptACommit.file_row.revision, receiptA: receiptA.data },
    phase_b: { replaySameOp, same_op_returns_same_result: JSON.stringify(replaySameOp) === JSON.stringify(approvalAResult), noChangeApproval, opIdentityConflict, scriptSeqAfterB: scriptSeqAfterB.data, scriptReceiptCount: scriptReceiptsCount.count ?? null },
    phase_c: { bootstrap: bootstrap.data, repairedA, canonicalAfterA },
    phase_d: { scriptBFileRevision: scriptBCommit.file_row.revision, approvalBResult, approvalRows: approvalRows.data, mapBeforeRepairB, stale_or_update_required: readString((mapBeforeRepairB.image_map as Record<string, unknown>).source_script_approval_id) !== readString((approvalB as Record<string, unknown>).id) },
    phase_e: { repairedB, mapAfterRepairB, preserved_entry: mapAfterRepairB.image_map.entries.find((entry: any) => entry.id === "moment-preserved"), removed_entry: mapAfterRepairB.image_map.entries.find((entry: any) => entry.id === "moment-removed"), disallowed_event_count: disallowedEvents.data?.length ?? 0, ai_usage_count: aiUsage.data?.length ?? 0 },
    phase_f: { replayRepairSameOp, replayRepairNewOp, conflictReuse: conflictReuse.data },
    phase_g: { manualResolved, manualFresh, resolved_entry: manualFresh.image_map.entries.find((entry: any) => entry.id === "moment-removed") },
    phase_h: { reapply: reapply.data, regenerate: regenerate.data, finalMap, operationReceipts: opReceipts.data },
    cleanup,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("authority_e2e_proof_failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});