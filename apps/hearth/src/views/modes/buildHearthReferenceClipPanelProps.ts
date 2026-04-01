import { buildReferenceClipPlanPanelProps } from "../../hooks/visuals/buildVisualsPanelProps";

type BuildHearthReferenceClipPanelPropsInput = Parameters<typeof buildReferenceClipPlanPanelProps>[0];

export function buildHearthReferenceClipPanelProps(input: BuildHearthReferenceClipPanelPropsInput) {
  return buildReferenceClipPlanPanelProps(input);
}
