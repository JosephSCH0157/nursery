import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import BrollPlanPanel from "../../components/visuals/BrollPlanPanel";
import EpisodeMediaMapPanel from "../../components/visuals/EpisodeMediaMapPanel";
import ImageMapPanel from "../../components/visuals/ImageMapPanel";
import ReferenceClipPlanPanel from "../../components/visuals/ReferenceClipPlanPanel";
import ThumbnailPanel from "../../components/visuals/ThumbnailPanel";
import ThumbnailV3Panel from "../../components/visuals/ThumbnailV3Panel";
import {
  HEARTH_VISUALS_PANEL_SECTION_IDS,
  toggleHearthVisualsPanel,
  type HearthVisualsPanelId,
} from "../../lib/hearth-visuals-panel";

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
  activeVisualProviderBanner: string;
  activeVisualProviderHelperText: string;
  thumbnailPanelProps: ComponentProps<typeof ThumbnailPanel>;
  thumbnailAuthority: { workspaceId: string | null; workpieceId: string | null };
  onGenerateThumbnailConcepts: ComponentProps<typeof ThumbnailV3Panel>["onGenerateConcepts"];
  onRecoverThumbnailConcepts: ComponentProps<typeof ThumbnailV3Panel>["onRecoverConcepts"];
  onCanonicalThumbnailProgress: NonNullable<ComponentProps<typeof ThumbnailV3Panel>["onCanonicalProgress"]>;
  mediaMapPanelProps: ComponentProps<typeof EpisodeMediaMapPanel>;
  imageMapPanelProps: ComponentProps<typeof ImageMapPanel>;
  brollPlanPanelProps: ComponentProps<typeof BrollPlanPanel>;
  referenceClipPlanPanelProps: ComponentProps<typeof ReferenceClipPlanPanel>;
};

export default function VisualsSurface(props: VisualsSurfaceProps) {
  const [openPanel, setOpenPanel] = useState<HearthVisualsPanelId | null>("media_map");
  const openPanelRef = useRef<HearthVisualsPanelId | null>("media_map");

  const queueScrollToPanel = useCallback((panel: HearthVisualsPanelId) => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const sectionId = HEARTH_VISUALS_PANEL_SECTION_IDS[panel];
    const scrollPanelIntoView = () => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const target = section.querySelector<HTMLElement>(".hs-focus-panel-header") ?? section;
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    };
    window.requestAnimationFrame(() => {
      scrollPanelIntoView();
      window.setTimeout(scrollPanelIntoView, 140);
      window.setTimeout(scrollPanelIntoView, 280);
    });
  }, []);

  const handleTogglePanel = useCallback((panel: HearthVisualsPanelId) => {
    const nextPanel = toggleHearthVisualsPanel(openPanelRef.current, panel);
    openPanelRef.current = nextPanel;
    setOpenPanel(nextPanel);
  }, []);

  useEffect(() => {
    if (!openPanel) return;
    queueScrollToPanel(openPanel);
  }, [openPanel, queueScrollToPanel]);

  if (!props.visible) return null;
  if (!props.hasApprovedScript || !props.approvedScriptVersion) {
    return (
      <section className="hs-visuals-skeleton" aria-live="polite">
        <strong>Visual workflow is loading.</strong>
        <span>Approve a script version to unlock Media Map, Images, B-roll, and Reference Clips.</span>
      </section>
    );
  }

  return (
    <>
      <section className="hs-media-plan-banner" aria-label="Media plan status">
        <div className="hs-media-plan-banner-header">
          <strong>Media Plan Status</strong>
        </div>
        <div>
          [{String(props.mediaMapStatus ?? "draft").toUpperCase()}] · Coverage: {props.mediaMapCoverageLevel} · Scope: {props.mediaMapScopeLabel}
        </div>
        <div>{props.activeVisualProviderBanner}</div>
        <div className="hs-media-plan-helper">{props.activeVisualProviderHelperText}</div>
      </section>

      <CollapsibleFocusPanel
        panelId="hearth-media-map-panel"
        title="Episode Media Map"
        meta={props.mediaMapPanelMeta}
        collapsed={openPanel !== "media_map"}
        onToggle={() => handleTogglePanel("media_map")}
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
        onToggle={() => handleTogglePanel("thumbnails")}
        collapsible
        priority="secondary"
      >
        {props.thumbnailAuthority.workspaceId && props.thumbnailAuthority.workpieceId ? (
          <ThumbnailV3Panel
            workspaceId={props.thumbnailAuthority.workspaceId}
            workpieceId={props.thumbnailAuthority.workpieceId}
            approvedScriptVersion={props.approvedScriptVersion}
            onGenerateConcepts={props.onGenerateThumbnailConcepts}
            onRecoverConcepts={props.onRecoverThumbnailConcepts}
            isGeneratingConcepts={props.thumbnailPanelProps.isGeneratingConcepts ?? false}
            onCanonicalProgress={props.onCanonicalThumbnailProgress}
          />
        ) : <p>Select an episode before opening its canonical thumbnail workspace.</p>}
      </CollapsibleFocusPanel>

      <CollapsibleFocusPanel
        panelId="hearth-image-map-panel"
        title="Timeline Images"
        meta={props.imageMapPanelMeta}
        collapsed={openPanel !== "timeline_images"}
        onToggle={() => handleTogglePanel("timeline_images")}
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
        onToggle={() => handleTogglePanel("broll")}
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
        onToggle={() => handleTogglePanel("reference_clips")}
        collapsible
        priority="secondary"
      >
        <ReferenceClipPlanPanel {...props.referenceClipPlanPanelProps} />
      </CollapsibleFocusPanel>
    </>
  );
}
