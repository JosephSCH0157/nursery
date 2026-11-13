import { useEffect, useMemo } from "react";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerRawPlaybackSource } from "./hammerCanonicalPlayback";

export type HammerTransportDurationDiagnostic = Readonly<{
  code:
    | "hammer_transport_canonical_identity_incomplete"
    | "hammer_transport_canonical_authority_missing"
    | "hammer_transport_canonical_authority_mismatch"
    | "hammer_transport_canonical_duration_invalid"
    | "hammer_transport_canonical_duration_mismatch";
  message: string;
}>;

export type HammerTransportDurationResolution = Readonly<{
  durationSec: number;
  source: "verified_canonical_authority" | "hydrated_media" | "transcript";
  playbackSourceAccepted: boolean;
  verifiedDurationAuthority: Readonly<{ source: string; durationSec: number }> | null;
  diagnostic: HammerTransportDurationDiagnostic | null;
}>;

const DURATION_CONTRADICTION_TOLERANCE_SEC = 1;

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedSha256(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/^sha256:/, "") ?? "";
}

function fallbackDuration(args: {
  mediaRef: MediaRef | null;
  transcriptDurationSec: number;
  diagnostic?: HammerTransportDurationDiagnostic | null;
  playbackSourceAccepted?: boolean;
}): HammerTransportDurationResolution {
  const hydratedDurationSec = finitePositive(args.mediaRef?.duration_ms)
    ? args.mediaRef.duration_ms / 1000
    : 0;
  const transcriptDurationSec = finitePositive(args.transcriptDurationSec)
    ? args.transcriptDurationSec
    : 0;
  return Object.freeze({
    durationSec: hydratedDurationSec || transcriptDurationSec,
    source: hydratedDurationSec > 0 ? "hydrated_media" : "transcript",
    playbackSourceAccepted: args.playbackSourceAccepted ?? true,
    verifiedDurationAuthority: null,
    diagnostic: args.diagnostic ?? null,
  });
}

/**
 * Promotes a duration into transport authority only when it is carried by the
 * signed source selected for the same canonical recording, active revision,
 * and immutable media hash. Transcript timing remains an overlay and cannot
 * shorten canonical media.
 */
export function resolveHammerTransportDurationAuthority(args: {
  mediaRef: MediaRef | null;
  transcriptDurationSec: number;
  canonicalRecordingId: string | null;
  recordingRevisionId: string | null;
  rawPlaybackSource: HammerRawPlaybackSource | null;
}): HammerTransportDurationResolution {
  const source = args.rawPlaybackSource;
  if (source?.kind !== "canonical_signed") {
    return fallbackDuration(args);
  }

  const expectedRecordingId = args.canonicalRecordingId?.trim() ?? "";
  const expectedRevisionId = args.recordingRevisionId?.trim() ?? "";
  const expectedSha256 = normalizedSha256(args.mediaRef?.sha256);
  if (!expectedRecordingId || !expectedRevisionId || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    return fallbackDuration({
      ...args,
      diagnostic: Object.freeze({
        code: "hammer_transport_canonical_identity_incomplete",
        message: "Canonical transport requires a recording ID, active revision ID, and source SHA-256.",
      }),
      playbackSourceAccepted: false,
    });
  }

  const authority = source.authority;
  if (!authority) {
    return fallbackDuration({
      ...args,
      diagnostic: Object.freeze({
        code: "hammer_transport_canonical_authority_missing",
        message: "The signed canonical playback source did not include source authority.",
      }),
      playbackSourceAccepted: false,
    });
  }

  const authorityMatches = authority.canonicalRecordingId.trim() === expectedRecordingId
    && authority.recordingRevisionId.trim() === expectedRevisionId
    && normalizedSha256(authority.sourceSha256) === expectedSha256;
  if (!authorityMatches) {
    return fallbackDuration({
      ...args,
      diagnostic: Object.freeze({
        code: "hammer_transport_canonical_authority_mismatch",
        message: "The signed playback authority does not match the hydrated canonical recording, revision, and source SHA-256.",
      }),
      playbackSourceAccepted: false,
    });
  }

  if (!finitePositive(authority.durationSec)) {
    return fallbackDuration({
      ...args,
      diagnostic: Object.freeze({
        code: "hammer_transport_canonical_duration_invalid",
        message: "The verified canonical playback authority did not provide a finite positive duration.",
      }),
    });
  }

  const hydratedDurationSec = finitePositive(args.mediaRef?.duration_ms)
    ? args.mediaRef.duration_ms / 1000
    : null;
  if (
    hydratedDurationSec !== null
    && Math.abs(hydratedDurationSec - authority.durationSec) > DURATION_CONTRADICTION_TOLERANCE_SEC
  ) {
    return fallbackDuration({
      ...args,
      diagnostic: Object.freeze({
        code: "hammer_transport_canonical_duration_mismatch",
        message: "The signed playback duration contradicts the hydrated canonical recording duration.",
      }),
      playbackSourceAccepted: false,
    });
  }

  return Object.freeze({
    durationSec: authority.durationSec,
    source: "verified_canonical_authority",
    playbackSourceAccepted: true,
    verifiedDurationAuthority: Object.freeze({ source: source.url, durationSec: authority.durationSec }),
    diagnostic: null,
  });
}

export function useHammerTransportDurationAuthority(args: {
  mediaRef: MediaRef | null;
  transcriptDurationSec: number;
  canonicalRecordingId: string | null;
  recordingRevisionId: string | null;
  rawPlaybackSource: HammerRawPlaybackSource | null;
}): HammerTransportDurationResolution {
  const { mediaRef, transcriptDurationSec, canonicalRecordingId, recordingRevisionId, rawPlaybackSource } = args;
  const resolution = useMemo(
    () => resolveHammerTransportDurationAuthority({ mediaRef, transcriptDurationSec, canonicalRecordingId, recordingRevisionId, rawPlaybackSource }),
    [canonicalRecordingId, mediaRef, rawPlaybackSource, recordingRevisionId, transcriptDurationSec],
  );
  useEffect(() => {
    if (!resolution.diagnostic) return;
    console.error("[HammerPlayback:transport_duration_authority_rejected]", {
      code: resolution.diagnostic.code,
      message: resolution.diagnostic.message,
      canonicalRecordingId,
      recordingRevisionId,
      mediaId: mediaRef?.media_id ?? null,
      sourceSha256: mediaRef?.sha256 ?? null,
    });
  }, [canonicalRecordingId, mediaRef?.media_id, mediaRef?.sha256, recordingRevisionId, resolution.diagnostic]);
  return resolution;
}
