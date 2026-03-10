import { resolveHammerRouteSelection } from "@hammer/app/hammerNavigation";
import TranscriptSeekMock from "@hammer/dev/TranscriptSeekMock";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export default function HammerEditorRoute() {
  const location = useLocation();
  const launchContext = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state).launchContext,
    [location.search, location.state],
  );

  return <TranscriptSeekMock launchContext={launchContext} />;
}
