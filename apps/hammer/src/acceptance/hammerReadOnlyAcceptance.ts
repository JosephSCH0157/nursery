import {
  loadHammerRecordingRevisionArtifacts,
  readHammerRecordingRevision,
  type HammerCanonicalRecordingRecord,
  type HammerRecordingRevisionRecord,
  type HammerRevisionArtifacts,
} from "../persistence/hammerRecordingRevisionPersistence";
import {
  loadHammerHistoryComponentAuthority,
  loadHammerRevisionHistoryHydration,
  type HammerHistoryComponentAuthority,
  type HammerRevisionHistoryHydration,
} from "../lib/hammerHistoryEpochApi";
import { projectHammerMountedCompositionClips } from "../editor/hammerMountedCompositionProjection";

export type HammerReadOnlyAcceptance = Readonly<{
  schema: "forge.hammer-read-only-acceptance.v1";
  status: "canonical";
  facts: Readonly<{
    transcript_segments: number;
    canonical_placements: number;
    mounted_composition_clips: number;
    uncertain_placements: number;
    undo_depth: number;
    redo_depth: number;
    history_current_head_mismatch: false;
  }>;
  identities: Readonly<{
    workspace_id: string;
    workpiece_id: string;
    canonical_recording_id: string;
    recording_revision_id: string;
    recording_media_path: string;
    revision_updated_at: string;
    history_path: string;
    history_kind: "epoch_anchor" | "epoch_head";
    history_sequence: number;
    history_head_id: string | null;
    history_head_state_hash: string;
    editorial_authority_path: string;
    editorial_authority_fingerprint: string;
    editorial_authority_revision: number;
  }>;
  component_authority: HammerHistoryComponentAuthority;
}>;

type LoaderDependencies = Readonly<{
  readRevision: typeof readHammerRecordingRevision;
  loadArtifacts: typeof loadHammerRecordingRevisionArtifacts;
  loadHistory: typeof loadHammerRevisionHistoryHydration;
  loadComponentAuthority: typeof loadHammerHistoryComponentAuthority;
}>;

const DEFAULT_DEPENDENCIES: LoaderDependencies = {
  readRevision: readHammerRecordingRevision,
  loadArtifacts: loadHammerRecordingRevisionArtifacts,
  loadHistory: loadHammerRevisionHistoryHydration,
  loadComponentAuthority: loadHammerHistoryComponentAuthority,
};

function assertIdentity(args: {
  workspaceId: string;
  workpieceId: string;
  revisionId: string;
  canonical: HammerCanonicalRecordingRecord;
  revision: HammerRecordingRevisionRecord;
}): void {
  if (args.canonical.workspace_id !== args.workspaceId
    || args.canonical.workpiece_id !== args.workpieceId
    || args.revision.workspace_id !== args.workspaceId
    || args.revision.workpiece_id !== args.workpieceId
    || args.revision.id !== args.revisionId
    || args.revision.canonical_recording_id !== args.canonical.id
    || args.canonical.status !== "sealed"
    || args.revision.status !== "active") {
    throw new Error("The requested Hammer revision is not the active sealed canonical authority.");
  }
}

function requireCanonicalArtifacts(revision: HammerRecordingRevisionRecord, artifacts: HammerRevisionArtifacts): asserts artifacts is HammerRevisionArtifacts & {
  revision_transcript: NonNullable<HammerRevisionArtifacts["revision_transcript"]>;
  audio_polish: NonNullable<HammerRevisionArtifacts["audio_polish"]>;
  visual_timeline: NonNullable<HammerRevisionArtifacts["visual_timeline"]>;
  visual_placements: NonNullable<HammerRevisionArtifacts["visual_placements"]>;
  editorial_authority: NonNullable<HammerRevisionArtifacts["editorial_authority"]>;
} {
  if (!revision.revision_transcript_path || !revision.audio_polish_path || !revision.visual_timeline_path
    || !revision.visual_placements_path || !revision.history_path || !revision.editorial_authority_path
    || !revision.editorial_authority_fingerprint || revision.editorial_authority_revision < 1
    || !artifacts.revision_transcript || !artifacts.audio_polish || !artifacts.visual_timeline
    || artifacts.visual_timeline_authority !== "canonical" || !artifacts.visual_placements
    || !artifacts.editorial_authority) {
    throw new Error("The active revision does not expose a complete canonical authority set.");
  }
}

