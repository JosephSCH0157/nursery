import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { loadHammerCanonicalPlayableMedia, loadWorkpieceMediaPreviewUrl, type TongsFetcher } from "../lib/hammerSourceDeskMediaApi";

export type HammerRawPlaybackSource = Readonly<{
  url: string;
  kind: "canonical_signed" | "buffered_preview";
  expiresAt: string | null;
  authority: Readonly<{
    canonicalRecordingId: string;
    recordingRevisionId: string;
    sourceSha256: string;
    durationSec: number | null;
  }> | null;
}>;

export type HammerCanonicalPlaybackIdentityError = Error & { code: string };

function createCanonicalPlaybackIdentityError(code: string, message: string): HammerCanonicalPlaybackIdentityError {
  return Object.assign(new Error(message), { code });
}

export const HAMMER_SIGNED_MEDIA_REFRESH_LEAD_MS = 60_000;

export function createHammerPlaybackSourceResolutionGuard() {
  let generation = 0;
  return Object.freeze({
    begin() { generation += 1; return generation; },
    accepts(token: number) { return token === generation; },
    invalidate() { generation += 1; },
  });
}

export function selectHammerEffectivePlaybackUrl(args: {
  rawUrl: string | null;
  processedUrl: string | null;
  polishedUrl: string | null;
  useProcessed: boolean;
  preferPolished: boolean;
}): string | null {
  if (args.useProcessed && args.processedUrl) return args.processedUrl;
  if (args.preferPolished && args.polishedUrl) return args.polishedUrl;
  return args.rawUrl;
}

export function resolveHammerSignedMediaRefreshDelayMs(expiresAt: string, nowMs = Date.now()): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) throw new Error("hammer_playback_expiry_invalid");
  return Math.max(0, expiresAtMs - nowMs - HAMMER_SIGNED_MEDIA_REFRESH_LEAD_MS);
}

export async function resolveHammerRawPlaybackSource(args: {
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string | null;
  recordingRevisionId: string | null;
  mediaRef: MediaRef;
  path: string;
  mimeType: string;
  fetcher?: TongsFetcher;
}): Promise<HammerRawPlaybackSource> {
  const sourceSha256 = args.mediaRef.sha256?.trim() ?? "";
  const hasCanonicalIdentity = Boolean(args.canonicalRecordingId || args.recordingRevisionId);
  if (hasCanonicalIdentity && (!args.canonicalRecordingId || !args.recordingRevisionId || !/^[0-9a-f]{64}$/i.test(sourceSha256))) {
    throw createCanonicalPlaybackIdentityError(
      "hammer_canonical_playback_identity_incomplete",
      "Canonical playback requires a recording ID, active revision ID, and source SHA-256.",
    );
  }
  if (args.canonicalRecordingId && args.recordingRevisionId) {
    const media = await loadHammerCanonicalPlayableMedia({
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      canonicalRecordingId: args.canonicalRecordingId,
      recordingRevisionId: args.recordingRevisionId,
      sourceSha256,
      fetcher: args.fetcher,
    });
    const receiptDurationMs = media.durationMs;
    const expectedDurationMs = args.mediaRef.duration_ms;
    if (
      typeof receiptDurationMs === "number"
      && Number.isFinite(receiptDurationMs)
      && receiptDurationMs > 0
      && typeof expectedDurationMs === "number"
      && Number.isFinite(expectedDurationMs)
      && expectedDurationMs > 0
      && Math.abs(receiptDurationMs - expectedDurationMs) > 1000
    ) {
      throw createCanonicalPlaybackIdentityError(
        "hammer_canonical_playback_duration_mismatch",
        "Canonical playback duration contradicted the hydrated recording authority.",
      );
    }
    const durationMs = typeof receiptDurationMs === "number" && Number.isFinite(receiptDurationMs) && receiptDurationMs > 0
      ? receiptDurationMs
      : typeof expectedDurationMs === "number" && Number.isFinite(expectedDurationMs) && expectedDurationMs > 0
      ? expectedDurationMs
      : null;
    return Object.freeze({
      url: media.url,
      kind: "canonical_signed",
      expiresAt: media.expiresAt,
      authority: Object.freeze({
        canonicalRecordingId: media.canonicalRecordingId,
        recordingRevisionId: media.recordingRevisionId,
        sourceSha256: media.sourceSha256.trim().toLowerCase().replace(/^sha256:/, ""),
        durationSec: durationMs === null ? null : durationMs / 1000,
      }),
    });
  }
  return Object.freeze({
    url: await loadWorkpieceMediaPreviewUrl({ workpieceId: args.workpieceId, path: args.path, mimeType: args.mimeType, surface: "unknown", fetcher: args.fetcher }),
    kind: "buffered_preview",
    expiresAt: null,
    authority: null,
  });
}

export async function resolveHammerRawPlaybackSourceWithDiagnostics(
  args: Parameters<typeof resolveHammerRawPlaybackSource>[0],
): Promise<HammerRawPlaybackSource | null> {
  try {
    return await resolveHammerRawPlaybackSource(args);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "hammer_playback_source_resolution_failed";
    console.error("[HammerPlayback:source_resolution_failed]", {
      code,
      message: error instanceof Error ? error.message : String(error),
      canonicalRecordingId: args.canonicalRecordingId,
      recordingRevisionId: args.recordingRevisionId,
      mediaId: args.mediaRef.media_id,
      sourceSha256: args.mediaRef.sha256 ?? null,
    });
    return null;
  }
}
