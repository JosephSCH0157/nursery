import type { JSX } from "react";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "./HammerTypedToolBaySurfaces";
import type { HammerToolBayRuntimeContexts } from "./hammerToolBayRuntimeContext";

export type PackagingIntroStatusView = {
  selectionStatusLine: string;
  placementStatusLine: string;
  applyActionLabel: string;
  removeActionLabel: string;
  canApply: boolean;
  canRemove: boolean;
};

export function derivePackagingIntroStatusView(args: {
  selectedIntroAssetId: string | null;
  selectedIntroPath: string | null;
  introPlaced: boolean;
}): PackagingIntroStatusView {
  const hasSelection = Boolean(args.selectedIntroAssetId);
  const hasResolvedSelection = Boolean(args.selectedIntroAssetId && args.selectedIntroPath);
  return {
    selectionStatusLine: hasSelection
      ? (hasResolvedSelection ? `Selected intro from Source Desk: ${args.selectedIntroPath}` : `Selected intro from Source Desk is unresolved (${args.selectedIntroAssetId}).`)
      : "No intro selected in Source Desk.",
    placementStatusLine: args.introPlaced ? "Timeline packaging intro: placed." : "Timeline packaging intro: not placed.",
    applyActionLabel: "Apply Selected Intro to Timeline",
    removeActionLabel: "Remove Intro from Timeline",
    canApply: hasResolvedSelection,
    canRemove: args.introPlaced,
  };
}

export default function HammerWorkspaceShellToolBay(props: { contexts: HammerToolBayRuntimeContexts }): JSX.Element {
  const routedSurface = props.contexts.body?.route.status === "resolved" ? props.contexts.body.route.surface : null;
  return (
    <>
      {props.contexts.completion ? <HammerTypedPassCompletionHeader context={props.contexts.completion} /> : null}
      <div className="hammer-bay-body" data-hammer-routed-surface={routedSurface}>
        {props.contexts.body ? <HammerTypedToolBayBody context={props.contexts.body} /> : null}
      </div>
    </>
  );
}
