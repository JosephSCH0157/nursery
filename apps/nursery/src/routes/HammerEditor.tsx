import HammerEditorRuntime from "@hammer/app/HammerEditorRuntime";
import type { HammerShellContext } from "@hammer/app/hammerShellContext";
import HammerWorkspaceSelection from "@hammer/app/HammerWorkspaceSelection";
import { resolveHammerRouteWorkpieceId } from "@hammer/app/hammerRuntimeData";
import { useMemo } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { buildForgeRouteHref } from "../lib/forge-route-context";

export default function HammerEditorRoute() {
  const context = useOutletContext<HammerShellContext>();
  const location = useLocation();
  const routeWorkpieceId = resolveHammerRouteWorkpieceId(location.search);
  const releasePrepHref = useMemo(() => {
    if (!context.workspaceId || !routeWorkpieceId) return null;
    const baseHref = buildForgeRouteHref("/app/quench", {
      search: location.search,
      workspaceId: context.workspaceId,
      workpieceId: routeWorkpieceId,
    });
    return baseHref;
  }, [context.workspaceId, location.search, routeWorkpieceId]);
  const libraryHref = buildForgeRouteHref("/app/hammer", {
    search: location.search,
    workspaceId: context.workspaceId,
    workpieceId: null,
  });

  if (context.workspaceResolutionState !== "ready") {
    return (
      <HammerWorkspaceSelection
        title={context.workspaceResolutionState === "resolving"
          ? "Resolving Hammer workspace"
          : "Choose a workspace before opening Hammer"}
        summary={context.workspaceResolutionState === "resolving"
          ? "Hammer is reconciling workspace truth from the current workpiece."
          : "Hammer needs an active workspace before it can hydrate editor state."}
        workspaces={context.workspaces}
        selectedWorkspaceId={context.workspaceId}
        loading={context.loadingWorkspaces}
        error={context.workspaceError}
        onSelectWorkspace={(workspaceId) => context.selectWorkspace(workspaceId)}
        onRefresh={() => {
          void context.refreshWorkspaces();
        }}
      />
    );
  }

  if (!routeWorkpieceId) {
    return (
      <HammerWorkspaceSelection
        title="Choose a workpiece from the Hammer library"
        summary="Hammer has a workspace, but this editor route does not include a workpiece to open."
        workspaces={context.workspaces}
        selectedWorkspaceId={context.workspaceId}
        loading={context.loadingWorkspaces}
        error={null}
        onSelectWorkspace={(workspaceId) => context.selectWorkspace(workspaceId)}
        onRefresh={() => {
          void context.refreshWorkspaces();
        }}
        footer={<Link to={libraryHref} className="hammer-workspace-selection__button">Open Hammer library</Link>}
      />
    );
  }

  return (
    <HammerEditorRuntime
      releasePrepHref={releasePrepHref}
      prepAiNoticeEffectiveLane={context.prepAiNoticeEffectiveLane}
      prepAiNoticeAcknowledgedLaneSignature={context.prepAiNoticeAcknowledgedLaneSignature}
      prepAiNoticeResolutionState={context.prepAiNoticeResolutionState}
      prepAiNoticeResolutionError={context.prepAiNoticeResolutionError}
      onPrepAiNoticeAcknowledgeLane={context.savePrepAiNoticeAcknowledgedLane}
      onRequestAiSettings={context.openAiSettings}
      workspaceRole={context.workspaces.find((workspace) => workspace.id === context.workspaceId)?.role ?? null}
    />
  );
}
