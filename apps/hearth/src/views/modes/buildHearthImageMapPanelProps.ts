import { buildImageMapPanelProps } from "../../hooks/visuals/buildVisualsPanelProps";

type BuildHearthImageMapPanelPropsInput = Parameters<typeof buildImageMapPanelProps>[0];

export function buildHearthImageMapPanelProps(input: BuildHearthImageMapPanelPropsInput) {
  return buildImageMapPanelProps(input);
}
