import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerLaunchContext,
  HammerMediaSource,
  HammerTranscriptSource,
} from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerVisualPackage } from "../../../../packages/contracts/hammer/visual-package.contract";
import { DEFAULT_TRANSCRIPT_FIXTURE_ID, getDevTranscriptSegments } from "./transcriptFixtures";
import { getDevVisualPackage } from "./visualPackageFixtures";

export const HAMMER_DEV_LAUNCH_PRESET_IDS = [
  "dev-tone-basic",
  "mapped-media-missing",
  "tongs-stub-with-edit-plan",
  "tongs-stub-clean",
] as const;

export type HammerDevLaunchPresetId = (typeof HAMMER_DEV_LAUNCH_PRESET_IDS)[number];

const DEFAULT_WORKSPACE_ID = "ws_demo";
const DEFAULT_WORKPIECE_ID = "wp_demo_014";
const DEFAULT_SESSION_ID = "session_dev_launch";
const DEFAULT_MEDIA_ID = "media_local_01";
const DEFAULT_MEDIA_RELPATH = "recordings/episode014.mp4";
const DEFAULT_MEDIA_ROOT_ABS = "D:\\ForgeMedia\\ws_demo";
const DEFAULT_DURATION_SEC = 32;
const DEFAULT_PREVIEW_MODE: HammerPreviewMode = "edit-aware";
const TONGS_STUB_TRANSCRIPT_ID = "transcript_wp_demo_014";
const TONGS_STUB_TRANSCRIPT_LABEL = "tongs:transcript_wp_demo_014";
const TONGS_STUB_MEDIA_ID = "media_wp_demo_014";
const TONGS_STUB_MEDIA_LABEL = "tongs:media_wp_demo_014";

function cloneInstructions(instructions: HammerEditInstruction[]): HammerEditInstruction[] {
  return instructions.map((instruction) => ({ ...instruction }));
}

function cloneEditPlan(plan: HammerEditPlan): HammerEditPlan {
  return {
    ...plan,
    instructions: cloneInstructions(plan.instructions),
  };
}

function cloneMediaRef(ref: MediaRef): MediaRef {
  return { ...ref };
}

function cloneWorkspaceMapping(mapping: WorkspaceMediaMapping): WorkspaceMediaMapping {
  return { ...mapping };
}

function cloneTranscriptSource(source: HammerTranscriptSource): HammerTranscriptSource {
  if (source.kind === "tongs-stub") {
    return {
      ...source,
      segments: source.segments.map((segment) => ({ ...segment })),
    };
  }
  return { ...source };
}

function cloneMediaSource(source: HammerMediaSource): HammerMediaSource {
  if (source.kind === "mapped-local") {
    return {
      ...source,
      ref: cloneMediaRef(source.ref),
    };
  }
  if (source.kind === "tongs-stub") {
    return {
      ...source,
      ref: cloneMediaRef(source.ref),
      workspace_mapping: source.workspace_mapping
        ? cloneWorkspaceMapping(source.workspace_mapping)
        : undefined,
    };
  }
  return { ...source };
}

function syncVisualPackageIdentity(
  visualPackage: HammerVisualPackage,
  workspaceId: string,
  workpieceId: string,
): HammerVisualPackage {
  const previousWorkpieceId = visualPackage.workpiece_id;
  return {
    ...visualPackage,
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    visuals: visualPackage.visuals.map((visual) => ({
      ...visual,
      script_anchor: visual.script_anchor ? { ...visual.script_anchor } : null,
      selected_asset: visual.selected_asset
        ? {
          ...visual.selected_asset,
          path: visual.selected_asset.path.replace(previousWorkpieceId, workpieceId),
          storage_key: visual.selected_asset.storage_key.replace(previousWorkpieceId, workpieceId),
        }
        : null,
    })),
  };
}

function cloneLaunchContext(context: HammerLaunchContext): HammerLaunchContext {
  return {
    ...context,
    transcript: cloneTranscriptSource(context.transcript),
    media: cloneMediaSource(context.media),
    visual_package: context.visual_package
      ? syncVisualPackageIdentity(
        context.visual_package,
        context.visual_package.workspace_id,
        context.visual_package.workpiece_id,
      )
      : undefined,
    edit_plan: context.edit_plan ? cloneEditPlan(context.edit_plan) : undefined,
  };
}

