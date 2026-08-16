import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";
import { validateCanonicalVisualTimelineArtifact } from "../src/persistence/hammerRecordingRevisionPersistence";
import {
  isHammerAuthorityTokenCurrent,
  issueHammerAuthorityToken,
  persistHammerCanonicalSave,
  reconcileHammerWorkpieceAcknowledgement,
  resolveHammerVisualHydrationAuthority,
  type HammerAsyncResponseLane,
} from "../src/persistence/hammerVisualAuthority";

function snapshot(clipCount: number, marker: string): HammerPersistenceSnapshot {
  const artifact = (data: unknown, path: string | null = null) => ({ path, updated_at: null, data });
  return {
    schema_version: 1,
    state: {
      workspace_id: "workspace", workpiece_id: "workpiece", active_session_id: "session",
      current_pass: "transcript_cleanup", pass_order_version: 1, pass_status: {}, editor_session_path: "revision/editor",
      transcript_artifact_path: "revision/transcript", transcript_versions_artifact_path: null,
      speaker_map_artifact_path: null, visual_placement_artifact_path: `revision/${marker}/placements`,
      visual_timeline_artifact_path: `revision/${marker}/timeline`, audio_polish_artifact_path: null,
      edit_plan_artifact_path: null, editorial_authority_artifact_path: null, edit_plan_signature: null,
      prep_status: "prepared", alignment_status: "aligned", macro_recipe_ref: null, last_macro_run_ref: null,
      last_opened_at: "2026-08-15T00:00:00.000Z", updated_at: "2026-08-15T00:00:00.000Z", updated_by: marker,
    },
    editor_session: artifact(null, "revision/editor"), structured_transcript: artifact(null, "revision/transcript"),
    transcript_version_registry: artifact(null), speaker_map: artifact(null),
    visual_placements: artifact({ schema_version: 1, placements: Array.from({ length: clipCount }, (_, i) => ({ id: `${marker}-p${i}` })) }, `revision/${marker}/placements`) as any,
    visual_timeline: artifact({ schema_version: 2, version: 2, revision: 1, updated_at: "2026-08-15T00:00:00.000Z", assets: [], clips: Array.from({ length: clipCount }, (_, i) => ({ id: `${marker}-c${i}` })), lanes: [] }, `revision/${marker}/timeline`) as any,
    audio_polish: artifact(null), edit_plan: artifact(null), editorial_authority: artifact(null),
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  } as HammerPersistenceSnapshot;
}

test("legacy workpiece acknowledgement cannot downgrade a canonical 30-clip revision", () => {
  const canonical = snapshot(30, "canonical");
  const legacy = snapshot(18, "legacy");
  legacy.state!.current_pass = "visual_assembly";
  const reconciled = reconcileHammerWorkpieceAcknowledgement({
    canonicalSnapshot: canonical,
    response: legacy,
    revision: {
      id: "revision", workspace_id: "workspace", workpiece_id: "workpiece", canonical_recording_id: "recording",
      status: "active", label: null, editor_session_path: "revision/editor", revision_transcript_path: "revision/transcript",
      audio_polish_path: null, visual_timeline_path: "revision/canonical/timeline", visual_placements_path: "revision/canonical/placements",
      history_path: null, snapshots_manifest_path: null,
    },
    revisionRequest: {
      visual_timeline: { data: canonical.visual_timeline.data },
      visual_placements: { data: canonical.visual_placements.data },
    },
    persistenceRequest: { active_session_id: "session", last_opened_at: "2026-08-15T00:00:00.000Z" },
  });
  assert.equal(reconciled.visual_timeline.data?.clips.length, 30);
  assert.equal(reconciled.visual_placements.data?.placements.length, 30);
  assert.equal(reconciled.state?.current_pass, "visual_assembly");
  assert.equal(reconciled.state?.visual_timeline_artifact_path, "revision/canonical/timeline");
});

test("legacy fallback requires positive absence and failures never downgrade", () => {
  const legacy = snapshot(18, "legacy").visual_placements.data;
  assert.equal(resolveHammerVisualHydrationAuthority({ pointer: null, pointerLookup: { status: "absent" }, standardPathLookup: { status: "absent" }, legacyPlacements: legacy }).source, "legacy");
  for (const classification of ["missing", "unreadable", "unauthorized", "invalid"] as const) {
    const result = resolveHammerVisualHydrationAuthority({ pointer: "canonical", pointerLookup: { status: "failure", classification }, standardPathLookup: { status: "absent" }, legacyPlacements: legacy });
    assert.deepEqual(result, { source: "failure", classification });
  }
});

