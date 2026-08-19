import type {
  HammerPersistenceSaveRequest,
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "./hammerPersistenceContract";
import type { HammerRecordingRevisionRecord } from "./hammerRecordingRevisionPersistence";
import { saveHammerRecordingRevision } from "./hammerRecordingRevisionPersistence";
import { saveHammerPersistenceSnapshot } from "./hammerPersistence";
import { persistHammerRevisionEditorialAuthority } from "./hammerRevisionEditorialAuthorityWriter";
import {
  areHammerAuthorityGraphsSemanticallyEqual,
  selectChangedHammerRevisionArtifacts,
  type HammerRevisionAutosaveArtifacts,
} from "./hammerAutosaveQuiescence";

export type HammerAsyncResponseLane =
  | "canonical_hydration"
  | "revision_mutation"
  | "workpiece_reconciliation"
  | "lifecycle_flush";

export type HammerAuthorityIdentity = {
  workspaceId: string;
  workpieceId: string;
  revisionId: string;
  editorGeneration: number;
};

export type HammerAuthorityToken = HammerAuthorityIdentity & {
  lane: HammerAsyncResponseLane;
  sequence: number;
  saveAttemptId?: string;
};

export function issueHammerAuthorityToken(args: {
  identity: HammerAuthorityIdentity;
  lane: HammerAsyncResponseLane;
  laneSequences: Record<HammerAsyncResponseLane, number>;
  saveAttemptId?: string;
}): HammerAuthorityToken {
  const sequence = args.laneSequences[args.lane] + 1;
  args.laneSequences[args.lane] = sequence;
  return { ...args.identity, lane: args.lane, sequence, saveAttemptId: args.saveAttemptId };
}

export function isHammerAuthorityTokenCurrent(args: {
  token: HammerAuthorityToken;
  identity: HammerAuthorityIdentity | null;
  laneSequences: Readonly<Record<HammerAsyncResponseLane, number>>;
  saveAttemptId?: string;
}): boolean {
  const { token, identity } = args;
  return Boolean(
    identity
    && token.workspaceId === identity.workspaceId
    && token.workpieceId === identity.workpieceId
    && token.revisionId === identity.revisionId
    && token.editorGeneration === identity.editorGeneration
    && token.sequence === args.laneSequences[token.lane]
    && (typeof args.saveAttemptId === "undefined" || token.saveAttemptId === args.saveAttemptId),
  );
}

type RevisionSaveArtifacts = HammerRevisionAutosaveArtifacts;

function readWriteData(value: unknown): unknown {
  return value && typeof value === "object" && "data" in value ? (value as { data?: unknown }).data : undefined;
}

/**
 * A workpiece-state acknowledgement is not revision hydration. This function picks
 * only the fields owned by that response and installs the exact revision artifacts
 * that were just acknowledged. Unknown and visual response fields are ignored.
 */
export function reconcileHammerWorkpieceAcknowledgement(args: {
  canonicalSnapshot: HammerPersistenceSnapshot;
  response: HammerPersistenceSnapshot;
  revision: HammerRecordingRevisionRecord;
  revisionRequest: RevisionSaveArtifacts;
  persistenceRequest: Pick<HammerPersistenceSaveRequest, "active_session_id" | "last_opened_at">;
}): HammerPersistenceSnapshot {
  const current = args.canonicalSnapshot;
  const responseState = args.response.state;
  const currentState = current.state;
  const state = currentState
    ? {
        ...currentState,
        ...(responseState ? {
          active_session_id: responseState.active_session_id,
          current_pass: responseState.current_pass,
          pass_order_version: responseState.pass_order_version,
          pass_status: responseState.pass_status,
          transcript_versions_artifact_path: responseState.transcript_versions_artifact_path,
          edit_plan_artifact_path: responseState.edit_plan_artifact_path,
          editorial_authority_artifact_path: responseState.editorial_authority_artifact_path,
          edit_plan_signature: responseState.edit_plan_signature,
          prep_status: responseState.prep_status,
          alignment_status: responseState.alignment_status,
          macro_recipe_ref: responseState.macro_recipe_ref,
          last_macro_run_ref: responseState.last_macro_run_ref,
          last_opened_at: responseState.last_opened_at,
          updated_at: responseState.updated_at,
          updated_by: responseState.updated_by,
        } : {}),
        workspace_id: args.revision.workspace_id,
        workpiece_id: args.revision.workpiece_id,
        editor_session_path: args.revision.editor_session_path,
        transcript_artifact_path: args.revision.revision_transcript_path,
        visual_placement_artifact_path: args.revision.visual_placements_path,
        visual_timeline_artifact_path: args.revision.visual_timeline_path,
        audio_polish_artifact_path: args.revision.audio_polish_path,
      }
    : null;

  const artifact = <K extends keyof RevisionSaveArtifacts>(
    key: K,
    fallback: HammerPersistenceSnapshot[K extends "revision_transcript" ? "structured_transcript" : K],
    path: string | null,
  ) => ({
    ...fallback,
    path,
    data: readWriteData(args.revisionRequest[key]) ?? fallback.data,
  });

  return {
    ...current,
    state,
    editor_session: artifact("editor_session", current.editor_session, args.revision.editor_session_path),
    structured_transcript: artifact("revision_transcript", current.structured_transcript, args.revision.revision_transcript_path),
    audio_polish: artifact("audio_polish", current.audio_polish, args.revision.audio_polish_path),
    visual_timeline: artifact("visual_timeline", current.visual_timeline, args.revision.visual_timeline_path),
    visual_placements: artifact("visual_placements", current.visual_placements, args.revision.visual_placements_path),
    transcript_version_registry: args.response.transcript_version_registry,
    edit_plan: args.response.edit_plan,
    editorial_authority: args.response.editorial_authority,
    macro_hooks: args.response.macro_hooks,
  };
}

export async function persistHammerCanonicalSave(args: {
  target: HammerPersistenceTarget;
  canonicalRecordingId?: string;
  revisionId: string;
  currentRevision?: HammerRecordingRevisionRecord;
  revisionRequest: RevisionSaveArtifacts;
  persistenceRequest: HammerPersistenceSaveRequest;
  canonicalSnapshot: HammerPersistenceSnapshot;
  identity: HammerAuthorityIdentity;
  currentIdentity: () => HammerAuthorityIdentity | null;
  laneSequences: Record<HammerAsyncResponseLane, number>;
  lifecycleFlush?: boolean;
  adapters?: {
    saveRevision?: typeof saveHammerRecordingRevision;
    saveWorkpiece?: typeof saveHammerPersistenceSnapshot;
    saveRevisionAuthority?: typeof persistHammerRevisionEditorialAuthority;
  };
}): Promise<
  | { ok: true; revision: HammerRecordingRevisionRecord; snapshot: HammerPersistenceSnapshot }
  | { ok: false; stale?: true; error: string; revision: HammerRecordingRevisionRecord | null }
> {
  const saveAttemptId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `hammer-save-${Math.random().toString(16).slice(2)}`;
  const lifecycleToken = args.lifecycleFlush
    ? issueHammerAuthorityToken({ identity: args.identity, lane: "lifecycle_flush", laneSequences: args.laneSequences, saveAttemptId })
    : null;
  const changedRevisionRequest = selectChangedHammerRevisionArtifacts({
    request: args.revisionRequest,
    installed: args.canonicalSnapshot,
  });
  const requestedAuthority = args.persistenceRequest.editorial_authority?.data ?? null;
  const authorityChanged = !areHammerAuthorityGraphsSemanticallyEqual(
    requestedAuthority,
    args.canonicalSnapshot.editorial_authority.data,
  );
  if (Object.keys(changedRevisionRequest).length === 0 && !authorityChanged && args.currentRevision) {
    return { ok: true, revision: args.currentRevision, snapshot: args.canonicalSnapshot };
  }
  const revisionToken = issueHammerAuthorityToken({
    identity: args.identity, lane: "revision_mutation", laneSequences: args.laneSequences, saveAttemptId,
  });
  const revisionResult = Object.keys(changedRevisionRequest).length === 0 && args.currentRevision
    ? { ok: true as const, status: 200, data: { revision: args.currentRevision } }
    : await (args.adapters?.saveRevision ?? saveHammerRecordingRevision)(args.target, args.revisionId, changedRevisionRequest);
  const tokenIsCurrent = (token: HammerAuthorityToken) => isHammerAuthorityTokenCurrent({
    token, identity: args.currentIdentity(), laneSequences: args.laneSequences, saveAttemptId,
  });
  if (!tokenIsCurrent(revisionToken) || (lifecycleToken && !tokenIsCurrent(lifecycleToken))) {
    return { ok: false, stale: true, error: "stale_revision_response", revision: null };
  }
  if (!revisionResult.ok) return { ok: false, error: revisionResult.error, revision: null };

  const reconciliationToken = issueHammerAuthorityToken({
    identity: args.identity, lane: "workpiece_reconciliation", laneSequences: args.laneSequences, saveAttemptId,
  });
  const persistenceResult = await (args.adapters?.saveWorkpiece ?? saveHammerPersistenceSnapshot)(args.target, args.persistenceRequest);
  if (!tokenIsCurrent(reconciliationToken)) {
    return { ok: false, stale: true, error: "stale_workpiece_response", revision: revisionResult.data.revision };
  }
  if (!persistenceResult.ok) return { ok: false, error: persistenceResult.error, revision: revisionResult.data.revision };
  const authority = requestedAuthority;
  if (!authority) return { ok: false, error: "Canonical save did not contain editorial authority.", revision: revisionResult.data.revision };
  let authorityResult: Awaited<ReturnType<typeof persistHammerRevisionEditorialAuthority>>;
  if (!authorityChanged) {
    authorityResult = {
      revision: revisionResult.data.revision,
      disposition: "already_committed",
      fingerprint: revisionResult.data.revision.editorial_authority_fingerprint ?? "",
    };
  } else {
    try {
      authorityResult = await (args.adapters?.saveRevisionAuthority ?? persistHammerRevisionEditorialAuthority)({
        target: args.target,
        canonicalRecordingId: args.canonicalRecordingId ?? revisionResult.data.revision.canonical_recording_id,
        revision: revisionResult.data.revision,
        authority,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Revision editorial-authority persistence failed.",
        revision: revisionResult.data.revision,
      };
    }
  }
  if (!tokenIsCurrent(reconciliationToken)) {
    return { ok: false, stale: true, error: "stale_authority_response", revision: authorityResult.revision };
  }
  const reconciled = reconcileHammerWorkpieceAcknowledgement({
    canonicalSnapshot: args.canonicalSnapshot,
    response: persistenceResult.data,
    revision: authorityResult.revision,
    revisionRequest: changedRevisionRequest,
    persistenceRequest: args.persistenceRequest,
  });
  return {
    ok: true,
    revision: authorityResult.revision,
    snapshot: {
      ...reconciled,
      editorial_authority: {
        path: authorityResult.revision.editorial_authority_path,
        updated_at: authorityResult.revision.updated_at,
        data: authority,
      },
    },
  };
}

export type CanonicalVisualLookup =
  | { status: "present"; timeline: HammerPersistenceSnapshot["visual_timeline"]["data"] }
  | { status: "absent" }
  | { status: "failure"; classification: "missing" | "unreadable" | "unauthorized" | "invalid" };

export type CanonicalVisualFailureClassification = Extract<CanonicalVisualLookup, { status: "failure" }>["classification"];

export function resolveHammerVisualHydrationAuthority(args: {
  pointer: string | null | undefined;
  pointerLookup: CanonicalVisualLookup;
  standardPathLookup: CanonicalVisualLookup;
  legacyPlacements: HammerPersistenceSnapshot["visual_placements"]["data"];
}): { source: "canonical"; timeline: NonNullable<HammerPersistenceSnapshot["visual_timeline"]["data"]> }
  | { source: "legacy"; placements: NonNullable<HammerPersistenceSnapshot["visual_placements"]["data"]> }
  | { source: "absent" }
  | { source: "failure"; classification: CanonicalVisualFailureClassification } {
  const lookups = args.pointer ? [args.pointerLookup, args.standardPathLookup] : [args.standardPathLookup];
  for (const lookup of lookups) {
    if (lookup.status === "present" && lookup.timeline) return { source: "canonical", timeline: lookup.timeline };
    if (lookup.status === "failure") return { source: "failure", classification: lookup.classification };
  }
  if (lookups.every((lookup) => lookup.status === "absent")) {
    return args.legacyPlacements
      ? { source: "legacy", placements: args.legacyPlacements }
      : { source: "absent" };
  }
  return { source: "failure", classification: "invalid" };
}