function createMappedMediaRef(mediaId: string, localRelpath: string): MediaRef {
  return {
    media_id: mediaId,
    kind: "recording_video",
    source_hint: "local",
    local_relpath: localRelpath,
    duration_ms: DEFAULT_DURATION_SEC * 1000,
  };
}

function createTongsStubEditPlan(): HammerEditPlan {
  return {
    edit_plan_id: "plan_tongs_stub_v1",
    version: "1",
    created_at: "2026-03-07T20:10:00.000Z",
    updated_at: "2026-03-07T20:10:00.000Z",
    source_transcript_id: TONGS_STUB_TRANSCRIPT_LABEL,
    preview_mode: "raw",
    tool_version: "forge-v1.2.0/hammer-launch-stub",
    workspace_id: DEFAULT_WORKSPACE_ID,
    workpiece_id: DEFAULT_WORKPIECE_ID,
    session_id: "session_tongs_stub_reloaded",
    instructions: [
      {
        instruction_id: "ins_delete_seg_002",
        segment_id: "seg_002",
        type: "delete",
        created_at: "2026-03-07T20:10:00.000Z",
      },
      {
        instruction_id: "ins_trim_seg_003",
        segment_id: "seg_003",
        type: "trim",
        trim_start_sec: 10.4,
        trim_end_sec: 13.4,
        created_at: "2026-03-07T20:10:01.000Z",
      },
    ],
  };
}

const PRESET_INDEX: Record<HammerDevLaunchPresetId, HammerLaunchContext> = {
  "dev-tone-basic": {
    workspace_id: DEFAULT_WORKSPACE_ID,
    workpiece_id: DEFAULT_WORKPIECE_ID,
    session_id: DEFAULT_SESSION_ID,
    source_mode: "dev",
    transcript: {
      kind: "fixture",
      fixture_id: DEFAULT_TRANSCRIPT_FIXTURE_ID,
    },
    media: {
      kind: "dev-tone",
      media_id: "media_dev_tone_basic",
      duration_sec: DEFAULT_DURATION_SEC,
    },
    visual_package: getDevVisualPackage({
      fixtureId: DEFAULT_TRANSCRIPT_FIXTURE_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      workpieceId: DEFAULT_WORKPIECE_ID,
    }),
    preview_mode: DEFAULT_PREVIEW_MODE,
  },
  "mapped-media-missing": {
    workspace_id: DEFAULT_WORKSPACE_ID,
    workpiece_id: DEFAULT_WORKPIECE_ID,
    session_id: "session_mapped_missing",
    source_mode: "mapped",
    transcript: {
      kind: "fixture",
      fixture_id: DEFAULT_TRANSCRIPT_FIXTURE_ID,
    },
    media: {
      kind: "mapped-local",
      ref: createMappedMediaRef("media_missing_local_01", "recordings/missing-episode014.mp4"),
      label: "mapped:missing-local",
    },
    visual_package: getDevVisualPackage({
      fixtureId: DEFAULT_TRANSCRIPT_FIXTURE_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      workpieceId: DEFAULT_WORKPIECE_ID,
    }),
    preview_mode: DEFAULT_PREVIEW_MODE,
  },
  "tongs-stub-with-edit-plan": {
    workspace_id: DEFAULT_WORKSPACE_ID,
    workpiece_id: DEFAULT_WORKPIECE_ID,
    session_id: "session_tongs_stub_reloaded",
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: TONGS_STUB_TRANSCRIPT_ID,
      segments: getDevTranscriptSegments(DEFAULT_TRANSCRIPT_FIXTURE_ID),
      label: TONGS_STUB_TRANSCRIPT_LABEL,
    },
    media: {
      kind: "tongs-stub",
      ref: createMappedMediaRef(TONGS_STUB_MEDIA_ID, DEFAULT_MEDIA_RELPATH),
      workspace_mapping: {
        workspace_id: DEFAULT_WORKSPACE_ID,
        local_root_abs: DEFAULT_MEDIA_ROOT_ABS,
      },
      label: TONGS_STUB_MEDIA_LABEL,
    },
    visual_package: getDevVisualPackage({
      fixtureId: DEFAULT_TRANSCRIPT_FIXTURE_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      workpieceId: DEFAULT_WORKPIECE_ID,
    }),
    edit_plan: createTongsStubEditPlan(),
    preview_mode: "raw",
  },
  "tongs-stub-clean": {
    workspace_id: DEFAULT_WORKSPACE_ID,
    workpiece_id: DEFAULT_WORKPIECE_ID,
    session_id: "session_tongs_stub_clean",
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: TONGS_STUB_TRANSCRIPT_ID,
      segments: getDevTranscriptSegments(DEFAULT_TRANSCRIPT_FIXTURE_ID),
      label: TONGS_STUB_TRANSCRIPT_LABEL,
    },
    media: {
      kind: "tongs-stub",
      ref: createMappedMediaRef(TONGS_STUB_MEDIA_ID, DEFAULT_MEDIA_RELPATH),
      workspace_mapping: {
        workspace_id: DEFAULT_WORKSPACE_ID,
        local_root_abs: DEFAULT_MEDIA_ROOT_ABS,
      },
      label: TONGS_STUB_MEDIA_LABEL,
    },
    visual_package: getDevVisualPackage({
      fixtureId: DEFAULT_TRANSCRIPT_FIXTURE_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      workpieceId: DEFAULT_WORKPIECE_ID,
    }),
    preview_mode: DEFAULT_PREVIEW_MODE,
  },
};

