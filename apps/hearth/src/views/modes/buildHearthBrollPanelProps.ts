import { buildBrollPlanPanelProps } from "../../hooks/visuals/buildVisualsPanelProps";

type BuildHearthBrollPanelPropsInput = Parameters<typeof buildBrollPlanPanelProps>[0];

export function buildHearthBrollPanelProps(input: BuildHearthBrollPanelPropsInput) {
  return buildBrollPlanPanelProps(input);
}