test("malformed and schema-invalid canonical artifacts are classified failures", () => {
  assert.deepEqual(validateCanonicalVisualTimelineArtifact("{not-json"), {
    ok: false, classification: "malformed_json", error: "Canonical visual timeline JSON must be an object.",
  });
  const invalid = validateCanonicalVisualTimelineArtifact({ version: 2, source_mode: "packaging", revision: 1, updated_at: "now", assets: [], lanes: [], clips: "invalid" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.classification, "schema_invalid");
});

test("typed response lanes do not invalidate each other", () => {
  const lanes: Record<HammerAsyncResponseLane, number> = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
  const identity = { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 4 };
  const revision = issueHammerAuthorityToken({ identity, lane: "revision_mutation", laneSequences: lanes, saveAttemptId: "save" });
  issueHammerAuthorityToken({ identity, lane: "workpiece_reconciliation", laneSequences: lanes, saveAttemptId: "save" });
  assert.equal(isHammerAuthorityTokenCurrent({ token: revision, identity, laneSequences: lanes, saveAttemptId: "save" }), true);
  issueHammerAuthorityToken({ identity, lane: "revision_mutation", laneSequences: lanes, saveAttemptId: "newer" });
  assert.equal(isHammerAuthorityTokenCurrent({ token: revision, identity, laneSequences: lanes, saveAttemptId: "save" }), false);
});

test("every lane supersedes itself without crossing another lane", () => {
  const lanes: Record<HammerAsyncResponseLane, number> = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
  const identity = { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 4 };
  for (const lane of Object.keys(lanes) as HammerAsyncResponseLane[]) {
    const older = issueHammerAuthorityToken({ identity, lane, laneSequences: lanes });
    const otherLane = lane === "canonical_hydration" ? "workpiece_reconciliation" : "canonical_hydration";
    issueHammerAuthorityToken({ identity, lane: otherLane, laneSequences: lanes });
    assert.equal(isHammerAuthorityTokenCurrent({ token: older, identity, laneSequences: lanes }), true);
    issueHammerAuthorityToken({ identity, lane, laneSequences: lanes });
    assert.equal(isHammerAuthorityTokenCurrent({ token: older, identity, laneSequences: lanes }), false);
  }
});

test("foreign identity and previous editor generation responses are rejected", () => {
  const lanes: Record<HammerAsyncResponseLane, number> = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
  const identity = { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 4 };
  const token = issueHammerAuthorityToken({ identity, lane: "revision_mutation", laneSequences: lanes });
  for (const foreign of [
    { ...identity, workspaceId: "other-workspace" },
    { ...identity, workpieceId: "other-workpiece" },
    { ...identity, revisionId: "other-revision" },
    { ...identity, editorGeneration: 5 },
  ]) assert.equal(isHammerAuthorityTokenCurrent({ token, identity: foreign, laneSequences: lanes }), false);
});

test("workpiece allowlist reconciles sentinels and ignores future visual fields", () => {
  const canonical = snapshot(30, "canonical");
  const response = snapshot(18, "response");
  Object.assign(response.state!, {
    active_session_id: "allow-session", current_pass: "visual_assembly", pass_order_version: 91,
    pass_status: { visual_assembly: { status: "completed" } }, transcript_versions_artifact_path: "allow-versions",
    edit_plan_artifact_path: "allow-edit-plan", editorial_authority_artifact_path: "allow-authority",
    edit_plan_signature: "allow-signature", prep_status: "prepared", alignment_status: "aligned",
    macro_recipe_ref: "allow-recipe", last_macro_run_ref: "allow-run", last_opened_at: "2026-08-15T01:00:00.000Z",
    updated_at: "2026-08-15T01:01:00.000Z", updated_by: "allow-writer",
  });
  response.transcript_version_registry = { path: "allow-versions", updated_at: "v", data: { schema_version: 1, versions: [] } } as any;
  response.edit_plan = { path: "allow-edit-plan", updated_at: "e", data: { sentinel: "edit" } } as any;
  response.editorial_authority = { path: "allow-authority", updated_at: "a", data: { sentinel: "authority" } } as any;
  response.macro_hooks = { recipe_ref: "allow-recipe", last_run_ref: "allow-run" };
  (response as any).future_visual_authority = { clips: 1_000 };
  const revision = {
    id: "revision", workspace_id: "workspace", workpiece_id: "workpiece", canonical_recording_id: "recording", status: "active" as const,
    label: null, editor_session_path: "canonical-editor", revision_transcript_path: "canonical-transcript", audio_polish_path: "canonical-audio",
    visual_timeline_path: "canonical-timeline", visual_placements_path: "canonical-placements", history_path: null, snapshots_manifest_path: null,
  };
  const result = reconcileHammerWorkpieceAcknowledgement({ canonicalSnapshot: canonical, response, revision, revisionRequest: {}, persistenceRequest: {} });
  for (const [key, value] of Object.entries(response.state!)) {
    if (["workspace_id", "workpiece_id", "editor_session_path", "transcript_artifact_path", "speaker_map_artifact_path", "visual_placement_artifact_path", "visual_timeline_artifact_path", "audio_polish_artifact_path"].includes(key)) continue;
    assert.deepEqual((result.state as any)[key], value, `allowlisted state field ${key}`);
  }
  assert.equal(result.visual_timeline.data?.clips.length, 30);
  assert.equal((result as any).future_visual_authority, undefined);
});

test("all autosave acknowledgement branches reconcile instead of installing workpiece snapshots", () => {
  const source = readFileSync(new URL("../src/editor/HammerWorkspaceEditor.tsx", import.meta.url), "utf8");
  const autosave = source.slice(source.indexOf("const queueRevisionAutosave"), source.indexOf("const handleWorkspaceSnapshotChange"));
  const lifecycle = source.slice(source.indexOf("const flushPendingSave"), source.indexOf("const onVisibilityChange"));
  assert.equal((autosave.match(/persistHammerCanonicalSave/g) ?? []).length, 1);
  assert.equal((autosave.match(/setLoadedPersistenceSnapshot\(result\.snapshot\)/g) ?? []).length, 1);
  assert.equal(lifecycle.includes("setLoadedPersistenceSnapshot(persistenceResult.data)"), false);
  assert.equal(lifecycle.includes("persistHammerCanonicalSave"), true);
});

test("one canonical save performs exactly one revision write and one workpiece write", async () => {
  const canonical = snapshot(30, "canonical");
  const legacy = snapshot(18, "legacy");
  const revision = {
    id: "revision", workspace_id: "workspace", workpiece_id: "workpiece", canonical_recording_id: "recording",
    status: "active" as const, label: null, editor_session_path: "revision/editor", revision_transcript_path: "revision/transcript",
    audio_polish_path: null, visual_timeline_path: "revision/canonical/timeline", visual_placements_path: "revision/canonical/placements",
    history_path: null, snapshots_manifest_path: null,
  };
  let revisionWrites = 0;
  let workpieceWrites = 0;
  const lanes: Record<HammerAsyncResponseLane, number> = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
  const identity = { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 1 };
  const result = await persistHammerCanonicalSave({
    target: { workspaceId: "workspace", workpieceId: "workpiece" }, revisionId: "revision",
    revisionRequest: { visual_timeline: { data: canonical.visual_timeline.data }, visual_placements: { data: canonical.visual_placements.data } },
    persistenceRequest: { written_by: { tool: "hammer", tool_version: "test", lane: "test" } }, canonicalSnapshot: canonical,
    identity, currentIdentity: () => identity, laneSequences: lanes,
    adapters: {
      saveRevision: async () => { revisionWrites += 1; return { ok: true, status: 200, data: { revision } }; },
      saveWorkpiece: async () => { workpieceWrites += 1; return { ok: true, status: 200, data: legacy }; },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(revisionWrites, 1);
  assert.equal(workpieceWrites, 1);
  if (result.ok) assert.equal(result.snapshot.visual_timeline.data?.clips.length, 30);
});

test("lifecycle flush supersedes an active revision mutation", async () => {
  const canonical = snapshot(30, "canonical");
  const identity = { workspaceId: "workspace", workpieceId: "workpiece", revisionId: "revision", editorGeneration: 1 };
  const lanes: Record<HammerAsyncResponseLane, number> = { canonical_hydration: 0, revision_mutation: 0, workpiece_reconciliation: 0, lifecycle_flush: 0 };
  const revision = {
    id: "revision", workspace_id: "workspace", workpiece_id: "workpiece", canonical_recording_id: "recording", status: "active" as const,
    label: null, editor_session_path: null, revision_transcript_path: null, audio_polish_path: null,
    visual_timeline_path: "timeline", visual_placements_path: "placements", history_path: null, snapshots_manifest_path: null,
  };
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let revisionCall = 0;
  const saveRevision = async () => {
    revisionCall += 1;
    if (revisionCall === 1) await firstBlocked;
    return { ok: true as const, status: 200, data: { revision } };
  };
  const saveWorkpiece = async () => ({ ok: true as const, status: 200, data: canonical });
  const common = {
    target: { workspaceId: "workspace", workpieceId: "workpiece" }, revisionId: "revision", revisionRequest: {},
    persistenceRequest: { written_by: { tool: "hammer", tool_version: "test", lane: "test" } }, canonicalSnapshot: canonical,
    identity, currentIdentity: () => identity, laneSequences: lanes, adapters: { saveRevision, saveWorkpiece },
  };
  const active = persistHammerCanonicalSave(common);
  const flush = persistHammerCanonicalSave({ ...common, lifecycleFlush: true });
  const flushResult = await flush;
  releaseFirst();
  const activeResult = await active;
  assert.equal(flushResult.ok, true);
  assert.equal(activeResult.ok, false);
  assert.equal("stale" in activeResult && activeResult.stale, true);
});
