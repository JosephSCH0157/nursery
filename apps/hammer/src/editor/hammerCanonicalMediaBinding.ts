import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerCanonicalRecordingRecord } from "../persistence/hammerRecordingRevisionPersistence";

export function bindLaunchContextToCanonicalRecording(
  launchContext: HammerLaunchContext | undefined,
  canonicalRecording: HammerCanonicalRecordingRecord | null,
): HammerLaunchContext | undefined {
  if (!launchContext || !canonicalRecording?.media_path) return launchContext;
  const canonicalPath = canonicalRecording.media_path.trim();
  const canonicalKind = /\.(?:mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(canonicalPath)
    ? "recording_audio"
    : "recording_video";
  const canonicalMediaId = canonicalRecording.media_id || canonicalRecording.id;
  const canonicalSha256 = canonicalRecording.media_signature?.trim().toLowerCase().replace(/^sha256:/, "") ?? "";
  const canonicalDurationMs = canonicalRecording.media_duration_ms;
  const canonicalByteSize = canonicalRecording.media_bytes;
  return {
    ...launchContext,
    source_mode: "tongs",
    media: {
      kind: "tongs-stub",
      ref: {
        media_id: canonicalMediaId,
        kind: canonicalKind,
        source_hint: "cloud",
        local_relpath: canonicalPath,
        ...(typeof canonicalByteSize === "number" && Number.isSafeInteger(canonicalByteSize) && canonicalByteSize >= 0
          ? { byte_size: canonicalByteSize }
          : {}),
        ...(/^[0-9a-f]{64}$/.test(canonicalSha256)
          ? { sha256: canonicalSha256 }
          : {}),
        ...(typeof canonicalDurationMs === "number" && Number.isFinite(canonicalDurationMs) && canonicalDurationMs > 0
          ? { duration_ms: canonicalDurationMs }
          : {}),
      },
      workspace_mapping: launchContext.media.kind === "tongs-stub"
        ? launchContext.media.workspace_mapping
        : undefined,
      label: canonicalPath,
    },
  };
}
