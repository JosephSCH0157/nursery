import type { ComponentProps } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import MetadataPanel from "../../components/metadata/MetadataPanel";

type MetadataSurfaceProps = {
  visible: boolean;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  metadataPanelMeta: string;
  metadataPanelProps: ComponentProps<typeof MetadataPanel>;
};

export default function MetadataSurface(props: MetadataSurfaceProps) {
  if (!props.visible || !props.hasApprovedScript || !props.approvedScriptVersion) return null;

  return (
    <CollapsibleFocusPanel
      panelId="hearth-metadata-panel"
      title="Metadata"
      meta={props.metadataPanelMeta}
      collapsed={false}
      onToggle={() => {}}
      collapsible={false}
    >
      <MetadataPanel {...props.metadataPanelProps} />
    </CollapsibleFocusPanel>
  );
}
