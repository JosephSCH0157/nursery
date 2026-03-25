import type { HammerPersistedAudioPolish } from "../persistence/hammerPersistenceContract";
import type {
  HammerAudioPolishFailureCode,
  HammerAudioPolishPass,
} from "../persistence/hammerPersistenceContract";
import type { HammerPrepSource } from "./hammerPrep";

export const HAMMER_AUDIO_POLISH_PROCESSOR_VERSION = "forge-v1.2.0/audio-polish.v2";
export const HAMMER_AUDIO_POLISH_PREPARED_PASSES: HammerAudioPolishPass[] = [
  "studio_sound",
  "noise_cleanup",
  "level_consistency",
];
const TERMINAL_FAILURE_CODES = new Set<HammerAudioPolishFailureCode>([
  "unsupported_source",
  "source_unavailable",
]);

function cloneSettingsSummary(
  value: Record<string, string | number | boolean | null> | null | undefined,
): Record<string, string | number | boolean | null> {
  return value ? { ...value } : {};
}

export function cloneHammerAudioPolish(
  value: HammerPersistedAudioPolish | null | undefined,
): HammerPersistedAudioPolish | null {
  if (!value) return null;
  return {
    ...value,
    prepared_passes: [...value.prepared_passes],
    source_artifact_paths: [...value.source_artifact_paths],
    settings_summary: cloneSettingsSummary(value.settings_summary),
  };
}

export function buildNotStartedHammerAudioPolish(): HammerPersistedAudioPolish {
  return {
    schema_version: 1,
    status: "not_started",
    prepared_passes: [],
    source_artifact_paths: [],
    settings_summary: {},
    source_media_id: null,
    source_media_signature: null,
    processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
    prepared_at: null,
    output_local_relpath: null,
    output_workpiece_path: null,
    output_mime_type: null,
    output_duration_ms: null,
    failure_code: null,
    failure_reason: null,
  };
}

function buildBaseAudioPolish(
  prepSource: HammerPrepSource,
  overrides: Partial<HammerPersistedAudioPolish>,
): HammerPersistedAudioPolish {
  return {
    ...buildNotStartedHammerAudioPolish(),
    source_media_id: prepSource.mediaRef.media_id,
    source_media_signature: prepSource.media_signature,
    ...overrides,
    prepared_passes: overrides.prepared_passes ? [...overrides.prepared_passes] : [],
    source_artifact_paths: overrides.source_artifact_paths
      ? [...overrides.source_artifact_paths]
      : [prepSource.canonical_workpiece_path],
    settings_summary: cloneSettingsSummary(overrides.settings_summary),
  };
}

export function buildPreparingHammerAudioPolish(
  prepSource: HammerPrepSource,
): HammerPersistedAudioPolish {
  return buildBaseAudioPolish(prepSource, {
    status: "preparing",
    settings_summary: {
      source_media_kind: prepSource.mediaRef.kind,
      source_kind: prepSource.source_kind,
      source_canonical_workpiece_path: prepSource.canonical_workpiece_path,
      source_local_relpath: prepSource.local_relpath,
      source_media_signature: prepSource.media_signature,
      supported_source: true,
    },
  });
}

export function buildPreparedHammerAudioPolish(args: {
  prepSource: HammerPrepSource;
  preparedAt: string;
  outputLocalRelpath?: string | null;
  outputWorkpiecePath?: string | null;
  outputMimeType: string;
  outputDurationMs: number | null;
  settingsSummary?: Record<string, string | number | boolean | null>;
  preparedPasses?: HammerAudioPolishPass[];
  sourceArtifactPaths?: string[];
}): HammerPersistedAudioPolish {
  return buildBaseAudioPolish(args.prepSource, {
    status: "prepared",
    prepared_passes: args.preparedPasses ?? HAMMER_AUDIO_POLISH_PREPARED_PASSES,
    source_artifact_paths: args.sourceArtifactPaths ?? [args.prepSource.canonical_workpiece_path],
    processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
    prepared_at: args.preparedAt,
    output_local_relpath: args.outputLocalRelpath ?? null,
    output_workpiece_path: args.outputWorkpiecePath ?? null,
    output_mime_type: args.outputMimeType,
    output_duration_ms: args.outputDurationMs,
    failure_code: null,
    failure_reason: null,
    settings_summary: {
      source_media_kind: args.prepSource.mediaRef.kind,
      source_kind: args.prepSource.source_kind,
      source_canonical_workpiece_path: args.prepSource.canonical_workpiece_path,
      source_local_relpath: args.prepSource.local_relpath,
      supported_source: true,
      ...args.settingsSummary,
    },
  });
}

export function buildFailedHammerAudioPolish(args: {
  prepSource: HammerPrepSource;
  failureCode: HammerAudioPolishFailureCode;
  failureReason: string;
  settingsSummary?: Record<string, string | number | boolean | null>;
}): HammerPersistedAudioPolish {
  return buildBaseAudioPolish(args.prepSource, {
    status: "failed",
    prepared_passes: [],
    processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
    prepared_at: null,
    output_local_relpath: null,
    output_workpiece_path: null,
    output_mime_type: null,
    output_duration_ms: null,
    failure_code: args.failureCode,
    failure_reason: args.failureReason,
    settings_summary: {
      source_media_kind: args.prepSource.mediaRef.kind,
      source_kind: args.prepSource.source_kind,
      source_canonical_workpiece_path: args.prepSource.canonical_workpiece_path,
      source_local_relpath: args.prepSource.local_relpath,
      supported_source: args.failureCode !== "unsupported_source" ? true : false,
      ...args.settingsSummary,
    },
  });
}

export function isReusableHammerAudioPolish(
  artifact: HammerPersistedAudioPolish | null | undefined,
  prepSource: HammerPrepSource,
): boolean {
  if (!artifact) return false;
  if (artifact.processor_version !== HAMMER_AUDIO_POLISH_PROCESSOR_VERSION) return false;
  if (artifact.source_media_signature !== prepSource.media_signature) return false;
  if (artifact.source_media_id !== prepSource.mediaRef.media_id) return false;

  if (artifact.status === "prepared") {
    return Boolean((artifact.output_local_relpath || artifact.output_workpiece_path) && artifact.output_mime_type);
  }

  if (artifact.status === "failed" && artifact.failure_code) {
    return TERMINAL_FAILURE_CODES.has(artifact.failure_code);
  }

  return false;
}
