import type { EpisodeMediaMapStatus } from "../../lib/episode-package-v2";

export type HearthReleaseChecklistState = "complete" | "incomplete" | "unavailable" | "loading";

export type HearthReleaseChecklistItem = Readonly<{
  id: "script" | "media_plan" | "metadata" | "thumbnail";
  label: string;
  state: HearthReleaseChecklistState;
  reason: string | null;
}>;

export type HearthReleasePreparationController = {
  state: {
    artifact: {
      rawText: string | null;
      sections: ReadonlyArray<{ key: string; label: string; content: string }>;
      scriptVersion: number | null;
    };
    checklist: ReadonlyArray<HearthReleaseChecklistItem>;
  };
  status: {
    load: "inactive" | "loading" | "missing" | "ready" | "failed" | "unavailable";
    stale: "current" | "stale" | "unknown";
    readiness: "ready" | "blocked";
  };
  commands: {
    refreshArtifact: () => void;
  };
  handoff: Readonly<{
    workspaceId: string | null;
    workpieceId: string | null;
    ready: boolean;
    blockingReasons: ReadonlyArray<string>;
  }>;
  summary: string;
  surface: {
    hasApprovedScript: boolean;
    approvedScriptVersion: number | null;
    hasFramingComplete: boolean;
    hasThumbnailsSelected: boolean;
    mediaMapStatus: EpisodeMediaMapStatus | null;
    releaseReadinessCompleteCount: number;
    releaseReadinessTotalCount: number;
  } | null;
};
