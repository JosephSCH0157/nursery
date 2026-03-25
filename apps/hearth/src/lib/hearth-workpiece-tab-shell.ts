import type { Revision } from "../domain/revision";
import type { EpisodeMediaMapEntry, EpisodeMediaMapStatus } from "./episode-package-v2";

export type WorkpieceWorkspaceTab = "script" | "visuals" | "metadata" | "release" | "history";

function readWorkpieceWorkspaceTabValue(value: unknown): WorkpieceWorkspaceTab | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "script" || normalized === "visuals" || normalized === "metadata" || normalized === "release" || normalized === "history") {
    return normalized;
  }
  return null;
}

export function normalizeWorkpieceWorkspaceTab(value: unknown): WorkpieceWorkspaceTab {
  return readWorkpieceWorkspaceTabValue(value) ?? "script";
}

export function resolveRestoredWorkpieceWorkspaceTab(input: {
  workpieceTab: unknown;
  workspaceTab: unknown;
  lastTab: unknown;
}): WorkpieceWorkspaceTab {
  const workpieceTab = readWorkpieceWorkspaceTabValue(input.workpieceTab);
  if (workpieceTab) return workpieceTab;
  const workspaceTab = readWorkpieceWorkspaceTabValue(input.workspaceTab);
  if (workspaceTab) return workspaceTab;
  return normalizeWorkpieceWorkspaceTab(input.lastTab);
}

export function resolveMediaPlanCoverageLevel(entries: EpisodeMediaMapEntry[]): "HIGH" | "MEDIUM" | "LOW" {
  if (entries.length === 0) return "LOW";
  const resolvedCount = entries.filter((entry) => entry.source.status === "selected" || entry.source.status === "attached").length;
  const ratio = resolvedCount / entries.length;
  if (ratio >= 0.75) return "HIGH";
  if (ratio >= 0.4) return "MEDIUM";
  return "LOW";
}

export function resolveMediaPlanScopeLabel(entries: EpisodeMediaMapEntry[]): "Images Only" | "Images+B-roll" | "Full Plan" {
  const kinds = new Set(entries.map((entry) => entry.final_media_kind));
  if (kinds.size === 0 || (kinds.size === 1 && kinds.has("image"))) return "Images Only";
  if (!kinds.has("contextual_data_composite")) return "Images+B-roll";
  return "Full Plan";
}

export function resolveReleaseReadinessChecklist(input: {
  hasApprovedScript: boolean;
  mediaMapStatus: EpisodeMediaMapStatus | null;
  metadataComplete: boolean;
  thumbnailsSelected: boolean;
}): { completeCount: number; totalCount: 4 } {
  const mediaPlanActivated = input.mediaMapStatus === "activated"
    || input.mediaMapStatus === "fulfilling"
    || input.mediaMapStatus === "fulfilled";
  const completeCount = [
    input.hasApprovedScript,
    mediaPlanActivated,
    input.metadataComplete,
    input.thumbnailsSelected,
  ].filter(Boolean).length;
  return { completeCount, totalCount: 4 };
}

export function resolveHistoryMilestoneMarker(revisions: Revision[]): string {
  const latestMilestone = revisions.find((revision) => revision.kind === "milestone");
  if (!latestMilestone) return "No milestone";
  return `Milestone ${latestMilestone.createdAt}`;
}
