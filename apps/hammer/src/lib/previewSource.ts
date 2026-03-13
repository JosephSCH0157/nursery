import type { MediaRef, ResolveMediaResult, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";

export function buildHammerDevMediaUrl(localRootAbs: string, localRelpath: string): string {
  const params = new URLSearchParams({
    local_root_abs: localRootAbs,
    local_relpath: localRelpath,
  });
  return `/api/hammer/dev-media?${params.toString()}`;
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
