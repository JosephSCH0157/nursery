export type HammerPlaybackReadiness = Readonly<{
  status: "idle" | "loading_metadata" | "metadata_ready" | "playable" | "failed";
  source: string | null;
  durationSec: number | null;
  durationSource: "media" | "verified_authority" | null;
  error: string | null;
}>;

export function createHammerPlaybackReadiness(source: string | null): HammerPlaybackReadiness {
  return Object.freeze({ status: source ? "loading_metadata" : "idle", source, durationSec: null, durationSource: null, error: null });
}

export function acceptHammerPlaybackMetadata(args: {
  current: HammerPlaybackReadiness;
  source: string | null;
  durationSec: number;
  expectedDurationSec: number;
  verifiedDurationSec?: number | null;
}): HammerPlaybackReadiness {
  if (args.source !== args.current.source) return args.current;
  const verifiedDurationSec = typeof args.verifiedDurationSec === "number"
    && Number.isFinite(args.verifiedDurationSec)
    && args.verifiedDurationSec > 0
    ? args.verifiedDurationSec
    : null;
  if (args.durationSec === Number.POSITIVE_INFINITY) {
    if (verifiedDurationSec === null) {
      return Object.freeze({ ...args.current, status: "failed", error: "media_duration_unknown" });
    }
    return Object.freeze({
      ...args.current,
      status: "metadata_ready",
      durationSec: verifiedDurationSec,
      durationSource: "verified_authority",
      error: null,
    });
  }
  if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) {
    return Object.freeze({ ...args.current, status: "failed", error: "media_duration_invalid" });
  }
  const comparisonDurationSec = verifiedDurationSec ?? (args.expectedDurationSec > 0 ? args.expectedDurationSec : null);
  if (comparisonDurationSec !== null && Math.abs(args.durationSec - comparisonDurationSec) > 1) {
    return Object.freeze({ ...args.current, status: "failed", durationSec: args.durationSec, error: "media_duration_mismatch" });
  }
  return Object.freeze({
    ...args.current,
    status: "metadata_ready",
    durationSec: verifiedDurationSec ?? args.durationSec,
    durationSource: verifiedDurationSec === null ? "media" : "verified_authority",
    error: null,
  });
}

export function acceptHammerPlaybackCanPlay(current: HammerPlaybackReadiness, source: string | null): HammerPlaybackReadiness {
  if (source !== current.source || current.status !== "metadata_ready") return current;
  return Object.freeze({ ...current, status: "playable" });
}

export function failHammerPlayback(current: HammerPlaybackReadiness, source: string | null, error: string): HammerPlaybackReadiness {
  if (source !== current.source) return current;
  return Object.freeze({ ...current, status: "failed", error });
}

export function clampHammerMediaSeekTime(requestedSec: number, durationSec: number, effectiveDurationSec?: number | null): number {
  if (!Number.isFinite(requestedSec)) return 0;
  const bound = typeof effectiveDurationSec === "number" && Number.isFinite(effectiveDurationSec) && effectiveDurationSec > 0
    ? effectiveDurationSec
    : durationSec;
  if (!Number.isFinite(bound) || bound <= 0) return Math.max(0, requestedSec);
  return Math.max(0, Math.min(requestedSec, bound));
}
import { useEffect, useState, type RefObject } from "react";


export function useHammerPlaybackReadiness(args: {
  mediaRef: RefObject<HTMLVideoElement | null>;
  source: string | null;
  expectedDurationSec: number;
  verifiedDurationAuthority?: Readonly<{ source: string; durationSec: number }> | null;
}): HammerPlaybackReadiness {
  const [readiness, setReadiness] = useState(() => createHammerPlaybackReadiness(args.source));
  useEffect(() => {
    const media = args.mediaRef.current;
    if (!media || !args.source) {
      setReadiness(createHammerPlaybackReadiness(args.source));
      return;
    }
    const source = args.source;
    const verifiedDurationSec = args.verifiedDurationAuthority?.source === source
      ? args.verifiedDurationAuthority.durationSec
      : null;
    const reconcile = (canPlay: boolean) => setReadiness((current) => {
      let next = current.source === source ? current : createHammerPlaybackReadiness(source);
      if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
        next = acceptHammerPlaybackMetadata({ current: next, source, durationSec: media.duration, expectedDurationSec: args.expectedDurationSec, verifiedDurationSec });
      }
      if (canPlay || media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        next = acceptHammerPlaybackCanPlay(next, source);
      }
      return next;
    });
    const metadata = () => reconcile(false);
    const canPlay = () => reconcile(true);
    const error = () => setReadiness((current) => failHammerPlayback(current, source, media.error?.message ?? "media_load_failed"));
    media.addEventListener("loadedmetadata", metadata); media.addEventListener("durationchange", metadata); media.addEventListener("canplay", canPlay); media.addEventListener("error", error);
    setReadiness(() => {
      let next = createHammerPlaybackReadiness(source);
      if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
        next = acceptHammerPlaybackMetadata({ current: next, source, durationSec: media.duration, expectedDurationSec: args.expectedDurationSec, verifiedDurationSec });
      }
      if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) next = acceptHammerPlaybackCanPlay(next, source);
      return next;
    });
    return () => { media.removeEventListener("loadedmetadata", metadata); media.removeEventListener("durationchange", metadata); media.removeEventListener("canplay", canPlay); media.removeEventListener("error", error); };
  }, [args.expectedDurationSec, args.mediaRef, args.source, args.verifiedDurationAuthority?.durationSec, args.verifiedDurationAuthority?.source]);
  return readiness;
}
