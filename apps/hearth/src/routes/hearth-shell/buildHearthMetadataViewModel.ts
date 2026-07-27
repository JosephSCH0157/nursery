import type { HearthMetadataController, HearthMetadataLoadStatus } from "./hearth-metadata-contracts";

export function resolveHearthMetadataLoadStatus(args: {
  active: boolean;
  loaded: boolean;
  failed: boolean;
  authorityAvailable: boolean;
  canonicalPresent: boolean;
}): HearthMetadataLoadStatus {
  if (!args.active) return "inactive";
  if (!args.authorityAvailable) return "unavailable";
  if (args.failed) return "failed";
  if (!args.loaded) return "loading";
  return args.canonicalPresent ? "loaded" : "absent";
}

export function buildHearthMetadataMeta(args: {
  titleCount: number;
  tagCount: number;
  framingPackReady: boolean;
}): string {
  return `${args.titleCount} title${args.titleCount === 1 ? "" : "s"} · ${args.tagCount} tag${args.tagCount === 1 ? "" : "s"}${args.framingPackReady ? " · Pack ready" : ""}`;
}

export function isHearthMetadataComplete(
  progress: HearthMetadataController["state"]["progress"],
): boolean {
  return progress.completion === "complete";
}
