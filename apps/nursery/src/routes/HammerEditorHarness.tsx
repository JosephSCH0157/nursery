import { resolveHammerRouteSelection } from "@hammer/app/hammerNavigation";
import TranscriptSeekHarness from "@hammer/dev/TranscriptSeekHarness";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { createHammerAutoPlacementFixtureTimeline } from "@hammer/dev/hammerAutoPlacementFixture";

export default function HammerEditorHarnessRoute() {
  const location = useLocation();
  const launchContext = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state, { allowStubScenario: true }).launchContext,
    [location.search, location.state],
  );
  const visualTimelineOverride = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("hammer_auto_placement_fixture") === "1"
      ? createHammerAutoPlacementFixtureTimeline()
      : null;
  }, [location.search]);

  return <TranscriptSeekHarness launchContext={launchContext} visualTimelineOverride={visualTimelineOverride} />;
}