function authorityMatches(left: HammerHistoryComponentAuthority, right: HammerHistoryComponentAuthority): boolean {
  return (Object.keys(left) as Array<keyof HammerHistoryComponentAuthority>).every((component) => {
    const a = left[component];
    const b = right[component];
    return a.workpiece_id === b.workpiece_id && a.path === b.path && a.sha256 === b.sha256
      && a.bytes === b.bytes && a.registry_revision === b.registry_revision
      && a.registry_updated_at === b.registry_updated_at && a.content_type === b.content_type;
  });
}

function historyIdentity(hydration: HammerRevisionHistoryHydration): {
  kind: "epoch_anchor" | "epoch_head";
  sequence: number;
  headId: string | null;
  stateHash: string;
  expectedAuthority: HammerHistoryComponentAuthority | null;
} {
  if (hydration.kind === "legacy_history") throw new Error("Legacy history is not canonical epoch authority.");
  if (hydration.kind === "epoch_anchor") return {
    kind: "epoch_anchor",
    sequence: 0,
    headId: null,
    stateHash: hydration.epoch.base.editor_state_hash,
    expectedAuthority: null,
  };
  return {
    kind: "epoch_head",
    sequence: hydration.sequence,
    headId: hydration.head_id,
    stateHash: hydration.result.editor_state_hash,
    expectedAuthority: hydration.result.component_authority,
  };
}

export async function loadHammerReadOnlyAcceptance(args: {
  workspaceId: string;
  workpieceId: string;
  revisionId: string;
  dependencies?: Partial<LoaderDependencies>;
}): Promise<HammerReadOnlyAcceptance> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...args.dependencies };
  const revisionResult = await deps.readRevision({ workspaceId: args.workspaceId, workpieceId: args.workpieceId }, args.revisionId);
  if (!revisionResult.ok) throw new Error(revisionResult.error);
  const { canonical_recording: canonical, revision } = revisionResult.data;
  assertIdentity({ ...args, canonical, revision });

  const artifactsResult = await deps.loadArtifacts(revision);
  if (!artifactsResult.ok) throw new Error(artifactsResult.error);
  const artifacts = artifactsResult.data;
  requireCanonicalArtifacts(revision, artifacts);

  const historyPath = revision.history_path!;
  const editorialAuthorityPath = revision.editorial_authority_path!;
  const editorialAuthorityFingerprint = revision.editorial_authority_fingerprint!;
  const componentPaths = {
    audio: revision.audio_polish_path!,
    editorial_authority: editorialAuthorityPath,
    transcript: revision.revision_transcript_path!,
    visual_placements: revision.visual_placements_path!,
    visual_timeline: revision.visual_timeline_path!,
  } as const;
  const [historyResult, componentAuthority] = await Promise.all([
    deps.loadHistory({
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      canonicalRecordingId: canonical.id,
      revisionId: revision.id,
      historyPath,
      revisionUpdatedAt: revision.updated_at,
    }),
    deps.loadComponentAuthority({ workpieceId: args.workpieceId, paths: componentPaths }),
  ]);
  if (!historyResult.ok) throw new Error(historyResult.error);
  const history = historyIdentity(historyResult.hydration);
  if (history.expectedAuthority && !authorityMatches(componentAuthority, history.expectedAuthority)) {
    throw new Error("history_current_head_mismatch");
  }

  const mounted = projectHammerMountedCompositionClips({
    timeline: artifacts.visual_timeline,
    transcriptSegments: artifacts.revision_transcript.segments,
  });
  return Object.freeze({
    schema: "forge.hammer-read-only-acceptance.v1",
    status: "canonical",
    facts: Object.freeze({
      transcript_segments: artifacts.revision_transcript.segments.length,
      canonical_placements: artifacts.visual_placements.placements.length,
      mounted_composition_clips: mounted.length,
      uncertain_placements: artifacts.visual_placements.placements.filter((placement) => placement.status === "uncertain").length,
      undo_depth: historyResult.hydration.document.undoStack.length,
      redo_depth: historyResult.hydration.document.redoStack.length,
      history_current_head_mismatch: false as const,
    }),
    identities: Object.freeze({
      workspace_id: args.workspaceId,
      workpiece_id: args.workpieceId,
      canonical_recording_id: canonical.id,
      recording_revision_id: revision.id,
      recording_media_path: canonical.media_path,
      revision_updated_at: revision.updated_at,
      history_path: historyPath,
      history_kind: history.kind,
      history_sequence: history.sequence,
      history_head_id: history.headId,
      history_head_state_hash: history.stateHash,
      editorial_authority_path: editorialAuthorityPath,
      editorial_authority_fingerprint: editorialAuthorityFingerprint,
      editorial_authority_revision: revision.editorial_authority_revision,
    }),
    component_authority: componentAuthority,
  });
}
