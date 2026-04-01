import { buildThumbnailPanelProps } from "../../hooks/visuals/buildVisualsPanelProps";

type BuildHearthThumbnailPanelPropsInput = Parameters<typeof buildThumbnailPanelProps>[0];

export function buildHearthThumbnailPanelProps(input: BuildHearthThumbnailPanelPropsInput) {
  return buildThumbnailPanelProps(input);
}
