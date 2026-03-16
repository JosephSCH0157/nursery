import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import HammerWorkspaceEditor from "../editor/HammerWorkspaceEditor";

export interface TranscriptSeekHarnessProps {
  launchContext?: HammerLaunchContext;
}

export default function TranscriptSeekHarness(
  props: TranscriptSeekHarnessProps,
): JSX.Element {
  return (
    <HammerWorkspaceEditor
      launchContext={props.launchContext}
      persistenceMode="disabled"
      allowDevLaunchFallback
    />
  );
}
