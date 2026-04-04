import { useMemo } from "react";
import type { JSX } from "react";
import { useLocation } from "react-router-dom";
import HammerWorkspaceEditor from "../editor/HammerWorkspaceEditor";
import { resolveHammerRouteSelection } from "./hammerNavigation";

export interface HammerEditorRuntimeProps {
  releasePrepHref?: string | null;
  prepAiNoticeEffectiveLane?: "forge-managed" | "personal-byo" | "ai-disabled";
  prepAiNoticeAcknowledgedLaneSignature?: string | null;
  prepAiNoticeResolutionState?: "ready" | "loading" | "error";
  prepAiNoticeResolutionError?: string | null;
  onPrepAiNoticeAcknowledgeLane?: (laneSignature: string) => void | Promise<void>;
  onRequestAiSettings?: () => void;
}

export default function HammerEditorRuntime(props: HammerEditorRuntimeProps): JSX.Element {
  const location = useLocation();
  const allowStubScenario = false;
  const routeSelection = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state, { allowStubScenario }),
    [allowStubScenario, location.search, location.state],
  );
  const persistenceMode = routeSelection.scenario ? "disabled" : "canonical";

  return (
    <HammerWorkspaceEditor
      launchContext={routeSelection.launchContext}
      persistenceMode={persistenceMode}
      releasePrepHref={props.releasePrepHref}
      routeSearch={location.search}
      prepAiNoticeEffectiveLane={props.prepAiNoticeEffectiveLane}
      prepAiNoticeAcknowledgedLaneSignature={props.prepAiNoticeAcknowledgedLaneSignature}
      prepAiNoticeResolutionState={props.prepAiNoticeResolutionState}
      prepAiNoticeResolutionError={props.prepAiNoticeResolutionError}
      onPrepAiNoticeAcknowledgeLane={props.onPrepAiNoticeAcknowledgeLane}
      onRequestAiSettings={props.onRequestAiSettings}
    />
  );
}
