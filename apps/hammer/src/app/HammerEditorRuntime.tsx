import { useMemo } from "react";
import type { JSX } from "react";
import { useLocation } from "react-router-dom";
import HammerWorkspaceEditor from "../editor/HammerWorkspaceEditor";
import { resolveHammerRouteSelection } from "./hammerNavigation";

export default function HammerEditorRuntime(): JSX.Element {
  const location = useLocation();
  const routeSelection = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state),
    [location.search, location.state],
  );
  const persistenceMode = routeSelection.scenario ? "disabled" : "canonical";

  return (
    <HammerWorkspaceEditor
      launchContext={routeSelection.launchContext}
      persistenceMode={persistenceMode}
      routeSearch={location.search}
    />
  );
}
