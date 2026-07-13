import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type {
  HammerHydratedLaunchContext,
  HammerPersistedEditorSession,
  HammerPersistenceSnapshot,
  HammerPersistedStructuredTranscript,
  HammerPersistenceTarget,
} from "../persistence/hammerPersistenceContract";
import { buildHammerLaunchContextFromPersistence } from "../persistence/hammerPersistence";
import { isHammerDevConsoleEnabled } from "../lib/hammerDevConsole";

export type HammerOpenHydrationResult = {
  launchContext: HammerLaunchContext | undefined;
  hasCanonicalBasis: boolean;
  persistenceSource: HammerHydratedLaunchContext["source"] | "transitional" | "bootstrap" | "none";
};

function cloneTransitionMediaSource(
  media: HammerLaunchContext["media"],
): HammerLaunchContext["media"] {
  if (media.kind === "mapped-local") {
    return {
      ...media,
      ref: { ...media.ref },
    };
  }
  if (media.kind === "tongs-stub") {
    return {
      ...media,
      ref: { ...media.ref },
      workspace_mapping: media.workspace_mapping
        ? { ...media.workspace_mapping }
        : undefined,
    };
  }
  return { ...media };
}

function cloneTransitionTranscript(
  transcript: HammerPersistedStructuredTranscript,
): HammerLaunchContext["transcript"] {
  return {
    kind: "tongs-stub",
    transcript_id: transcript.transcript_id,
    segments: transcript.segments.map((segment) => ({ ...segment })),
    label: transcript.transcript_id,
  };
}

function buildTransitionMediaSource(args: {
  editorSession: HammerPersistedEditorSession | null;
  basisLaunchContext: HammerLaunchContext | undefined;
}): HammerLaunchContext["media"] | null {
  const { editorSession, basisLaunchContext } = args;
  if (editorSession?.media_ref) {
    return {
      kind: "tongs-stub",
      ref: { ...editorSession.media_ref },
      workspace_mapping: editorSession.workspace_mapping
        ? { ...editorSession.workspace_mapping }
        : undefined,
      label: editorSession.media_source_label ?? "tongs:persisted-media",
    };
  }
  if (!basisLaunchContext) return null;
  return cloneTransitionMediaSource(basisLaunchContext.media);
}

function buildHammerLaunchContextFromTranscriptFallback(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  basisLaunchContext: HammerLaunchContext | undefined;
}): HammerLaunchContext | null {
  const transcript = args.snapshot.structured_transcript.data;
  if (!transcript || transcript.segments.length === 0) {
    return null;
  }

  const editorSession = args.snapshot.editor_session.data ?? null;
  const media = buildTransitionMediaSource({
    editorSession,
    basisLaunchContext: args.basisLaunchContext,
  });
  if (!media) {
    return null;
  }

  const sourceMode = editorSession?.source_mode
    ?? args.basisLaunchContext?.source_mode
    ?? "tongs";
  const previewMode = editorSession?.preview_mode
    ?? args.basisLaunchContext?.preview_mode;

  return {
    workspace_id: args.target.workspaceId,
    workpiece_id: args.target.workpieceId,
    session_id: editorSession?.session_id ?? args.basisLaunchContext?.session_id,
    source_mode: sourceMode,
    transcript: cloneTransitionTranscript(transcript),
    media,
    preview_mode: previewMode,
  };
}

export function hydrateHammerOpenLaunchContext(args: {
  target: HammerPersistenceTarget;
  hydratedSnapshot: HammerPersistenceSnapshot | null;
  initialLaunchContext: HammerLaunchContext | undefined;
  bootstrapLaunchContext: HammerLaunchContext | undefined;
  allowLegacyEditPlanProjection?: boolean;
}): HammerOpenHydrationResult {
  const {
    target,
    hydratedSnapshot,
    initialLaunchContext,
    bootstrapLaunchContext,
    allowLegacyEditPlanProjection,
  } = args;
  const persistedCanonicalMissing = Boolean(
    hydratedSnapshot
    && (hydratedSnapshot.state
      || hydratedSnapshot.editor_session.data
      || hydratedSnapshot.structured_transcript.data
      || hydratedSnapshot.edit_plan.data)
    && !hydratedSnapshot.editorial_authority.data,
  );

  let launchContext = initialLaunchContext;

  if (hydratedSnapshot && persistedCanonicalMissing) {
    const transitionalLaunchContext = buildHammerLaunchContextFromTranscriptFallback({
      target,
      snapshot: hydratedSnapshot,
      basisLaunchContext: launchContext ?? bootstrapLaunchContext,
    });
    if (transitionalLaunchContext) {
      if (isHammerDevConsoleEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[HammerReopen] reopening from structured transcript fallback; canonical authority missing", {
          workspace_id: target.workspaceId,
          workpiece_id: target.workpieceId,
          transcript_id: transitionalLaunchContext.transcript.kind === "tongs-stub"
            ? transitionalLaunchContext.transcript.transcript_id
            : null,
        });
      }
      return {
        launchContext: transitionalLaunchContext,
        hasCanonicalBasis: !hydratedSnapshot.editor_session.data && Boolean(launchContext ?? bootstrapLaunchContext),
        persistenceSource: "transitional",
      };
    }
  }
  let persistenceSource: HammerOpenHydrationResult["persistenceSource"] = launchContext ? "launch" : "none";

  if (hydratedSnapshot) {
    const hydrated = buildHammerLaunchContextFromPersistence(
      target,
      hydratedSnapshot,
      launchContext,
      { allowLegacyEditPlanProjection },
    );
    if (hydrated) {
      return {
        launchContext: hydrated.launchContext,
        hasCanonicalBasis: true,
        persistenceSource: hydrated.source,
      };
    }
  }

  if (!launchContext && bootstrapLaunchContext) {
    launchContext = bootstrapLaunchContext;
    persistenceSource = "bootstrap";
  }

  if (hydratedSnapshot && launchContext) {
    const merged = buildHammerLaunchContextFromPersistence(
      target,
      hydratedSnapshot,
      launchContext,
      { allowLegacyEditPlanProjection },
    );
    if (merged) {
      return {
        launchContext: merged.launchContext,
        hasCanonicalBasis: true,
        persistenceSource: merged.source,
      };
    }
  }

  return {
    launchContext,
    hasCanonicalBasis: !persistedCanonicalMissing && Boolean(launchContext),
    persistenceSource,
  };
}

