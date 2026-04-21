import type { MediaRef, ResolveMediaResult, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { normalizeWorkpieceRelativePath } from "../../../../packages/contracts/workpiece-paths";
import type { HammerPersistedAudioPolish } from "../persistence/hammerPersistenceContract";
import { tongsFetch } from "./tongsFetch";

export function buildHammerDevMediaUrl(localRootAbs: string, localRelpath: string): string {
  const params = new URLSearchParams({
    local_root_abs: localRootAbs,
    local_relpath: localRelpath,
  });
  return `/api/hammer/dev-media?${params.toString()}`;
}

export function buildHammerCanonicalWorkpieceReadUrl(workpieceId: string, workpiecePath: string): string {
  const normalizedPath = normalizeWorkpieceRelativePath(workpieceId, workpiecePath);
  const params = new URLSearchParams({
    path: normalizedPath,
    encoding: "binary",
  });
  return `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?${params.toString()}`;
}

export function toBrowserMediaSrc(playableUri: string): string {
  const value = playableUri.trim();
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (value.startsWith("/@fs/")) return value;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/")) {
    const normalized = value.replace(/\\/g, "/");
    return `/@fs/${encodeURI(normalized)}`;
  }
  return value;
}

export interface ResolvePreviewMediaSrcOptions {
  resolveResult: ResolveMediaResult | null;
  mediaRef: MediaRef | null;
  workspaceMapping: WorkspaceMediaMapping | null;
  devPlaybackUrl?: string | null;
}

export function resolvePreviewMediaSrc(
  options: ResolvePreviewMediaSrcOptions,
): string | null {
  if (!options.resolveResult || options.resolveResult.status !== "ok") {
    return null;
  }

  if (options.devPlaybackUrl) {
    return options.devPlaybackUrl;
  }

  const localRootAbs = options.workspaceMapping?.local_root_abs ?? null;
  const localRelpath = options.mediaRef?.local_relpath ?? null;
  if (localRootAbs && localRelpath) {
    return buildHammerDevMediaUrl(localRootAbs, localRelpath);
  }

  return options.resolveResult.playable_uri
    ? toBrowserMediaSrc(options.resolveResult.playable_uri)
    : null;
}

export function resolveAudioPolishPreviewSrc(
  workspaceMapping: WorkspaceMediaMapping | null,
  audioPolish: HammerPersistedAudioPolish | null | undefined,
): string | null {
  if (!workspaceMapping?.local_root_abs) return null;
  if (!audioPolish || audioPolish.status !== "prepared") return null;
  if (!audioPolish.output_local_relpath) return null;
  return buildHammerDevMediaUrl(workspaceMapping.local_root_abs, audioPolish.output_local_relpath);
}

export type HammerPreviewPlaybackSourceKind = "none" | "fallback" | "polished" | "attached" | "launch";

export interface BuildHammerPreviewPlaybackSourceModelArgs {
  playbackSrc?: string | null;
  resolvedMediaSrc?: string | null;
  polishedMediaSrc?: string | null;
  preferDevAudioFallback?: boolean;
  activeMediaUsesDevTone?: boolean;
  activeMediaRequiresResolution?: boolean;
  activeDevRecordingName?: string | null;
  activeMediaDisplayTitle?: string | null;
}

export interface HammerPreviewPlaybackSourceModel {
  sourceKind: HammerPreviewPlaybackSourceKind;
  sourceLabel: string;
  truthLabel: string;
  statusLabel: string;
  displayTitle: string;
}

function readTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildHammerPreviewPlaybackSourceModel(
  args: BuildHammerPreviewPlaybackSourceModelArgs,
): HammerPreviewPlaybackSourceModel {
  const playbackSrc = readTrimmed(args.playbackSrc);
  const resolvedMediaSrc = readTrimmed(args.resolvedMediaSrc);
  const polishedMediaSrc = readTrimmed(args.polishedMediaSrc);
  const activeDevRecordingName = readTrimmed(args.activeDevRecordingName);
  const activeMediaDisplayTitle = readTrimmed(args.activeMediaDisplayTitle);
  const usesPolishedPlayback = Boolean(
    playbackSrc
    && resolvedMediaSrc
    && polishedMediaSrc
    && !args.preferDevAudioFallback
    && resolvedMediaSrc === polishedMediaSrc
  );

  if (!playbackSrc) {
    return {
      sourceKind: "none",
      sourceLabel: "none",
      truthLabel: "Unavailable",
      statusLabel: "Preview source unavailable",
      displayTitle: activeMediaDisplayTitle ?? "Preview source unavailable",
    };
  }

  if (args.activeMediaUsesDevTone || args.preferDevAudioFallback || !resolvedMediaSrc) {
    return {
      sourceKind: "fallback",
      sourceLabel: "fallback tone",
      truthLabel: "Fallback source",
      statusLabel: args.activeMediaRequiresResolution === false
        ? "Fallback preview tone ready"
        : "Fallback preview source active",
      displayTitle: "Fallback tone",
    };
  }

  if (usesPolishedPlayback) {
    return {
      sourceKind: "polished",
      sourceLabel: "polished prep",
      truthLabel: "Polished prep",
      statusLabel: "Polished prep connected",
      displayTitle: "Polished prep",
    };
  }

  if (activeDevRecordingName) {
    return {
      sourceKind: "attached",
      sourceLabel: activeDevRecordingName,
      truthLabel: "Attached media",
      statusLabel: "Attached recording connected",
      displayTitle: activeDevRecordingName,
    };
  }

  return {
    sourceKind: "launch",
    sourceLabel: activeMediaDisplayTitle ?? "launch media",
    truthLabel: "Launch media",
    statusLabel: "Mapped media connected",
    displayTitle: activeMediaDisplayTitle ?? "Launch media",
  };
}

export async function loadCanonicalAudioPolishPreviewUrl(args: {
  workpieceId: string;
  workpiecePath: string;
  mimeType?: string | null;
}): Promise<string> {
  const response = await tongsFetch(
    buildHammerCanonicalWorkpieceReadUrl(args.workpieceId, args.workpiecePath),
    {
      method: "GET",
      headers: {
        accept: "application/octet-stream",
      },
      timeoutMs: 60_000,
    },
  );

  if (!response.ok) {
    let message = "Hammer could not load canonical audio preview.";
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object") {
        const row = payload as { error?: { message?: unknown }; message?: unknown };
        if (typeof row.error?.message === "string" && row.error.message.trim()) {
          message = row.error.message.trim();
        } else if (typeof row.message === "string" && row.message.trim()) {
          message = row.message.trim();
        }
      }
    } catch {
      // Keep the fallback message stable when the response is not JSON.
    }
    throw new Error(message);
  }

  const bytes = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type")?.trim()
    || args.mimeType?.trim()
    || "application/octet-stream";
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}
