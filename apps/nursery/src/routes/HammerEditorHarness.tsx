import { resolveHammerRouteSelection } from "@hammer/app/hammerNavigation";
import TranscriptSeekHarness from "@hammer/dev/TranscriptSeekHarness";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export default function HammerEditorHarnessRoute() {
  const location = useLocation();
  const launchContext = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state, { allowStubScenario: true }).launchContext,
    [location.search, location.state],
  );

  return <TranscriptSeekHarness launchContext={launchContext} />;
}
