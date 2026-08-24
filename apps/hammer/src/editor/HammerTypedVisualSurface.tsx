import type { JSX } from "react";
import type { HammerImageAnimationToolBayContext, HammerImagePlacementToolBayContext, HammerImageTimingToolBayContext, HammerImageTransformToolBayContext, HammerVisualPolishToolBayContext } from "./hammerToolBayContext";
import { HammerTypedImageInspectorSurface } from "./HammerTypedImageInspectorSurface";
import { HammerTypedVisualPolishSurface } from "./HammerTypedVisualPolishSurface";

type HammerTypedVisualContext = HammerVisualPolishToolBayContext | HammerImagePlacementToolBayContext | HammerImageTimingToolBayContext | HammerImageTransformToolBayContext | HammerImageAnimationToolBayContext;

export function HammerTypedVisualSurface(props: { context: HammerTypedVisualContext }): JSX.Element {
  if (props.context.surface === "visual_polish") return <HammerTypedVisualPolishSurface context={props.context} />;
  return <HammerTypedImageInspectorSurface context={props.context} />;
}