export function isHammerDevLaunchPresetId(value: string): value is HammerDevLaunchPresetId {
  return HAMMER_DEV_LAUNCH_PRESET_IDS.includes(value as HammerDevLaunchPresetId);
}

export function getHammerDevLaunchPreset(presetId: HammerDevLaunchPresetId): HammerLaunchContext {
  return cloneLaunchContext(PRESET_INDEX[presetId]);
}

function readTrimmed(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  if (!raw) return null;
  const next = raw.trim();
  return next.length ? next : null;
}

function readPreviewMode(value: string | null): HammerPreviewMode | null {
  if (value === "raw" || value === "edit-aware") {
    return value;
  }
  return null;
}

function pickPresetId(params: URLSearchParams): HammerDevLaunchPresetId {
  const explicitPreset = readTrimmed(params, "launch_preset")
    ?? readTrimmed(params, "launchPreset");
  if (explicitPreset && isHammerDevLaunchPresetId(explicitPreset)) {
    return explicitPreset;
  }

  const sourceMode = readTrimmed(params, "source_mode")
    ?? readTrimmed(params, "sourceMode");
  if (sourceMode === "tongs") {
    return "tongs-stub-clean";
  }

  if (
    sourceMode === "mapped"
    || readTrimmed(params, "media_root_abs")
    || readTrimmed(params, "media_root")
    || readTrimmed(params, "local_root_abs")
    || readTrimmed(params, "media_local_relpath")
    || readTrimmed(params, "media_relpath")
    || readTrimmed(params, "local_relpath")
  ) {
    return "mapped-media-missing";
  }

  return "dev-tone-basic";
}

function syncWorkspaceOnMediaSource(
  source: HammerMediaSource,
  workspaceId: string,
): HammerMediaSource {
  if (source.kind === "tongs-stub" && source.workspace_mapping) {
    return {
      ...source,
      workspace_mapping: {
        ...source.workspace_mapping,
        workspace_id: workspaceId,
      },
    };
  }
  return source;
}

