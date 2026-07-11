import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import HammerWorkspaceEditor from "../editor/HammerWorkspaceEditor";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";

export interface TranscriptSeekHarnessProps {
  launchContext?: HammerLaunchContext;
  visualTimelineOverride?: HammerVisualTimelineState | null;
}

export default function TranscriptSeekHarness(
  props: TranscriptSeekHarnessProps,
): JSX.Element {
  return (
    <HammerWorkspaceEditor
      launchContext={props.launchContext}
      persistenceMode="disabled"
      allowDevLaunchFallback
      visualTimelineOverride={props.visualTimelineOverride}
    />
  );
}
