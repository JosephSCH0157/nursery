import { useState, type ComponentProps } from "react";
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
  if (!props.visible) return null;
  if (!props.hasApprovedScript || !props.approvedScriptVersion) {
    return (
      <section className="hs-visuals-skeleton" aria-live="polite">
        <strong>Visual workflow is loading.</strong>
        <span>Approve a script version to unlock Media Map, Images, B-roll, and Reference Clips.</span>
      </section>
    );
  }
  const [openPanel, setOpenPanel] = useState<"media_map" | "thumbnails" | "timeline_images" | "broll" | "reference_clips">("media_map");

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
        collapsed={openPanel !== "media_map"}
        onToggle={() => setOpenPanel("media_map")}
        collapsible
        priority="primary"
      >
        <EpisodeMediaMapPanel {...props.mediaMapPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-thumbnail-panel"
        title="Thumbnails"
        meta={props.thumbnailPanelMeta}
        collapsed={openPanel !== "thumbnails"}
        onToggle={() => setOpenPanel("thumbnails")}
        collapsible
        priority="secondary"
      >
        <ThumbnailPanel {...props.thumbnailPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-image-map-panel"
        title="Timeline Images"
        meta={props.imageMapPanelMeta}
        collapsed={openPanel !== "timeline_images"}
        onToggle={() => setOpenPanel("timeline_images")}
        collapsible
        priority="secondary"
      >
        <ImageMapPanel {...props.imageMapPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-broll-plan-panel"
        title="B-roll Plan"
        meta={props.brollPanelMeta}
        collapsed={openPanel !== "broll"}
        onToggle={() => setOpenPanel("broll")}
        collapsible
        priority="secondary"
      >
        <BrollPlanPanel {...props.brollPlanPanelProps} />
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-reference-clip-plan-panel"
        title="Reference Clips"
        meta={props.referenceClipPanelMeta}
        collapsed={openPanel !== "reference_clips"}
        onToggle={() => setOpenPanel("reference_clips")}
        collapsible
        priority="secondary"
      >
        <ReferenceClipPlanPanel {...props.referenceClipPlanPanelProps} />
      </CollapsibleFocusPanel>
    </>
  );
}
