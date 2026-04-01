import { buildMediaMapPanelProps } from "../../hooks/visuals/buildVisualsPanelProps";

type BuildHearthMediaMapPanelPropsInput = Parameters<typeof buildMediaMapPanelProps>[0];

export function buildHearthMediaMapPanelProps(input: BuildHearthMediaMapPanelPropsInput) {
  return buildMediaMapPanelProps(input);
}
