import { useReleasePrepPackWorkspace } from "../../hooks/visuals/useReleasePrepPackWorkspace";
import type { EpisodeMediaMapStatus } from "../../lib/episode-package-v2";
import { buildHearthReleaseChecklist } from "./buildHearthReleaseChecklist";
import type { HearthReleasePreparationController } from "./hearth-release-preparation-contracts";

export const useHearthReleasePreparationWorkspaceState = useReleasePrepPackWorkspace;

type ReleaseWorkspace = ReturnType<typeof useHearthReleasePreparationWorkspaceState>;

export function buildHearthReleasePreparationController(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  active: boolean;
  scriptAuthorityAvailable: boolean;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  mediaAuthorityAvailable: boolean;
  mediaMapStatus: EpisodeMediaMapStatus | null;
  metadataAuthorityAvailable: boolean;
  metadataComplete: boolean;
  thumbnailAuthorityAvailable: boolean;
  thumbnailsSelected: boolean;
  workspace: ReleaseWorkspace;
}): HearthReleasePreparationController {
  const checklist = buildHearthReleaseChecklist(args);
  const completeCount = checklist.filter((entry) => entry.state === "complete").length;
  const ready = checklist.length > 0 && completeCount === checklist.length;
  const blockingReasons = checklist.flatMap((entry) => entry.reason ? [entry.reason] : []);
  const artifactCurrent = Boolean(
    args.approvedScriptVersion
    && args.workspace.releasePrepScriptVersion === args.approvedScriptVersion
  );
  const load = !args.active
    ? "inactive"
    : !args.scriptAuthorityAvailable
      ? "unavailable"
      : args.workspace.releasePrepLoadState === "error"
        ? "failed"
        : args.workspace.releasePrepLoadState === "idle"
          ? "loading"
          : args.workspace.releasePrepLoadState;

  return {
    state: {
      artifact: {
        rawText: args.workspace.latestReleasePrepRawText,
        sections: args.workspace.latestReleasePrepSections,
        scriptVersion: args.workspace.releasePrepScriptVersion,
      },
      checklist,
    },
    status: {
      load,
      stale: args.workspace.releasePrepScriptVersion == null
        ? "unknown"
        : artifactCurrent ? "current" : "stale",
      readiness: ready ? "ready" : "blocked",
    },
    commands: {
      refreshArtifact: () => {
        if (args.approvedScriptVersion) {
          void args.workspace.loadLatestReleasePrepPack(args.approvedScriptVersion);
        }
      },
    },
    handoff: Object.freeze({
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      ready,
      blockingReasons: Object.freeze(blockingReasons),
    }),
    summary: `${completeCount}/${checklist.length} ready · ${ready ? "Shippable" : "Pending"}`,
    surface: args.hasApprovedScript && args.approvedScriptVersion
      ? {
        hasApprovedScript: args.hasApprovedScript,
        approvedScriptVersion: args.approvedScriptVersion,
        hasFramingComplete: args.metadataComplete,
        hasThumbnailsSelected: args.thumbnailsSelected,
        mediaMapStatus: args.mediaMapStatus,
        releaseReadinessCompleteCount: completeCount,
        releaseReadinessTotalCount: checklist.length,
      }
      : null,
  };
}
