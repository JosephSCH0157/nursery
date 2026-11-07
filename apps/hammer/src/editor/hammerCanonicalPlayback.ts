import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { loadHammerCanonicalPlayableMedia, loadWorkpieceMediaPreviewUrl } from "../lib/hammerSourceDeskMediaApi";

export type HammerRawPlaybackSource = Readonly<{
  url: string;
  kind: "canonical_signed" | "buffered_preview";
  expiresAt: string | null;
}>;

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
}): Promise<HammerRawPlaybackSource> {
  const sourceSha256 = args.mediaRef.sha256?.trim() ?? "";
  if (args.canonicalRecordingId && args.recordingRevisionId && /^[0-9a-f]{64}$/i.test(sourceSha256)) {
    const media = await loadHammerCanonicalPlayableMedia({
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      canonicalRecordingId: args.canonicalRecordingId,
      recordingRevisionId: args.recordingRevisionId,
      sourceSha256,
    });
    return Object.freeze({ url: media.url, kind: "canonical_signed", expiresAt: media.expiresAt });
  }
  return Object.freeze({
    url: await loadWorkpieceMediaPreviewUrl({ workpieceId: args.workpieceId, path: args.path, mimeType: args.mimeType, surface: "unknown" }),
    kind: "buffered_preview",
    expiresAt: null,
  });
}
