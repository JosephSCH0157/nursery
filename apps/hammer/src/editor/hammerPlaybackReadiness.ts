export type HammerPlaybackReadiness = Readonly<{
  status: "idle" | "loading_metadata" | "metadata_ready" | "playable" | "failed";
  source: string | null;
  durationSec: number | null;
  error: string | null;
}>;

export function createHammerPlaybackReadiness(source: string | null): HammerPlaybackReadiness {
  return Object.freeze({ status: source ? "loading_metadata" : "idle", source, durationSec: null, error: null });
}

export function acceptHammerPlaybackMetadata(args: {
  current: HammerPlaybackReadiness;
  source: string | null;
  durationSec: number;
  expectedDurationSec: number;
}): HammerPlaybackReadiness {
  if (args.source !== args.current.source) return args.current;
  if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) {
    return Object.freeze({ ...args.current, status: "failed", error: "media_duration_invalid" });
  }
  if (args.expectedDurationSec > 0 && Math.abs(args.durationSec - args.expectedDurationSec) > 1) {
    return Object.freeze({ ...args.current, status: "failed", durationSec: args.durationSec, error: "media_duration_mismatch" });
  }
  return Object.freeze({ ...args.current, status: "metadata_ready", durationSec: args.durationSec, error: null });
}

export function acceptHammerPlaybackCanPlay(current: HammerPlaybackReadiness, source: string | null): HammerPlaybackReadiness {
  if (source !== current.source || current.status !== "metadata_ready") return current;
  return Object.freeze({ ...current, status: "playable" });
}

export function failHammerPlayback(current: HammerPlaybackReadiness, source: string | null, error: string): HammerPlaybackReadiness {
  if (source !== current.source) return current;
  return Object.freeze({ ...current, status: "failed", error });
}

export function clampHammerMediaSeekTime(requestedSec: number, durationSec: number): number {
  if (!Number.isFinite(requestedSec)) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return Math.max(0, requestedSec);
  return Math.max(0, Math.min(requestedSec, durationSec));
}
import { useEffect, useState, type RefObject } from "react";


export function useHammerPlaybackReadiness(args: {
  mediaRef: RefObject<HTMLVideoElement | null>;
  source: string | null;
  expectedDurationSec: number;
}): HammerPlaybackReadiness {
  const [readiness, setReadiness] = useState(() => createHammerPlaybackReadiness(args.source));
  useEffect(() => {
    const media = args.mediaRef.current;
    setReadiness(createHammerPlaybackReadiness(args.source));
    if (!media || !args.source) return;
    const source = args.source;
    const metadata = () => setReadiness((current) => acceptHammerPlaybackMetadata({ current, source, durationSec: media.duration, expectedDurationSec: args.expectedDurationSec }));
    const canPlay = () => setReadiness((current) => acceptHammerPlaybackCanPlay(current, source));
    const error = () => setReadiness((current) => failHammerPlayback(current, source, media.error?.message ?? "media_load_failed"));
    media.addEventListener("loadedmetadata", metadata); media.addEventListener("canplay", canPlay); media.addEventListener("error", error);
    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) metadata();
    if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) canPlay();
    return () => { media.removeEventListener("loadedmetadata", metadata); media.removeEventListener("canplay", canPlay); media.removeEventListener("error", error); };
  }, [args.expectedDurationSec, args.mediaRef, args.source]);
  return readiness;
}
