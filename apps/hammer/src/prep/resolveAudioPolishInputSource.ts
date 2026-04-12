import type { HammerPrepSource } from "./hammerPrep";
import type { HammerAudioPolishRequest } from "./hammerAudioPolishApi";

export type AudioPolishResolvedInputType = "url" | "local_path" | "unknown";

export type AudioPolishAttemptedSource = {
  kind: "local_path" | "url";
  value: string;
};

export type ResolvedAudioPolishInputSource =
  | {
      supported: true;
      resolved_input_type: Exclude<AudioPolishResolvedInputType, "unknown">;
      source_kind: HammerPrepSource["source_kind"];
      source: NonNullable<HammerAudioPolishRequest["input"]>;
      attempted_sources: AudioPolishAttemptedSource[];
    }
  | {
      supported: false;
      resolved_input_type: AudioPolishResolvedInputType;
      source_kind: HammerPrepSource["source_kind"];
      reason: string;
      attempted_sources: AudioPolishAttemptedSource[];
    };

function readWindowOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const origin = window.location?.origin;
  return typeof origin === "string" && origin.trim() ? origin.trim() : null;
}

function joinRelpath(rootAbs: string, relpath: string): string {
  const normalizedRoot = rootAbs.replace(/[\\/]+$/g, "");
  const normalizedRel = relpath.replace(/^[\\/]+/g, "");
  const usesBackslash = /\\|^[a-zA-Z]:/.test(normalizedRoot);
  const separator = usesBackslash ? "\\" : "/";
  const rel = usesBackslash ? normalizedRel.replace(/\//g, "\\") : normalizedRel.replace(/\\/g, "/");
  return `${normalizedRoot}${separator}${rel}`;
}

function buildTongsReadFileUrl(origin: string, workpieceId: string, workpiecePath: string): string {
  const url = new URL(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file`, origin);
  url.searchParams.set("path", workpiecePath);
  url.searchParams.set("encoding", "binary");
  return url.toString();
}

export function resolveAudioPolishInputSource(args: {
  workpiece_id: string;
  prepSource: HammerPrepSource;
}): ResolvedAudioPolishInputSource {
  const attempted_sources: AudioPolishAttemptedSource[] = [];
  const source_kind = args.prepSource.source_kind;

  const localRootAbs = args.prepSource.local_root_abs?.trim() || null;
  const localRelpath = args.prepSource.local_relpath?.trim() || null;
  const canonicalWorkpiecePath = args.prepSource.canonical_workpiece_path?.trim() || null;

  if (localRootAbs && localRelpath) {
    const localPath = joinRelpath(localRootAbs, localRelpath);
    attempted_sources.push({ kind: "local_path", value: localPath });
    return {
      supported: true,
      resolved_input_type: "local_path",
      source_kind,
      source: { type: "local_path", value: localPath },
      attempted_sources,
    };
  }

  if (canonicalWorkpiecePath) {
    const origin = readWindowOrigin();
    if (origin) {
      const url = buildTongsReadFileUrl(origin, args.workpiece_id, canonicalWorkpiecePath);
      attempted_sources.push({ kind: "url", value: url });
      return {
        supported: true,
        resolved_input_type: "url",
        source_kind,
        source: { type: "url", value: url },
        attempted_sources,
      };
    }
  }

  return {
    supported: false,
    resolved_input_type: "unknown",
    source_kind,
    reason: canonicalWorkpiecePath
      ? "Hammer could not resolve a runtime origin for canonical workpiece media."
      : "Hammer could not resolve a canonical workpiece media pointer for audio polish.",
    attempted_sources,
  };
}
