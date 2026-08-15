import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerCanonicalRecordingRecord } from "../persistence/hammerRecordingRevisionPersistence";

export function bindLaunchContextToCanonicalRecording(
  launchContext: HammerLaunchContext | undefined,
  canonicalRecording: HammerCanonicalRecordingRecord | null,
): HammerLaunchContext | undefined {
  if (!launchContext || !canonicalRecording?.media_path) return launchContext;
  const currentRef = launchContext.media.kind === "dev-tone" ? null : launchContext.media.ref;
  const canonicalPath = canonicalRecording.media_path.trim();
  const canonicalKind = /\.(?:mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(canonicalPath)
    ? "recording_audio"
    : "recording_video";
  const canonicalMediaId = canonicalRecording.media_id || canonicalRecording.id;
  const currentRefMatchesCanonical = currentRef?.media_id === canonicalMediaId
    && currentRef.local_relpath === canonicalPath;
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
        ...(currentRefMatchesCanonical ? {
          byte_size: currentRef.byte_size,
          sha256: currentRef.sha256,
          duration_ms: currentRef.duration_ms,
        } : {}),
      },
      workspace_mapping: launchContext.media.kind === "tongs-stub"
        ? launchContext.media.workspace_mapping
        : undefined,
      label: canonicalPath,
    },
  };
}
