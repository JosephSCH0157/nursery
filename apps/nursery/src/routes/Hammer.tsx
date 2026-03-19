import type { HammerShellContext } from "@hammer/app/hammerShellContext";
import HammerProjectLibrary from "@hammer/app/HammerProjectLibrary";
import { useOutletContext } from "react-router-dom";

export default function HammerRoute() {
  const context = useOutletContext<HammerShellContext>();

  return (
    <HammerProjectLibrary
      workspaceId={context.workspaceId}
      workspaces={context.workspaces}
      loadingWorkspaces={context.loadingWorkspaces}
      workspaceError={context.workspaceError}
      workspaceResolutionState={context.workspaceResolutionState}
      onSelectWorkspace={context.selectWorkspace}
      onRefreshWorkspaces={context.refreshWorkspaces}
    />
  );
}

