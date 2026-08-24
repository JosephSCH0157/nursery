import type { JSX } from "react";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "./HammerTypedToolBaySurfaces";
import type { HammerToolBayRuntimeContexts } from "./hammerToolBayRuntimeContext";

export { derivePackagingIntroStatusView, type PackagingIntroStatusView } from "./hammerPackagingIntroStatusView";

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