function applyTranscriptOverrides(
  context: HammerLaunchContext,
  params: URLSearchParams,
): HammerLaunchContext {
  const transcriptFixtureId = readTrimmed(params, "transcript_fixture")
    ?? readTrimmed(params, "transcriptFixture");
  const transcriptJson = readTrimmed(params, "transcript_json")
    ?? readTrimmed(params, "transcript");

  if (transcriptJson) {
    return {
      ...context,
      transcript: {
        kind: "inline-json",
        transcript_json: transcriptJson,
        fallback_fixture_id: transcriptFixtureId ?? DEFAULT_TRANSCRIPT_FIXTURE_ID,
        label: "query:transcript_json",
      },
    };
  }

  if (!transcriptFixtureId) {
    return context;
  }

  return {
    ...context,
    transcript: {
      kind: "fixture",
      fixture_id: transcriptFixtureId,
    },
    visual_package: getDevVisualPackage({
      fixtureId: transcriptFixtureId,
      workspaceId: context.workspace_id,
      workpieceId: context.workpiece_id,
    }),
  };
}

function applyMediaOverrides(
  context: HammerLaunchContext,
  params: URLSearchParams,
): HammerLaunchContext {
  const sourceMode = readTrimmed(params, "source_mode")
    ?? readTrimmed(params, "sourceMode");
  const mediaId = readTrimmed(params, "media_id")
    ?? readTrimmed(params, "mediaId")
    ?? DEFAULT_MEDIA_ID;
  const mediaLocalRelpath = readTrimmed(params, "media_local_relpath")
    ?? readTrimmed(params, "media_relpath")
    ?? readTrimmed(params, "local_relpath")
    ?? DEFAULT_MEDIA_RELPATH;
  const mediaRootAbs = readTrimmed(params, "media_root_abs")
    ?? readTrimmed(params, "media_root")
    ?? readTrimmed(params, "local_root_abs");
  const shouldUseMappedSource = sourceMode === "mapped"
    || Boolean(mediaRootAbs)
    || readTrimmed(params, "media_local_relpath") != null
    || readTrimmed(params, "media_relpath") != null
    || readTrimmed(params, "local_relpath") != null;

  if (!shouldUseMappedSource) {
    if (context.media.kind === "dev-tone") {
      return {
        ...context,
        media: {
          ...context.media,
          media_id: mediaId,
        },
      };
    }

    if (context.media.kind === "mapped-local") {
      return {
        ...context,
        media: {
          ...context.media,
          ref: createMappedMediaRef(mediaId, mediaLocalRelpath),
          media_root_abs: mediaRootAbs ?? context.media.media_root_abs,
        },
      };
    }

    return {
      ...context,
      media: {
        ...context.media,
        ref: createMappedMediaRef(mediaId, mediaLocalRelpath),
      },
    };
  }

  return {
    ...context,
    source_mode: "mapped",
    media: {
      kind: "mapped-local",
      ref: createMappedMediaRef(mediaId, mediaLocalRelpath),
      media_root_abs: mediaRootAbs ?? undefined,
      label: mediaRootAbs ? "mapped:query" : "mapped:missing-local",
    },
  };
}

export function resolveHammerDevLaunchContext(search: string): HammerLaunchContext {
  const params = new URLSearchParams(search);
  const presetId = pickPresetId(params);
  const baseContext = getHammerDevLaunchPreset(presetId);
  const workspaceId = readTrimmed(params, "workspace_id")
    ?? readTrimmed(params, "workspaceId")
    ?? readTrimmed(params, "workspace")
    ?? baseContext.workspace_id;
  const workpieceId = readTrimmed(params, "workpiece_id")
    ?? readTrimmed(params, "workpieceId")
    ?? baseContext.workpiece_id;
  const sessionId = readTrimmed(params, "session_id")
    ?? readTrimmed(params, "sessionId")
    ?? baseContext.session_id;
  const previewMode = readPreviewMode(
    readTrimmed(params, "preview_mode")
    ?? readTrimmed(params, "previewMode"),
  );

  let context: HammerLaunchContext = {
    ...baseContext,
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    session_id: sessionId ?? undefined,
    visual_package: baseContext.visual_package
      ? syncVisualPackageIdentity(baseContext.visual_package, workspaceId, workpieceId)
      : undefined,
    media: syncWorkspaceOnMediaSource(baseContext.media, workspaceId),
  };

  context = applyTranscriptOverrides(context, params);
  context = applyMediaOverrides(context, params);

  if (previewMode) {
    context = {
      ...context,
      preview_mode: previewMode,
    };
  }

  return context;
}
