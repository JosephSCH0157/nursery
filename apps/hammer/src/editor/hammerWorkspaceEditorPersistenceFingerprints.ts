import type {
  HammerPersistenceSaveRequest,
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../persistence/hammerPersistenceContract";
import { loadHammerVisualTimelineStateFromSnapshot } from "../visuals/persistence/hammerVisualTimelinePersistence";

type HammerAutosaveArtifactRequest = {
  editor_session?: { data: unknown };
  revision_transcript?: { data: unknown };
  audio_polish?: { data: unknown };
  visual_timeline?: { data: unknown };
  visual_placements?: { data: unknown };
};

export function buildAutosavePayloadKey(args: {
  target: HammerPersistenceTarget;
  revisionId: string;
  request: HammerAutosaveArtifactRequest;
  persistenceRequest: Pick<HammerPersistenceSaveRequest, "editorial_authority" | "active_session_id" | "last_opened_at">;
}): string {
  return JSON.stringify({
    target: args.target,
    revisionId: args.revisionId,
    request: args.request,
    persistenceRequest: args.persistenceRequest,
  });
}

export function stripEditorSessionOpenMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    last_opened_at: null,
    selected_segment_id: null,
    selected_overlay_row_id: null,
  };
}

export function normalizeVisualTimelineForFingerprint(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  const assets = Array.isArray(row.assets)
    ? row.assets.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const asset = entry as Record<string, unknown>;
      return { ...asset, updated_at: null };
    })
    : row.assets;
  const clips = Array.isArray(row.clips)
    ? row.clips.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const clip = entry as Record<string, unknown>;
      return { ...clip, updated_at: null };
    })
    : row.clips;
  return {
    ...row,
    updated_at: null,
    debug_origin: null,
    debug_migration_hash: null,
    selected_clip_id: null,
    assets,
    clips,
  };
}

export function buildHydrationNoopFingerprint(args: {
  target: HammerPersistenceTarget;
  revisionId: string;
  request: HammerAutosaveArtifactRequest;
  persistenceRequest: Pick<HammerPersistenceSaveRequest, "editorial_authority">;
}): string {
  return JSON.stringify({
    target: args.target,
    revisionId: args.revisionId,
    editor_session: args.request.editor_session
      ? { data: stripEditorSessionOpenMetadata(args.request.editor_session.data) }
      : null,
    revision_transcript: args.request.revision_transcript ?? null,
    audio_polish: args.request.audio_polish ?? null,
    visual_timeline: args.request.visual_timeline
      ? { data: normalizeVisualTimelineForFingerprint(args.request.visual_timeline.data) }
      : null,
    visual_placements: args.request.visual_placements ?? null,
    editorial_authority: args.persistenceRequest.editorial_authority ?? null,
  });
}

export function buildPersistedHydrationNoopFingerprint(args: {
  target: HammerPersistenceTarget;
  revisionId: string;
  snapshot: HammerPersistenceSnapshot | null;
}): string | null {
  if (!args.snapshot) return null;
  const effectiveVisualTimeline = loadHammerVisualTimelineStateFromSnapshot(args.snapshot);
  return JSON.stringify({
    target: args.target,
    revisionId: args.revisionId,
    editor_session: args.snapshot.editor_session.data
      ? { data: stripEditorSessionOpenMetadata(args.snapshot.editor_session.data) }
      : null,
    revision_transcript: args.snapshot.structured_transcript.data
      ? { data: args.snapshot.structured_transcript.data }
      : null,
    audio_polish: args.snapshot.audio_polish.data
      ? { data: args.snapshot.audio_polish.data }
      : null,
    visual_timeline: { data: normalizeVisualTimelineForFingerprint(effectiveVisualTimeline) },
    visual_placements: args.snapshot.visual_placements.data
      ? { data: args.snapshot.visual_placements.data }
      : null,
    editorial_authority: args.snapshot.editorial_authority.data
      ? { data: args.snapshot.editorial_authority.data }
      : null,
  });
}
