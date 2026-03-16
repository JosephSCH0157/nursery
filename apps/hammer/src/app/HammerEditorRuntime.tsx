import { useMemo } from "react";
import type { JSX } from "react";
import { useLocation } from "react-router-dom";
import HammerWorkspaceEditor from "../editor/HammerWorkspaceEditor";
import { resolveHammerRouteSelection } from "./hammerNavigation";

export default function HammerEditorRuntime(): JSX.Element {
  const location = useLocation();
  const allowStubScenario = import.meta.env.DEV;
  const routeSelection = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state, { allowStubScenario }),
    [allowStubScenario, location.search, location.state],
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
