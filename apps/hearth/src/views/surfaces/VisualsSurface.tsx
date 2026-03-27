import type { ComponentProps } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import BrollPlanPanel from "../../components/visuals/BrollPlanPanel";
import EpisodeMediaMapPanel from "../../components/visuals/EpisodeMediaMapPanel";
import ImageMapPanel from "../../components/visuals/ImageMapPanel";
import ReferenceClipPlanPanel from "../../components/visuals/ReferenceClipPlanPanel";
import ThumbnailPanel from "../../components/visuals/ThumbnailPanel";

type VisualsSurfaceProps = {
  visible: boolean;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  mediaMapStatus: string | null;
  mediaMapCoverageLevel: string;
  mediaMapScopeLabel: string;
  thumbnailPanelMeta: string;
  mediaMapPanelMeta: string;
  imageMapPanelMeta: string;
  brollPanelMeta: string;
  referenceClipPanelMeta: string;
  thumbnailPanelProps: ComponentProps<typeof ThumbnailPanel>;
  mediaMapPanelProps: ComponentProps<typeof EpisodeMediaMapPanel>;
  imageMapPanelProps: ComponentProps<typeof ImageMapPanel>;
  brollPlanPanelProps: ComponentProps<typeof BrollPlanPanel>;
  referenceClipPlanPanelProps: ComponentProps<typeof ReferenceClipPlanPanel>;
};

export default function VisualsSurface(props: VisualsSurfaceProps) {
  if (!props.visible || !props.hasApprovedScript || !props.approvedScriptVersion) return null;

  return (
    <>
      <section className="hs-media-plan-banner" aria-label="Media plan status">
        <strong>Media Plan Status</strong>
        <div>
          [{String(props.mediaMapStatus ?? "draft").toUpperCase()}] · Coverage: {props.mediaMapCoverageLevel} · Scope: {props.mediaMapScopeLabel}
        </div>
      </section>

      <CollapsibleFocusPanel
        panelId="hearth-media-map-panel"
        title="Episode Media Map"
        meta={props.mediaMapPanelMeta}
        collapsed={false}
        onToggle={() => {}}
        collapsible={false}
      >
        <EpisodeMediaMapPanel {...props.mediaMapPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-thumbnail-panel"
        title="Thumbnails"
        meta={props.thumbnailPanelMeta}
        collapsed={false}
        onToggle={() => {}}
        collapsible={false}
      >
        <ThumbnailPanel {...props.thumbnailPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-image-map-panel"
        title="Timeline Images"
        meta={props.imageMapPanelMeta}
        collapsed={false}
        onToggle={() => {}}
        collapsible={false}
      >
        <ImageMapPanel {...props.imageMapPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-broll-plan-panel"
        title="B-roll Plan"
        meta={props.brollPanelMeta}
        collapsed={false}
        onToggle={() => {}}
        collapsible={false}
      >
        <BrollPlanPanel {...props.brollPlanPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-reference-clip-plan-panel"
        title="Reference Clips"
        meta={props.referenceClipPanelMeta}
        collapsed={false}
        onToggle={() => {}}
        collapsible={false}
      >
        <ReferenceClipPlanPanel {...props.referenceClipPlanPanelProps} />
      </CollapsibleFocusPanel>
    </>
  );
}
